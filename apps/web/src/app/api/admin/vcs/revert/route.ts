import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();
  const idStr = String(form.get('id') || '');
  const id = parseInt(idStr, 10);

  if (!id || isNaN(id)) {
    return NextResponse.redirect(new URL('/admin/vcs', request.url), { status: 303 });
  }

  // Fetch the target row
  const row = db.prepare<[number], { template_slug: string; section_key: string; content: string }>(
    'SELECT template_slug, section_key, content FROM site_content WHERE id = ?'
  ).get(id);

  if (row) {
    const now = new Date().toISOString();
    // Revert by appending a new row with the old content
    db.prepare(
      'INSERT INTO site_content (template_slug, section_key, content, position, updated_at) VALUES (?, ?, ?, 0, ?)'
    ).run(row.template_slug, row.section_key, row.content, now);
  }

  return NextResponse.redirect(new URL('/admin/vcs?success=1', request.url), { status: 303 });
}
