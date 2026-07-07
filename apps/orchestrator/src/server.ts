// Orchestrator HTTP server (§7). Long-lived Express process. Caddy proxies
// /api/chat/* to this service from the public web app; /internal/voice is for
// Phase 3 (not exposed via Caddy).

import express from 'express';
import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import { createRecruiterSession, getSession, countIpSessionsToday, bumpSessionActivity } from './db.js';
import { hashIp, EMAIL_RX, submitWorkEmailImpl } from './gate.js';
import { getLimits, checkPreTurnGuards } from './limits.js';
import { runTurn, type SseEvent } from './turn.js';

const PORT = Number(process.env.ORCHESTRATOR_PORT || 8100);

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Create a new recruiter session. Body: { channel?: 'text'|'voice' }.
// Returns { sessionId }. Rate-limited per ip_hash.
app.post('/api/chat/session', (req, res) => {
  const db = getDb();
  const ip = (req.ip || req.socket.remoteAddress || null);
  const ipHash = hashIp(ip);
  const limits = getLimits(db);
  if (ipHash && countIpSessionsToday(db, ipHash) >= limits.ipSessionsPerDay) {
    return res.status(429).json({ error: 'too_many_sessions_for_ip' });
  }
  const id = randomUUID();
  const channel = req.body?.channel === 'voice' ? 'voice' : 'text';
  createRecruiterSession(db, {
    id, channel, ip_hash: ipHash, user_agent: (req.get('user-agent') || '').slice(0, 256),
  });
  bumpSessionActivity(db, id, false);
  res.json({ sessionId: id });
});

// Send one user message and stream the LLM turn as Server-Sent Events.
app.post('/api/chat/message', async (req, res) => {
  const db = getDb();
  const sessionId = String(req.body?.sessionId ?? '');
  const text = String(req.body?.text ?? '');
  if (!sessionId || !text) {
    return res.status(400).json({ error: 'sessionId and text required' });
  }
  if (text.length > 4000) {
    return res.status(400).json({ error: 'text too long (>4000 chars)' });
  }
  // Session existence + guard.
  const session = getSession(db, sessionId);
  if (!session) return res.status(404).json({ error: 'session not found' });
  const guard = checkPreTurnGuards(db, session.message_count, text.length);
  if (!guard.allowed) {
    return res.status(429).json({ error: `blocked: ${guard.reason}` });
  }

  // SSE.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (ev: SseEvent) => {
    res.write(`event: ${ev.type}\n`);
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  };
  try {
    await runTurn(db, sessionId, text, send);
  } catch (e) {
    send({ type: 'error', message: (e as Error).message });
  }
  res.end();
});

// Direct endpoint for the chat widget to *test* the email-gate without going
// through the LLM (so the UI can show "verifying..."). Useful in Phase 1
// (no LLM key yet) and stays as a debugging handle.
app.post('/api/chat/submit-email', (req, res) => {
  const db = getDb();
  const sessionId = String(req.body?.sessionId ?? '');
  const email = String(req.body?.email ?? '');
  const session = getSession(db, sessionId);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (!EMAIL_RX.exec(email)) return res.status(400).json({ error: 'invalid email' });
  const r = submitWorkEmailImpl(db, sessionId, { email });
  res.json({ ok: r.ok, message: r.message });
});

app.listen(PORT, () => {
  console.log(`[orchestrator] listening on :${PORT}`);
});
