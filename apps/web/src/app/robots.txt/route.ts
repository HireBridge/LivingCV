import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const s = getAllSettings(db);
  const domain = s['site.domain'] || '';
  const base = domain ? `https://${domain}` : '';
  return new Response(
    `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${base}/sitemap.xml
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
}
