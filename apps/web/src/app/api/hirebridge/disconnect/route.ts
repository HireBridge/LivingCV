import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { deleteSetting } from '@/lib/settings';
import { SETTING_KEYS } from '@livingcv/shared';

export async function POST(request: Request) {
  const db = getDb();

  // Clear all hirebridge settings.
  deleteSetting(db, SETTING_KEYS.hirebridgeToken);
  deleteSetting(db, SETTING_KEYS.hirebridgeConnected);
  deleteSetting(db, SETTING_KEYS.hirebridgeProfileUrl);
  deleteSetting(db, SETTING_KEYS.hirebridgeRequestId);

  const base = externalBase(request);
  return NextResponse.redirect(new URL('/admin/settings?tab=mcp&hirebridge=disconnected', base), { status: 303 });
}
