'use client';

// Floating chat widget — Phase 2 (§9 public site, chat widget).
//
// 1. /api/chat/session → { sessionId }
// 2. /api/chat/message → SSE stream of {type:token|tool_start|tool_end|done|error}
// We use fetch() with a ReadableStream for SSE (no EventSource so we can POST
// with a body).

import { useEffect, useRef, useState } from 'react';

interface ChatToolEvent { id: string; name: string; ok?: boolean }
interface MessageEntry {
  role: 'user' | 'assistant';
  text: string;
  tools?: ChatToolEvent[];
}

const STORAGE_KEY = 'portfolio.chat.sessionId';

export function ChatWidget({ agentEnabled = true }: { agentEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<MessageEntry[]>([]);
  const assistantsRef = useRef<MessageEntry>({ role: 'assistant', text: '', tools: [] });
  const toolsRef = useRef<ChatToolEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [typingDots, setTypingDots] = useState('');

  useEffect(() => {
    if (!busy) return;
    const interval = setInterval(() => setTypingDots(d => d.length >= 3 ? '' : d + '.'), 400);
    return () => clearInterval(interval);
  }, [busy]);

  useEffect(() => {
    messagesRef.current = messages;
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  async function ensureSession(forceNew = false): Promise<string> {
    if (!forceNew && sessionId) return sessionId;
    const r = await fetch('/api/orchestrator/api/chat/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'text' }),
    });
    if (!r.ok) throw new Error(`session: ${r.status}`);
    const j = (await r.json()) as { sessionId?: string };
    if (!j.sessionId) throw new Error('no sessionId');
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, j.sessionId);
    setSessionId(j.sessionId);
    return j.sessionId;
  }

  async function send(text: string, forceNew = false) {
    setBusy(true);
    setError(null);
    try {
      const sid = await ensureSession(forceNew);
      // Optimistic user message.
      const um: MessageEntry = { role: 'user', text };
      assistantsRef.current = { role: 'assistant', text: '', tools: [] };
      toolsRef.current = [];
      setMessages((prev) => [...prev, um, assistantsRef.current]);

      const r = await fetch('/api/orchestrator/api/chat/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, text }),
      });
      if (!r.ok || !r.body) {
        if (r.status === 404) {
          if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
          setSessionId(null);
          if (!forceNew) {
            // Remove optimistic messages and retry
            setMessages((prev) => prev.slice(0, prev.length - 2));
            return send(text, true);
          }
          setError('Session expired. Please try sending your message again to start a new chat.');
        } else {
          setError(`message: ${r.status}`);
        }
        setBusy(false);
        return;
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Parse SSE frames: "event: <type>\ndata: <json>\n\n"
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const ev = parseFrame(frame);
          if (!ev) continue;
          applyEvent(ev);
        }
      }
      // Persist the final assistant message when the stream closes.
      const a = assistantsRef.current;
      if (a.text || (a.tools && a.tools.length > 0)) {
        setMessages((prev) => {
          const next = prev.slice();
          next[next.length - 1] = { ...a };
          return next;
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function applyEvent(ev: { type: string; payload: unknown }) {
    switch (ev.type) {
      case 'token': {
        const t = (ev.payload as { text?: string }).text ?? '';
        assistantsRef.current.text += t;
        // Lightweight re-render via a state tick using messagesRef.
        setMessages((prev) => prev.slice());
        break;
      }
      case 'tool_start': {
        const p = ev.payload as { id: string; name: string };
        toolsRef.current.push({ id: p.id, name: p.name });
        assistantsRef.current.tools = toolsRef.current.slice();
        setMessages((prev) => prev.slice());
        break;
      }
      case 'tool_end': {
        const p = ev.payload as { id: string; name: string; ok: boolean };
        const t = toolsRef.current.find((x) => x.id === p.id);
        if (t) t.ok = p.ok;
        assistantsRef.current.tools = toolsRef.current.slice();
        setMessages((prev) => prev.slice());
        break;
      }
      case 'error': {
        const m = (ev.payload as { message?: string }).message ?? 'error';
        setError(m);
        break;
      }
      case 'done':
        break;
    }
  }

  const [formSubmitted, setFormSubmitted] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const [visitorInfo, setVisitorInfo] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  // When form is submitted, send an initial silent or visible message with their info
  async function submitForm(e: React.FormEvent | React.MouseEvent, shouldStartChat: boolean, forceNew = false) {
    e.preventDefault();
    if (!visitorName.trim() || !visitorEmail.trim()) return;
    setEmailError(null);
    
    try {
      const sid = await ensureSession(forceNew);
      const emailRes = await fetch('/api/orchestrator/api/chat/submit-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, email: visitorEmail }),
      });
      if (emailRes.status === 404 && !forceNew) {
         if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
         setSessionId(null);
         return submitForm(e, shouldStartChat, true);
      }

      const emailData = await emailRes.json().catch(() => ({ ok: false, message: 'Invalid response' }));
      if (!emailData.ok) {
        setEmailError(emailData.message ?? 'Email not accepted');
        return;
      }

      if (!shouldStartChat || !agentEnabled) {
        // Send lead info as a silent message to record it, ignoring any LLM errors
        const msgRes = await fetch('/api/orchestrator/api/chat/message', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: sid, text: `[Lead Submission] Name: ${visitorName}, Email: ${visitorEmail}, Info: ${visitorInfo || 'None'}` }),
        }).catch(() => null);
        if (msgRes && msgRes.status === 404 && !forceNew) {
           if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
           setSessionId(null);
           return submitForm(e, shouldStartChat, true);
        }
        
        setOpen(false);
        setVisitorName('');
        setVisitorEmail('');
        setVisitorInfo('');
        alert('Thank you! Your information has been submitted. We will be in touch shortly.');
        return;
      }
    } catch {
      // ignore
    }

    setFormSubmitted(true);
    
    // Send an initial system-context-like message from the user
    const contextText = `[System Context: The user's name is ${visitorName}. Their email is ${visitorEmail}. Additional info provided: ${visitorInfo || 'None'}. Please welcome them by name.]`;
    await send(contextText);
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-label={agentEnabled ? "Open chat" : "Get in touch"}
        onClick={() => setOpen(true)}
        style={launcherStyle}
      >
        {agentEnabled ? "Chat" : "Get in touch"}
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      <header style={headerStyle}>
        <strong>{agentEnabled ? 'Concierge' : 'Get in touch'}</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </header>
      
      {!formSubmitted ? (
        <form onSubmit={(e) => submitForm(e, agentEnabled)} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          <p style={{ margin: '0 0 10px 0', color: 'var(--ink)' }}>{agentEnabled ? 'Please introduce yourself before starting the chat.' : 'Leave us a message and we will get back to you.'}</p>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem' }}>Name <span style={{color: 'red'}}>*</span></label>
            <input required type="text" value={visitorName} onChange={e => setVisitorName(e.target.value)} style={formInputStyle} placeholder="Your name" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem' }}>Email <span style={{color: 'red'}}>*</span></label>
            <input required type="email" value={visitorEmail} onChange={e => { setVisitorEmail(e.target.value); setEmailError(null); }} style={formInputStyle} placeholder="you@company.com" />
            {emailError && <p style={{ margin: '4px 0 0 0', color: '#d32f2f', fontSize: '0.85rem' }}>{emailError}</p>}
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem' }}>Additional Info</label>
            <textarea value={visitorInfo} onChange={e => setVisitorInfo(e.target.value)} style={{...formInputStyle, height: 80, resize: 'none'}} placeholder="Any context or questions..." />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
            {agentEnabled ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button 
                  type="button" 
                  onClick={(e) => submitForm(e, false)} 
                  disabled={!visitorName.trim() || !visitorEmail.trim()} 
                  style={{...sendStyle, padding: '12px 16px', borderRadius: 6, background: 'var(--rule)', color: 'var(--ink)'}}
                >
                  Submit
                </button>
                <button 
                  type="submit" 
                  disabled={!visitorName.trim() || !visitorEmail.trim()} 
                  style={{...sendStyle, padding: '12px 16px', borderRadius: 6}}
                >
                  Submit and start chat with concierge
                </button>
              </div>
            ) : (
              <button 
                type="button" 
                onClick={(e) => submitForm(e, false)} 
                disabled={!visitorName.trim() || !visitorEmail.trim()} 
                style={{...sendStyle, padding: '12px 16px', borderRadius: 6, background: 'var(--rule)', color: 'var(--ink)'}}
              >
                Submit
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          <div style={messagesStyle} aria-live="polite">
            {messages.map((m, i) => {
              // Hide the initial context message from the UI
              if (m.text.startsWith('[System Context:')) return null;
              const isTyping = busy && i === messages.length - 1 && m.role === 'assistant' && !m.text && (!m.tools || m.tools.length === 0);
              return (
                <div key={i} style={messageRowStyle(m.role)}>
                  <div style={messageBubbleStyle(m.role)}>
                    {isTyping ? <span style={{ opacity: 0.6, fontStyle: 'italic' }}>typing{typingDots}</span> : m.text}
                    {m.tools && m.tools.length > 0 ? (
                      <ul style={toolsStyle}>
                        {m.tools.map((t) => (
                          <li key={t.id}>{t.ok === undefined ? '⟳' : t.ok ? '✓' : '✗'} {t.name}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {error ? <div style={errorStyle}>{error}</div> : null}
            <div ref={scrollRef} />
          </div>
          <form
            style={inputRowStyle}
            onSubmit={(e) => {
              e.preventDefault();
              const text = input.trim();
              if (!text || busy) return;
              setInput('');
              void send(text);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about projects, skills, work history…"
              disabled={busy}
              style={inputStyle}
            />
            <button type="submit" disabled={busy || !input.trim()} style={sendStyle}>Send</button>
          </form>
        </>
      )}
    </div>
  );
}

function parseFrame(frame: string): { type: string; payload: unknown } | null {
  let eventType: string | null = null;
  let dataLine: string | null = null;
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) eventType = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLine = line.slice(5).trim();
  }
  if (!eventType || dataLine === null) return null;
  let payload: unknown = null;
  try {
    payload = JSON.parse(dataLine);
  } catch {
    payload = dataLine;
  }
  return { type: eventType, payload };
}

// ── Inline styles (template-neutral; matches the public palette). ──────────────
const launcherStyle: React.CSSProperties = {
  position: 'fixed', right: 20, bottom: 20, zIndex: 30,
  background: 'var(--ink)', color: 'var(--paper)', border: 'none', borderRadius: 22,
  padding: '12px 20px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
};
const panelStyle: React.CSSProperties = {
  position: 'fixed', right: 20, bottom: 20, zIndex: 30,
  width: 360, height: 580, background: 'var(--paper)', color: 'var(--ink)',
  border: '1px solid var(--rule)', borderRadius: 10, display: 'flex', flexDirection: 'column',
  fontFamily: "'Source Serif 4', Georgia, serif", boxShadow: '0 6px 24px rgba(0,0,0,0.22)',
};
const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '12px 16px', borderBottom: '1px solid var(--rule)',
  fontFamily: "'Space Grotesk', sans-serif",
};
const messagesStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
};
const inputRowStyle: React.CSSProperties = { display: 'flex', borderTop: '1px solid var(--rule)' };
const inputStyle: React.CSSProperties = {
  flex: 1, border: 'none', padding: '12px 14px', background: 'transparent', color: 'var(--ink)', font: 'inherit',
};
const sendStyle: React.CSSProperties = {
  border: 'none', padding: '0 16px', background: 'var(--ink)', color: 'var(--paper)',
  cursor: 'pointer', fontWeight: 600,
};
function messageRowStyle(role: 'user' | 'assistant'): React.CSSProperties {
  return { display: 'flex', justifyContent: role === 'user' ? 'flex-end' : 'flex-start' };
}
function messageBubbleStyle(role: 'user' | 'assistant'): React.CSSProperties {
  return {
    maxWidth: '85%',
    background: role === 'user' ? 'var(--signal)' : 'var(--paper-deep)',
    color: 'var(--ink)',
    padding: '10px 14px',
    borderRadius: 8,
    border: role === 'user' ? 'none' : '1px solid var(--rule)',
    fontFamily: role === 'user' ? "'Source Serif 4', Georgia, serif" : 'inherit',
  };
}
const toolsStyle: React.CSSProperties = { marginTop: 6, marginBottom: 0, paddingLeft: 18, fontSize: '0.85em', opacity: 0.8 };
const errorStyle: React.CSSProperties = { color: 'var(--rust)', fontSize: '0.85em', padding: 8 };
const formInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--rule)',
  background: 'transparent',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
