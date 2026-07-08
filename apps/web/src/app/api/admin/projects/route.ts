import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { createProject, deleteProject } from '@/lib/content';

// Convert the FormData fields into the shape the content module expects.
function readFormFields(form: FormData) {
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
      // Wrap free-text body into the 3-col shape so admins don't need raw JSON
      // for the common case. Advanced admins can edit body JSON directly on the
      // /api/admin/projects/[id] JSON endpoint.
      bodyJson = JSON.stringify({
        designDecision: bodyText,
        whatsReal: '',
        honestConstraint: '',
      });
    }
  }
  return {
    title: pick('title'),
    tagline: pick('tagline') || null,
    kind: pick('kind') || null,
    repo_url: pick('repo_url') || null,
    demo_url: pick('demo_url') || null,
    package_url: pick('package_url') || null,
    status: pick('status') || null,
    sort_order: num('sort_order'),
    featured: pick('featured') === 'on' ? 1 : 0,
    diagram_svg: pick('diagram_svg') || null,
    body: bodyJson,
    install_cmd: pick('install_cmd') || null,
  };
}

export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();
  const action = String(form.get('_action') || 'create');
  if (action === 'delete') {
    const id = Number(form.get('id'));
    if (Number.isFinite(id)) deleteProject(db, id);
    return NextResponse.redirect(new URL('/admin/projects', externalBase(request)), { status: 303 });
  }
  if (action === 'create') {
    const slug = String(form.get('slug') || '').trim();
    const fields = readFormFields(form);
    if (!slug) {
      return NextResponse.redirect(
        new URL('/admin/projects?err=slug-required', externalBase(request)),
        { status: 303 },
      );
    }
    const id = createProject(db, { slug, ...fields });
    return NextResponse.redirect(new URL(`/admin/projects/${id}`, externalBase(request)), { status: 303 });
  }
  return NextResponse.redirect(new URL('/admin/projects', externalBase(request)), { status: 303 });
}
