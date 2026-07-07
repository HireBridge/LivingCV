'use client';

import { useState } from 'react';

export function ConnectivityForm({ initialData }: { initialData: Record<string, string> }) {
  const [telegramBotToken, setTelegramBotToken] = useState(initialData['telegram.bot_token'] ?? '');
  const [telegramChatId, setTelegramChatId] = useState(initialData['telegram.chat_id'] ?? '');
  const [emailProvider, setEmailProvider] = useState(initialData['email.provider'] ?? 'none');
  const [emailApiKey, setEmailApiKey] = useState(initialData['email.api_key'] ?? '');
  const [googleClientId, setGoogleClientId] = useState(initialData['google.client_id'] ?? '');
  const [googleClientSecret, setGoogleClientSecret] = useState(initialData['google.client_secret'] ?? '');

  return (
    <form method="post" action="/api/admin/settings/save" className="row">
      <input type="hidden" name="group" value="connectivity" />
      <input type="hidden" name="redirect" value="/admin/settings?tab=connectivity" />
      
      <div className="admin-card" style={{ marginBottom: 20 }}>
        <h3>Telegram Integration</h3>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginBottom: 15 }}>
          Connect a Telegram bot to allow the agent to relay messages from visitors directly to your Telegram account.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
          <div>
            <label>Bot Token (encrypted)</label>
            <input 
              type="password" 
              name="telegram.bot_token" 
              value={telegramBotToken} 
              onChange={e => setTelegramBotToken(e.target.value)} 
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" 
              autoComplete="off" 
            />
          </div>
          <div>
            <label>Chat ID</label>
            <input 
              name="telegram.chat_id" 
              value={telegramChatId} 
              onChange={e => setTelegramChatId(e.target.value)} 
              placeholder="e.g. 123456789" 
            />
          </div>
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: 20 }}>
        <h3>Email Provider</h3>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginBottom: 15 }}>
          Configure an email API service (like Resend, SendGrid, etc.) to allow the agent to send emails.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
          <div>
            <label>Provider</label>
            <select name="email.provider" value={emailProvider} onChange={e => setEmailProvider(e.target.value)}>
              <option value="none">None</option>
              <option value="resend">Resend</option>
              <option value="sendgrid">SendGrid</option>
              <option value="mailgun">Mailgun</option>
            </select>
          </div>
          <div>
            <label>API Key (encrypted)</label>
            <input 
              type="password" 
              name="email.api_key" 
              value={emailApiKey} 
              onChange={e => setEmailApiKey(e.target.value)} 
              placeholder={emailProvider === 'none' ? 'not required' : 'paste API key'}
              disabled={emailProvider === 'none'}
              autoComplete="off" 
            />
          </div>
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: 20 }}>
        <h3>Google Calendar & Admin Sign-in</h3>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginBottom: 15 }}>
          Configure Google OAuth to allow signing into this admin panel using your Google account and to let the AI check your availability or schedule meetings directly in Google Calendar.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
          <div>
            <label>Google Client ID</label>
            <input 
              name="google.client_id" 
              value={googleClientId} 
              onChange={e => setGoogleClientId(e.target.value)} 
              placeholder="e.g. 123456789-abc.apps.googleusercontent.com" 
              autoComplete="off" 
            />
          </div>
          <div>
            <label>Google Client Secret (encrypted)</label>
            <input 
              type="password" 
              name="google.client_secret" 
              value={googleClientSecret} 
              onChange={e => setGoogleClientSecret(e.target.value)} 
              placeholder="paste secret" 
              autoComplete="off" 
            />
          </div>
        </div>
      </div>

      <div className="actions">
        <button type="submit">Save</button>
      </div>
    </form>
  );
}
