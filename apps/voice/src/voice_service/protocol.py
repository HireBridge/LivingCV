"""Voice service WS message protocol (§8).

Same shapes on both legs (browser ↔ voice, voice ↔ orchestrator). Only the
transport differs. Keeping the wire shape narrow and JSON-only makes the
contract testable from any language and trivially mockable.
"""

from __future__ import annotations

from typing import Literal, Union

from pydantic import BaseModel, Field

# ── Browser → voice ──────────────────────────────────────────────────────────

class ClientHello(BaseModel):
    type: Literal["client_hello"]
    session_id: str = Field(..., description="Orchestrator sessionId minted by /api/chat/session.")
    mime: str = Field(default="audio/pcm", description="Browser MIME (webm/opus/PCM).")


class AudioChunk(BaseModel):
    """Single inbound audio chunk from the browser's MediaRecorder/WS API."""
    type: Literal["audio_chunk"]
    seq: int
    rate: int = Field(default=16000, description="Sample rate (Hz).")
    channels: int = Field(default=1)
    bytes_b64: str = Field(..., description="Raw PCM16 bytes (base64).")
    speech_ms: int = Field(
        default=0,
        description="Speech-region milliseconds (filled by VAD in browser or in voice).",
    )


class ClientControl(BaseModel):
    type: Literal["client_control"]
    action: Literal["pause", "resume", "stop"]


# ── Voice → browser ──────────────────────────────────────────────────────────

class TranscriptPartial(BaseModel):
    """Streaming STT partial."""
    type: Literal["transcript_partial"]
    text: str
    is_final: bool = False


class TranscriptFinal(BaseModel):
    type: Literal["transcript_final"]
    text: str


class AssistantDelta(BaseModel):
    """LLM token stream mirrored from the orchestrator's SseEvent 'token'."""
    type: Literal["assistant_delta"]
    text: str


class AudioOut(BaseModel):
    """TTS chunk (raw PCM16). The browser concatenates + plays."""
    type: Literal["audio_out"]
    rate: int
    bytes_b64: str


class StatusEvent(BaseModel):
    type: Literal["status"]
    state: Literal["idle", "listening", "thinking", "speaking", "closed"]
    message: str | None = None


class ErrorEvent(BaseModel):
    type: Literal["error"]
    message: str


# ── Voice ↔ orchestrator (internal) ────────────────────────────────────────

class VoiceSpeak(BaseModel):
    """voice → orchestrator: 'speak' carries the transcribed user turn."""
    type: Literal["voice_speak"]
    session_id: str
    text: str
    turn_seq: int


# Discriminated union helpers — keep parsing in one place.
AllClient = Union[ClientHello, AudioChunk, ClientControl]
AllServer = Union[
    TranscriptPartial,
    TranscriptFinal,
    AssistantDelta,
    AudioOut,
    StatusEvent,
    ErrorEvent,
    VoiceSpeak,
]

ALL_TYPES = {
    m.model_fields["type"].default
    for m in (
        ClientHello, AudioChunk, ClientControl,
        TranscriptPartial, TranscriptFinal, AssistantDelta,
        AudioOut, StatusEvent, ErrorEvent, VoiceSpeak,
    )
}
