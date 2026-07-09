import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { getSetting, setSetting } from '@/lib/settings';
import { SETTING_KEYS } from '@livingcv/shared';
import crypto from 'node:crypto';

export async function POST(request: Request) {
  const db = getDb();
  const email = getSetting(db, SETTING_KEYS.adminEmail);
  if (!email) {
    return NextResponse.json({ error: 'Add your admin email first in General settings.' }, { status: 400 });
  }

  const apiUrl = getSetting(db, SETTING_KEYS.hirebridgeApiUrl) || '';
  if (!apiUrl) {
    return NextResponse.json({ error: 'HireBridge API URL not configured. Set it in MCP settings.' }, { status: 400 });
  }

  // Generate a request_id and sign a token using the client_id as HMAC secret.
  const clientId = getSetting(db, SETTING_KEYS.hirebridgeClientId) || '';
  const requestId = crypto.randomUUID();
  const iat = Date.now();
  const tokenPayload = JSON.stringify({ requestId, email, iat });
  const token = crypto.createHmac('sha256', clientId || 'hirebridge-dev').update(tokenPayload).digest('hex');

  // Store the pending request (encrypted in settings).
  setSetting(db, SETTING_KEYS.hirebridgeRequestId, JSON.stringify({ requestId, email, token, iat }));

  // Return the magic link so the authenticated admin can open it themselves.
  const baseUrl = externalBase(request);
  const callbackUrl = `${baseUrl}/api/hirebridge/callback?request_id=${encodeURIComponent(requestId)}&token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    ok: true,
    message: 'Magic link generated. Open it to complete the connection.',
    magicLink: callbackUrl,
  });
}
