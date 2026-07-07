import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';
import { listProjects, getPublishedCaseStudyByProject } from '@/lib/content';
import { listBlogs } from '@/lib/blogs';

export const dynamic = 'force-dynamic';

function escapeXml(unsafe: string) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export async function GET() {
  const db = getDb();
  const s = getAllSettings(db);
  const domain = s['site.domain'] || '';
  const base = domain ? `https://${domain}` : 'http://localhost:3000';
  const title = s['site.title'] || 'Portfolio';
  const description = s['site.meta_description'] || '';

  const items: { title: string; link: string; description: string; date: Date }[] = [];

  for (const p of listProjects(db)) {
    const cs = getPublishedCaseStudyByProject(db, p.id);
    if (cs && cs.frontmatter) {
      try {
        const fm = JSON.parse(cs.frontmatter);
        items.push({
          title: fm.title || p.title,
          link: `${base}/projects/${p.slug}`,
          description: fm.summary || p.tagline || '',
          date: new Date(cs.created_at),
        });
      } catch {}
    }
  }

  try {
    for (const b of listBlogs(db, true)) {
      items.push({
        title: b.title,
        link: `${base}/blog/${b.slug}`,
        description: b.summary,
        date: new Date(b.created_at),
      });
    }
  } catch {}

  items.sort((a, b) => b.date.getTime() - a.date.getTime());

  const rssItems = items.map(item => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${item.date.toUTCString()}</pubDate>
    </item>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(base)}</link>
    <description>${escapeXml(description)}</description>
    <atom:link href="${escapeXml(base)}/blog/feed.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}
