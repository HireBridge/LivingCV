import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { getSetting, setSetting, deleteSetting } from '@/lib/settings';
import { SETTING_KEYS } from '@livingcv/shared';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const receivedRequestId = searchParams.get('request_id');
  const receivedToken = searchParams.get('token');

  if (!receivedRequestId || !receivedToken) {
    return new NextResponse('Missing request_id or token', { status: 400 });
  }

  const db = getDb();
  const storedRaw = getSetting(db, SETTING_KEYS.hirebridgeRequestId);

  if (!storedRaw) {
    return new NextResponse('No pending connection request found. Try connecting again.', { status: 400 });
  }

  let stored: { requestId: string; email: string; token: string };
  try {
    stored = JSON.parse(storedRaw);
  } catch {
    return new NextResponse('Invalid stored request data.', { status: 400 });
  }

  if (stored.requestId !== receivedRequestId) {
    return new NextResponse('Request ID mismatch. Try connecting again.', { status: 400 });
  }

  if (stored.token !== receivedToken) {
    return new NextResponse('Invalid token. Try connecting again.', { status: 401 });
  }

  // Token matches — establish the connection.

  // Generate a persistent federation token.
  const federationToken = crypto.randomBytes(32).toString('hex');
  const hbClientId = getSetting(db, SETTING_KEYS.hirebridgeClientId) || 'hirebridge-dev';
  const profileUrl = `${getSetting(db, SETTING_KEYS.hirebridgeApiUrl) || ''}/profile/${encodeURIComponent(hbClientId)}`;

  setSetting(db, SETTING_KEYS.hirebridgeToken, federationToken);
  setSetting(db, SETTING_KEYS.hirebridgeConnected, '1');
  setSetting(db, SETTING_KEYS.hirebridgeProfileUrl, profileUrl);
  deleteSetting(db, SETTING_KEYS.hirebridgeRequestId);

  const base = externalBase(request);
  return NextResponse.redirect(new URL('/admin/settings?tab=mcp&hirebridge=connected', base), { status: 303 });
}
