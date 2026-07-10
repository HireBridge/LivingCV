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

  // The .well-known/portfolio document is forward-looking discovery metadata.
  // HireBridge itself does not yet consume this; the inbox endpoint remains
  // the authoritative path for introductions.
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
    },
  };

  return NextResponse.json(doc, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}