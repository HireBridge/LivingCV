import { getDb } from '@/lib/db';
import { listProjects } from '@/lib/content';
import { FieldHelp } from '../FieldHelp';

export const dynamic = 'force-dynamic';

export default function ProjectsPage() {
  const db = getDb();
  const projects = listProjects(db);
  return (
    <div>
      <h1>Projects</h1>
      <section className="admin-card">
        <h3>New project</h3>
        <form method="post" action="/api/admin/projects" className="row">
          <input type="hidden" name="_action" value="create" />
          <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div>
              <label>Slug (URL)</label>
              <input name="slug" required placeholder="my-project" />
            </div>
            <div>
              <label>Title</label>
              <input name="title" required placeholder="My Project" />
            </div>
          </div>
          <FieldHelp>
            <p><strong>Slug</strong>: the URL-safe id used in the case-study link (<code>/projects/&lt;slug&gt;</code>) and to bind a case study to this project. Use lowercase words with hyphens, e.g. <code>my-project</code>. It can&rsquo;t be changed as easily later, so pick it deliberately.</p>
            <p>After creating, you&rsquo;ll land on the full editor where you add the tagline, links, diagram, body columns and install command.</p>
          </FieldHelp>
          <div className="actions">
            <button type="submit">Create</button>
          </div>
        </form>
      </section>

      <section className="admin-card">
        <h3>All projects ({projects.length})</h3>
        {projects.length === 0 ? (
          <p>No projects yet.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Slug</th>
                <th>Title</th>
                <th>Kind</th>
                <th>Featured</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td><code>{p.slug}</code></td>
                  <td>{p.title}</td>
                  <td>{p.kind || '—'}</td>
                  <td>{p.featured === 1 ? 'yes' : 'no'}</td>
                  <td>{p.status || '—'}</td>
                  <td>
                    <a href={`/admin/projects/${p.id}`}>edit</a>{' '}
                    <form
                      method="post"
                      action="/api/admin/projects"
                      style={{ display: 'inline' }}
                    >
                      <input type="hidden" name="_action" value="delete" />
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="danger">delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
