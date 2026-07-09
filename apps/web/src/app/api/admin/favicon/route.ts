import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { setSetting, deleteSetting } from '@/lib/settings';
import { getFaviconDir, removeFavicon, isAllowedFaviconType, faviconExtensionFromMime } from '@/lib/favicon';
import { SETTING_KEYS } from '@livingcv/shared';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();
  const redirectUrl = String(form.get('redirect') || '/admin/settings?tab=general');
  const errUrl = String(form.get('redirect') ? form.get('redirect') + '&favicon_err=' : '/admin/settings?tab=general&favicon_err=');

  const file = form.get('favicon');
  if (!(file instanceof File)) {
    return NextResponse.redirect(new URL(errUrl + 'file', externalBase(request)), { status: 303 });
  }

  const type = file.type || '';
  if (!isAllowedFaviconType(type)) {
    return NextResponse.redirect(new URL(errUrl + 'type', externalBase(request)), { status: 303 });
  }

  if (file.size > 512 * 1024) {
    return NextResponse.redirect(new URL(errUrl + 'size', externalBase(request)), { status: 303 });
  }

  removeFavicon();

  const ext = faviconExtensionFromMime(type);
  const dir = getFaviconDir();
  const path = join(dir, 'favicon' + ext);

  const webStream = file.stream();
  const nodeReadable = Readable.fromWeb(webStream as unknown as import('node:stream/web').ReadableStream<Uint8Array>);

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(path);
    nodeReadable.pipe(out);
    out.on('finish', () => resolve());
    out.on('error', reject);
    nodeReadable.on('error', reject);
  });

  setSetting(db, SETTING_KEYS.siteFavicon, '1');
  return NextResponse.redirect(new URL(redirectUrl + '&favicon=saved', externalBase(request)), { status: 303 });
}

export async function DELETE() {
  const db = getDb();
  removeFavicon();
  deleteSetting(db, SETTING_KEYS.siteFavicon);
  return NextResponse.json({ ok: true });
}
