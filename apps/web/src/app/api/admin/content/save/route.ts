import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { setSection } from '@/lib/content';
import { parseJson } from '@/lib/parse-json';

function parseLinkLines(s: string): { label: string; href: string }[] {
  return s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf('|');
      if (idx < 0) return null;
      const label = line.slice(0, idx).trim();
      const href = line.slice(idx + 1).trim();
      if (!label || !href) return null;
      return { label, href };
    })
    .filter((x): x is { label: string; href: string } => x !== null);
}

// Parses JSON from a string field with a friendly error if the admin entered
// malformed JSON. Used for the theme override block.
function parseJsonField(s: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = s.trim();
  if (!trimmed) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Persist one content section. The form posts plain FormData (Label|URL per line
// for links) and this route reassembles the per-section JSON shape stored in
// site_content.
export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();
  const templateSlug = String(form.get('template_slug') || '');
  const section = String(form.get('section') || '');
  if (!templateSlug || !section) {
    return NextResponse.redirect(new URL('/admin/content', externalBase(request)), { status: 303 });
  }
  let content: unknown;
  if (section === 'hero') {
    content = {
      eyebrow: String(form.get('eyebrow') || ''),
      name: String(form.get('name') || ''),
      roleLine: String(form.get('roleLine') || ''),
      links: parseLinkLines(String(form.get('hero_links') || '')),
      diagramCenterLabel: String(form.get('diagramCenterLabel') || '') || undefined,
    };
  } else if (section === 'background') {
    content = {
      kicker: String(form.get('kicker') || ''),
      title: String(form.get('title') || ''),
      paragraphs: String(form.get('paragraphs') || '')
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
    };
  } else if (section === 'footer') {
    content = {
      links: parseLinkLines(String(form.get('footer_links') || '')),
      note: String(form.get('note') || ''),
    };
  } else if (section === 'theme') {
    const parsed = parseJsonField(String(form.get('theme_json') || '{}'));
    if (!parsed.ok) {
      return NextResponse.redirect(
        new URL(`/admin/content?err=${encodeURIComponent(parsed.error)}`, externalBase(request)),
        { status: 303 },
      );
    }
    content = parseJson<Record<string, string>>(JSON.stringify(parsed.value), {});
  } else if (section === 'order') {
    const parsed = parseJsonField(String(form.get('order_json') || '[]'));
    const parsedHidden = parseJsonField(String(form.get('hidden_json') || '[]'));
    
    if (!parsed.ok || !parsedHidden.ok) {
      const errStr = !parsed.ok ? parsed.error : (parsedHidden as { ok: false; error: string }).error;
      return NextResponse.redirect(
        new URL(`/admin/content?tab=order&err=${encodeURIComponent(errStr)}`, externalBase(request)),
        { status: 303 },
      );
    }
    content = parsed.value;
    setSection(db, templateSlug, 'hidden', parsedHidden.value);
  } else if (section === 'signals') {
    const rawLines = String(form.get('signals_lines') || '');
    const lines = rawLines.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    content = lines.map((l: string) => {
      const catMatch = l.match(/^(.+?)\s*\((.+?)\)\s*$/);
      if (catMatch) return { label: catMatch[1]!.trim(), category: catMatch[2]!.trim() };
      return { label: l };
    });
  } else if (section === 'custom_sections') {
    const parsed = parseJsonField(String(form.get('custom_sections_json') || '[]'));
    if (!parsed.ok) {
      return NextResponse.redirect(
        new URL(`/admin/content?tab=custom&err=${encodeURIComponent(parsed.error)}`, externalBase(request)),
        { status: 303 },
      );
    }
    content = parsed.value;
  } else {
    return NextResponse.redirect(new URL('/admin/content', externalBase(request)), { status: 303 });
  }
  setSection(db, templateSlug, section, content);
  
  revalidatePath('/');
  revalidatePath('/admin/content');
  
  const tabParam = ['order', 'theme', 'custom_sections'].includes(section) ? `?tab=${section === 'custom_sections' ? 'custom' : section}` : '';
  return NextResponse.redirect(new URL(`/admin/content${tabParam}`, externalBase(request)), { status: 303 });
}
