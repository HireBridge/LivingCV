import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';
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
  
  const allSettings = getAllSettings(db);
  const expectedEmail = allSettings['admin.email'];
  // Constant-time check: always verify the password hash even if the email fails
  // to avoid timing attacks enumerating the admin email.
  // We use crypto.timingSafeEqual for the email string? No, just run both.
  
  // We still do string comparison for email, but don't early return.
  const emailMatch = expectedEmail 
    ? email.toLowerCase().trim() === expectedEmail.toLowerCase().trim()
    : true;
  
  const ok = await verifyAdminPassword(db, password);
  
  if (!emailMatch || !ok) {
    return NextResponse.json({ error: 'Wrong email or password.' }, { status: 401 });
  }
  await createSession();
  return NextResponse.json({ ok: true });
}
