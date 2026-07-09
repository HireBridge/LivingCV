import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';
import { verifyAdminPassword, createSession } from '@/lib/auth';
import { systemLog } from '@livingcv/db';

const FAILED_MAP = new Map<string, { count: number; firstAt: number }>();
const MAX_FAILURES = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

function ipHash(req: Request): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const h = createHash('sha256');
  h.update('login-brute-force-salt');
  h.update(ip);
  return h.digest('hex').slice(0, 32);
}

export async function POST(request: Request) {
  const db = getDb();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = body.email;
  const password = body.password;

  if (typeof email !== 'string' || !email) {
    return NextResponse.json({ error: 'Email required.' }, { status: 400 });
  }
  if (typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'Password required.' }, { status: 400 });
  }

  const hash = ipHash(request);
  const now = Date.now();

  // Clean up stale entries.
  for (const [k, v] of FAILED_MAP) {
    if (now - v.firstAt > FAIL_WINDOW_MS) FAILED_MAP.delete(k);
  }

  const entry = FAILED_MAP.get(hash);
  if (entry && entry.count >= MAX_FAILURES) {
    const retrySec = Math.ceil((entry.firstAt + FAIL_WINDOW_MS - now) / 1000);
    return NextResponse.json(
      { error: `Too many login attempts. Try again in ${retrySec}s.` },
      { status: 429, headers: { 'Retry-After': String(retrySec) } },
    );
  }

  const allSettings = getAllSettings(db);
  const expectedEmail = allSettings['admin.email'];

  const emailMatch = expectedEmail
    ? email.toLowerCase().trim() === expectedEmail.toLowerCase().trim()
    : true;

  const ok = await verifyAdminPassword(db, password);

  if (!emailMatch || !ok) {
    const current = FAILED_MAP.get(hash) ?? { count: 0, firstAt: now };
    current.count++;
    FAILED_MAP.set(hash, current);
    systemLog(db, 'warn', `Failed login attempt for ${email} from ${hash}`);
    return NextResponse.json({ error: 'Wrong email or password.' }, { status: 401 });
  }

  // Successful login clears the failure counter.
  FAILED_MAP.delete(hash);

  await createSession();
  return NextResponse.json({ ok: true });
}
