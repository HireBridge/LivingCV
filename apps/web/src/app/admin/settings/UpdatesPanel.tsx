'use client';

import { useState } from 'react';

type CheckResult = {
  error?: string;
  current?: string;
  latestShort?: string;
  latestDate?: string;
  latestMessage?: string;
  repo?: string;
  branch?: string;
  repoUrl?: string;
  behind?: number | null;
  upToDate?: boolean;
  unknownCurrent?: boolean;
};

export function UpdatesPanel({
  currentCommit,
  repo,
  branch,
}: {
  currentCommit: string;
  repo: string;
  branch: string;
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  async function check() {
    setChecking(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/check-updates', { headers: { accept: 'application/json' } });
      setResult(await res.json());
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setChecking(false);
    }
  }

  const mono = { fontFamily: 'var(--font-mono, monospace)' } as const;

  return (
    <div>
      <p style={{ marginBottom: 12 }}>
        Running version: <code style={mono}>{currentCommit}</code>
        {' · '}tracking <code style={mono}>{repo}</code> @ <code style={mono}>{branch}</code>
      </p>

      <button type="button" onClick={check} disabled={checking}>
        {checking ? 'Checking…' : 'Check for updates'}
      </button>

      {result && (
        <div style={{ marginTop: 16 }}>
          {result.error ? (
            <p style={{ color: 'var(--rust)' }}>⚠️ {result.error}</p>
          ) : result.upToDate ? (
            <p style={{ color: 'var(--signal)' }}>✅ You&apos;re on the latest version.</p>
          ) : (
            <div style={{ border: '1px solid var(--rust)', borderRadius: 6, padding: '12px 16px' }}>
              <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
                ⬆️ Update available
                {typeof result.behind === 'number' && result.behind > 0
                  ? ` — you're ${result.behind} commit${result.behind === 1 ? '' : 's'} behind`
                  : ''}
              </p>
              <p style={{ margin: '0 0 4px', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
                Latest: <code style={mono}>{result.latestShort}</code>
                {result.latestDate ? ` · ${new Date(result.latestDate).toLocaleDateString()}` : ''}
              </p>
              {result.latestMessage && (
                <p style={{ margin: '0 0 6px', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
                  “{result.latestMessage}”
                </p>
              )}
              {result.unknownCurrent && (
                <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
                  (This image wasn&apos;t stamped with a commit, so the exact gap is unknown — rebuild via the
                  update below to enable precise version tracking.)
                </p>
              )}
              {result.repoUrl && (
                <a href={`${result.repoUrl}/commits/${result.branch}`} target="_blank" rel="noreferrer"
                   style={{ fontSize: '0.85rem' }}>
                  View changes on GitHub →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, background: 'var(--paper-deep)', border: '1px solid var(--rule)', borderRadius: 6, padding: '14px 16px' }}>
        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>To apply updates</p>
        <p style={{ margin: '0 0 8px', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
          Updates are applied on your server (not from this panel, for safety). SSH in, then run:
        </p>
        <pre style={{ ...mono, background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 4, padding: '10px 12px', margin: 0, overflowX: 'auto' }}>
{`cd /path/to/LivingCV
./scripts/update.sh`}
        </pre>
        <p style={{ margin: '8px 0 0', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
          Your content, leads, settings, and secrets are preserved — only code and containers are replaced.
        </p>
      </div>

      <form method="post" action="/api/admin/settings/save" className="row" style={{ marginTop: 24 }}>
        <input type="hidden" name="group" value="updates" />
        <input type="hidden" name="redirect" value="/admin/settings?tab=updates" />
        <h4 style={{ margin: '0 0 10px' }}>Advanced</h4>
        <div className="row">
          <label>Upstream repo (owner/name)</label>
          <input name="updates.repo" defaultValue={repo} placeholder="mohith-das/LivingCV" />
        </div>
        <div className="row">
          <label>Branch</label>
          <input name="updates.branch" defaultValue={branch} placeholder="main" />
        </div>
        <div className="actions">
          <button type="submit">Save</button>
        </div>
      </form>
    </div>
  );
}
