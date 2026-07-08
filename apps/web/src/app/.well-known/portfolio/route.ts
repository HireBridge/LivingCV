import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const s = getAllSettings(db);
  const domain = s['site.domain'] || '';
  const title = s['site.title'] || 'Portfolio';
  const hirebridgeConnected = s['hirebridge.connected'] === '1';

  const doc = {
    version: '1.0',
    domain,
    title,
    endpoints: {
      career_packet: '/career-packet.json',
      mcp_public: '/mcp/public',
      mcp_descriptor: '/.well-known/mcp',
      jsonld_person: '/',
      resume: '/resume',
      sitemap: '/sitemap.xml',
      robots: '/robots.txt',
      llms_txt: '/llms.txt',
    },
    hirebridge: {
      connected: hirebridgeConnected,
      ...(hirebridgeConnected ? { profile_url: s['hirebridge.profile_url'] || null } : {}),
    },
  };

  return NextResponse.json(doc, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
