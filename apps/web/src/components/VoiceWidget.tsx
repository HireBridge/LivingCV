'use client';

// Voice widget (Phase 3, §8). Mirrors ChatWidget but uses the voice service.
// Renders only when `voice.enabled === 1`.
//
// Phase 3 reality: the voice service ships MockSTT + MockTTS — the harness
// echoes "type" hints appended to the audio buffer; real Deepgram / Whisper /
// Cartesia / Piper adapters slot in behind the same STT/TTS interfaces
// (`apps/voice/src/voice_service/{stt,tts}.py`) when credentials are added.

import { useEffect, useRef, useState } from 'react';
import {
  AssistantDelta,
  AudioOut,
  ErrorEvent,
  StatusEvent,
  TranscriptFinal,
  TranscriptPartial,
  type VoiceClientMsg,
} from '@/lib/voice-protocol';

interface VoiceConfig {
  enabled: boolean;
  mode: 'cloud' | 'local';
  wsUrl: string;
}

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'closed' | 'error';
interface LogEntry {
  phase: Phase;
  detail?: string;
  ts: number;
}

export function VoiceWidget(props: { config: VoiceConfig }) {
  // Hooks must run unconditionally on every render (rules-of-hooks). The
  // "not enabled" early return goes AFTER all hooks.
  const cfg = props.config;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [partial, setPartial] = useState('');
  const [assistant, setAssistant] = useState('');
  const [history, setHistory] = useState<LogEntry[]>([]);
  const [email, setEmail] = useState('');
  const [recording, setRecording] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Determine if voice is enabled and capture the WS URL from the server.
  useEffect(() => {
    if (!cfg.enabled) return;
    // Web Speech Recognition isn't available in all browsers and Phase 3's
    // MockSTT doesn't decode webm. The widget is honest about its capabilities
    // when getUserMedia isn't available: voice mode falls back to typed input
    // for dictation-hostile addresses (§8). The check is SSR-safe.
    if (typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function') {
      setAudioReady(true);
    }
    return () => {
      try { wsRef.current?.close(); } catch { /* noop */ }
      try { mediaRecorderRef.current?.stop(); } catch { /* noop */ }
    };
  }, [cfg.enabled]);

  // Now safe to early-return after all hooks ran.
  if (!cfg.enabled) return null;

  function log(p: Phase, detail?: string) {
    setPhase(p);
    setHistory((h) => [...h, { phase: p, detail, ts: Date.now() }]);
  }

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;
    const r = await fetch('/api/orchestrator/api/chat/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'voice' }),
    });
    if (!r.ok) throw new Error(`session: ${r.status}`);
    const j = (await r.json()) as { sessionId?: string };
    if (!j.sessionId) throw new Error('no sessionId');
    setSessionId(j.sessionId);
    return j.sessionId;
  }

  async function connectWS() {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;
    const sid = await ensureSession();
    const url = `${cfg.wsUrl}?session_id=${encodeURIComponent(sid)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => log('listening', 'voice ws open');
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as unknown;
        if (typeof data !== 'object' || data === null) return;
        const t = (data as { type?: unknown }).type;
        if (t === 'transcript_partial') {
          const p = TranscriptPartial.safeParse(data);
          if (p.success) setPartial(p.data.text);
        } else if (t === 'transcript_final') {
          const p = TranscriptFinal.safeParse(data);
          if (p.success) {
            setTranscript((cur) => (cur ? cur + '\n' : '') + p.data.text);
            setPartial('');
          }
        } else if (t === 'assistant_delta') {
          const a = AssistantDelta.safeParse(data);
          if (a.success) setAssistant((s) => s + a.data.text);
        } else if (t === 'audio_out') {
          const a = AudioOut.safeParse(data);
          if (a.success) {
            // For Phase 3, MockTTS is a placeholder; we don't auto-play it.
            log('speaking', `tts ${a.data.bytes_b64.length}b`);
          }
        } else if (t === 'status') {
          const s = StatusEvent.safeParse(data);
          if (s.success) log(s.data.state as Phase);
        } else if (t === 'error') {
          const e = ErrorEvent.safeParse(data);
          if (e.success) log('error', e.data.message);
        }
      } catch {
        // Ignore malformed frames — the voice service sanitises on its side.
      }
    };
    ws.onclose = () => log('closed', 'voice ws close');
    ws.onerror = () => log('error', 'voice ws error');
  }

  function sendFrame(msg: VoiceClientMsg) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }

  async function submitEmail() {
    if (!email) return;
    setAssistant('');
    setPartial('');
    setEmail('');
    const sid = await ensureSession();
    const r = await fetch('/api/orchestrator/api/chat/submit-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: sid, email }),
    });
    if (r.ok) {
      log('listening', 'email accepted');
      // Now that email_verified flipped, connect the WS and start receiving LLM tokens.
      await connectWS();
    }
  }

  async function toggleMic() {
    if (!audioReady) return;
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      await ensureSession();
      await connectWS();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          void e.data.arrayBuffer().then(() => {
            // Phase 3 mock STT doesn't decode real audio; we send a synthetic
            // "hint:" payload that the mock recognises. Real STT replaces
            // this entire path with proper audio in Phase 5 (Deepgram /
            // Whisper.cpp / Piper). The bytes are otherwise unused.
            const seq = Date.now();
            const hint = btoa(`type:phase3 mock`);
            sendFrame({ type: 'audio_chunk', seq, rate: 16000, channels: 1, bytes_b64: hint, speech_ms: 0 });
            // Send a stop frame so the orchestrator STT-checksum the buffered
            // bytes; the mock STT returns the uppercase hint as the transcript.
            sendFrame({ type: 'client_control', action: 'stop' });
            log('thinking', 'sent audio + stop');
            // Also send the conversation text via voice_speak, per Phase 3
            // design (a separate fan-out — Phase 5 polish hooks this into the
            // audio path).
            const sid = sessionId;
            if (sid && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: 'voice_speak',
                session_id: sid,
                text: 'phase 3 voice test',
                turn_seq: seq,
              }));
            }
          });
        }
      };
      mr.start();
      setRecording(true);
      log('listening', 'mic on');
    } catch (err) {
      log('error', `mic: ${(err as Error).message}`);
    }
  }

  return (
    <div style={panelStyle}>
      <header style={headerStyle}>
        <strong>Voice concierge</strong>
        <span style={statusStyle}>{phase}</span>
        <button type="button" onClick={() => log('closed')} aria-label="Close">×</button>
      </header>

      <div style={messagesStyle} aria-live="polite">
        {transcript || partial || assistant ? (
          <pre style={preStyle}>
            {assistant ? `assistant: ${assistant}` : ''}
            {partial ? `\nuser (partial): ${partial}` : ''}
            {transcript ? `\nuser (final): ${transcript}` : ''}
          </pre>
        ) : (
          <p style={dimStyle}>
            Phase 3 voice harness — the orchestrator routes voice sessions through
            the same gate + transcripts as text. Use the typed email input below until
            a real STT (Deepgram / Whisper) is configured.
          </p>
        )}
        {history.slice(-3).map((h, i) => (
          <div key={i} style={historyStyle}>
            [{h.phase}{h.detail ? `: ${h.detail}` : ''}]
          </div>
        ))}
      </div>

      <form
        style={inputRowStyle}
        onSubmit={(e) => {
          e.preventDefault();
          void submitEmail();
        }}
      >
        <input
          ref={emailInputRef}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Work email (gate)"
          type="email"
          required
          style={inputStyle}
        />
        <button type="submit" disabled={!email} style={sendStyle}>Send</button>
      </form>

      <div style={micRowStyle}>
        <button
          type="button"
          onClick={() => void toggleMic()}
          disabled={!audioReady}
          aria-pressed={recording}
          style={{ ...micButtonStyle, background: recording ? 'var(--rust, #9C5333)' : 'var(--signal, #2F6F5E)' }}
        >
          {recording ? 'Stop mic' : audioReady ? 'Hold to speak (Phase 3 mock)' : 'Mic unavailable — type'}
        </button>
        <span style={hintStyle}>mode: {cfg.mode}</span>
      </div>
    </div>
  );
}

// Used by Phase 5 when the MediaRecorder path actually ships real audio; until
// then Phase 3 ships a typed input + echo-style Microphone mock, so the
// helper is parked here behind a flag for the future real implementation.
function _arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
}

const panelStyle: React.CSSProperties = {
  position: 'fixed', right: 20, bottom: 20, zIndex: 30,
  width: 360, height: 540, background: 'var(--paper)', color: 'var(--ink)',
  border: '1px solid var(--rule)', borderRadius: 10, display: 'flex', flexDirection: 'column',
  fontFamily: "'Source Serif 4', Georgia, serif", boxShadow: '0 6px 24px rgba(0,0,0,0.22)',
};
const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
  padding: '12px 16px', borderBottom: '1px solid var(--rule)', fontFamily: "'Space Grotesk', sans-serif",
};
const statusStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem',
  textTransform: 'uppercase', color: 'var(--signal, #2F6F5E)',
};
const messagesStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
};
const preStyle: React.CSSProperties = {
  margin: 0, padding: 12, background: 'var(--paper-deep, #E7E3D6)',
  border: '1px solid var(--rule)', borderRadius: 6, fontSize: '0.88rem', whiteSpace: 'pre-wrap',
};
const dimStyle: React.CSSProperties = { color: 'var(--ink-soft, #4A5568)', fontSize: '0.9rem', margin: 0 };
const historyStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem',
  color: 'var(--ink-soft, #4A5568)',
};
const inputRowStyle: React.CSSProperties = { display: 'flex', borderTop: '1px solid var(--rule)' };
const inputStyle: React.CSSProperties = {
  flex: 1, border: 'none', padding: '12px 14px', background: 'transparent', color: 'var(--ink)', font: 'inherit',
};
const sendStyle: React.CSSProperties = {
  border: 'none', padding: '0 16px', background: 'var(--ink)', color: 'var(--paper)', cursor: 'pointer', fontWeight: 600,
};
const micRowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '10px 14px', borderTop: '1px solid var(--rule)',
};
const micButtonStyle: React.CSSProperties = {
  border: 'none', color: 'var(--paper, #F2F0EA)', padding: '8px 14px',
  borderRadius: 999, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
};
const hintStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: '0.74rem', color: 'var(--ink-soft, #4A5568)',
};
