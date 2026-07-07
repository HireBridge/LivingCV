// Mirrors apps/voice/src/voice_service/protocol.py (kept here so the browser
// bundle can parse the WS frames with the same zod-style runtime checks
// instead of trusting the network). These are deliberately permissive:
// unknown fields are ignored; only the discriminator + required text is
// asserted. The server-side Pydantic models are authoritative.

import { z } from 'zod';

export const StatusStateEnum = z.enum(['idle', 'listening', 'thinking', 'speaking', 'closed']);
export type StatusState = z.infer<typeof StatusStateEnum>;

export const TranscriptPartial = z.object({
  type: z.literal('transcript_partial'),
  text: z.string(),
  is_final: z.boolean().default(false),
});

export const TranscriptFinal = z.object({
  type: z.literal('transcript_final'),
  text: z.string(),
});

export const AssistantDelta = z.object({
  type: z.literal('assistant_delta'),
  text: z.string(),
});

export const AudioOut = z.object({
  type: z.literal('audio_out'),
  rate: z.number(),
  bytes_b64: z.string(),
});

export const StatusEvent = z.object({
  type: z.literal('status'),
  state: StatusStateEnum,
  message: z.string().optional(),
});

export const ErrorEvent = z.object({
  type: z.literal('error'),
  message: z.string(),
});

export const ClientHello = z.object({
  type: z.literal('client_hello'),
  session_id: z.string(),
  mime: z.string().default('audio/pcm'),
});

export const AudioChunk = z.object({
  type: z.literal('audio_chunk'),
  seq: z.number(),
  rate: z.number().default(16000),
  channels: z.number().default(1),
  bytes_b64: z.string(),
  speech_ms: z.number().default(0),
});

export const ClientControl = z.object({
  type: z.literal('client_control'),
  action: z.enum(['pause', 'resume', 'stop']),
});

export const VoiceSpeak = z.object({
  type: z.literal('voice_speak'),
  session_id: z.string(),
  text: z.string(),
  turn_seq: z.number(),
});

// Discriminated outbound frames from the browser.
export type VoiceClientMsg =
  | z.infer<typeof ClientHello>
  | z.infer<typeof AudioChunk>
  | z.infer<typeof ClientControl>;

// Inbound frames from the voice service.
export type VoiceServerFrame =
  | z.infer<typeof TranscriptPartial>
  | z.infer<typeof TranscriptFinal>
  | z.infer<typeof AssistantDelta>
  | z.infer<typeof AudioOut>
  | z.infer<typeof StatusEvent>
  | z.infer<typeof ErrorEvent>;

export function parseServerFrame(raw: unknown): VoiceServerFrame | null {
  if (!raw || typeof raw !== 'object') return null;
  for (const parser of [TranscriptPartial, TranscriptFinal, AssistantDelta, AudioOut, StatusEvent, ErrorEvent]) {
    const r = parser.safeParse(raw);
    if (r.success) return r.data;
  }
  return null;
}
