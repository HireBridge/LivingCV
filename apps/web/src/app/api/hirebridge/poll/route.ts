import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getSetting, setSetting, deleteSetting } from '@/lib/settings';
import { SETTING_KEYS, deriveCandidateId } from '@livingcv/shared';

export const dynamic = 'force-dynamic';

// Canonical Federation Contract v1 — poll step of the device-auth flow.
// Performs ONE /auth/token call per request; the React UI schedules them at
// the HireBridge-supplied interval. RFC 8628: pending/slow_down/expired arrive
// as HTTP 400 + {"error": …}, success as 200 + {access_token, node_id,
// intro_secret, …}.
export async function POST() {
  const session = await getSession();
  if (!session.admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const pendingRaw = getSetting(db, SETTING_KEYS.hirebridgePendingAuth);
  if (!pendingRaw) {
    return NextResponse.json({ error: 'No pending HireBridge connection. Click Connect first.' }, { status: 400 });
  }

  let pending: {
    device_code?: string;
    interval?: number;
    expires_at?: number;
    api_url?: string;
    admin_email?: string;
    client_id?: string;
  };
  try {
    pending = JSON.parse(pendingRaw);
  } catch {
    deleteSetting(db, SETTING_KEYS.hirebridgePendingAuth);
    return NextResponse.json({ error: 'Pending state was corrupted. Click Connect again.' }, { status: 400 });
  }

  if (!pending.device_code || !pending.api_url) {
    deleteSetting(db, SETTING_KEYS.hirebridgePendingAuth);
    return NextResponse.json({ error: 'Pending state missing required fields. Click Connect again.' }, { status: 400 });
  }

  if (Date.now() > (pending.expires_at ?? 0)) {
    deleteSetting(db, SETTING_KEYS.hirebridgePendingAuth);
    return NextResponse.json({ error: 'Device code expired. Click Connect again.' }, { status: 410 });
  }

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: pending.device_code,
  });
  const res = await fetch(`${pending.api_url}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  }).catch((e) => ({ __networkError: e instanceof Error ? e.message : String(e) } as const));

  if ('__networkError' in res) {
    return NextResponse.json({ error: `Could not reach HireBridge: ${res.__networkError}` }, { status: 502 });
  }

  if (res.status === 400) {
    let err = 'unknown';
    try {
      const parsed = (await res.json()) as { error?: string };
      if (typeof parsed.error === 'string') err = parsed.error;
    } catch {
      // ignore — keep the generic unknown
    }
    if (err === 'authorization_pending') {
      return NextResponse.json({ pending: true, interval: pending.interval ?? 5 });
    }
    if (err === 'slow_down') {
      const newInterval = (pending.interval ?? 5) + 5;
      pending.interval = newInterval;
      setSetting(db, SETTING_KEYS.hirebridgePendingAuth, JSON.stringify(pending));
      return NextResponse.json({ pending: true, interval: newInterval });
    }
    if (err === 'expired_token' || err === 'access_denied') {
      deleteSetting(db, SETTING_KEYS.hirebridgePendingAuth);
      return NextResponse.json({ error: `HireBridge rejected the device code (${err}). Click Connect again.` }, { status: 410 });
    }
    return NextResponse.json({ error: `HireBridge /auth/token returned ${err}` }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: `HireBridge /auth/token returned ${res.status}` }, { status: 502 });
  }

  const token = (await res.json()) as {
    access_token?: string;
    node_id?: string;
    token_type?: string;
    scope?: string;
    intro_secret?: string;
  };
  if (!token.access_token || !token.intro_secret || !token.node_id) {
    return NextResponse.json({ error: 'HireBridge /auth/token returned an invalid payload.' }, { status: 502 });
  }

  // Persist the contract's required keys.
  const email = pending.admin_email ?? getSetting(db, SETTING_KEYS.adminEmail) ?? '';
  const clientId = pending.client_id ?? deriveCandidateId(email);

  setSetting(db, SETTING_KEYS.hirebridgeAccessToken, token.access_token);
  setSetting(db, SETTING_KEYS.hirebridgeToken, token.intro_secret);
  setSetting(db, SETTING_KEYS.hirebridgeNodeId, token.node_id);
  setSetting(db, SETTING_KEYS.hirebridgeClientId, clientId);
  setSetting(db, SETTING_KEYS.hirebridgeConnected, '1');
  deleteSetting(db, SETTING_KEYS.hirebridgePendingAuth);
  // Defensive: nuke any leftover state from the old self-callback flow.
  deleteSetting(db, SETTING_KEYS.hirebridgeRequestId);

  return NextResponse.json({ connected: true, node_id: token.node_id, client_id: clientId });
}