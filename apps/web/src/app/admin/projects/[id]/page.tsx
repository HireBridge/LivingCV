import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getProjectById } from '@/lib/content';
import { parseJson } from '@/lib/parse-json';
import { normalizeProjectBody } from '@/lib/project-body';
import { ProjectBodyEditor } from '../ProjectBodyEditor';
import { FieldHelp } from '../../FieldHelp';

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
  const { columns, diagramCaption } = normalizeProjectBody(
    parseJson<unknown>(project.body, {}),
  );
  return (
    <div>
      <h1>Edit project · <code>{project.slug}</code></h1>
      <form method="post" action={`/api/admin/projects/${project.id}`} className="admin-card">
        <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label>Title</label>
            <input name="title" defaultValue={project.title} />
            <FieldHelp>
              <p>The project&rsquo;s name — shown as the bold heading at the top of the card.</p>
            </FieldHelp>
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
            <FieldHelp>
              <p>Optional category tag stored as metadata (open-source, commercial, volunteer, hardware). It helps you filter and is available to the AI concierge; it is not printed on the card.</p>
            </FieldHelp>
          </div>
        </div>
        <div className="row">
          <label>Tagline</label>
          <input name="tagline" defaultValue={project.tagline ?? ''} />
          <FieldHelp>
            <p>One short sentence shown directly under the title. For non-featured projects this is the only description shown in the &ldquo;Also shipped&rdquo; grid, so keep it self-contained.</p>
          </FieldHelp>
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
          <FieldHelp>
            <p>Each URL you fill becomes a small link in the top-right corner of the card, labelled <code>repo</code>, <code>demo</code>, and <code>package</code> respectively. Leave a field blank to omit that link.</p>
          </FieldHelp>
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
          <FieldHelp>
            <p><strong>Status</strong>: a short free-text label such as &ldquo;Live&rdquo; or &ldquo;Published on PyPI — v0.2.0&rdquo;. Stored as metadata (and used in the case study), not printed on the card itself.</p>
            <p><strong>Sort order</strong>: lower numbers appear first. Ties fall back to creation order.</p>
            <p><strong>Featured</strong>: checked = a full project card in the main list. Unchecked = a compact entry in the &ldquo;Also shipped&rdquo; grid (title + tagline only).</p>
          </FieldHelp>
        </div>
        <div className="row">
          <label>Diagram SVG</label>
          <textarea name="diagram_svg" defaultValue={project.diagram_svg ?? ''} placeholder="<svg viewBox=...>...</svg>" />
          <FieldHelp>
            <p>Paste raw inline SVG markup (starting with <code>&lt;svg …&gt;</code>) to draw the architecture diagram box on the card. Leave blank for no diagram.</p>
            <p>Tips: include a <code>viewBox</code> so it scales, and use <code>stroke=&quot;currentColor&quot;</code> / <code>fill=&quot;currentColor&quot;</code> instead of hard-coded colors so the diagram matches the site theme. The markup is rendered as-is, so only paste SVG you trust.</p>
          </FieldHelp>
        </div>
        <ProjectBodyEditor initialColumns={columns} diagramCaption={diagramCaption} />
        <div className="row">
          <label>Install command</label>
          <input name="install_cmd" className="mono" defaultValue={project.install_cmd ?? ''} />
          <FieldHelp>
            <p>A one-line install/run command shown in a terminal-style box at the bottom of the card (e.g. <code>pip install wikimcp</code>). The leading <code>$</code> prompt is added automatically — don&rsquo;t type it. Leave blank to hide the box.</p>
          </FieldHelp>
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
