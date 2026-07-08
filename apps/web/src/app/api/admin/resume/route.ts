import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { setSetting } from '@/lib/settings';
import { saveResumeStream } from '@/lib/resume';
import { SETTING_KEYS } from '@livingcv/shared';
import { Readable } from 'node:stream';

// Reads a PDF upload from a multipart/form-data request and streams it to
// DATA_DIR/resume/<sanitized filename>. Stores the filename in app_settings
// (resume.filename). The /resume route serves it back as application/pdf.
export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();
  const redirectUrl = String(form.get('redirect') || '/admin/packet?saved=resume');
  const errUrl = String(form.get('redirect') ? form.get('redirect') + '&err=' : '/admin/packet?err=');
  
  const file = form.get('resume');
  if (!(file instanceof File)) {
    return NextResponse.redirect(new URL(errUrl + 'file', externalBase(request)), { status: 303 });
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.redirect(new URL(errUrl + 'pdf-only', externalBase(request)), { status: 303 });
  }
  const filename = file.name.replace(/[^A-Za-z0-9._-]/g, '_');
  if (!filename) {
    return NextResponse.redirect(new URL(errUrl + 'name', externalBase(request)), { status: 303 });
  }
  const webStream = file.stream();
  const nodeReadable = Readable.fromWeb(webStream as unknown as import('node:stream/web').ReadableStream<Uint8Array>);
  await saveResumeStream(filename, nodeReadable);
  setSetting(db, SETTING_KEYS.resumeFilename, filename);
  return NextResponse.redirect(new URL(redirectUrl, externalBase(request)), { status: 303 });
}
