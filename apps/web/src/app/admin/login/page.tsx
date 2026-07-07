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
        <div className="actions flex justify-between items-center mt-4">
          <button 
            type="button" 
            className="text-sm text-signal hover:underline bg-transparent p-0 border-none cursor-pointer"
            onClick={() => setShowForgotModal(true)}
          >
            Forgot password?
          </button>
          <button type="submit" disabled={busy}>Sign in</button>
        </div>
      </form>

      {showForgotModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-paper p-6 rounded-lg shadow-xl max-w-sm w-full border border-ink/10">
            <h3 className="mt-0 text-lg font-semibold">Password reset</h3>
            <p className="text-ink/80 my-4">Please contact the system administrator to reset your password.</p>
            <div className="flex justify-end">
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
