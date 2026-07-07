"""STT service selection + MockSTT (CI). Real providers are Pipecat services.

voice.mode=mock  → MockSTT
voice.mode=cloud → DeepgramSTTService (needs voice.stt_api_key)
voice.mode=local → WhisperSTTService (faster-whisper, keyless)
"""

from __future__ import annotations

import base64
import binascii
import os
from typing import Protocol

# ── Interface ────────────────────────────────────────────────────────────────


class STT(Protocol):
    """Speech-to-text: PCM16 mono-bytes @ 16 kHz → words."""

    @property
    def name(self) -> str: ...

    def transcribe(self, pcm16_mono_16k: bytes) -> str: ...


# ── Mock (CI) ────────────────────────────────────────────────────────────────


class MockSTT(STT):
    name = "mock"
    HEADER = b"vmsg\x01"

    @classmethod
    def _flatten(cls, pcm: bytes) -> bytes:
        return pcm[len(cls.HEADER):] if pcm.startswith(cls.HEADER) else pcm

    def transcribe(self, pcm16_mono_16k: bytes) -> str:
        flat = self._flatten(pcm16_mono_16k)
        if not flat:
            return ""
        b = flat.rstrip(b"\x00")
        if not b:
            return ""
        try:
            hint_idx = b.index(b"hint:")
            hint = b[hint_idx + 5:].decode("ascii", errors="ignore").strip()
        except ValueError:
            hint = ""
        return (hint or "[mock-stt]").upper()


# ── Build helpers (called from pipeline.py at pipeline construction) ─────────


def build_pipecat_stt(mode: str, api_key: str = "", model: str = "") -> STT:
    """Return the appropriate STT for voice.mode. Cloud returns a real Pipecat
    service; raises RuntimeError if the key is missing. Local returns the
    Pipecat WhisperSTTService (keyless). Mock returns MockSTT."""

    mode = mode.lower()
    if mode == "mock":
        return MockSTT()
    if mode == "cloud":
        provider = os.environ.get("VOICE_STT_PROVIDER", "deepgram").lower()
        if not api_key:
            api_key = os.environ.get("VOICE_STT_API_KEY", "")
        if provider == "deepgram":
            if not api_key:
                raise RuntimeError("Cloud STT selected but voice.stt_api_key is not set.")
            from pipecat.services.deepgram.stt import DeepgramSTTService
            svc = DeepgramSTTService(api_key=api_key, model=model or "nova-3")
            pass  # name is read-only property
            return svc
    if mode == "local":
        from pipecat.services.whisper.stt import Model as WhisperModel
        from pipecat.services.whisper.stt import WhisperSTTService
        m_str = model or os.environ.get("VOICE_WHISPER_MODEL", "base")
        try:
            m = WhisperModel(m_str)
        except ValueError:
            m = WhisperModel.BASE
        svc = WhisperSTTService(model=m)
        pass  # name is read-only property
        return svc
    raise RuntimeError(f"Unknown voice.mode: {mode}")


def decode_audio_b64(blob: str) -> bytes:
    if not blob:
        return b""
    try:
        return base64.b64decode(blob, validate=False)
    except (binascii.Error, ValueError):
        return b""
