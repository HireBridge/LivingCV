import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { upsertCaseStudy } from '@/lib/content';
import type { CaseStudyFrontmatter } from '@/lib/types';

function readFrontmatter(form: FormData): string {
  const fm: CaseStudyFrontmatter = {
    title: String(form.get('fm_title') ?? ''),
    summary: String(form.get('fm_summary') ?? ''),
    stack: String(form.get('fm_stack') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    status: String(form.get('fm_status') ?? ''),
    links: {
      repo: String(form.get('fm_repo') ?? '') || undefined,
      demo: String(form.get('fm_demo') ?? '') || undefined,
      package: String(form.get('fm_package') ?? '') || undefined,
    },
    highlights: String(form.get('fm_highlights') ?? '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
  };
  return JSON.stringify(fm);
}

export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();
  const action = String(form.get('_action') || '');

  if (action === 'create') {
    const slug = String(form.get('slug') || '').trim();
    const projectIdRaw = String(form.get('project_id') || '');
    const projectId = projectIdRaw ? Number(projectIdRaw) : null;
    if (!slug) {
      return NextResponse.redirect(new URL('/admin/case-studies?err=slug', externalBase(request)), {
        status: 303,
      });
    }
    const id = upsertCaseStudy(db, {
      project_id: projectId,
      slug,
      frontmatter: null,
      body_markdown: null,
      published: 0,
    });
    return NextResponse.redirect(new URL(`/admin/case-studies/${id}`, externalBase(request)), { status: 303 });
  }

  if (action === 'update') {
    const id = Number(form.get('id'));
    if (!Number.isFinite(id)) {
      return NextResponse.redirect(new URL('/admin/case-studies', externalBase(request)), { status: 303 });
    }
    const slug = String(form.get('slug') || '').trim();
    const projectIdRaw = String(form.get('project_id') || '');
    const projectId = projectIdRaw ? Number(projectIdRaw) : null;
    const frontmatter = readFrontmatter(form);
    const body = String(form.get('body_markdown') ?? '');
    const published = String(form.get('published') || '') === 'on' ? 1 : 0;
    upsertCaseStudy(db, {
      id,
      project_id: projectId,
      slug,
      frontmatter,
      body_markdown: body,
      published,
    });
    return NextResponse.redirect(new URL(`/admin/case-studies/${id}`, externalBase(request)), { status: 303 });
  }

  if (action === 'delete') {
    const id = Number(form.get('id'));
    if (Number.isFinite(id)) {
      db.prepare('DELETE FROM case_studies WHERE id = ?').run(id);
    }
    return NextResponse.redirect(new URL('/admin/case-studies', externalBase(request)), { status: 303 });
  }

  return NextResponse.redirect(new URL('/admin/case-studies', externalBase(request)), { status: 303 });
}
