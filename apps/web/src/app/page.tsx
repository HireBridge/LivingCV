import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { buildTemplateProps, getActiveTemplateSlug } from '@/lib/content';
import { getTemplate } from '@/templates/registry';
import { recordPageView } from '@/lib/page-views';
import { getAllSettings, getSetting } from '@/lib/settings';
import { ChatWidget } from '@/components/ChatWidget';
import { VoiceWidget } from '@/components/VoiceWidget';

// Landing page — renders the active template from the DB on every request
// (content is runtime-editable, never build-time). §9.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const db = getDb();
  const s = getAllSettings(db);
  const title = s['site.title'] || s['site.domain'] || 'Portfolio';
  const description = s['site.meta_description'] || '';
  const domain = s['site.domain'] || '';
  const twitter = s['site.twitter_handle'] || '';
  const ogImage = s['site.og_image_path'] || `/og?title=${encodeURIComponent(title)}`;
  const url = domain ? `https://${domain}` : '/';

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: title,
      type: 'website',
      images: [ogImage],
      locale: s['site.lang'] || 'en',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
      ...(twitter && { creator: twitter, site: twitter }),
    },
  };
}

export default async function LandingPage() {
  const db = getDb();
  const props = buildTemplateProps(db);
  const slug = getActiveTemplateSlug(db);
  const entry = getTemplate(slug) ?? getTemplate('classic');
  if (!entry) throw new Error('classic template is missing from the registry');
  recordPageView(db, '/');

  // Voice widget config (Phase 3). voice.enabled is the master gate; the
  // widget renders nothing when off.
  const voiceEnabled = (getSetting(db, 'voice.enabled') ?? '0').trim() === '1';
  const agentEnabled = (getSetting(db, 'agent.enabled') ?? '1').trim() === '1';

  const Component = entry.Component;

  const s = getAllSettings(db);
  const title = s['site.title'] || 'Portfolio';
  const domain = s['site.domain'] || '';
  const url = domain ? `https://${domain}` : '/';
  
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: title,
        url,
      },
      {
        '@type': 'Person',
        name: title,
        url,
        description: s['site.meta_description'] || '',
        sameAs: [s['social.github'], s['social.linkedin'], s['social.twitter']].filter(Boolean),
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Component {...props} />
      {agentEnabled && <ChatWidget />}
      <VoiceWidget config={{ enabled: voiceEnabled }} />
    </>
  );
}
