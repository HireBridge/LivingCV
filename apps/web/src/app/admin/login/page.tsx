'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (r.ok) {
      window.location.replace('/admin');
      return;
    }
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setErr(j.error || 'Login failed.');
  }

  return (
    <div>
      <h1>Sign in</h1>
      <form onSubmit={submit} className="admin-card" style={{ maxWidth: 360 }}>
        <div className="row">
          <label>Admin password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        {err ? <div className="flash error">{err}</div> : null}
        <div className="actions">
          <button type="submit" disabled={busy}>Sign in</button>
        </div>
      </form>
    </div>
  );
}
