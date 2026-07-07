"""TTS interface + mock + slot for the real Pipecat / Cartesia / Piper backends.

Shape mirrors what Pipecat's TTSService exposes (`synthesize(text) -> PCM16
bytes`). Phase 3 ships `MockTTS` (text → reversed-bytes PCM16 frames). Real
adapters go in `real_cartesia_tts.py` etc. and are selected by
`voice.tts_provider`.
"""

from __future__ import annotations

import abc
import struct

SAMPLE_RATE_DEFAULT = 16000  # Hz — match STT for round-trip


class TTS(abc.ABC):
    """Text-to-speech: string → PCM16 mono bytes @ 16 kHz."""

    name: str = "abstract"

    @abc.abstractmethod
    def synthesize(self, text: str) -> bytes:
        """Synchronous batch synthesis. Real adapters will use streaming.

        Returns PCM16 mono bytes at `sample_rate`. The mock returns an empty
        buffer for empty input and a deterministic "encoded reverse" of the
        text otherwise — a stable, easily-differentiable, test-handleable
        payload."""
        raise NotImplementedError

    @property
    def sample_rate(self) -> int:
        return SAMPLE_RATE_DEFAULT


class MockTTS(TTS):
    """Phase 3 mock. Real adapters (Cartesia, Piper) live next to this one.

    The output is deterministic per text so integration tests can assert a
    known payload without a real model. Each byte is the inverted ASCII (when
    representable) of the input; otherwise 0. This is NOT a useful waveform —
    it's a placeholder that proves the wire without needing a model.
    """

    name = "mock"

    FRAME_MS = 20  # speech frames: 20 ms
    SAMPLES_PER_FRAME = SAMPLE_RATE_DEFAULT * FRAME_MS // 1000

    def synthesize(self, text: str) -> bytes:
        if not text:
            return b""
        out = bytearray()
        for ch in text.encode("ascii", errors="replace"):
            inv = (~ch) & 0xFF
            sample = struct.pack("<h", inv - 128)  # int16 little-endian
            out.extend(sample * self.SAMPLES_PER_FRAME)
        return bytes(out)
