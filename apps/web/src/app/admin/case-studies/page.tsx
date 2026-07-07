import { getDb } from '@/lib/db';
import { listCaseStudies, listProjects } from '@/lib/content';

export const dynamic = 'force-dynamic';

export default function CaseStudiesPage() {
  const db = getDb();
  const caseStudies = listCaseStudies(db);
  const projects = listProjects(db);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  return (
    <div>
      <h1>Case studies</h1>

      <section className="admin-card">
        <h3>New case study</h3>
        <form method="post" action="/api/admin/case-studies/save" className="row">
          <input type="hidden" name="_action" value="create" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label>Slug</label>
              <input name="slug" required />
            </div>
            <div>
              <label>Project (optional)</label>
              <select name="project_id" defaultValue="">
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.slug})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="actions">
            <button type="submit">Create</button>
          </div>
        </form>
      </section>

      <section className="admin-card">
        <h3>All case studies</h3>
        {caseStudies.length === 0 ? (
          <p>No case studies yet.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Slug</th>
                <th>Project</th>
                <th>Published</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {caseStudies.map((c) => (
                <tr key={c.id}>
                  <td><code>{c.slug}</code></td>
                  <td>{c.project_id ? projectById.get(c.project_id)?.title ?? c.project_id : '—'}</td>
                  <td>{c.published === 1 ? 'yes' : 'no'}</td>
                  <td>
                    <a href={`/admin/case-studies/${c.id}`}>edit</a>{' '}
                    <form method="post" action="/api/admin/case-studies/save" style={{ display: 'inline' }}>
                      <input type="hidden" name="_action" value="delete" />
                      <input type="hidden" name="id" value={c.id} />
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
