import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Admin-managed rows for the email-gate denylist. Built-in rows come from
// packages/shared (source='builtin', immutable here); admin rows can be added
// or removed. Supports wildcard suffixes (`yahoo.*`) in both stored patterns
// and the matcher.
export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();
  const action = String(form.get('_action') || '');
  if (action === 'add') {
    const domain = String(form.get('domain') || '').trim().toLowerCase();
    if (!domain || !/^[a-z0-9.*-]+$/.test(domain)) {
      return NextResponse.redirect(new URL('/admin/settings?err=domain-format', request.url), { status: 303 });
    }
    const now = new Date().toISOString();
    db.prepare(
      'INSERT OR IGNORE INTO disposable_domains (domain, source, added_at) VALUES (?, ?, ?)',
    ).run(domain, 'admin_added', now);
    return NextResponse.redirect(new URL('/admin/settings?saved=domain', request.url), { status: 303 });
  }
  if (action === 'remove') {
    const domain = String(form.get('domain') || '').trim().toLowerCase();
    // Don't remove the builtin rows — they're the auditable baseline.
    const row = db
      .prepare<[string], { source: string }>('SELECT source FROM disposable_domains WHERE domain = ?')
      .get(domain);
    if (row && row.source !== 'builtin') {
      db.prepare('DELETE FROM disposable_domains WHERE domain = ?').run(domain);
    }
    return NextResponse.redirect(new URL('/admin/settings?saved=domain', request.url), { status: 303 });
  }
  return NextResponse.redirect(new URL('/admin/settings', request.url), { status: 303 });
}
