import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getSetting, setSetting, deleteSetting } from '@/lib/settings';
import { SETTING_KEYS, deriveCandidateId } from '@livingcv/shared';

export const dynamic = 'force-dynamic';

// Canonical Federation Contract v1 — device auth flow against HireBridge.
// Step 1: POST {api}/auth/device (JSON {node_type, endpoint_url})
// Step 2: POST {api}/auth/request (form-encoded email + user_code) — emails
//         the admin a magic link. The admin clicks it on HireBridge's side
//         and then the React UI polls /api/hirebridge/poll until success.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const email = getSetting(db, SETTING_KEYS.adminEmail);
  if (!email) {
    return NextResponse.json({ error: 'Add your admin email first in General settings.' }, { status: 400 });
  }

  const apiUrl = (getSetting(db, SETTING_KEYS.hirebridgeApiUrl) || '').replace(/\/$/, '');
  if (!apiUrl) {
    return NextResponse.json({ error: 'HireBridge API URL not configured. Set it in MCP settings.' }, { status: 400 });
  }

  const base = externalBase(request);
  const clientId = deriveCandidateId(email);

  // Step 1: /auth/device
  const deviceRes = await fetch(`${apiUrl}/auth/device`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ node_type: 'livingcv', endpoint_url: base }),
    signal: AbortSignal.timeout(10000),
  }).catch((e) => ({ __networkError: e instanceof Error ? e.message : String(e) } as const));
  if ('__networkError' in deviceRes) {
    return NextResponse.json({ error: `Could not reach HireBridge: ${deviceRes.__networkError}` }, { status: 502 });
  }
  if (!deviceRes.ok) {
    return NextResponse.json({ error: `HireBridge /auth/device returned ${deviceRes.status}` }, { status: 502 });
  }
  const device = (await deviceRes.json()) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    verification_uri_complete?: string;
    expires_in?: number;
    interval?: number;
  };
  if (!device.device_code || !device.user_code) {
    return NextResponse.json({ error: 'HireBridge /auth/device returned an invalid payload.' }, { status: 502 });
  }

  // Step 2: /auth/request — HireBridge emails the magic link.
  const requestBody = new URLSearchParams({ email, uc: device.user_code });
  const reqRes = await fetch(`${apiUrl}/auth/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: requestBody.toString(),
    signal: AbortSignal.timeout(10000),
  }).catch((e) => ({ __networkError: e instanceof Error ? e.message : String(e) } as const));
  if ('__networkError' in reqRes) {
    return NextResponse.json({ error: `Could not reach HireBridge: ${reqRes.__networkError}` }, { status: 502 });
  }
  if (!reqRes.ok) {
    return NextResponse.json({ error: `HireBridge /auth/request returned ${reqRes.status}` }, { status: 502 });
  }

  // Persist pending state. The interval is enforced client-side on each poll.
  const interval = Math.max(1, device.interval ?? 5);
  const expiresAt = Date.now() + Math.max(60, device.expires_in ?? 600) * 1000;
  const pending = {
    device_code: device.device_code,
    user_code: device.user_code,
    interval,
    expires_at: expiresAt,
    verification_uri_complete: device.verification_uri_complete ?? device.verification_uri ?? null,
    api_url: apiUrl,
    admin_email: email,
    client_id: clientId,
  };
  setSetting(db, SETTING_KEYS.hirebridgePendingAuth, JSON.stringify(pending));
  // Defensive: clear any legacy request_id state from the old self-callback flow.
  deleteSetting(db, SETTING_KEYS.hirebridgeRequestId);

  return NextResponse.json({
    ok: true,
    message: `Magic link sent to ${email} — click it, then finish here.`,
    verification_uri_complete: pending.verification_uri_complete,
    interval,
    expires_at: expiresAt,
  });
}