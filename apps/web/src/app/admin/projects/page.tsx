import { getDb } from '@/lib/db';
import { listProjects } from '@/lib/content';

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
