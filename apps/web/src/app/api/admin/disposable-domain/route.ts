import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();
  const action = String(form.get('_action') || '');
  const redirectUrl = String(form.get('redirect') || '/admin/settings?saved=domain');
  
  if (action === 'add') {
    const domain = String(form.get('domain') || '').trim().toLowerCase();
    if (!domain || !/^[a-z0-9.*-]+$/.test(domain)) {
      return NextResponse.redirect(new URL('/admin/settings?err=domain-format', externalBase(request)), { status: 303 });
    }
    const now = new Date().toISOString();
    db.prepare(
      'INSERT OR IGNORE INTO disposable_domains (domain, source, added_at) VALUES (?, ?, ?)',
    ).run(domain, 'admin_added', now);
    return NextResponse.redirect(new URL(redirectUrl, externalBase(request)), { status: 303 });
  }
  if (action === 'remove') {
    const domain = String(form.get('domain') || '').trim().toLowerCase();
    const row = db
      .prepare<[string], { source: string }>('SELECT source FROM disposable_domains WHERE domain = ?')
      .get(domain);
    if (row && row.source !== 'builtin') {
      db.prepare('DELETE FROM disposable_domains WHERE domain = ?').run(domain);
    }
    return NextResponse.redirect(new URL(redirectUrl, externalBase(request)), { status: 303 });
  }
  return NextResponse.redirect(new URL('/admin/settings', externalBase(request)), { status: 303 });
}
