import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getProjectById } from '@/lib/content';
import { parseJson } from '@/lib/parse-json';
import type { ProjectBodyContent } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) notFound();
  const db = getDb();
  const project = getProjectById(db, id);
  if (!project) notFound();
  const body = parseJson<ProjectBodyContent>(project.body, {
    designDecision: '',
    whatsReal: '',
    honestConstraint: '',
  });
  return (
    <div>
      <h1>Edit project · <code>{project.slug}</code></h1>
      <form method="post" action={`/api/admin/projects/${project.id}`} className="admin-card">
        <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label>Title</label>
            <input name="title" defaultValue={project.title} />
          </div>
          <div>
            <label>Kind</label>
            <select name="kind" defaultValue={project.kind ?? ''}>
              <option value="">—</option>
              <option value="oss">oss</option>
              <option value="commercial">commercial</option>
              <option value="volunteer">volunteer</option>
              <option value="hardware">hardware</option>
            </select>
          </div>
        </div>
        <div className="row">
          <label>Tagline</label>
          <input name="tagline" defaultValue={project.tagline ?? ''} />
        </div>
        <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label>Repo URL</label>
            <input name="repo_url" defaultValue={project.repo_url ?? ''} />
          </div>
          <div>
            <label>Demo URL</label>
            <input name="demo_url" defaultValue={project.demo_url ?? ''} />
          </div>
          <div>
            <label>Package URL</label>
            <input name="package_url" defaultValue={project.package_url ?? ''} />
          </div>
        </div>
        <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label>Status</label>
            <input name="status" defaultValue={project.status ?? ''} />
          </div>
          <div>
            <label>Sort order</label>
            <input type="number" name="sort_order" defaultValue={project.sort_order ?? ''} />
          </div>
          <div>
            <label>
              <input type="checkbox" name="featured" defaultChecked={project.featured === 1} /> Featured
            </label>
          </div>
        </div>
        <div className="row">
          <label>Diagram SVG</label>
          <textarea name="diagram_svg" defaultValue={project.diagram_svg ?? ''} placeholder="<svg viewBox=...>...</svg>" />
        </div>
        <div className="row">
          <label>3-column body (free text → design decision; or paste JSON below)</label>
          <textarea name="body" defaultValue={JSON.stringify(body)} className="mono" />
        </div>
        <div className="row">
          <label>Install command</label>
          <input name="install_cmd" className="mono" defaultValue={project.install_cmd ?? ''} />
        </div>
        <div className="actions">
          <button type="submit">Save</button>
          <a href="/admin/projects" className="secondary">Back</a>
        </div>
      </form>
      <section className="admin-card">
        <h3>Case study</h3>
        <p>
          Manage the case study on the{' '}
          <a href="/admin/case-studies">Case studies</a> page (create one with the
          same slug to bind it here).
        </p>
      </section>
    </div>
  );
}
