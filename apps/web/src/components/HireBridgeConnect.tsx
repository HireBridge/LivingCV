'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  adminEmail: string;
  connected: boolean;
  apiUrl: string;
  nodeId: string;
  clientId: string;
}

export function HireBridgeConnect({ adminEmail, connected, apiUrl, nodeId, clientId }: Props) {
  const [connecting, setConnecting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  if (!adminEmail) {
    return (
      <div style={{ padding: '12px 16px', background: 'var(--signal-soft)', borderRadius: 6, color: 'var(--ink-soft)' }}>
        Add your <strong>Admin email</strong> in the{' '}
        <a href="/admin/settings?tab=general" style={{ textDecoration: 'underline' }}>General settings</a> tab first.
      </div>
    );
  }

  if (connected) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: 'var(--signal)', flexShrink: 0,
          }} />
          <span style={{ fontWeight: 600 }}>Connected to HireBridge</span>
        </div>
        <div style={{ color: 'var(--ink-soft)', marginBottom: 12, fontSize: '0.85rem', display: 'grid', gap: 4 }}>
          <div><strong>Node ID:</strong> <code>{nodeId}</code></div>
          <div><strong>Candidate ID:</strong> <code>{clientId}</code></div>
          <div style={{ marginTop: 6 }}>
            HireBridge can deliver introductions to <code>POST /api/inbox</code> on this site.
            The same admin email must be configured in your jobops instance for
            introductions to match.
          </div>
        </div>
        <form method="post" action="/api/hirebridge/disconnect">
          <button type="submit" className="danger" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
            Disconnect
          </button>
        </form>
      </div>
    );
  }

  const startPoll = (intervalSec: number) => {
    setPolling(true);
    abortRef.current = new AbortController();
    let cancelled = false;
    const tick = async () => {
      while (!cancelled) {
        await new Promise<void>((r) => setTimeout(r, intervalSec * 1000));
        if (cancelled) return;
        try {
          const res = await fetch('/api/hirebridge/poll', {
            method: 'POST',
            signal: abortRef.current?.signal,
          });
          const data = await res.json();
          if (data.connected) {
            cancelled = true;
            setPolling(false);
            setMessage('Connected to HireBridge.');
            // Reload so the server-rendered connected UI takes over with node_id + client_id.
            window.location.reload();
            return;
          }
          if (data.pending && typeof data.interval === 'number') {
            intervalSec = data.interval;
            continue;
          }
          if (data.error) {
            cancelled = true;
            setPolling(false);
            setError(data.error);
            return;
          }
        } catch (e) {
          if ((e as Error)?.name === 'AbortError') return;
          cancelled = true;
          setPolling(false);
          setError((e as Error)?.message || 'Polling failed.');
          return;
        }
      }
    };
    void tick();
  };

  const cancelPoll = () => {
    abortRef.current?.abort();
    setPolling(false);
  };

  return (
    <div>
      <p style={{ color: 'var(--ink-soft)', marginBottom: 16 }}>
        Connect to HireBridge to make your portfolio discoverable on a federated talent
        network. HireBridge will email a magic link to your admin email, <strong>{adminEmail}</strong>.
        Click the link on HireBridge&rsquo;s side, then this page will finish connecting
        automatically.
      </p>

      {message && (
        <div style={{ padding: '10px 14px', background: 'var(--signal-soft)', borderRadius: 6, marginBottom: 12 }}>
          {message}
          {verificationUri && (
            <div style={{ marginTop: 8 }}>
              If the email didn&rsquo;t arrive, open this verification link on HireBridge&rsquo;s site:{' '}
              <a href={verificationUri} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--signal)', fontWeight: 600 }}>
                {verificationUri}
              </a>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', background: 'var(--rust-soft, #fbeae0)', borderRadius: 6, marginBottom: 12, color: 'var(--rust)' }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label>HireBridge API URL</label>
        <input
          id="hirebridge-api-url"
          defaultValue={apiUrl}
          placeholder="https://hirebridge.example.com"
          style={{ width: '100%', maxWidth: 480 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={async () => {
            setConnecting(true);
            setError(null);
            setMessage(null);
            setVerificationUri(null);

            // Save API URL.
            const apiUrlEl = document.getElementById('hirebridge-api-url') as HTMLInputElement;
            const formData = new FormData();
            formData.set('group', 'hirebridge');
            formData.set('hirebridge.api_url', apiUrlEl.value);
            formData.set('redirect', '/admin/settings?tab=mcp');
            await fetch('/api/admin/settings/save', { method: 'POST', body: formData });

            // Kick off the device-auth flow.
            const res = await fetch('/api/hirebridge/connect', { method: 'POST' });
            const data = await res.json();
            setConnecting(false);

            if (data.error) {
              setError(data.error);
              return;
            }

            setMessage(data.message || 'Magic link sent.');
            if (data.verification_uri_complete) {
              setVerificationUri(data.verification_uri_complete);
            }
            startPoll(data.interval ?? 5);
          }}
          disabled={connecting || polling}
          style={{ opacity: connecting || polling ? 0.6 : 1 }}
        >
          {connecting ? 'Sending...' : polling ? 'Waiting for approval...' : 'Connect to HireBridge'}
        </button>

        {polling && (
          <button onClick={cancelPoll} className="secondary" style={{ padding: '6px 14px' }}>
            Cancel
          </button>
        )}
      </div>

      <p style={{ color: 'var(--ink-soft)', marginTop: 16, fontSize: '0.85rem' }}>
        <strong>Note:</strong> your site must be publicly reachable for HireBridge to deliver
        introductions to <code>/api/inbox</code>. Use the same admin email in your jobops
        instance &mdash; the candidate_id is derived from it on both sides.
      </p>
    </div>
  );
}