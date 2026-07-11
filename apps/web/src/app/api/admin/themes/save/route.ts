import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { upsertCustomTheme } from '@/lib/custom-themes';

const PRESET_NAMES = new Set(
  ['Classic Default', 'Cyber', 'Minimal Dark', 'Solar'].map((n) => n.toLowerCase()),
);
const PRESET_IDS = new Set(['classic', 'cyber', 'minimal_dark', 'solar']);

export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();

  const idStr = String(form.get('id') || '');
  const id = idStr ? parseInt(idStr, 10) : undefined;

  const name = String(form.get('name') || '').trim();
  const description = String(form.get('description') || '').trim();
  const themeJsonRaw = String(form.get('theme_json') || '').trim();

  if (!name || !themeJsonRaw) {
    return NextResponse.redirect(
      new URL('/admin/content?tab=theme&err=Name+and+theme+data+are+required', externalBase(request)),
      { status: 303 },
    );
  }

  const nameLower = name.toLowerCase();
  if (PRESET_NAMES.has(nameLower) || PRESET_IDS.has(nameLower)) {
    return NextResponse.redirect(
      new URL('/admin/content?tab=theme&err=Name+collides+with+a+built-in+preset', externalBase(request)),
      { status: 303 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(themeJsonRaw);
  } catch {
    return NextResponse.redirect(
      new URL('/admin/content?tab=theme&err=Invalid+theme+JSON', externalBase(request)),
      { status: 303 },
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return NextResponse.redirect(
      new URL('/admin/content?tab=theme&err=Theme+data+must+be+a+JSON+object', externalBase(request)),
      { status: 303 },
    );
  }

  try {
    upsertCustomTheme(db, { id, name, description, theme_json: themeJsonRaw });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Failed to save custom theme:', err);
    const displayMsg =
      msg.toLowerCase().includes('unique') ? 'A theme with this name already exists' : msg;
    return NextResponse.redirect(
      new URL(
        `/admin/content?tab=theme&err=${encodeURIComponent(displayMsg)}`,
        externalBase(request),
      ),
      { status: 303 },
    );
  }

  return NextResponse.redirect(
    new URL('/admin/content?tab=theme', externalBase(request)),
    { status: 303 },
  );
}
