import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';
import { listProjects, hasPublishedCaseStudy } from '@/lib/content';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const s = getAllSettings(db);
  const domain = (s['site.domain'] || '').trim();
  const base = domain ? `https://${domain}` : '';
  const urls: string[] = [base + '/'];
  for (const p of listProjects(db)) {
    if (hasPublishedCaseStudy(db, p.id)) {
      urls.push(`${base}/projects/${p.slug}`);
    }
  }
  const body = urls
    .map((u) => `  <url><loc>${u}</loc></url>`)
    .join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
