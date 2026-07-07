"""TTS service selection + MockTTS (CI). Real providers are Pipecat services.

voice.mode=mock  → MockTTS
voice.mode=cloud → CartesiaTTSService or ElevenLabsTTSService (needs key)
voice.mode=local → PiperTTSService (keyless)
"""

from __future__ import annotations

import os
import struct
from typing import Protocol

SAMPLE_RATE_DEFAULT = 16000


# ── Interface ────────────────────────────────────────────────────────────────


class TTS(Protocol):
    """Text-to-speech: string → PCM16 mono bytes @ 16 kHz."""

    @property
    def name(self) -> str: ...

    @property
    def sample_rate(self) -> int: ...

    def synthesize(self, text: str) -> bytes: ...


# ── Mock (CI) ────────────────────────────────────────────────────────────────


class MockTTS(TTS):
    name = "mock"
    sample_rate = SAMPLE_RATE_DEFAULT

    FRAME_MS = 20
    SAMPLES_PER_FRAME = SAMPLE_RATE_DEFAULT * FRAME_MS // 1000

    def synthesize(self, text: str) -> bytes:
        if not text:
            return b""
        out = bytearray()
        for ch in text.encode("ascii", errors="replace"):
            inv = (~ch) & 0xFF
            sample = struct.pack("<h", inv - 128)
            out.extend(sample * self.SAMPLES_PER_FRAME)
        return bytes(out)


# ── Build helpers ────────────────────────────────────────────────────────────


def build_pipecat_tts(mode: str, api_key: str = "", voice_id: str = "") -> TTS:
    """Return the appropriate TTS for voice.mode."""

    mode = mode.lower()
    if mode == "mock":
        return MockTTS()
    if mode == "cloud":
        provider = os.environ.get("VOICE_TTS_PROVIDER", "cartesia").lower()
        if not api_key:
            api_key = os.environ.get("VOICE_TTS_API_KEY", "")
        if not voice_id:
            voice_id = os.environ.get("VOICE_TTS_VOICE_ID", "")
        if not api_key:
            raise RuntimeError("Cloud TTS selected but voice.tts_api_key is not set.")
        if provider == "elevenlabs":
            from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
            svc = ElevenLabsTTSService(api_key=api_key, voice_id=voice_id or "21m00Tcm4TlvDq8ikWAM")
            pass  # name is read-only property
            return svc
        from pipecat.services.cartesia.tts import CartesiaTTSService
        svc = CartesiaTTSService(api_key=api_key, voice_id=voice_id or "79a125e8-cowie")
        pass  # name is read-only property
        return svc
    if mode == "local":
        from pipecat.services.piper.tts import PiperTTSService
        model = os.environ.get("VOICE_PIPER_MODEL", "")
        svc = PiperTTSService(model_path=model or None)
        pass  # name is read-only property
        return svc
    raise RuntimeError(f"Unknown voice.mode: {mode}")
