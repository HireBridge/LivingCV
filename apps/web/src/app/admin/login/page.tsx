'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
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
      <h1 style={{ textAlign: 'center', marginBottom: 24, fontSize: '1.8rem' }}>Sign in</h1>
      <form onSubmit={submit} className="admin-card" style={{ maxWidth: '100%', padding: '24px 28px' }}>
        <div className="row">
          <label>Admin email</label>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="row">
          <label>Admin password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {err ? <div className="flash error">{err}</div> : null}
        <div className="actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <button 
            type="button" 
            style={{ fontSize: '0.875rem', color: 'var(--signal)', backgroundColor: 'transparent', padding: 0, border: 'none', cursor: 'pointer' }}
            onClick={() => setShowForgotModal(true)}
          >
            Forgot password?
          </button>
          <button type="submit" disabled={busy}>Sign in</button>
        </div>
      </form>

      {showForgotModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: 'var(--paper)', padding: '24px', borderRadius: '8px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', maxWidth: '24rem', width: '100%', border: '1px solid var(--rule)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.125rem', fontWeight: 600 }}>Password reset</h3>
            <p style={{ color: 'var(--ink-soft)', margin: '16px 0' }}>Please contact the system administrator to reset your password.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                className="secondary"
                onClick={() => setShowForgotModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
