import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { upsertBlog } from '@/lib/blogs';

export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();
  
  const idStr = String(form.get('id') || '');
  const id = idStr ? parseInt(idStr, 10) : undefined;
  
  const slug = String(form.get('slug') || '').trim();
  const title = String(form.get('title') || '').trim();
  const summary = String(form.get('summary') || '').trim();
  const body_markdown = String(form.get('body_markdown') || '');
  const published = form.get('published') === '1' ? 1 : 0;

  if (!slug || !title) {
    return NextResponse.redirect(new URL('/admin/blogs', externalBase(request)), { status: 303 });
  }

  try {
    upsertBlog(db, { id, slug, title, summary, body_markdown, published });
    return NextResponse.redirect(new URL('/admin/blogs', externalBase(request)), { status: 303 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Failed to save blog:', err);
    // If unique constraint fails or something
    return NextResponse.redirect(new URL(`/admin/blogs/${id || 'new'}?error=${encodeURIComponent(msg)}`, externalBase(request)), { status: 303 });
  }
}
