import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { setSetting } from '@/lib/settings';
import { setActiveTemplate } from '@/lib/content';
import { ENCRYPTED_SETTING_KEYS, SETTING_KEYS } from '@livingcv/shared';

// Generic settings writer. Maps a "group" (site/limits/connections/etc.) to a
// list of known setting keys, reads each from the form, and writes via
// setSetting (which auto-encrypts keys in ENCRYPTED_SETTING_KEYS).
const GROUPS: Record<string, { keys: string[]; checkboxKeys?: string[] }> = {
  site: {
    keys: ['site.title', 'site.domain', 'site.meta_description', 'site.og_image_path', 'site.active_template', 'admin.email'],
  },
  limits: {
    keys: [
      SETTING_KEYS.limitsSessionMaxMessages,
      SETTING_KEYS.limitsDailyMessageBudget,
      SETTING_KEYS.limitsIpSessionsPerDay,
    ],
    checkboxKeys: [SETTING_KEYS.agentEnabled, SETTING_KEYS.gateEnabled],
  },
  connections: {
    keys: [
      'agent.llm_provider',
      'agent.llm_api_key',
      'agent.llm_model',
      'agent.system_prompt_extra',
      'agent.search_provider',
      'agent.search_api_key',
      'notify.webhook_url',
    ],
  },
  connectivity: {
    keys: [
      'telegram.bot_token',
      'telegram.chat_id',
      'email.provider',
      'email.api_key',
      'google.client_id',
      'google.client_secret',
    ],
    checkboxKeys: [SETTING_KEYS.syncToJobOps],
  },
  mcp: {
    keys: ['mcp.master_key'],
    checkboxKeys: ['mcp.enabled'],
  },
  // Public MCP toggle lives in its own group so saving it never clobbers the
  // Master Relay MCP toggle (absent checkboxes are written as '0').
  publicmcp: {
    keys: [],
    checkboxKeys: [SETTING_KEYS.publicMcpEnabled],
  },
  // JobOps sync toggle (career packet pushing via master relay MCP).
  mcpsync: {
    keys: [],
    checkboxKeys: [SETTING_KEYS.jobopsSyncEnabled],
  },
  // HireBridge federation settings (API URL + client ID).
  hirebridge: {
    keys: ['hirebridge.api_url', 'hirebridge.client_id'],
    checkboxKeys: [],
  },
  updates: {
    keys: [SETTING_KEYS.updatesRepo, SETTING_KEYS.updatesBranch],
  },
};

export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();
  const group = String(form.get('group') || '');
  const spec = GROUPS[group];
  if (!spec) {
    return NextResponse.redirect(new URL('/admin/settings', externalBase(request)), { status: 303 });
  }
  for (const key of spec.keys) {
    const raw = form.get(key);
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    // Skip empty values for non-checkbox settings so blanks don't overwrite
    // stored secrets with "" (this is the "set → encrypted" affordance).
    if (!value && !ENCRYPTED_SETTING_KEYS.has(key)) continue;
    // Do not overwrite existing secrets with their masked placeholders from the UI.
    if (value.startsWith('••••') && ENCRYPTED_SETTING_KEYS.has(key)) continue;
    if (key === 'site.active_template' && value) {
      setActiveTemplate(db, value);
      continue;
    }
    setSetting(db, key, value || ' ');
  }
  for (const key of spec.checkboxKeys ?? []) {
    setSetting(db, key, String(form.get(key)) === 'on' ? '1' : '0');
  }
  const redirectUrl = String(form.get('redirect') || '/admin/settings?saved=1');
  return NextResponse.redirect(new URL(redirectUrl, externalBase(request)), { status: 303 });
}
