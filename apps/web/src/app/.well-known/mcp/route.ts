import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { SETTING_KEYS } from '@livingcv/shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const domain = getSetting(db, SETTING_KEYS.siteDomain) || '';
  const baseUrl = domain ? `https://${domain}` : '';
  const publicEnabled = getSetting(db, SETTING_KEYS.publicMcpEnabled) === '1';

  const descriptor = {
    schemaVersion: '1.0',
    name: domain ? `${domain} portfolio MCP` : 'Portfolio MCP',
    description: 'Public MCP surface for the portfolio. Exposes read-only career packet and story bank.',
    transport: 'http+streamable',
    endpoint: `${baseUrl}/mcp/public`,
    tools: publicEnabled
      ? [
          {
            name: 'get_career_packet',
            description: 'Returns the active career packet (identity, experience, projects, skills, education) as structured markdown.',
          },
          {
            name: 'get_story_bank_public',
            description: 'Returns STAR (Situation, Task, Action, Result) stories with reflections, filtered by competency.',
          },
        ]
      : [],
    auth: {
      type: 'none',
      note: 'Public endpoint — no authentication required.',
    },
  };

  return NextResponse.json(descriptor, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
