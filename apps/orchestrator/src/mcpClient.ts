// MCP client for jobops. Per PLAN §2 invariant 4 and §7, the orchestrator's
// recruiter sessions connect ONLY to jobops's /mcp/public mount — not the
// authenticated /mcp. There is no admin token in this process. The closed
// surface (mutates=false, publicSafe=true) is structurally enforced by the
// jobops server; this client cannot widen it.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ToolDef } from './llm/types.js';

const PUBLIC_PATH = '/mcp/public';

export interface McpSession {
  client: Client;
  tools: ToolDef[];
  close(): Promise<void>;
}

// Connect to jobops and cache the tool list. The jobops base URL comes from
// app_settings.jobops.base_url (the "internal" URL inside the docker network is
// preferred; defaults to http://jobops:7891 in compose).
export async function connectMcpPublic(jobopsBaseUrl: string): Promise<McpSession> {
  const url = `${jobopsBaseUrl.replace(/\/$/, '')}${PUBLIC_PATH}`;
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({ name: 'portfolio-orchestrator', version: '0.0.0' });
  await client.connect(transport);
  const listed = await client.listTools();
  // Translate MCP tool definitions (inputSchema is JSON Schema already) to our
  // ToolDef. We do NOT add additional fields — strict JSON Schema passthrough.
  const tools: ToolDef[] = listed.tools.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    inputSchema: t.inputSchema as ToolDef['inputSchema'],
  }));
  return {
    client,
    tools,
    async close() {
      await client.close();
    },
  };
}

export async function callTool(mcp: McpSession, name: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await mcp.client.callTool({ name, arguments: args });
  // MCP returns { content: [{type:'text', text: string}], structuredContent? }.
  // Prefer structuredContent; fall back to JSON-parsing the text block.
  if (r.structuredContent) return r.structuredContent;
  const blocks = (r.content ?? []) as Array<{ type: string; text?: string }>;
  for (const b of blocks) {
    if (b.type === 'text' && typeof b.text === 'string') {
      try {
        return JSON.parse(b.text);
      } catch {
        return b.text;
      }
    }
  }
  return null;
}
