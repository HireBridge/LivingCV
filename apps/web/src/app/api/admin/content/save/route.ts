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
    // Read the existing stored hero JSON so we can preserve the diagram field
    // (which is not exposed as individual form inputs — just the JSON textarea).
    const db = getDb();
    const existing = (() => {
      const row = db
        .prepare<[string, string], { content: string }>(
          'SELECT content FROM site_content WHERE template_slug = ? AND section_key = ? ORDER BY id DESC LIMIT 1',
        )
        .get(templateSlug, 'hero');
      try { return row?.content ? JSON.parse(row.content) as Record<string, unknown> : {}; }
      catch { return {}; }
    })();

    // Parse the diagram textarea — may be empty (unchanged) or new JSON.
    const diagramRaw = String(form.get('diagram_json') || '').trim();
    let diagram: unknown = existing['diagram'];
    if (diagramRaw) {
      const parsed = parseJsonField(diagramRaw);
      if (!parsed.ok) {
        return NextResponse.redirect(
          new URL(`/admin/content?err=${encodeURIComponent(parsed.error)}`, externalBase(request)),
          { status: 303 },
        );
      }
      diagram = parsed.value;
    }

    content = {
      eyebrow: String(form.get('eyebrow') || ''),
      name: String(form.get('name') || ''),
      roleLine: String(form.get('roleLine') || ''),
      links: parseLinkLines(String(form.get('hero_links') || '')),
      diagramCenterLabel: String(form.get('diagramCenterLabel') || '') || undefined,
      ...(diagram !== undefined ? { diagram } : {}),
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
  } else if (section === 'section_labels') {
    const labels: Record<string, { kicker?: string; title?: string; navLabel?: string }> = {};
    const SEC_IDS = ['projects', 'alsoShipped', 'background', 'signals', 'contact'];
    for (const id of SEC_IDS) {
      const kicker = String(form.get(`${id}_kicker`) || '').trim();
      const title = String(form.get(`${id}_title`) || '').trim();
      const navLabel = String(form.get(`${id}_navLabel`) || '').trim();
      
      if (kicker || title || navLabel) {
        labels[id] = {};
        if (kicker) labels[id].kicker = kicker;
        if (title) labels[id].title = title;
        if (navLabel) labels[id].navLabel = navLabel;
      }
    }
    content = labels;
  } else {
    return NextResponse.redirect(new URL('/admin/content', externalBase(request)), { status: 303 });
  }
  setSection(db, templateSlug, section, content);
  
  revalidatePath('/');
  revalidatePath('/admin/content');
  
  const tabParam = ['order', 'theme', 'custom_sections', 'section_labels'].includes(section) ? `?tab=${section === 'custom_sections' ? 'custom' : section === 'section_labels' ? 'labels' : section}` : '';
  return NextResponse.redirect(new URL(`/admin/content${tabParam}`, externalBase(request)), { status: 303 });
}
