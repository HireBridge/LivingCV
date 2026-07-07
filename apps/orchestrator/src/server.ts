// Orchestrator HTTP + WS server (§7 + §8). Long-lived Express process.
//
// Routes (proxied by Caddy from the public web app and by the voice
// container directly):
//
//   POST /api/chat/session   -> { sessionId }        (rate-limited)
//   POST /api/chat/message   -> SSE stream of an LLM turn
//   POST /api/chat/submit-email -> { ok, message }    (text fallback for the
//                                                   email gate; voice widget
//                                                   uses the same endpoint)
//   GET  /healthz
//
// Internal-only (docker-network, NOT exposed via Caddy):
//
//   GET  /internal/voice?session_id=...   WS upgrade → voice bridge
//
// Voice bridge protocol is defined in apps/voice/src/voice_service/protocol.py.

import express from 'express';

import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import { createRecruiterSession, getSession, countIpSessionsToday, bumpSessionActivity } from './db.js';
import { hashIp, EMAIL_RX, submitWorkEmailImpl } from './gate.js';
import { getLimits, checkPreTurnGuards } from './limits.js';
import { runTurn, type SseEvent } from './turn.js';

import { attachMasterMcp } from './masterMcp.js';

const PORT = Number(process.env.ORCHESTRATOR_PORT || 8100);

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/healthz', (_req: Request, res: Response) => res.json({ ok: true }));

// Create a new recruiter session. Body: { channel?: 'text'|'voice' }.
// Returns { sessionId }. Rate-limited per ip_hash.
app.post('/api/chat/session', (req: Request, res: Response) => {
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
app.post('/api/chat/message', async (req: Request, res: Response) => {
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
// through the LLM (so the UI can show "verifying..."). Useful when LLM key is
// missing OR for the voice widget's typed email-input fallback.
app.post('/api/chat/submit-email', (req: Request, res: Response) => {
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



// Attach the Master MCP server endpoints
attachMasterMcp(app);
