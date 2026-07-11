// Manual round-trip: drive the master MCP SSE endpoint to publish a blog post
// and then list it. Uses the official MCP client SDK against the orchestrator's
// /api/mcp/sse.
//
// Run from the repo root with:
//   PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH" \
//   DATA_DIR=/tmp/portfolio-test/data PORTFOLIO_ENCRYPTION_KEY=$(cat /tmp/portfolio-test/envkey.txt) \
//   npx tsx scripts/mcp-blog-roundtrip.ts

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const baseUrl = process.env.MCP_BASE_URL || 'http://127.0.0.1:8100';
const token = process.env.MCP_TOKEN || 'mcp-test-master-key-1234567890abcdef';

async function main() {
  const transport = new SSEClientTransport(new URL(`${baseUrl}/api/mcp/sse`), {
    eventSourceInit: {
      // EventSource doesn't accept custom headers, but @modelcontextprotocol/sdk
      // accepts the auth as a custom fetch.
    },
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
    },
  } as ConstructorParameters<typeof SSEClientTransport>[1]);

  const client = new Client({ name: 'mcp-blog-roundtrip', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  console.log('[mcp] connected');

  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  console.log('[mcp] tools/list ->', names.length, 'tools');
  for (const want of ['publish_blog_post', 'update_blog_post', 'list_blog_posts']) {
    if (!names.includes(want)) throw new Error(`missing ${want}`);
  }

  const slug = `mcp-roundtrip-${Date.now()}`;
  const pub = await client.callTool({
    name: 'publish_blog_post',
    arguments: {
      title: 'Roundtrip via master MCP',
      body_markdown: '# Hello\n\nThis post was published via the master admin MCP.',
      summary: 'Verifying the new tools end-to-end.',
      tags: ['mcp', 'roundtrip', 'demo'],
      slug,
    },
  });
  const pubText = String((pub.content[0] as { text: string }).text);
  console.log('[mcp] publish ->', pubText);
  if (!pubText.includes(slug)) {
    throw new Error(`expected slug ${slug} in publish response`);
  }

  const list = await client.callTool({
    name: 'list_blog_posts',
    arguments: { published_only: false },
  });
  const listText = String((list.content[0] as { text: string }).text);
  const rows = JSON.parse(listText) as Array<{ slug: string; title: string; tags: string }>;
  console.log('[mcp] list_blog_posts ->', rows.length, 'rows');
  const ours = rows.find((r) => r.title === 'Roundtrip via master MCP');
  if (!ours) throw new Error('our post is not in the list');
  console.log('[mcp] found our post:', ours);

  const upd = await client.callTool({
    name: 'update_blog_post',
    arguments: { slug: ours.slug, summary: 'Updated by master MCP.' },
  });
  const updText = String((upd.content[0] as { text: string }).text);
  console.log('[mcp] update ->', updText.slice(0, 120), '...');

  // Collision check: try to publish a duplicate slug with an explicit slug, expect error.
  const dup = await client.callTool({
    name: 'publish_blog_post',
    arguments: { title: 'Anything', body_markdown: 'x', slug: ours.slug },
  });
  if (!dup.isError) throw new Error('expected duplicate slug to error');
  const dupText = String((dup.content[0] as { text: string }).text);
  if (!dupText.includes('already in use')) throw new Error('expected collision message');
  console.log('[mcp] duplicate-slug collision correctly surfaced');

  await client.close();
  console.log('[mcp] OK — roundtrip complete');
}

main().catch((e) => {
  console.error('[mcp] FAIL:', e);
  process.exit(1);
});