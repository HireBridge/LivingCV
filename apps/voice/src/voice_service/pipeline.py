"""Pipecat voice pipeline (§8, VOICE.md). Single brain per PLAN §2 invariant 3.

Pipeline stages: transport → SileroVADAnalyzer → STT → OrchestratorProcessor → TTS → transport.

OrchestratorProcessor does NO model inference — it relays the transcribed user
text to the orchestrator's runTurn() over the existing internal WebSocket
(via `OrchestratorClient`) and feeds the streamed `assistant_delta` text
into the TTS stage. All LLM reasoning, tool calls, the email gate, and
limits happen server-side in the orchestrator — the voice service does
audio⇄text ONLY.

Provider selection: voice.mode=mock|cloud|local mapped at pipeline build time.
"""

from __future__ import annotations

import asyncio
import logging

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import (
    EndFrame,
    ErrorFrame,
    Frame,
    StartFrame,
    TextFrame,
    TranscriptionFrame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.transports.base_transport import BaseTransport

from .orchestrator_client import OrchestratorClient
from .stt import MockSTT, build_pipecat_stt
from .tts import MockTTS, build_pipecat_tts

log = logging.getLogger("voice_service.pipeline")


# ── OrchestratorProcessor ────────────────────────────────────────────────────


class OrchestratorProcessor(FrameProcessor):
    """Pipecat processor that relays user speech to the *real* orchestrator brain.

    On every FINAL TranscriptionFrame, it calls `OrchestratorClient.speak()`
    (the existing internal WS protocol — apps/voice/src/voice_service/
    orchestrator_client.py) and converts the streamed `assistant_delta` text
    back into Pipecat `TextFrame` objects for the downstream TTS stage. No
    model inference, no tool calling, no LLM — this is a pure proxy. Per
    PLAN §2 invariant 3, every recruiter-facing guard (email gate, tool-tier
    enforcement) runs in the orchestrator's `runTurn()`, NOT here.
    """

    def __init__(
        self,
        session_id: str,
        orchestrator_session: OrchestratorSession,
        *,
        name: str = "OrchestratorProcessor",
        **kwargs,
    ) -> None:
        super().__init__(name=name, **kwargs)
        self._session_id = session_id
        self._session = orchestrator_session
        self._turn_seq = 0
        self._client: OrchestratorClient | None = None
        self._connected = asyncio.Event()

    async def _connect(self) -> None:
        url = _internal_ws_url(self._session.orchestrator_url, self._session_id)
        self._client = OrchestratorClient(url)
        await self._client.connect(self._on_orchestrator_event)
        self._connected.set()

    async def _on_orchestrator_event(self, payload: dict) -> None:
        t = payload.get("type", "")
        if t == "assistant_delta":
            text = payload.get("text", "")
            if text:
                await self.push_frame(TextFrame(text))
        elif t == "done" or t == "voice_close":
            await self.push_frame(TTSStoppedFrame())

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)

        if isinstance(frame, StartFrame):
            await self._connect()
            await self.push_frame(frame, direction)

        elif isinstance(frame, TranscriptionFrame):
            text = frame.text.strip()
            if not text or int(frame.timestamp or "0") == 0:
                # Intermediate / empty transcription — skip.
                await self.push_frame(frame, direction)
                return

            # Final transcription — send to orchestrator.
            if not self._connected.is_set():
                await self._connect()
            self._turn_seq += 1
            await self.push_frame(TTSStartedFrame())

            assert self._client is not None
            await self._client.speak(
                session_id=self._session_id,
                text=text,
                turn_seq=self._turn_seq,
            )
            # The streaming `assistant_delta` events from the orchestrator will
            # be pushed as TextFrame via `_on_orchestrator_event` above.
            await self.push_frame(frame, direction)

        elif isinstance(frame, (TTSStartedFrame, TTSStoppedFrame, TextFrame)):
            await self.push_frame(frame, direction)

        elif isinstance(frame, (EndFrame, ErrorFrame)):
            if self._client is not None:
                await self._client.close()
            await self.push_frame(frame, direction)

        else:
            await self.push_frame(frame, direction)


# ── Pipeline builder ─────────────────────────────────────────────────────────


class OrchestratorSession:
    """Thin holder for the orchestrator URL. Wired once at pipeline build."""

    def __init__(self, orchestrator_url: str) -> None:
        self.orchestrator_url = orchestrator_url


def build_pipeline(
    session_id: str,
    orchestrator_url: str,
    transport: BaseTransport,
    *,
    voice_mode: str = "mock",
    stt_api_key: str = "",
    stt_model: str = "",
    tts_api_key: str = "",
    tts_voice_id: str = "",
) -> Pipeline:
    """Construct the full Pipecat pipeline for a single browser session.

    Returns a Pipeline whose stages are:
        transport → SileroVADAnalyzer → STT → OrchestratorProcessor → TTS → transport

    The Silero VAD is always used (no EnergyVAD). Provider selection is
    driven by voice_mode:

        mock  → MockSTT + MockTTS (CI, keyless)
        cloud → DeepgramSTT + Cartesia/ElevenLabsTTS (needs API keys)
        local → WhisperSTT + PiperTTS (keyless, needs model files)
    """

    sess = OrchestratorSession(orchestrator_url)
    stt = _choose_stt(voice_mode, stt_api_key, stt_model)
    tts = _choose_tts(voice_mode, tts_api_key, tts_voice_id)

    pipeline = Pipeline([
        transport.input(),
        SileroVADAnalyzer(),
        stt,
        OrchestratorProcessor(session_id, sess),
        tts,
        transport.output(),
    ])

    return pipeline


def _choose_stt(mode: str, api_key: str = "", model: str = "") -> FrameProcessor:
    """Return a Pipecat STT frame processor for the given mode."""
    svc = build_pipecat_stt(mode, api_key, model)
    if isinstance(svc, MockSTT):
        # Wrap the sync MockSTT in a Pipecat frame processor.
        return _SyncSTTWrapper(svc)
    return svc


def _choose_tts(mode: str, api_key: str = "", voice_id: str = "") -> FrameProcessor:
    """Return a Pipecat TTS frame processor for the given mode."""
    svc = build_pipecat_tts(mode, api_key, voice_id)
    if isinstance(svc, MockTTS):
        return _SyncTTSWrapper(svc)
    return svc


class _SyncSTTWrapper(FrameProcessor):
    """Wrap our legacy MockSTT into the Pipecat `STTService` shape."""

    def __init__(self, mock: MockSTT, name: str = "mock-stt", **kwargs) -> None:
        super().__init__(name=name, **kwargs)
        self._mock = mock

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame):
            text = self._mock.transcribe(frame.text.encode() if isinstance(frame.text, str) else b"")
            out = TranscriptionFrame(text=text, user_id="voice", timestamp="1")
            await self.push_frame(out)
        else:
            await self.push_frame(frame, direction)


class _SyncTTSWrapper(FrameProcessor):
    """Wrap our legacy MockTTS into the Pipecat `TTSService` shape."""

    def __init__(self, mock: MockTTS, name: str = "mock-tts", **kwargs) -> None:
        super().__init__(name=name, **kwargs)
        self._mock = mock

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if isinstance(frame, TextFrame):
            pcm = self._mock.synthesize(frame.text)
            out = TTSAudioRawFrame(audio=pcm, sample_rate=self._mock.sample_rate, num_channels=1)
            await self.push_frame(out)
        else:
            await self.push_frame(frame, direction)


def _internal_ws_url(base: str, session_id: str) -> str:
    sep = "&" if "?" in base else "?"
    return f"{base.rstrip('/')}{sep}/internal/voice?session_id={session_id}"
