import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { deleteCustomTheme } from '@/lib/custom-themes';

export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();

  const idStr = String(form.get('id') || '');
  const id = idStr ? parseInt(idStr, 10) : undefined;

  if (id) {
    try {
      deleteCustomTheme(db, id);
    } catch (err) {
      console.error('Failed to delete custom theme:', err);
    }
  }

  return NextResponse.redirect(
    new URL('/admin/content?tab=theme', externalBase(request)),
    { status: 303 },
  );
}
