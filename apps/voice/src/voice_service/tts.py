"""TTS interface + MockTTS + CartesiaTTS + ElevenLabsTTS (cloud) + PiperTTS (local).

Shape mirrors Pipecat's TTSService. Phase 3 shipped MockTTS. Phase 5 ships the
real cloud adapters (CartesiaTTS, ElevenLabsTTS) and the local adapter
(PiperTTS, bundled in the Docker image). A missing key raises RuntimeError.
"""

from __future__ import annotations

import abc
import os
import struct

SAMPLE_RATE_DEFAULT = 16000


class TTS(abc.ABC):
    """Text-to-speech: string → PCM16 mono bytes @ 16 kHz."""

    name: str = "abstract"

    @abc.abstractmethod
    def synthesize(self, text: str) -> bytes:
        raise NotImplementedError

    @property
    def sample_rate(self) -> int:
        return SAMPLE_RATE_DEFAULT


# ── Mock (Phase 3, CI) ───────────────────────────────────────────────────────


class MockTTS(TTS):
    name = "mock"
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


# ── Cartesia (cloud) ─────────────────────────────────────────────────────────


class CartesiaTTS(TTS):
    """Real TTS via Cartesia. voice.tts_voice_id from app_settings."""

    name = "cartesia"

    def __init__(self, api_key: str | None = None, voice_id: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("CARTESIA_API_KEY", "")
        self._voice_id = voice_id or os.environ.get("VOICE_TTS_VOICE_ID", "79a125e8-cowie")
        if not self._api_key:
            raise RuntimeError(
                "Cartesia TTS selected but voice.tts_api_key is not set."
            )

    def synthesize(self, text: str) -> bytes:
        import json
        import urllib.request
        body = json.dumps({
            "model_id": "sonic-2",
            "transcript": text,
            "voice": {"mode": "id", "id": self._voice_id},
            "output_format": {"container": "raw", "encoding": "pcm_s16le", "sample_rate": SAMPLE_RATE_DEFAULT},
        }).encode()
        req = urllib.request.Request(
            "https://api.cartesia.ai/tts/bytes",
            data=body,
            headers={"Content-Type": "application/json", "X-API-Key": self._api_key, "Cartesia-Version": "2024-06-30"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read()


# ── ElevenLabs (cloud) ───────────────────────────────────────────────────────


class ElevenLabsTTS(TTS):
    """Real TTS via ElevenLabs. voice.tts_voice_id from app_settings."""

    name = "elevenlabs"

    def __init__(self, api_key: str | None = None, voice_id: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("ELEVENLABS_API_KEY", "")
        self._voice_id = voice_id or os.environ.get("VOICE_TTS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
        if not self._api_key:
            raise RuntimeError(
                "ElevenLabs TTS selected but voice.tts_api_key is not set."
            )

    def synthesize(self, text: str) -> bytes:
        import json
        import urllib.request
        body = json.dumps({
            "text": text, "model_id": "eleven_turbo_v2_5",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }).encode()
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{self._voice_id}/stream?output_format=pcm_16000"
        req = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json", "xi-api-key": self._api_key},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read()


# ── Piper (local) — Phase 5 Docker model bundling ────────────────────────────


class PiperTTS(TTS):
    name = "piper"

    def synthesize(self, text: str) -> bytes:
        raise NotImplementedError(
            "Piper TTS requires piper-tts + a bundled model file."
        )
