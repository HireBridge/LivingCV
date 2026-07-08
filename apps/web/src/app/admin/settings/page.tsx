import { getDb } from '@/lib/db';
import { getAllSettings, getSettingForBrowser } from '@/lib/settings';
import { SETTING_KEYS } from '@livingcv/shared';
import type { Db } from '@livingcv/db';
import { LlmConnectionsForm } from './LlmConnectionsForm';
import { McpConfigForm } from './McpConfigForm';
import { ConnectivityForm } from './ConnectivityForm';
import { SystemLogsViewer } from './SystemLogsViewer';
import { UpdatesPanel } from './UpdatesPanel';

export const dynamic = 'force-dynamic';

function listDisposableDomains(db: Db, search: string, page: number, perPage: number) {
  let query = 'SELECT domain, source FROM disposable_domains';
  const params: (string | number)[] = [];
  
  if (search) {
    query += ' WHERE domain LIKE ?';
    params.push(`%${search}%`);
  }
  
  query += ' ORDER BY domain ASC LIMIT ? OFFSET ?';
  params.push(perPage, (page - 1) * perPage);
  
  return db.prepare<(string | number)[], { domain: string; source: string }>(query).all(...params);
}

function countDisposableDomains(db: Db, search: string) {
  let query = 'SELECT COUNT(*) as count FROM disposable_domains';
  const params: string[] = [];
  if (search) {
    query += ' WHERE domain LIKE ?';
    params.push(`%${search}%`);
  }
  const row = db.prepare<string[], { count: number }>(query).get(...params);
  return row?.count ?? 0;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string; test_success?: string; test_error?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const db = getDb();
  const all = getAllSettings(db);
  const baseDefaults = {
    [SETTING_KEYS.limitsSessionMaxMessages]: '40',
    [SETTING_KEYS.limitsDailyMessageBudget]: '500',
    [SETTING_KEYS.limitsIpSessionsPerDay]: '20',
  };
  const get = (k: string) => all[k] ?? baseDefaults[k as keyof typeof baseDefaults] ?? '';
  const hasLlmKey = !!getSettingForBrowser(db, SETTING_KEYS.agentLlmApiKey);
  
  const currentTab = sp.tab || 'general';

  // Pagination for email gate
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const perPage = 20;
  const q = sp.q || '';
  const disposable = listDisposableDomains(db, q, page, perPage);
  const totalDisposable = countDisposableDomains(db, q);
  const totalPages = Math.ceil(totalDisposable / perPage);

  const TabNav = () => (
    <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--rule)', marginBottom: 24, paddingBottom: 10, fontSize: '1.05rem' }}>
      <a href="?tab=general" style={{ textDecoration: 'none', color: currentTab === 'general' ? 'var(--signal)' : 'var(--ink-soft)', fontWeight: currentTab === 'general' ? 'bold' : 'normal' }}>General</a>
      <a href="?tab=seo" style={{ textDecoration: 'none', color: currentTab === 'seo' ? 'var(--signal)' : 'var(--ink-soft)', fontWeight: currentTab === 'seo' ? 'bold' : 'normal' }}>SEO</a>
      <a href="?tab=connections" style={{ textDecoration: 'none', color: currentTab === 'connections' ? 'var(--signal)' : 'var(--ink-soft)', fontWeight: currentTab === 'connections' ? 'bold' : 'normal' }}>AI & LLM</a>
      <a href="?tab=connectivity" style={{ textDecoration: 'none', color: currentTab === 'connectivity' ? 'var(--signal)' : 'var(--ink-soft)', fontWeight: currentTab === 'connectivity' ? 'bold' : 'normal' }}>Connectivity</a>
      <a href="?tab=mcp" style={{ textDecoration: 'none', color: currentTab === 'mcp' ? 'var(--signal)' : 'var(--ink-soft)', fontWeight: currentTab === 'mcp' ? 'bold' : 'normal' }}>MCP</a>
      <a href="?tab=gate" style={{ textDecoration: 'none', color: currentTab === 'gate' ? 'var(--signal)' : 'var(--ink-soft)', fontWeight: currentTab === 'gate' ? 'bold' : 'normal' }}>Email Gate</a>
      <a href="?tab=logs" style={{ textDecoration: 'none', color: currentTab === 'logs' ? 'var(--signal)' : 'var(--ink-soft)', fontWeight: currentTab === 'logs' ? 'bold' : 'normal' }}>System Logs</a>
      <a href="?tab=updates" style={{ textDecoration: 'none', color: currentTab === 'updates' ? 'var(--signal)' : 'var(--ink-soft)', fontWeight: currentTab === 'updates' ? 'bold' : 'normal' }}>Updates</a>
    </div>
  );

  return (
    <div>
      <h1>Settings</h1>
      <TabNav />

      {currentTab === 'general' && (
        <>
          <section className="admin-card">
            <h3>Site</h3>
            <form method="post" action="/api/admin/settings/save" className="row">
              <input type="hidden" name="group" value="site" />
              <input type="hidden" name="redirect" value="/admin/settings?tab=general" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label>Site title</label>
                  <input name="site.title" defaultValue={all['site.title'] ?? ''} />
                </div>
                <div>
                  <label>Domain</label>
                  <input name="site.domain" defaultValue={all['site.domain'] ?? ''} />
                </div>
                <div>
                  <label>Admin email</label>
                  <input name="admin.email" type="email" defaultValue={all['admin.email'] ?? ''} />
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
              <input type="hidden" name="redirect" value="/admin/settings?tab=general" />
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                <label style={{ opacity: !hasLlmKey ? 0.5 : 1 }}>
                  <input 
                    type="checkbox" 
                    name="agent.enabled" 
                    defaultChecked={hasLlmKey && (all['agent.enabled'] ?? '1') === '1'} 
                    disabled={!hasLlmKey}
                  /> 
                  Agent enabled {!hasLlmKey && '(Requires LLM API Key in AI & LLM tab)'}
                </label>
                <label><input type="checkbox" name="gate.enabled" defaultChecked={(all['gate.enabled'] ?? '1') === '1'} /> Email gate enabled</label>
              </div>
              <div className="actions">
                <button type="submit">Save</button>
              </div>
            </form>
          </section>
        </>
      )}

      {currentTab === 'seo' && (
        <section className="admin-card">
          <h3>SEO & Metadata</h3>
          <form method="post" action="/api/admin/settings/save" className="row">
            <input type="hidden" name="group" value="seo" />
            <input type="hidden" name="redirect" value="/admin/settings?tab=seo" />
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label>Twitter Handle (e.g. @username)</label>
                <input name="site.twitter_handle" defaultValue={all['site.twitter_handle'] ?? ''} />
              </div>
              <div>
                <label>Site Language (e.g. en)</label>
                <input name="site.lang" defaultValue={all['site.lang'] ?? 'en'} />
              </div>
            </div>

            <div className="row" style={{ marginTop: 14 }}>
              <label>Custom OG Image Path (Leave blank to use auto-generated next/og)</label>
              <input name="site.og_image_path" defaultValue={all['site.og_image_path'] ?? ''} placeholder="/og?title=..." />
            </div>

            <div className="row">
              <label>Keywords (Comma separated)</label>
              <input name="site.keywords" defaultValue={all['site.keywords'] ?? ''} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              <div>
                <label>Google Site Verification ID</label>
                <input name="seo.google_site_verification" defaultValue={all['seo.google_site_verification'] ?? ''} />
              </div>
              <div>
                <label>Bing Verification ID</label>
                <input name="seo.bing_verification" defaultValue={all['seo.bing_verification'] ?? ''} />
              </div>
            </div>

            <div className="row" style={{ marginTop: 14 }}>
              <label>Google Analytics ID (e.g. G-XXXXXXXXXX)</label>
              <input name="seo.google_analytics_id" defaultValue={all['seo.google_analytics_id'] ?? ''} placeholder="G-..." />
            </div>

            <div className="actions">
              <button type="submit">Save</button>
            </div>
          </form>
        </section>
      )}

      {currentTab === 'connections' && (
        <section className="admin-card">
          <h3>Connections</h3>
          <p>Configure your LLM provider to power the AI agent.</p>
          <LlmConnectionsForm 
            initialData={{
              'agent.llm_provider': all['agent.llm_provider'] || '',
              'agent.llm_model': all['agent.llm_model'] || '',
              'agent.llm_api_key': getSettingForBrowser(db, SETTING_KEYS.agentLlmApiKey),
              'agent.system_prompt_extra': all['agent.system_prompt_extra'] || '',
              'agent.search_provider': all['agent.search_provider'] || '',
              'agent.search_api_key': getSettingForBrowser(db, SETTING_KEYS.agentSearchApiKey),
            }} 
          />
        </section>
      )}

      {currentTab === 'connectivity' && (
        <section className="admin-card">
          <ConnectivityForm initialData={{
            'telegram.chat_id': all['telegram.chat_id'] || '',
            'telegram.bot_token': getSettingForBrowser(db, SETTING_KEYS.telegramBotToken),
            'email.provider': all['email.provider'] || 'none',
            'email.api_key': getSettingForBrowser(db, SETTING_KEYS.emailApiKey),
            'google.client_id': all['google.client_id'] || '',
            'google.client_secret': getSettingForBrowser(db, SETTING_KEYS.googleClientSecret),
          }} />
        </section>
      )}

      {currentTab === 'mcp' && (
        <section className="admin-card">
          <h3>Master Relay MCP</h3>
          <p style={{ color: 'var(--ink-soft)', marginBottom: 16 }}>
            Configure the Master MCP Server. This exposes the entire platform to your local LLM client (like Claude Desktop or Cursor).
          </p>
          <McpConfigForm
            domain={all['site.domain'] || 'localhost:3000'}
            initialData={{
              'mcp.enabled': all['mcp.enabled'] || '0',
              'mcp.master_key': getSettingForBrowser(db, SETTING_KEYS.mcpMasterKey) || '',
            }}
          />
        </section>
      )}

      {currentTab === 'mcp' && (
        <section className="admin-card" style={{ marginTop: 20 }}>
          <h3>Public MCP</h3>
          <p style={{ color: 'var(--ink-soft)', marginBottom: 16 }}>
            The open, read-only endpoint at <code>/mcp/public</code> that external
            recruiter AI agents (Claude.ai, ChatGPT, any MCP client) can connect to.
            It exposes exactly two tools: <code>get_career_packet</code> and{' '}
            <code>get_story_bank_public</code>. When enabled, a <b>TalentMCP</b> button
            appears in the site navigation linking to connection instructions.
          </p>
          <form method="post" action="/api/admin/settings/save" className="row">
            <input type="hidden" name="group" value="publicmcp" />
            <input type="hidden" name="redirect" value="/admin/settings?tab=mcp" />
            <div className="row">
              <label>
                <input
                  type="checkbox"
                  name="publicmcp.enabled"
                  defaultChecked={(all[SETTING_KEYS.publicMcpEnabled] ?? '0') === '1'}
                  style={{ marginRight: 8 }}
                />
                Enable public MCP endpoint + TalentMCP button
              </label>
            </div>
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem', margin: '4px 0 12px' }}>
              Public URL: <code>https://{all['site.domain'] || 'your-domain'}/mcp/public</code>
              {' · '}Instructions page: <code>/talent-mcp</code>
            </p>
            <div className="actions">
              <button type="submit">Save</button>
            </div>
          </form>
        </section>
      )}

      {currentTab === 'mcp' && (
        <section className="admin-card" style={{ marginTop: 20 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Connect to HireBridge
            <span style={{
              fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
              color: 'var(--rust)', border: '1px solid var(--rust)', borderRadius: 4, padding: '2px 8px',
            }}>Work in Progress</span>
          </h3>
          <p style={{ color: 'var(--ink-soft)', marginBottom: 16 }}>
            Link this portfolio to HireBridge to sync your profile and reach a wider
            network of recruiters. This integration is coming soon.
          </p>
          <div className="actions">
            <button type="button" disabled title="Coming soon" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              Connect
            </button>
          </div>
        </section>
      )}

      {currentTab === 'gate' && (
        <section className="admin-card">
          <h3>Disposable email domains ({totalDisposable})</h3>
          <p style={{ color: 'var(--ink-soft)', marginBottom: 16 }}>The email gate rejects a work email whose domain is in this list. Wildcard suffixes supported via <code>domain.*</code>.</p>
          
          <form method="get" action="/admin/settings" style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="hidden" name="tab" value="gate" />
            <input name="q" defaultValue={q} placeholder="Search domain..." style={{ flex: 1, maxWidth: 300 }} />
            <button type="submit" className="secondary">Search</button>
            {q && <a href="?tab=gate" className="button secondary" style={{ textDecoration: 'none' }}>Clear</a>}
          </form>

          <table className="admin-table">
            <thead><tr><th style={{ textAlign: 'left', paddingBottom: 8 }}>Domain</th><th style={{ textAlign: 'left', paddingBottom: 8 }}>Source</th><th style={{ paddingBottom: 8 }}></th></tr></thead>
            <tbody>
              {disposable.map((d) => (
                <tr key={d.domain} style={{ borderTop: '1px solid var(--rule)' }}>
                  <td style={{ padding: '8px 0' }}><code>{d.domain}</code></td>
                  <td style={{ padding: '8px 0', color: 'var(--ink-soft)' }}>{d.source}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>
                    <form method="post" action="/api/admin/disposable-domain" style={{ display: 'inline' }}>
                      <input type="hidden" name="_action" value="remove" />
                      <input type="hidden" name="redirect" value={`/admin/settings?tab=gate&q=${q}&page=${page}`} />
                      <input type="hidden" name="domain" value={d.domain} />
                      <button type="submit" className="danger" disabled={d.source === 'builtin'} style={{ padding: '4px 8px', fontSize: '0.8rem', opacity: d.source === 'builtin' ? 0.3 : 1 }}>remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', justifyContent: 'center' }}>
              <a 
                href={page > 1 ? `?tab=gate&q=${q}&page=${page - 1}` : '#'} 
                className="button secondary text-sm"
                style={{ opacity: page > 1 ? 1 : 0.5, pointerEvents: page > 1 ? 'auto' : 'none', textDecoration: 'none' }}
              >
                Previous
              </a>
              <span style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>Page {page} of {totalPages}</span>
              <a 
                href={page < totalPages ? `?tab=gate&q=${q}&page=${page + 1}` : '#'} 
                className="button secondary text-sm"
                style={{ opacity: page < totalPages ? 1 : 0.5, pointerEvents: page < totalPages ? 'auto' : 'none', textDecoration: 'none' }}
              >
                Next
              </a>
            </div>
          )}

          <form method="post" action="/api/admin/disposable-domain" className="row" style={{ marginTop: 32, borderTop: '1px solid var(--rule)', paddingTop: 24 }}>
            <h4 style={{ margin: '0 0 10px 0' }}>Add Domain</h4>
            <input type="hidden" name="_action" value="add" />
            <input type="hidden" name="redirect" value={`/admin/settings?tab=gate&q=${q}&page=${page}`} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
              <input name="domain" placeholder="example.com or *.example" required />
              <button type="submit">Add Domain</button>
            </div>
          </form>
        </section>
      )}

      {currentTab === 'logs' && (
        <section className="admin-card">
          <h3>System Logs</h3>
          <p>Application logs for debugging. Powered by Winston and SQLite.</p>
          <SystemLogsViewer />
        </section>
      )}

      {currentTab === 'updates' && (
        <section className="admin-card">
          <h3>Software updates</h3>
          <p style={{ color: 'var(--ink-soft)', marginBottom: 16 }}>
            Check whether a newer version of LivingCV is available upstream and how to
            pull it into this instance. Updates never touch your content, leads,
            settings, or secrets.
          </p>
          <UpdatesPanel
            currentCommit={process.env.LIVINGCV_COMMIT || 'dev'}
            repo={all[SETTING_KEYS.updatesRepo] || 'mohith-das/LivingCV'}
            branch={all[SETTING_KEYS.updatesBranch] || 'main'}
          />
        </section>
      )}

    </div>
  );
}
