import { getDb } from '@/lib/db';
import type { Db } from '@livingcv/db';

export const dynamic = 'force-dynamic';

function listLeads(db: Db) {
  return db
    .prepare<[], {
      id: string;
      channel: string;
      work_email: string | null;
      email_domain: string | null;
      company_domain_inferred: string | null;
      started_at: string;
      last_active_at: string | null;
      message_count: number;
      blocked_reason: string | null;
    }>('SELECT id, channel, work_email, email_domain, company_domain_inferred, started_at, last_active_at, message_count, blocked_reason FROM recruiter_sessions ORDER BY started_at DESC')
    .all();
}

export default function LeadsPage() {
  const db = getDb();
  const leads = listLeads(db);
  return (
    <div>
      <h1>Leads</h1>
      <p>Recruiter / hiring manager sessions collected through the public MCP and the AI concierge chat widget.</p>

      <section className="admin-card">
        <h3>All leads ({leads.length})</h3>
        {leads.length === 0 ? (
          <p><em>No leads yet.</em></p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Channel</th>
                <th>Company</th>
                <th>Messages</th>
                <th>Started</th>
                <th>Last active</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>{l.work_email || '—'}</td>
                  <td>{l.channel}</td>
                  <td>{l.company_domain_inferred || '—'}</td>
                  <td>{l.message_count}</td>
                  <td>{l.started_at}</td>
                  <td>{l.last_active_at || '—'}</td>
                  <td>{l.blocked_reason ? `blocked: ${l.blocked_reason}` : 'ok'}</td>
                  <td><a href={`/admin/leads/${l.id}`}>transcript</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="actions">
          <a className="secondary" href="/api/admin/leads/export.csv" download>Download CSV</a>
        </div>
      </section>
    </div>
  );
}
