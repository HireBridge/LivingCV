import type { CaseStudyRow, ProjectRow } from '@/lib/types';
import { DeleteForm } from '../DeleteForm';

export function CaseStudiesTab({ caseStudies, projects }: { caseStudies: CaseStudyRow[], projects: ProjectRow[] }) {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  
  return (
    <div>
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
                    <DeleteForm action="/api/admin/case-studies/save" id={c.id} />
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
