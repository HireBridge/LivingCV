// Local tools — those that read portfolio.db rather than MCP (§7). Two tools:
//   list_projects: returns the featured projects as a compact summary.
//   get_case_study(slug): returns one published case study's frontmatter +
//     markdown body for the LLM to quote.

import type { Db } from '@livingcv/db';
import { listFeaturedProjects, getCaseStudyForTool } from './db.js';
import { parseJson } from './parse-json.js';
import type { ToolDef } from './llm/types.js';

export function listProjectsToolDefs(): ToolDef[] {
  return [
    {
      name: 'list_projects',
      description:
        'Returns the featured projects shown on the portfolio: title, slug, tagline. ' +
        'Use this to answer "what projects have you built?" before pulling a specific case study.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
  ];
}

export function listProjectsImpl(db: Db): { count: number; items: Array<{ slug: string; title: string; tagline: string }> } {
  const rows = listFeaturedProjects(db).map((p) => ({
    slug: p.slug,
    title: p.title,
    tagline: p.tagline ?? '',
  }));
  return { count: rows.length, items: rows };
}

export function getCaseStudyToolDefs(): ToolDef[] {
  return [
    {
      name: 'get_case_study',
      description:
        'Returns the full published case study for a project slug (frontmatter summary + markdown body). ' +
        'Use this when a recruiter asks for details about a specific project listed in list_projects.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'The project slug returned by list_projects.' },
        },
        required: ['slug'],
      },
    },
  ];
}

export function getCaseStudyImpl(
  db: Db,
  args: Record<string, unknown>,
): { slug: string; frontmatter: object; body_markdown: string } | null {
  const slug = typeof args.slug === 'string' ? args.slug : '';
  if (!slug) return null;
  const row = getCaseStudyForTool(db, slug);
  if (!row) return null;
  return {
    slug: row.project_slug,
    frontmatter: parseJson<Record<string, unknown>>(row.frontmatter, {}),
    body_markdown: row.body_markdown ?? '',
  };
}
