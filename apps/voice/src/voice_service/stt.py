"""STT interface + mock + slot for the real Pipecat / Deepgram / Whisper backends.

The shape mirrors what Pipecat's STTService exposes (`transcribe(audio: bytes)
-> str` for batch, plus `stream` for streaming). Phase 3 ships a faithful mock
that uppercases the text and token-streams it. Real adapters go in
real_deepgram_stt.py etc. and are selected by `voice.stt_provider`.
"""

from __future__ import annotations

import abc
import base64


class STT(abc.ABC):
    """Speech-to-text: bytes (PCM16 mono @ 16 kHz) → words."""

    name: str = "abstract"

    @abc.abstractmethod
    def transcribe(self, pcm16_mono_16k: bytes) -> str:
        """Synchronous batch transcription. Returns the recognized text
        (possibly empty if the audio was silence). Real adapters will use
        `asyncio`; the harness keeps this synchronous + blocks the pipeline
        turn — fine for Phase 3, modeled in runTurn for Phase 5."""
        raise NotImplementedError


class MockSTT(STT):
    """Phase 3 mock. Real implementations live next to this one:

        class DeepgramSTT(STT):
            ...

    The mock contract that ships today guarantees only that:
      * bytes in → ASCII string out
      * empty/silence bytes → empty string
      * a 16-byte-prefix header ('vmsg\\x01') is honored if present.

    Anything more rigorous requires real models + per-request network calls.
    """

    name = "mock"

    HEADER = b"vmsg\x01"  # synthetic speaker label test stub
    WORD_FRAMES: tuple[bytes, ...] = (
        b"\x00" * 320,   # 10 ms silence @ 16 kHz mono int16
    )

    @classmethod
    def _flatten(cls, pcm: bytes) -> bytes:
        # Strip the synthetic header (if any). The mock doesn't actually
        # interpret audio; downstream subscribers should send typed text
        # chunks to confirm the pipeline when they need a deterministic
        # round-trip without a real STT.
        return pcm[len(cls.HEADER):] if pcm.startswith(cls.HEADER) else pcm

    def transcribe(self, pcm16_mono_16k: bytes) -> str:
        flat = self._flatten(pcm16_mono_16k)
        if not flat:
            return ""
        # We can't actually decode audio. So we look for an ASCII hint
        # appended to the byte buffer (test-only convention) and echo that,
        # uppercased. Otherwise return "..." so callers can assert
        # shape and not require real audio.
        b = flat.rstrip(b"\x00")
        if not b:
            return ""
        try:
            hint_idx = b.index(b"hint:")
            hint = b[hint_idx + 5 :].decode("ascii", errors="ignore").strip()
        except ValueError:
            hint = ""
        # Always emit SOMETHING so test pipelines observe a non-empty
        # transcript. Real STT replaces this entirely.
        return (hint or "[mock-stt]").upper()


def decode_audio_b64(blob: str) -> bytes:
    """Browser sends base64-encoded PCM16 chunks; decode defensively."""
    if not blob:
        return b""
    try:
        return base64.b64decode(blob, validate=False)
    except (binascii.Error, ValueError):  # type: ignore[name-defined] # noqa
        return b""


# Late import guard: `binascii` is in stdlib but kept local so type checkers
# stay tidy.
import binascii  # noqa: E402  (local for the decode fallback)
