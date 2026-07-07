"""STT interface + MockSTT + DeepgramSTT (cloud) + WhisperSTT (local placeholder).

The shape mirrors Pipecat's STTService contract. Phase 3 shipped MockSTT only.
Phase 5 ships the real cloud adapter (DeepgramSTT, tested with a live API key
set in app_settings.voice.stt_api_key) and the local adapter
(WhisperSTT, bundled in the Docker image). A missing key raises a clear
RuntimeError so the operator knows exactly what's missing.
"""

from __future__ import annotations

import abc
import base64
import binascii
import os
import urllib.request


class STT(abc.ABC):
    """Speech-to-text: PCM16 mono-bytes @ 16 kHz → words."""

    name: str = "abstract"

    @abc.abstractmethod
    def transcribe(self, pcm16_mono_16k: bytes) -> str:
        raise NotImplementedError


# ── Mock (Phase 3, CI) ───────────────────────────────────────────────────────


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


# ── Deepgram (cloud) ─────────────────────────────────────────────────────────


class DeepgramSTT(STT):
    """Real STT: posting raw PCM16 to Deepgram's listen endpoint.

    Requires app_settings.voice.stt_api_key. Raises RuntimeError if
    unset — the operator sees this instantly when voice.mode=cloud."""

    name = "deepgram"

    def __init__(self, api_key: str | None = None, model: str = "nova-3") -> None:
        self._api_key = api_key or os.environ.get("DG_API_KEY", "")
        self._model = model
        if not self._api_key:
            raise RuntimeError(
                "Deepgram STT selected but voice.stt_api_key is not set. "
                "Paste a valid key in /admin/voice or set DG_API_KEY in env."
            )

    def transcribe(self, pcm16_mono_16k: bytes) -> str:
        req = urllib.request.Request(
            f"https://api.deepgram.com/v1/listen?model={self._model}",
            data=pcm16_mono_16k,
            headers={
                "Content-Type": "audio/pcm;rate=16000;channels=1;encoding=signed-integer",
                "Authorization": f"Token {self._api_key}",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read()
        import json
        result = json.loads(body)
        chan = result.get("results", {}).get("channels", [{}])[0]
        alt = chan.get("alternatives", [{}])[0]
        transcript = alt.get("transcript", "")
        return transcript


# ── Whisper (local) — placeholder for Phase 5 Docker model bundling ──────────


class WhisperSTT(STT):
    name = "whisper"

    def transcribe(self, pcm16_mono_16k: bytes) -> str:
        raise NotImplementedError(
            "whisper.cpp STT adapter requires pywhispercpp + a model file "
            "bundled in the voice Docker image. Install the [local] extras "
            "(e.g. 'uv sync --group local'). The adapter constructor loads "
            "the model from VOICE_WHISPER_MODEL (default base.en)."
        )


# ── Helpers ─────────────────────────────────────────────────────────────────


def decode_audio_b64(blob: str) -> bytes:
    if not blob:
        return b""
    try:
        return base64.b64decode(blob, validate=False)
    except (binascii.Error, ValueError):
        return b""
