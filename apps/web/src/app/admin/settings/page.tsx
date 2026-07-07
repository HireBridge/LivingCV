import { getDb } from '@/lib/db';
import { getAllSettings, getSettingForBrowser } from '@/lib/settings';
import { SETTING_KEYS } from '@livingcv/shared';
import type { Db } from '@livingcv/db';

export const dynamic = 'force-dynamic';

function listDisposableDomains(db: Db) {
  return db
    .prepare<[], { domain: string; source: string }>('SELECT domain, source FROM disposable_domains ORDER BY domain ASC')
    .all();
}

export default function SettingsPage() {
  const db = getDb();
  const all = getAllSettings(db);
  const disposable = listDisposableDomains(db);
  const baseDefaults = {
    [SETTING_KEYS.limitsSessionMaxMessages]: '40',
    [SETTING_KEYS.limitsDailyMessageBudget]: '500',
    [SETTING_KEYS.limitsIpSessionsPerDay]: '20',
  };
  const get = (k: string) => all[k] ?? baseDefaults[k as keyof typeof baseDefaults] ?? '';

  return (
    <div>
      <h1>Settings</h1>

      <section className="admin-card">
        <h3>Site</h3>
        <form method="post" action="/api/admin/settings/save" className="row">
          <input type="hidden" name="group" value="site" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label>Site title</label>
              <input name="site.title" defaultValue={all['site.title'] ?? ''} />
            </div>
            <div>
              <label>Domain</label>
              <input name="site.domain" defaultValue={all['site.domain'] ?? ''} />
            </div>
          </div>
          <div className="row">
            <label>Meta description</label>
            <textarea name="site.meta_description" defaultValue={all['site.meta_description'] ?? ''} />
          </div>
          <div className="actions">
            <button type="submit">Save</button>
          </div>
        </form>
      </section>

      <section className="admin-card">
        <h3>Limits & kill switches</h3>
        <form method="post" action="/api/admin/settings/save" className="row">
          <input type="hidden" name="group" value="limits" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label>Session max messages</label>
              <input type="number" name="limits.session_max_messages" defaultValue={get(SETTING_KEYS.limitsSessionMaxMessages)} />
            </div>
            <div>
              <label>Daily message budget</label>
              <input type="number" name="limits.daily_message_budget" defaultValue={get(SETTING_KEYS.limitsDailyMessageBudget)} />
            </div>
            <div>
              <label>IP sessions per day</label>
              <input type="number" name="limits.ip_sessions_per_day" defaultValue={get(SETTING_KEYS.limitsIpSessionsPerDay)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 8 }}>
            <label><input type="checkbox" name="agent.enabled" defaultChecked={(all['agent.enabled'] ?? '1') === '1'} /> Agent enabled</label>
            <label><input type="checkbox" name="voice.enabled" defaultChecked={(all['voice.enabled'] ?? '0') === '1'} /> Voice enabled</label>
            <label><input type="checkbox" name="gate.enabled" defaultChecked={(all['gate.enabled'] ?? '1') === '1'} /> Email gate enabled</label>
          </div>
          <div className="actions">
            <button type="submit">Save</button>
          </div>
        </form>
      </section>

      <section className="admin-card">
        <h3>Connections</h3>
        <p>Jobops and LLM wiring live in Phase 2; this section is the future home. For now you can pre-set values (they'll be encrypted).</p>
        <form method="post" action="/api/admin/settings/save" className="row">
          <input type="hidden" name="group" value="connections" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label>jobops base URL</label>
              <input name="jobops.base_url" defaultValue={all['jobops.base_url'] ?? ''} />
            </div>
            <div>
              <label>jobops auth token (set → encrypted)</label>
              <input name="jobops.auth_token" defaultValue={getSettingForBrowser(db, SETTING_KEYS.jobopsAuthToken)} placeholder="paste to set" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label>LLM provider</label>
              <select name="agent.llm_provider" defaultValue={all['agent.llm_provider'] ?? 'anthropic'}>
                <option value="anthropic">anthropic</option>
                <option value="openai">openai</option>
                <option value="deepseek">deepseek</option>
                <option value="gemini">gemini</option>
              </select>
            </div>
            <div>
              <label>LLM model</label>
              <input name="agent.llm_model" defaultValue={all['agent.llm_model'] ?? ''} />
            </div>
            <div>
              <label>LLM API key (set → encrypted)</label>
              <input name="agent.llm_api_key" defaultValue={getSettingForBrowser(db, SETTING_KEYS.agentLlmApiKey)} placeholder="paste to set" />
            </div>
          </div>
          <div className="actions">
            <button type="submit">Save</button>
          </div>
        </form>
      </section>

      <section className="admin-card">
        <h3>Resume (PDF)</h3>
        <p>Uploaded to the data dir; served at <code>/resume</code>.</p>
        <p>
          Current:{' '}
          {all['resume.filename'] ? (
            <a href="/resume" target="_blank" rel="noopener noreferrer">
              <code>{all['resume.filename']}</code>
            </a>
          ) : (
            <em>none</em>
          )}
        </p>
        <form method="post" action="/api/admin/resume" encType="multipart/form-data">
          <div className="row">
            <input type="file" name="resume" accept="application/pdf" required />
          </div>
          <div className="actions">
            <button type="submit">Upload</button>
          </div>
        </form>
      </section>

      <section className="admin-card">
        <h3>Disposable email domains ({disposable.length})</h3>
        <p>Built-in rows from <code>packages/shared/free-email-domains.ts</code> (wildcard suffixes supported via <code>domain.*</code>) plus any admin-added rows. The email gate rejects a work email whose domain is in this list (§7).</p>
        <table className="admin-table">
          <thead><tr><th>Domain</th><th>Source</th><th></th></tr></thead>
          <tbody>
            {disposable.map((d) => (
              <tr key={d.domain}>
                <td><code>{d.domain}</code></td>
                <td>{d.source}</td>
                <td>
                  <form method="post" action="/api/admin/disposable-domain" style={{ display: 'inline' }}>
                    <input type="hidden" name="_action" value="remove" />
                    <input type="hidden" name="domain" value={d.domain} />
                    <button type="submit" className="danger" disabled={d.source === 'builtin'}>remove</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form method="post" action="/api/admin/disposable-domain" className="row" style={{ marginTop: 10 }}>
          <input type="hidden" name="_action" value="add" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
            <input name="domain" placeholder="example.com or *.example" required />
            <button type="submit">Add</button>
          </div>
        </form>
      </section>
    </div>
  );
}
