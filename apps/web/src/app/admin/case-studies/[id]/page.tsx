import { getDb } from '@/lib/db';
import { listProjects } from '@/lib/content';
import { parseJson } from '@/lib/parse-json';
import type { CaseStudyFrontmatter } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EditCaseStudyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return <p>Invalid id.</p>;
  const db = getDb();
  const row = db
    .prepare<[number], { id: number; slug: string; project_id: number | null; frontmatter: string | null; body_markdown: string | null; published: number }>(
      'SELECT id, slug, project_id, frontmatter, body_markdown, published FROM case_studies WHERE id = ?',
    )
    .get(id);
  if (!row) return <p>Not found.</p>;
  const projects = listProjects(db);
  const fm = parseJson<CaseStudyFrontmatter>(row.frontmatter, {
    title: '',
    summary: '',
    stack: [],
    status: '',
    links: {},
    highlights: [],
  });
  return (
    <div>
      <h1>Edit case study · <code>{row.slug}</code></h1>
      <form method="post" action="/api/admin/case-studies/save" className="admin-card">
        <input type="hidden" name="id" value={row.id} />
        <input type="hidden" name="_action" value="update" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label>Slug</label>
            <input name="slug" defaultValue={row.slug} required />
          </div>
          <div>
            <label>Project</label>
            <select name="project_id" defaultValue={row.project_id ?? ''}>
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.slug})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <label>Title</label>
          <input name="fm_title" defaultValue={fm.title} />
        </div>
        <div className="row">
          <label>Summary</label>
          <textarea name="fm_summary" defaultValue={fm.summary} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label>Status</label>
            <input name="fm_status" defaultValue={fm.status} />
          </div>
          <div>
            <label>Stack (comma-separated)</label>
            <input name="fm_stack" defaultValue={(fm.stack ?? []).join(', ')} />
          </div>
        </div>
        <div className="row">
          <label>Highlights (one per line)</label>
          <textarea name="fm_highlights" defaultValue={(fm.highlights ?? []).join('\n')} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label>Repo link</label>
            <input name="fm_repo" defaultValue={fm.links?.repo ?? ''} />
          </div>
          <div>
            <label>Demo link</label>
            <input name="fm_demo" defaultValue={fm.links?.demo ?? ''} />
          </div>
          <div>
            <label>Package link</label>
            <input name="fm_package" defaultValue={fm.links?.package ?? ''} />
          </div>
        </div>
        <div className="row">
          <label>
            <input type="checkbox" name="published" defaultChecked={row.published === 1} /> Published
          </label>
        </div>
        <div className="row">
          <label>Body (markdown — the case-study skeleton lives in docs/claude_conv_porfolio_casestudy.md)</label>
          <textarea name="body_markdown" defaultValue={row.body_markdown ?? ''} style={{ minHeight: 320 }} />
        </div>
        <div className="actions">
          <button type="submit">Save</button>
          <a href="/admin/case-studies" className="secondary">Back</a>
        </div>
      </form>
    </div>
  );
}
