import type { Db } from '@mohith-das/portfolio-db';
import { hash, compare } from 'bcryptjs';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { SETTING_KEYS } from '@mohith-das/portfolio-shared';

// §2 invariant 8: one bcrypt-hashed admin password + iron-session sealed
// cookie. No user tables, no OAuth, no RBAC, no multi-tenancy.

export interface SessionData {
  admin?: boolean;
  loginAt?: number;
}

const SESSION_COOKIE = 'portfolio_admin';
const TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export function getSessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error(
      'SESSION_SECRET must be set to a >=32-char secret. Generate with: openssl rand -base64 32',
    );
  }
  return {
    cookieName: SESSION_COOKIE,
    password,
    ttl: TTL_SECONDS,
    cookieOptions: { httpOnly: true, sameSite: 'lax', path: '/' },
  };
}

// App Router: read/write the session via next/headers cookies(). In Next 16
// cookies() is async.
export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}

export async function setAdminPassword(db: Db, password: string): Promise<void> {
  if (password.length < 8) {
    throw new Error('Admin password must be at least 8 characters.');
  }
  const hashValue = await hash(password, 12);
  const now = new Date().toISOString();
  db.prepare(
    'INSERT OR REPLACE INTO app_settings (key, value, encrypted, updated_at) VALUES (?, ?, 0, ?)',
  ).run(SETTING_KEYS.adminPasswordHash, hashValue, now);
}

export async function verifyAdminPassword(db: Db, password: string): Promise<boolean> {
  const row = db
    .prepare<[string], { value: string }>('SELECT value FROM app_settings WHERE key = ?')
    .get(SETTING_KEYS.adminPasswordHash);
  if (!row || !row.value) return false;
  return compare(password, row.value);
}

export async function createSession(): Promise<void> {
  const session = await getSession();
  session.admin = true;
  session.loginAt = Date.now();
  await session.save();
}

export async function destroySession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
