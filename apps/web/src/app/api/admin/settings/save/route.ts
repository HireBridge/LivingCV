import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { setSetting } from '@/lib/settings';
import { setActiveTemplate } from '@/lib/content';
import { ENCRYPTED_SETTING_KEYS, SETTING_KEYS } from '@portfolio/shared';

// Generic settings writer. Maps a "group" (site/limits/connections) to a list of
// known setting keys, reads each from the form, and writes via setSetting (which
// auto-encrypts keys in ENCRYPTED_SETTING_KEYS).
const GROUPS: Record<string, { keys: string[]; checkboxKeys?: string[] }> = {
  site: {
    keys: ['site.title', 'site.domain', 'site.meta_description', 'site.og_image_path', 'site.active_template'],
  },
  limits: {
    keys: [
      SETTING_KEYS.limitsSessionMaxMessages,
      SETTING_KEYS.limitsDailyMessageBudget,
      SETTING_KEYS.limitsIpSessionsPerDay,
    ],
    checkboxKeys: [SETTING_KEYS.agentEnabled, SETTING_KEYS.voiceEnabled, SETTING_KEYS.gateEnabled],
  },
  connections: {
    keys: [
      'jobops.base_url',
      'jobops.auth_token',
      'agent.llm_provider',
      'agent.llm_api_key',
      'agent.llm_model',
      'agent.system_prompt_extra',
      'voice.mode',
      'voice.stt_provider',
      'voice.stt_api_key',
      'voice.tts_provider',
      'voice.tts_api_key',
      'voice.tts_voice_id',
      'notify.webhook_url',
    ],
  },
};

export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();
  const group = String(form.get('group') || '');
  const spec = GROUPS[group];
  if (!spec) {
    return NextResponse.redirect(new URL('/admin/settings', request.url), { status: 303 });
  }
  for (const key of spec.keys) {
    const raw = form.get(key);
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    // Skip empty values for non-checkbox settings so blanks don't overwrite
    // stored secrets with "" (this is the "set → encrypted" affordance).
    if (!value && !ENCRYPTED_SETTING_KEYS.has(key)) continue;
    if (key === 'site.active_template' && value) {
      setActiveTemplate(db, value);
      continue;
    }
    setSetting(db, key, value || ' ');
  }
  for (const key of spec.checkboxKeys ?? []) {
    setSetting(db, key, String(form.get(key)) === 'on' ? '1' : '0');
  }
  return NextResponse.redirect(new URL('/admin/settings?saved=1', request.url), { status: 303 });
}
