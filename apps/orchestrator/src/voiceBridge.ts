// Voice WebSocket bridge between the voice service and the orchestrator (§7 + §8).
//
// Wire protocol is defined in apps/voice/src/voice_service/protocol.py (the
// Python side) and mirrored here as TS types. The voice service is the only
// legitimate client — Caddy does NOT expose /internal/voice (the docker network
// only path is between the voice container and the orchestrator container), so
// no caller without a running voice service can reach this.
//
// Wire shape (single portable JSON message):
//
//   voice -> orchestrator:
//     {type:'voice_speak', session_id, text, turn_seq}
//     {type:'voice_close', session_id}
//
//   orchestrator -> voice:
//     {type:'assistant_delta', text}
//     {type:'transcript_final', text}   // gate echo
//     {type:'error', message}
//     {type:'done'}

import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { getDb } from './db.js';
import { getSession } from './db.js';
import { runTurn, type SseEvent } from './turn.js';

type VoiceClientMsg =
  | { type: 'voice_speak'; session_id: string; text: string; turn_seq: number }
  | { type: 'voice_close'; session_id: string };

type VoiceServerMsg =
  | { type: 'assistant_delta'; text: string }
  | { type: 'transcript_final'; text: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

const PRE_GATE_PROMPT =
  "Before we get started, please share your work email so I can tailor answers about the portfolio. " +
  'Type it in the input below.';

function safeSend(ws: WebSocket, msg: VoiceServerMsg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // Socket already closed — fine.
  }
}

function extractSessionId(req: IncomingMessage): string | null {
  const url = req.url ?? '';
  const q = url.split('?')[1] ?? '';
  for (const pair of q.split('&')) {
    const [k, v] = pair.split('=');
    if (k === 'session_id' && v) return decodeURIComponent(v);
  }
  return null;
}

export function attachVoiceBridge(httpServer: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket: Duplex, head) => {
    const url = req.url ?? '';
    if (!url.startsWith('/internal/voice')) {
      socket.destroy();
      return;
    }
    const sessionId = extractSessionId(req);
    if (!sessionId) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, sessionId);
    });
  });

  function handleConnection(ws: WebSocket, sessionId: string) {
    ws.on('message', async (raw: Buffer | ArrayBuffer | Buffer[]) => {
      let parsed: VoiceClientMsg;
      try {
        parsed = JSON.parse(toString(raw)) as VoiceClientMsg;
      } catch {
        safeSend(ws, { type: 'error', message: 'bad json' });
        return;
      }

      if (parsed.type === 'voice_close') {
        try {
          ws.close();
        } catch { /* noop */ }
        return;
      }

      if (parsed.type !== 'voice_speak') return;
      if (parsed.session_id !== sessionId) {
        safeSend(ws, { type: 'error', message: 'session_id mismatch' });
        return;
      }

      const text = (parsed.text ?? '').slice(0, 4000);
      const db = getDb();
      const session = getSession(db, sessionId);
      if (!session) {
        safeSend(ws, { type: 'error', message: 'session not found' });
        safeSend(ws, { type: 'done' });
        return;
      }

      // Pre-gate voice flows are special: we hand the caller the email prompt
      // and let the typed fallback in the widget collect the email. The
      // voice LLM path engages once email_verified=1. This keeps the typed
      // fallback authoritative (no dictation-based email submission).
      if (session.email_verified === 0) {
        safeSend(ws, { type: 'transcript_final', text: PRE_GATE_PROMPT });
        safeSend(ws, { type: 'done' });
        return;
      }

      await runTurn(db, sessionId, text, (ev: SseEvent) => {
        if (ev.type === 'token') {
          safeSend(ws, { type: 'assistant_delta', text: ev.text });
        } else if (ev.type === 'error') {
          safeSend(ws, { type: 'error', message: ev.message });
        }
        // tool_start/tool_end are intentionally not surfaced to voice — the
        // browser's "tools used" panel is text-only. Done is emitted below.
      });
      safeSend(ws, { type: 'done' });
    });

    ws.on('close', () => { /* no per-session state to release; runTurn is stateless across calls */ });
  }
}

function toString(raw: Buffer | ArrayBuffer | Buffer[]): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (raw instanceof ArrayBuffer) return new TextDecoder().decode(raw);
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  return String(raw);
}
