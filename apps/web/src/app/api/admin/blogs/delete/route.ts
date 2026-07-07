import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { deleteBlog } from '@/lib/blogs';

export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();
  
  const idStr = String(form.get('id') || '');
  const id = idStr ? parseInt(idStr, 10) : undefined;

  if (id) {
    try {
      deleteBlog(db, id);
    } catch (err) {
      console.error('Failed to delete blog:', err);
    }
  }
  
  return NextResponse.redirect(new URL('/admin/blogs', request.url), { status: 303 });
}
