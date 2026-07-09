'use client';

import { useState } from 'react';

interface Props {
  adminEmail: string;
  connected: boolean;
  profileUrl: string | null;
  apiUrl: string;
  clientId: string;
}

export function HireBridgeConnect({ adminEmail, connected, profileUrl, apiUrl, clientId }: Props) {
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [magicLink, setMagicLink] = useState<string | null>(null);

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
          {profileUrl && (
            <a href={profileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem', color: 'var(--signal)' }}>
              View profile ↗
            </a>
          )}
        </div>
        <form method="post" action="/api/hirebridge/disconnect">
          <button type="submit" className="danger" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
            Disconnect
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <p style={{ color: 'var(--ink-soft)', marginBottom: 16 }}>
        Connect to HireBridge to make your portfolio discoverable on a federated talent
        network. A magic link will be generated for your admin email, <strong>{adminEmail}</strong>.
      </p>

      {message && (
        <div style={{ padding: '10px 14px', background: 'var(--signal-soft)', borderRadius: 6, marginBottom: 12 }}>
          {message}
          {magicLink && (
            <div style={{ marginTop: 8 }}>
              <a href={magicLink} style={{ color: 'var(--signal)', fontWeight: 600 }}>
                Open magic link to finish connecting
              </a>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div>
          <label>HireBridge API URL</label>
          <input
            id="hirebridge-api-url"
            defaultValue={apiUrl}
            placeholder="https://hirebridge.example.com"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label>Client ID</label>
          <input
            id="hirebridge-client-id"
            defaultValue={clientId}
            placeholder="auto-generated if empty"
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <button
        onClick={async () => {
          setConnecting(true);
          setMessage(null);
          setMagicLink(null);

          // Save API URL and client ID first.
          const apiUrlEl = document.getElementById('hirebridge-api-url') as HTMLInputElement;
          const clientIdEl = document.getElementById('hirebridge-client-id') as HTMLInputElement;
          
          const formData = new FormData();
          formData.set('group', 'hirebridge');
          formData.set('hirebridge.api_url', apiUrlEl.value);
          formData.set('hirebridge.client_id', clientIdEl.value || crypto.randomUUID());
          formData.set('redirect', '/admin/settings?tab=mcp');
          await fetch('/api/admin/settings/save', { method: 'POST', body: formData });

          // Initiate the connection.
          const res = await fetch('/api/hirebridge/connect', { method: 'POST' });
          const data = await res.json();

          if (data.error) {
            setMessage(`Error: ${data.error}`);
            setConnecting(false);
            return;
          }

          setMessage(data.message || 'Magic link generated. Open it to complete the connection.');
          if (data.magicLink) {
            setMagicLink(data.magicLink);
          }
          setConnecting(false);
        }}
        disabled={connecting}
        style={{ opacity: connecting ? 0.6 : 1 }}
      >
        {connecting ? 'Sending...' : 'Connect to HireBridge'}
      </button>
    </div>
  );
}
