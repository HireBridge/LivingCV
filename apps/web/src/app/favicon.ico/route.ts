import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { getResolvedFaviconPath, getFaviconMimeType, faviconExists } from '@/lib/favicon';
import { SETTING_KEYS } from '@livingcv/shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const hasCustom = getSetting(db, SETTING_KEYS.siteFavicon);

  if (hasCustom === '1' && faviconExists()) {
    const path = getResolvedFaviconPath();
    if (path) {
      const buf = readFileSync(path);
      return new NextResponse(buf, {
        headers: {
          'Content-Type': getFaviconMimeType(),
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }
  }

  return new NextResponse(null, { status: 404 });
}
