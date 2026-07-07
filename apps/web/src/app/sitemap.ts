import { MetadataRoute } from 'next';
import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';
import { listProjects, getPublishedCaseStudyByProject } from '@/lib/content';
import { listBlogs } from '@/lib/blogs';

export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  const db = getDb();
  const s = getAllSettings(db);
  const domain = (s['site.domain'] || '').trim();
  const base = domain ? `https://${domain}` : 'http://localhost:3000';
  
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/blog`, changeFrequency: 'weekly', priority: 0.8 }
  ];

  for (const p of listProjects(db)) {
    const cs = getPublishedCaseStudyByProject(db, p.id);
    if (cs) {
      entries.push({
        url: `${base}/projects/${p.slug}`,
        lastModified: new Date(cs.updated_at || cs.created_at),
        changeFrequency: 'monthly',
        priority: 0.8
      });
    }
  }
  
  try {
    for (const b of listBlogs(db, true)) {
      entries.push({
        url: `${base}/blog/${b.slug}`,
        lastModified: new Date((b as { updated_at: string; created_at: string }).updated_at || (b as { updated_at: string; created_at: string }).created_at),
        changeFrequency: 'monthly',
        priority: 0.7
      });
    }
  } catch {}

  const hasResume = s['site.resume_path'];
  if (hasResume) {
    entries.push({
      url: `${base}/resume`,
      changeFrequency: 'monthly',
      priority: 0.6
    });
  }

  return entries;
}
