import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { getResumePath } from '@/lib/resume';
import { SETTING_KEYS } from '@mohith-das/portfolio-shared';

export const dynamic = 'force-dynamic';

// Serves the admin-uploaded resume PDF. The filename is stored in
// app_settings (resume.filename); the file lives under DATA_DIR/resume/<name>.
// Returns 404 if not configured — the admin must upload one via the console.
export async function GET() {
  const db = getDb();
  const filename = getSetting(db, SETTING_KEYS.resumeFilename);
  if (!filename) {
    return new NextResponse('Resume not configured', { status: 404 });
  }
  const path = getResumePath(filename);
  if (!existsSync(path)) {
    return new NextResponse('Resume not found on disk', { status: 404 });
  }
  const buf = readFileSync(path);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'public, max-age=60',
    },
  });
}
