// §12 feature 3 — lead webhook: on each newly verified recruiter email, POST
// {email, companyDomain, channel, timestamp, sessionUrl} to notify.webhook_url.
// Fire-and-forget (5s timeout) so a slow endpoint never blocks the chat.

import type { Db } from '@portfolio/db';
import { getSetting } from './settings.js';

export interface LeadWebhookPayload {
  email: string;
  domain: string;
  channel: 'text' | 'voice';
  sessionId: string;
}

export function fireLeadWebhook(db: Db, payload: LeadWebhookPayload): void {
  const url = (getSetting(db, 'notify.webhook_url') ?? '').trim();
  if (!url) return;
  // sessionUrl is computed by the caller at higher layers; the orchestrator here
  // hands off just identifiers + a hint. The web app generates the public URL.
  const body = JSON.stringify({
    email: payload.email,
    companyDomain: payload.domain,
    channel: payload.channel,
    timestamp: new Date().toISOString(),
    sessionId: payload.sessionId,
  });
  void postWithTimeout(url, body, 5000);
}

async function postWithTimeout(url: string, body: string, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) },
      body,
      signal: controller.signal,
    });
  } catch {
    // silent — webhook is best-effort.
  } finally {
    clearTimeout(t);
  }
}
