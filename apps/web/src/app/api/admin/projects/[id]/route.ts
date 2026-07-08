import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { updateProject } from '@/lib/content';

// Update a single project.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) {
    return NextResponse.redirect(new URL('/admin/projects', externalBase(request)), { status: 303 });
  }
  const db = getDb();
  const form = await request.formData();
  const pick = (k: string) => String(form.get(k) ?? '').trim();
  const num = (k: string) => {
    const v = pick(k);
    if (v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const bodyText = pick('body');
  let bodyJson: string | null = null;
  if (bodyText) {
    try {
      JSON.parse(bodyText);
      bodyJson = bodyText;
    } catch {
      bodyJson = JSON.stringify({ designDecision: bodyText, whatsReal: '', honestConstraint: '' });
    }
  }
  updateProject(db, id, {
    title: pick('title') || undefined,
    tagline: pick('tagline') || undefined,
    kind: pick('kind') || undefined,
    repo_url: pick('repo_url') || undefined,
    demo_url: pick('demo_url') || undefined,
    package_url: pick('package_url') || undefined,
    status: pick('status') || undefined,
    sort_order: num('sort_order'),
    featured: pick('featured') === 'on' ? 1 : 0,
    diagram_svg: pick('diagram_svg') || undefined,
    body: bodyJson,
    install_cmd: pick('install_cmd') || undefined,
  });
  return NextResponse.redirect(new URL(`/admin/projects/${id}`, externalBase(request)), { status: 303 });
}
