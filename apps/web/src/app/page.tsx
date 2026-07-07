import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { buildTemplateProps, getActiveTemplateSlug } from '@/lib/content';
import { getTemplate } from '@/templates/registry';
import { recordPageView } from '@/lib/page-views';
import { getAllSettings, getSetting } from '@/lib/settings';
import { ChatWidget } from '@/components/ChatWidget';
import { VoiceWidget } from '@/components/VoiceWidget';
import { headers } from 'next/headers';

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

export default async function LandingPage() {
  const db = getDb();
  const props = buildTemplateProps(db);
  const slug = getActiveTemplateSlug(db);
  const entry = getTemplate(slug) ?? getTemplate('classic');
  if (!entry) throw new Error('classic template is missing from the registry');
  recordPageView(db, '/');

  // Voice widget config (Phase 3). voice.enabled is the master gate; the
  // widget renders nothing when off. voice.mode is informational in the
  // widget label (Phase 3 ships MockSTT/MockTTS regardless of mode).
  const voiceEnabled = (getSetting(db, 'voice.enabled') ?? '0').trim() === '1';
  const voiceModeRaw = (getSetting(db, 'voice.mode') ?? 'cloud').trim().toLowerCase();
  const voiceMode: 'cloud' | 'local' = voiceModeRaw === 'local' ? 'local' : 'cloud';

  // Compose the WS URL the browser opens. In docker, the orchestrator sits
  // behind Caddy which routes /voice-ws to the voice service. In local dev,
  // `window.location.host` is used so the browser talks to localhost:3000 →
  // Caddy → voice. We pass the path only; the browser injects the host.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const wsProto = proto === 'https' ? 'wss' : 'ws';
  const agentEnabled = (getSetting(db, 'agent.enabled') ?? '1').trim() === '1';

  const Component = entry.Component;
  return (
    <>
      <Component {...props} />
      {agentEnabled && <ChatWidget />}
      <VoiceWidget
        config={{
          enabled: voiceEnabled,
          mode: voiceMode,
          wsUrl: `${wsProto}://${host}/voice-ws`,
        }}
      />
    </>
  );
}
