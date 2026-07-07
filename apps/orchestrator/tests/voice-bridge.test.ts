// Phase 3 acceptance — orchestrator WS bridge for voice channels.
//
// These tests bypass `server.ts` entirely and bring up a minimal Express
// server per test, attaching `attachVoiceBridge` directly. That's safer than
// importing `server.ts` (which permanently opens an HTTP listener on
// process.env.ORCHESTRATOR_PORT — fine in production, hostile to a vitest
// worker whose event loop would otherwise be held open until the parent
// process exits).
//
// Proves the structural invariants of §7 + §8:
//
//   1. The WS upgrade handler rejects paths that aren't /internal/voice and
//      rejects missing session_id.
//
//   2. Pre-gate voice_speak emits `transcript_final` with the email prompt
//      and never reaches the LLM (§2 invariant 4 — no LLM tools can fire
//      while email_verified=0).
//
//   3. Post-gate voice_speak would emit `assistant_delta` per token (we
//      don't actually run the LLM here — Phase 3 ships without a key —
//      but we assert the path emits an `error` per runTurn's contract and
//      a `done`).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once as _once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import WebSocket from 'ws';

const DATA_DIR_TMP = mkdtempSync(join(tmpdir(), 'p3-orch-'));

beforeAll(async () => {
  process.env.DATA_DIR = DATA_DIR_TMP;
  process.env.SESSION_SECRET = 'phase3-smoke-secret-value-long-enough-32';
  process.env.PORTFOLIO_ENCRYPTION_KEY =
    's38vFTFOjEXwZcfk7t08LkjOcwSpqEQz5f80dvOX2CU=';
  process.env.IP_HASH_SALT = 'phase3-smoke-salt';
  process.env.JOBOPS_BASE_URL = '';
});

afterAll(() => {
  rmSync(DATA_DIR_TMP, { recursive: true, force: true });
});

interface Bridge {
  server: ReturnType<typeof createServer>;
  port: number;
  close: () => Promise<void>;
}

async function startBridge(): Promise<Bridge> {
  const { attachVoiceBridge } = await import('../src/voiceBridge.js');
  const app = express();
  app.get('/healthz', (_req: unknown, res: { json: (v: unknown) => void }) => res.json({ ok: true }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  attachVoiceBridge(server);
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  const port = addr.port;
  return {
    server,
    port,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function insertSession(sessionId: string, channel: 'voice' | 'text', verified: 0 | 1) {
  const { getDb } = await import('../src/db.js');
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO recruiter_sessions (id, channel, work_email, email_domain, company_domain_inferred,
      ip_hash, user_agent, started_at, last_active_at, email_verified, blocked_reason, message_count)
     VALUES (?, ?, '', '', '', NULL, 'voice-test', ?, ?, ?, '', 0)`,
  ).run(sessionId, channel, now, now, verified);
}

async function collectFrames(
  ws: WebSocket,
  predicate: (types: string[]) => boolean,
  maxRetries = 100,
  intervalMs = 25,
): Promise<unknown[]> {
  const frames: unknown[] = [];
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      ws.off('message', onMessage);
      ws.off('error', onError);
      resolve(frames);
    };
    const onMessage = (raw: Buffer | string) => {
      try {
        frames.push(JSON.parse(raw.toString()));
      } catch {
        frames.push(raw.toString());
      }
      if (predicate(frameTypes(frames))) finish();
    };
    const onError = (e: Error) => {
      if (settled) return;
      settled = true;
      reject(e);
    };
    ws.on('message', onMessage);
    ws.on('error', onError);
    const tick = async () => {
      for (let i = 0; i < maxRetries; i++) {
        if (predicate(frameTypes(frames))) return;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    };
    void tick().then(finish);
  });
}

function frameTypes(frames: unknown[]): string[] {
  const out: string[] = [];
  for (const f of frames) {
    if (f && typeof f === 'object' && typeof (f as { type?: unknown }).type === 'string') {
      out.push((f as { type: string }).type);
    }
  }
  return out;
}

describe('voice bridge — internal WS protocol', () => {
  it('rejects WS upgrades to paths other than /internal/voice', async () => {
    const b = await startBridge();
    try {
      await expect(
        new Promise<void>((resolve, reject) => {
          const ws2 = new WebSocket(`ws://127.0.0.1:${b.port}/`);
          ws2.on('open', () => reject(new Error('should not connect')));
          ws2.on('error', () => resolve());
          ws2.on('unexpected-response', (_req, res: { statusCode?: number; destroy: () => void }) => {
            res.destroy();
            resolve();
          });
        }),
      ).resolves.toBeUndefined();
    } finally {
      await b.close();
    }
  });

  it('rejects WS upgrade with missing session_id', async () => {
    const b = await startBridge();
    try {
      await expect(
        new Promise<void>((resolve, reject) => {
          const ws2 = new WebSocket(`ws://127.0.0.1:${b.port}/internal/voice`);
          ws2.on('open', () => reject(new Error('should not connect')));
          ws2.on('error', () => resolve());
          ws2.on('unexpected-response', (_req, res: { statusCode?: number; destroy: () => void }) => {
            res.destroy();
            resolve();
          });
        }),
      ).resolves.toBeUndefined();
    } finally {
      await b.close();
    }
  });

  it('pre-gate voice_speak emits transcript_final prompt, no LLM tools fire', async () => {
    const b = await startBridge();
    try {
      const sessionId = randomUUID();
      await insertSession(sessionId, 'voice', 0);

      const ws2 = new WebSocket(
        `ws://127.0.0.1:${b.port}/internal/voice?session_id=${sessionId}`,
      );
      await new Promise<void>((resolve, reject) => {
        ws2.once('open', () => resolve());
        ws2.once('error', reject);
      });

      ws2.send(
        JSON.stringify({
          type: 'voice_speak',
          session_id: sessionId,
          text: 'what projects have you built',
          turn_seq: 1,
        }),
      );
      const frames = await collectFrames(ws2, (types) => types.includes('done'));
      ws2.close();

      const types = frameTypes(frames);
      expect(types).toContain('transcript_final');
      expect(types).toContain('done');
      // Crucially: NO assistant_delta — the LLM must not fire pre-gate.
      expect(types).not.toContain('assistant_delta');
      // No tool frames leaked; the gate pathway is the only one reachable.
      expect(types).not.toContain('tool_start');
      expect(types).not.toContain('tool_end');
      // Transcript_final carries the email-prompt wording.
      const promptFrame = frames.find((f) => isFrameType(f, 'transcript_final')) as { text?: string } | undefined;
      expect(promptFrame?.text?.toLowerCase() ?? '').toContain('email');
    } finally {
      await b.close();
    }
  });

  it('post-gate voice_speak runs runTurn and emits error/done (no live LLM key in Phase 3)', async () => {
    const b = await startBridge();
    try {
      const sessionId = randomUUID();
      await insertSession(sessionId, 'voice', 1);

      const ws2 = new WebSocket(
        `ws://127.0.0.1:${b.port}/internal/voice?session_id=${sessionId}`,
      );
      await new Promise<void>((resolve, reject) => {
        ws2.once('open', () => resolve());
        ws2.once('error', reject);
      });

      ws2.send(
        JSON.stringify({
          type: 'voice_speak',
          session_id: sessionId,
          text: 'list your projects',
          turn_seq: 1,
        }),
      );
      const frames = await collectFrames(ws2, (types) => types.includes('done'));
      ws2.close();

      const types = frameTypes(frames);
      // runTurn without an LLM key emits error('agent not configured') then
      // done. This is the honest Phase 3 behavior — Phase 5 polish wires
      // real credentials; once they exist, runTurn reaches the assistant path
      // and emits `assistant_delta` then `done` with chat_messages rows
      // (user + assistant). For now we assert the error path is reached and
      // the session row records voice-channel provenance.
      expect(types).toContain('error');
      expect(types).toContain('done');
      expect(types).not.toContain('assistant_delta');

      const { getDb } = await import('../src/db.js');
      const db = getDb();
      // No chat_messages yet (runTurn errored at the agent-not-configured
      // guard before recording). The session row exists and is voice-channel.
      const msgs = db
        .prepare('SELECT role FROM chat_messages WHERE session_id = ?')
        .all(sessionId) as Array<{ role: string }>;
      expect(msgs).toHaveLength(0);
      const session = db
        .prepare(
          'SELECT channel, message_count FROM recruiter_sessions WHERE id = ?',
        )
        .get(sessionId) as { channel: string; message_count: number } | undefined;
      expect(session).toBeDefined();
      expect(session?.channel).toBe('voice');
      // message_count is 0 because runTurn errored before recordChatMessage.
      // With a real LLM key (Phase 5 polish), this becomes >=1.
      expect(session?.message_count ?? 0).toBe(0);
    } finally {
      await b.close();
    }
  });

  it('rejects voice_speak with mismatched session_id (cross-tenant guard)', async () => {
    const b = await startBridge();
    try {
      const a = randomUUID();
      const b2 = randomUUID();
      await insertSession(a, 'voice', 0);

      const ws2 = new WebSocket(
        `ws://127.0.0.1:${b.port}/internal/voice?session_id=${a}`,
      );
      await new Promise<void>((resolve, reject) => {
        ws2.once('open', () => resolve());
        ws2.once('error', reject);
      });

      // Sending a frame that references a DIFFERENT session must error
      // without leaking any transcript / assistant state.
      ws2.send(
        JSON.stringify({
          type: 'voice_speak',
          session_id: b2,
          text: 'i belong to someone else',
          turn_seq: 1,
        }),
      );
      const frames = await collectFrames(ws2, (types) => types.includes('error'));
      ws2.close();

      const types = frameTypes(frames);
      expect(types).toContain('error');
      expect(types).not.toContain('transcript_final');
      expect(types).not.toContain('assistant_delta');
    } finally {
      await b.close();
    }
  });
});

function isFrameType(payload: unknown, type?: string): string | false {
  if (!payload || typeof payload !== 'object') return false;
  const t = (payload as { type?: unknown }).type;
  if (typeof t !== 'string') return false;
  if (type !== undefined && t !== type) return false;
  return t;
}
