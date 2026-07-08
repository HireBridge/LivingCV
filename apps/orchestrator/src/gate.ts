// Email-gate tool. §7: until email_verified=1, this is the only tool the LLM
// can call. The handler validates syntax, extracts the domain, rejects
// disposable/personal-domain entries (uses packages/shared's matcher), and on
// success flips email_verified=1 and fires the lead webhook.

import { createHash } from 'node:crypto';
import { isDomainDenied } from '@livingcv/shared';
import type { Db } from '@livingcv/db';
import type { ToolDef } from './llm/types.js';
import { setSessionEmailVerified } from './db.js';
import { fireLeadWebhook } from './webhook.js';
import { getSetting } from './settings.js';
import { syncLeadToJobOps } from './lead-sync.js';

export const EMAIL_RX = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

export function saltForIpHash(): string {
  return process.env.IP_HASH_SALT ?? 'portfolio-ip-salt';
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const h = createHash('sha256');
  h.update(saltForIpHash());
  h.update(ip);
  return h.digest('hex').slice(0, 32);
}

export function submitWorkEmailToolDef(): ToolDef {
  return {
    name: 'submit_work_email',
    description:
      'Submit the recruiter\'s work email. The email must come from a real company domain ' +
      '(free/personal/disposable addresses are rejected). On success the conversation continues; on ' +
      'failure the assistant should ask for a different email.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'E.g. "recruiter@stripe.com"' },
      },
      required: ['email'],
    },
  };
}

export interface EmailGateResult {
  ok: boolean;
  message: string;
}

export function submitWorkEmailImpl(
  db: Db,
  sessionId: string,
  args: Record<string, unknown>,
): EmailGateResult {
  const email = typeof args.email === 'string' ? args.email.trim() : '';
  const m = EMAIL_RX.exec(email);
  if (!m) return { ok: false, message: 'That doesn\'t look like a valid email — please double-check it.' };
  const domain = m[1]!.toLowerCase();
  if (isDomainDenied(domain, denyListFromDb(db))) {
    return {
      ok: false,
      message:
        'Please use a work email (real company domain) — free/personal mailboxes aren\'t accepted here.',
    };
  }
  setSessionEmailVerified(db, sessionId, email, domain, domain);
  // Fire the lead webhook (best-effort, never blocks the response).
  void fireLeadWebhook(db, { email, domain, channel: 'text', sessionId });
  // Sync lead to JobOps if enabled (best-effort, fire-and-forget).
  if (getSetting(db, 'notify.sync_to_jobops') === '1') {
    void syncLeadToJobOps(db, { email, domain, channel: 'text', sessionId });
  }
  return { ok: true, message: `Thanks — continuing with ${domain}.` };
}

function denyListFromDb(db: Db): string[] {
  return db.prepare<[], { domain: string }>('SELECT domain FROM disposable_domains').all().map((r) => r.domain);
}
