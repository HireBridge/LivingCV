import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { deleteSetting } from '@/lib/settings';
import { SETTING_KEYS } from '@livingcv/shared';

export async function POST(request: Request) {
  const db = getDb();

  // Clear all hirebridge settings. Best-effort: if HireBridge ever exposes a
  // revocation endpoint, call it here — not blocking today.
  deleteSetting(db, SETTING_KEYS.hirebridgeToken);
  deleteSetting(db, SETTING_KEYS.hirebridgeAccessToken);
  deleteSetting(db, SETTING_KEYS.hirebridgeNodeId);
  deleteSetting(db, SETTING_KEYS.hirebridgeClientId);
  deleteSetting(db, SETTING_KEYS.hirebridgeConnected);
  deleteSetting(db, SETTING_KEYS.hirebridgePendingAuth);
  // Legacy key from the pre-contract self-callback flow (the fabricated
  // {apiUrl}/profile/{clientId} URL we no longer store).
  db.prepare('DELETE FROM app_settings WHERE key = ?').run('hirebridge.profile_url');
  deleteSetting(db, SETTING_KEYS.hirebridgeRequestId);

  const base = externalBase(request);
  return NextResponse.redirect(new URL('/admin/settings?tab=mcp&hirebridge=disconnected', base), { status: 303 });
}