import { NextResponse } from 'next/server';
import { externalBase, safeRedirect } from '@/lib/http';
import { getDb } from '@/lib/db';
import { setSetting } from '@/lib/settings';
import { setActiveTemplate } from '@/lib/content';
import { ENCRYPTED_SETTING_KEYS, SETTING_KEYS } from '@livingcv/shared';

// Generic settings writer. Maps a "group" (site/limits/connections/etc.) to a
// list of known setting keys, reads each from the form, and writes via
// setSetting (which auto-encrypts keys in ENCRYPTED_SETTING_KEYS).
const GROUPS: Record<string, { keys: string[]; checkboxKeys?: string[] }> = {
  site: {
    keys: [SETTING_KEYS.siteTitle, SETTING_KEYS.siteDomain, SETTING_KEYS.siteMetaDescription, SETTING_KEYS.siteOgImagePath, SETTING_KEYS.siteActiveTemplate, SETTING_KEYS.adminEmail],
  },
  seo: {
    keys: [
      SETTING_KEYS.siteTwitterHandle,
      SETTING_KEYS.siteLang,
      SETTING_KEYS.siteKeywords,
      SETTING_KEYS.seoGoogleSiteVerification,
      SETTING_KEYS.seoBingVerification,
      SETTING_KEYS.seoGoogleAnalyticsId,
    ]
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
      SETTING_KEYS.agentLlmProvider,
      SETTING_KEYS.agentLlmApiKey,
      SETTING_KEYS.agentLlmModel,
      SETTING_KEYS.agentSystemPromptExtra,
      SETTING_KEYS.agentSearchProvider,
      SETTING_KEYS.agentSearchApiKey,
      SETTING_KEYS.notifyWebhookUrl,
    ],
  },
  connectivity: {
    keys: [
      SETTING_KEYS.telegramBotToken,
      SETTING_KEYS.telegramChatId,
      SETTING_KEYS.emailProvider,
      SETTING_KEYS.emailApiKey,
      SETTING_KEYS.googleClientId,
      SETTING_KEYS.googleClientSecret,
    ],
    checkboxKeys: [SETTING_KEYS.syncToJobOps],
  },
  mcp: {
    keys: [SETTING_KEYS.mcpMasterKey],
    checkboxKeys: [SETTING_KEYS.mcpEnabled],
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
    keys: [SETTING_KEYS.hirebridgeApiUrl, SETTING_KEYS.hirebridgeClientId],
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
  const redirectUrl = safeRedirect(String(form.get('redirect') || ''), '/admin/settings?saved=1');
  return NextResponse.redirect(new URL(redirectUrl, externalBase(request)), { status: 303 });
}
