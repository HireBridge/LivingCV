import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function VCSPage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const db = getDb();
  
  // Fetch all history from site_content, newest first
  const history = db
    .prepare<[], { id: number; template_slug: string; section_key: string; updated_at: string }>(
      'SELECT id, template_slug, section_key, updated_at FROM site_content ORDER BY id DESC'
    )
    .all();

  const sp = await searchParams;

  const seen = new Set<string>();
  const rows = history.map((row) => {
    const key = `${row.template_slug}::${row.section_key}`;
    const isLatest = !seen.has(key);
    seen.add(key);
    return { row, isLatest };
  });

  return (
    <div>
      <h1>Version Control</h1>
      <p>A history of all your content changes. Revert to any previous state with one click.</p>
      
      {sp.success ? <div className="flash success">Successfully reverted!</div> : null}

      <div className="admin-card">
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--rule)' }}>
              <th style={{ padding: '8px 0' }}>ID</th>
              <th style={{ padding: '8px 0' }}>Template</th>
              <th style={{ padding: '8px 0' }}>Section</th>
              <th style={{ padding: '8px 0' }}>Saved At</th>
              <th style={{ padding: '8px 0', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, isLatest }) => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                <td style={{ padding: '8px 0', color: 'var(--ink-soft)', fontSize: '0.9em' }}>#{row.id}</td>
                <td style={{ padding: '8px 0' }}>{row.template_slug}</td>
                <td style={{ padding: '8px 0', fontWeight: 'bold' }}>
                  {row.section_key}
                  {isLatest && <span style={{ marginLeft: 8, fontSize: '0.7em', padding: '2px 6px', background: 'var(--ink)', color: 'var(--paper)', borderRadius: 4 }}>LATEST</span>}
                </td>
                <td style={{ padding: '8px 0', color: 'var(--ink-soft)' }}>
                  {new Date(row.updated_at).toLocaleString()}
                </td>
                <td style={{ padding: '8px 0', textAlign: 'right' }}>
                  <form method="post" action="/api/admin/vcs/revert">
                    <input type="hidden" name="id" value={row.id} />
                    <button 
                      type="submit" 
                      className="button secondary" 
                      style={{ padding: '4px 10px', fontSize: '0.85rem' }}
                      disabled={isLatest}
                    >
                      {isLatest ? 'Current' : 'Revert to this'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p style={{ marginTop: 16, color: 'var(--ink-soft)' }}>No history found.</p>
        )}
      </div>
    </div>
  );
}
