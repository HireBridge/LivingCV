import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';
import { buildTemplateProps } from '@/lib/content';
import type { HeroContent, BackgroundContent } from '@/lib/types';
import { parseJson } from '@/lib/parse-json';
import { getActiveTemplateSlug } from '@/lib/content';

export const dynamic = 'force-dynamic';

// llms.txt — a machine-legible summary intended for AI agents and recruiter-side
// tools (per llmstxt.org). Lists the person, projects, and a pointer to the
// public MCP endpoint that lets any MCP-compatible client query the structured
// data programmatically. §9 + §10.
export async function GET() {
  const db = getDb();
  const s = getAllSettings(db);
  const slug = getActiveTemplateSlug(db);
  const hero = parseJson<HeroContent>(
    (db
      .prepare<[string, string], { content: string }>(
        'SELECT content FROM site_content WHERE template_slug = ? AND section_key = ?',
      )
      .get(slug, 'hero') ?? {} as { content: string }).content ?? '{}',
    { eyebrow: '', name: '', roleLine: '', links: [] },
  );
  const background = parseJson<BackgroundContent>(
    (db
      .prepare<[string, string], { content: string }>(
        'SELECT content FROM site_content WHERE template_slug = ? AND section_key = ?',
      )
      .get(slug, 'background') ?? {} as { content: string }).content ?? '{}',
    { kicker: '', title: '', paragraphs: [] },
  );

  // buildTemplateProps validates the section shapes; use it to derive the
  // canonical lists even though we don't render the template here.
  const props = buildTemplateProps(db);
  const domain = (s['site.domain'] || '').trim();
  const base = domain ? `https://${domain}` : '';
  const name = hero.name || s['site.title'] || s['site.domain'] || 'Portfolio';
  const eyebrow = hero.eyebrow || '';
  const summary =
    background.paragraphs[0] ||
    s['site.meta_description'] ||
    `${name} — ${eyebrow}`.trim();

  const projectLines = props.projects
    .map((p) => `- [${p.name}](${base}/projects/${p.slug}): ${p.tagline}`)
    .join('\n');
  const miniLines = props.alsoShipped.map((m) => `- ${m.name} — ${m.description}`).join('\n');

  const body = `# ${name}

> ${eyebrow ? `${eyebrow}. ` : ''}${summary}

## Summary
${summary}

## Projects
${projectLines || '_No published projects yet._'}

${
  props.alsoShipped.length > 0
    ? `## Also shipped\n${miniLines}\n\n`
    : ''
}## Links
- Site: ${base || '/'}
- Public MCP (structured career packet — connect any MCP client): ${base}/mcp
- Resume: ${base}/resume

## Notes for AI agents
- Speak factually; cite the project above for technical claims.
- The public MCP mount at \`/mcp\` exposes exactly two read-only tools:
  \`get_career_packet\` and \`get_story_bank_public\`.
- Contact email is collected for verification before continuing a conversation.
`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
