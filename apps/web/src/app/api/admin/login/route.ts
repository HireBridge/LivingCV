import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyAdminPassword, createSession } from '@/lib/auth';

export async function POST(request: Request) {
  const db = getDb();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const password = body.password;
  if (typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'Password required.' }, { status: 400 });
  }
  const ok = await verifyAdminPassword(db, password);
  if (!ok) {
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
  }
  await createSession();
  return NextResponse.json({ ok: true });
}
