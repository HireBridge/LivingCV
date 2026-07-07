'use client';

import { useEffect, useState } from 'react';

type SetupState = {
  setupComplete: boolean;
  hasEncryptionKey: boolean;
  hasEnvKey: boolean;
};

const STEPS = ['Password', 'Encryption key', 'Site', 'Done'] as const;

export default function SetupWizard() {
  const [state, setState] = useState<SetupState | null>(null);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // form state
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acked, setAcked] = useState(false);
  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState('');
  const [metaDesc, setMetaDesc] = useState('');

  useEffect(() => {
    void fetch('/api/admin/setup')
      .then((r) => r.json() as Promise<SetupState>)
      .then((s) => {
        setState(s);
        // If setup is already complete, bounce straight to the dashboard.
        if (s.setupComplete) window.location.replace('/admin');
      })
      .catch(() => setErr('Could not reach the setup API.'));
  }, []);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) return setErr('Use at least 8 characters.');
    if (password !== confirm) return setErr('Passwords do not match.');
    setBusy(true);
    const r = await fetch('/api/admin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'password', password }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return setErr(j.error || 'Failed to save password.');
    }
    setStep(1);
  }

  async function submitSite(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) return setErr('Site title is required.');
    setBusy(true);
    const r = await fetch('/api/admin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'site',
        title: title.trim(),
        domain: domain.trim(),
        metaDescription: metaDesc.trim(),
      }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return setErr(j.error || 'Failed to save site settings.');
    }
    setBusy(true);
    const f = await fetch('/api/admin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'finalize' }),
    });
    setBusy(false);
    if (!f.ok) {
      const j = (await f.json().catch(() => ({}))) as { error?: string };
      return setErr(j.error || 'Failed to finalize setup.');
    }
    window.location.replace('/admin');
  }

  if (!state) return <p>Loading…</p>;

  return (
    <div>
      <h1>Setup</h1>
      <div className="steps">
        {STEPS.map((label, i) => (
          <span key={label} className={i === step ? 'active' : i < step ? 'done' : ''}>
            {i + 1}. {label}
          </span>
        ))}
      </div>
      {err ? <div className="flash error">{err}</div> : null}

      {step === 0 ? (
        <form onSubmit={submitPassword} className="admin-card">
          <h3>Admin password</h3>
          <p>This password unlocks the admin console. It is stored as a bcrypt hash.</p>
          <div className="row">
            <label>Password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="row">
            <label>Confirm</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <div className="actions">
            <button type="submit" disabled={busy}>Save and continue</button>
          </div>
        </form>
      ) : null}

      {step === 1 ? (
        <div className="admin-card">
          <h3>Encryption key</h3>
          {state.hasEnvKey ? (
            <p>
              A <code>PORTFOLIO_ENCRYPTION_KEY</code> is set in your environment. The
              app will use it directly; no bootstrap key is needed. Make sure the
              value is backed up somewhere safe — losing it makes every encrypted
              setting unrecoverable.
            </p>
          ) : state.hasEncryptionKey ? (
            <p>
              A bootstrap encryption key was generated when the app first started
              and is stored in <code>app_settings</code> (<code>bootstrap.encryption_key</code>).
              For production, move it to your <code>PORTFOLIO_ENCRYPTION_KEY</code> env
              var and delete the stored copy.
            </p>
          ) : (
            <p>An encryption key will be generated for you in the next step.</p>
          )}
          <p>
            Losing the key makes every saved secret (jobops token, LLM keys,
            webhooks, voice keys) unrecoverable. Treat it like a root password.
          </p>
          <div className="row">
            <label>
              <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
              {' '}I have backed up the encryption key (or it is environment-set).
            </label>
          </div>
          <div className="actions">
            <button type="button" onClick={() => setStep(0)} className="secondary">Back</button>
            <button type="button" disabled={!acked} onClick={() => setStep(2)}>Continue</button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <form onSubmit={submitSite} className="admin-card">
          <h3>Site identity</h3>
          <p>The site title appears in the nav brand and browser tab. The domain drives SEO metadata and the public MCP/llms.txt URLs.</p>
          <div className="row">
            <label>Site title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="row">
            <label>Domain (e.g. example.com)</label>
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
          </div>
          <div className="row">
            <label>Meta description (one sentence)</label>
            <textarea value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} />
          </div>
          <div className="actions">
            <button type="button" onClick={() => setStep(1)} className="secondary">Back</button>
            <button type="submit" disabled={busy}>Finish</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
