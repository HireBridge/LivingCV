import { MetadataRoute } from 'next';
import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';

export default function manifest(): MetadataRoute.Manifest {
  const db = getDb();
  const s = getAllSettings(db);
  const title = s['site.title'] || 'Portfolio';
  const description = s['site.meta_description'] || '';
  
  const paper = s['theme.paper'] || '#F2F0EA';
  const ink = s['theme.ink'] || '#1B2430';

  return {
    name: title,
    short_name: title,
    description,
    start_url: '/',
    display: 'standalone',
    background_color: paper,
    theme_color: ink,
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
      // You can add more icons here (e.g. icon-192x192.png)
    ],
  };
}
