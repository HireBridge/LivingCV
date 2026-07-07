import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyAdminPassword, createSession } from '@/lib/auth';

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
  
  const expectedEmail = process.env.ADMIN_EMAIL;
  if (!expectedEmail || email.toLowerCase().trim() !== expectedEmail.toLowerCase().trim()) {
    return NextResponse.json({ error: 'Wrong email or password.' }, { status: 401 });
  }

  const ok = await verifyAdminPassword(db, password);
  if (!ok) {
    return NextResponse.json({ error: 'Wrong email or password.' }, { status: 401 });
  }
  await createSession();
  return NextResponse.json({ ok: true });
}
