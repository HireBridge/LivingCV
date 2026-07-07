import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  ensureEncryptionKey,
  hasEncryptionKey,
  isSetupComplete,
  markSetupComplete,
} from '@/lib/settings';
import { setAdminPassword, createSession } from '@/lib/auth';
import { SETTING_KEYS } from '@mohith-das/portfolio-shared';

// GET: wizard state (whether setup is done, whether an encryption key exists).
export async function GET() {
  const db = getDb();
  return NextResponse.json({
    setupComplete: isSetupComplete(db),
    hasEncryptionKey: hasEncryptionKey(db),
    hasEnvKey: !!(process.env.PORTFOLIO_ENCRYPTION_KEY ?? '').trim(),
  });
}

// POST: drive the wizard forward. Each action is idempotent.
//   {action:'password', password}     -- sets the bcrypt-hashed admin password
//   {action:'site', title, domain, metaDescription}
//   {action:'finalize'}                -- marks setup complete + mints session
export async function POST(request: Request) {
  const db = getDb();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;
  if (action === 'password') {
    const password = body.password;
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }
    await setAdminPassword(db, password);
    return NextResponse.json({ ok: true });
  }
  if (action === 'site') {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const domain = typeof body.domain === 'string' ? body.domain.trim() : '';
    const metaDescription = typeof body.metaDescription === 'string' ? body.metaDescription.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'Site title is required.' }, { status: 400 });
    }
    const now = new Date().toISOString();
    const upsert = (key: string, value: string) =>
      db
        .prepare(
          'INSERT OR REPLACE INTO app_settings (key, value, encrypted, updated_at) VALUES (?, ?, 0, ?)',
        )
        .run(key, value, now);
    upsert(SETTING_KEYS.siteTitle, title);
    if (domain) upsert(SETTING_KEYS.siteDomain, domain);
    if (metaDescription) upsert(SETTING_KEYS.siteMetaDescription, metaDescription);
    // Make sure a bootstrap encryption key exists so this fresh instance can
    // start encrypting secrets that the wizard will store next.
    ensureEncryptionKey(db);
    return NextResponse.json({ ok: true });
  }
  if (action === 'finalize') {
    markSetupComplete(db);
    await createSession();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
