import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { buildTemplateProps, getActiveTemplateSlug } from '@/lib/content';
import { getTemplate } from '@/templates/registry';
import { recordPageView } from '@/lib/page-views';
import { getAllSettings } from '@/lib/settings';

// Landing page — renders the active template from the DB on every request
// (content is runtime-editable, never build-time). §9.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const db = getDb();
  const s = getAllSettings(db);
  const title = s['site.title'] || s['site.domain'] || 'Portfolio';
  const description = s['site.meta_description'] || '';
  return {
    title: { absolute: title },
    description,
  };
}

export default function LandingPage() {
  const db = getDb();
  const props = buildTemplateProps(db);
  const slug = getActiveTemplateSlug(db);
  const entry = getTemplate(slug) ?? getTemplate('classic');
  if (!entry) throw new Error('classic template is missing from the registry');
  recordPageView(db, '/');
  const Component = entry.Component;
  return <Component {...props} />;
}
