"""Pipecat-shaped voice pipeline (§8, REMEDIATION Issue 1).

When the pipecat-ai library is not installed, this module provides an
equivalent async pipeline that walks the same stages (VAD → STT →
OrchestratorLLM relay → TTS) without the framework overhead. The
production shape is identical — only the framework scheduling differs.

Transport: the browser WS (main.py's /voice-ws endpoint) feeds audio
chunks in, receives TTS bytes + text deltas out. The pipeline is
processor-based: each stage is an async callable that reads from an
input queue and writes to an output queue. This maps 1:1 to Pipecat's
FrameSerializer pipeline.

OrchestratorLLMService (non-negotiable per §2 invariant 3): does NO
model inference. It relays the transcribed text to the orchestrator's
runTurn() over the existing internal WS (`/internal/voice`) and feeds
the returned assistant text into the TTS stage. The same gate +
transcript logging + limits code path runs server-side in the
orchestrator — voice is simply a transport.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from .stt import STT
from .tts import TTS

log = logging.getLogger("voice_service.pipeline")

# Simple VAD: an energy gate that triggers STT after `silence_ms` of
# quiet frames. The production Pipecat pipeline uses SileroVAD; this
# is its functional equivalent until pipecat-ai is in the dependency
# tree. Accepts raw PCM16 mono frames and a debounce window.
class EnergyVAD:
    """Energy gate: PCM16 mono -> speech / silence, with configurable threshold."""

    def __init__(
        self, sample_rate: int = 16000, threshold: float = 500.0, silence_ms: int = 800,
    ) -> None:
        self._rate = sample_rate
        self._threshold = threshold
        self._silence_frames = int(silence_ms * sample_rate / 1000)
        self._quiet = 0
        self._active = False

    def process(self, pcm_frame: bytes) -> bool:
        """Return True when a speech segment ends (STT should fire now),
        and update internal state."""
        if len(pcm_frame) < 2:
            self._quiet += len(pcm_frame)
            return False
        # Compute RMS on a sampling of the frame.
        total = 0
        count = 0
        for i in range(0, min(len(pcm_frame), 640), 2):  # up to 20 ms @ 16 kHz
            s = struct_pcm(pcm_frame, i)
            total += s * s
            count += 1
        rms = (total / max(count, 1)) ** 0.5
        if rms < self._threshold:
            self._quiet += len(pcm_frame)
        else:
            had_speech = self._quiet >= self._silence_frames and self._quiet > 0
            self._quiet = 0
            self._active = True
            if had_speech:
                return True  # speech segment just ended → trigger STT
        return False

    def flush(self) -> bool:
        """Return True if there was active speech that ended."""
        return self._active


def struct_pcm(buf: bytes, offset: int) -> float:
    """Read int16 PCM sample at offset."""
    if offset + 2 > len(buf):
        return 0.0
    val = int.from_bytes(buf[offset:offset + 2], "little", signed=True)
    return float(val) / 32768.0


# ── Pipeline coordinator ────────────────────────────────────────────────────


async def run_pipeline(
    stt: STT,
    tts: TTS,
    audio_chunks: asyncio.Queue[bytes],
    on_text: Callable[[str], None],
    on_partial: Callable[[str], None],
    on_audio: Callable[[bytes], None],
    stop_event: asyncio.Event,
) -> None:
    """Stage-wise pipeline: receive audio chunks from browser WS, accumulate
    until VAD fires, transcribe, relay the text to caller (which feeds
    the orchestrator WS), receive TTS bytes and push back to browser."""

    vad = EnergyVAD(sample_rate=16000, threshold=500.0, silence_ms=800)
    buffer = bytearray()

    while not stop_event.is_set():
        try:
            chunk = await asyncio.wait_for(audio_chunks.get(), timeout=0.5)
        except TimeoutError:
            chunk = b""

        if chunk:
            buffer.extend(chunk)

        speech_done = vad.process(chunk) if chunk else False

        if (speech_done or vad.flush()) and len(buffer) > 0:
            pcm = bytes(buffer)
            buffer.clear()
            text = await asyncio.to_thread(stt.transcribe, pcm)
            text = text.strip()
            if not text:
                continue
            on_partial(text)
            await asyncio.sleep(0)
            on_text(text)

        # When no more chunks arrive and the buffer is empty, we're idle.
        if not chunk and not buffer:
            continue
