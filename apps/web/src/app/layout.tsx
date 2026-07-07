import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Space_Grotesk, Source_Serif_4, JetBrains_Mono } from 'next/font/google';
import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--next-font-heading', display: 'swap' });
const sourceSerif = Source_Serif_4({ subsets: ['latin'], variable: '--next-font-body', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--next-font-mono', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const db = getDb();
  const s = getAllSettings(db);
  const domain = s['site.domain'] || '';
  const title = s['site.title'] || 'Portfolio';
  const description = s['site.meta_description'] || '';
  const baseUrl = domain ? new URL(`https://${domain}`) : undefined;
  
  const googleSiteVerification = s['seo.google_site_verification'];
  const bingVerification = s['seo.bing_verification'];

  const metadata: Metadata = {
    metadataBase: baseUrl,
    title: { template: `%s | ${title}`, default: title },
    description,
    applicationName: title,
    authors: [{ name: title }],
    creator: title,
    ...(s['site.keywords'] && { keywords: s['site.keywords'].split(',').map((k: string) => k.trim()) }),
  };
  if (googleSiteVerification || bingVerification) {
    metadata.verification = {
      ...(googleSiteVerification && { google: googleSiteVerification }),
      ...(bingVerification && { other: { 'msvalidate.01': bingVerification } }),
    };
  }
  return metadata;
}

// Root HTML shell. Public pages render the active template inside <body>
// (each template emits its own <style>). Admin pages render the admin layout
// inside <body>. Google Fonts links are replaced by next/font.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const db = getDb();
  const s = getAllSettings(db);
  const lang = s['site.lang'] || 'en';

  return (
    <html lang={lang} className={`${spaceGrotesk.variable} ${sourceSerif.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="alternate" type="application/rss+xml" title="RSS Feed" href="/blog/feed.xml" />
        <noscript>
          <style>{'.reveal{opacity:1 !important; transform:none !important;}'}</style>
        </noscript>
      </head>
      <body>{children}</body>
    </html>
  );
}
