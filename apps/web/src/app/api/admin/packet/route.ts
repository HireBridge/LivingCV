import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export async function POST(request: Request) {
  const form = await request.formData();
  const cvMd = String(form.get('cv_md') || '');
  const profileYaml = String(form.get('profile_yaml') || '');

  try {
    const dataDir = process.env.DATA_DIR || './data';
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(path.join(dataDir, 'cv.md'), cvMd);
    fs.writeFileSync(path.join(dataDir, 'profile.yaml'), profileYaml);

    return NextResponse.redirect(new URL('/admin/packet?saved=1', request.url), { status: 303 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Failed to update career data:', err);
    return NextResponse.redirect(new URL('/admin/packet?error=' + encodeURIComponent(msg), request.url), { status: 303 });
  }
}
