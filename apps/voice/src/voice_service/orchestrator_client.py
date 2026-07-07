"""Thin WS client to the orchestrator's `/internal/voice` endpoint.

The voice service holds a single persistent connection per browser session
(multiplexed on session_id). Messages the orchestrator sends are surfaced
to the browser via the voice service's WS. Real-time bidirectional stream
of token-by-token LLM output plus final transcript events.

Wire protocol is defined in `protocol.py`; this client is the only place
that knows about the orchestrator's transport.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable

import websockets
from websockets.asyncio.client import ClientConnection

from .protocol import (
    AssistantDelta,
    ErrorEvent,
    TranscriptFinal,
    VoiceSpeak,
)

log = logging.getLogger("voice_service.orchestrator_client")


class OrchestratorNotConfigured(RuntimeError):
    """Raised when the voice service is launched without an ORCHESTRATOR_URL."""


class OrchestratorClient:
    """A single WS session to the orchestrator's /internal/voice."""

    def __init__(self, url: str) -> None:
        self._url = url
        self._ws: ClientConnection | None = None
        self._reader_task: asyncio.Task | None = None
        self._on_event: Callable[[dict], Awaitable[None]] | None = None
        self._closed = asyncio.Event()

    async def connect(
        self,
        on_event: Callable[[dict], Awaitable[None]],
    ) -> None:
        if not self._url:
            raise OrchestratorNotConfigured(
                "voice service cannot reach the orchestrator: set ORCHESTRATOR_URL."
            )
        self._on_event = on_event
        log.info("connecting to orchestrator ws: %s", self._url)
        self._ws = await websockets.connect(self._url)
        log.info("orchestrator ws open")
        self._reader_task = asyncio.create_task(self._reader_loop())

    async def _reader_loop(self) -> None:
        assert self._ws is not None
        try:
            async for raw in self._ws:
                try:
                    payload = json.loads(raw)
                except json.JSONDecodeError:
                    log.warning("orchestrator sent non-json: %r", raw[:80])
                    continue
                if self._on_event is not None:
                    await self._on_event(payload)
        except websockets.ConnectionClosed:
            log.warning("orchestrator ws closed")
        except Exception as e:  # pragma: no cover — defensive
            log.exception("orchestrator ws reader crashed: %s", e)
        finally:
            self._closed.set()

    async def speak(self, session_id: str, text: str, turn_seq: int) -> None:
        """Forward a transcribed user turn to the orchestrator.

        The orchestrator will stream back AssistantDelta + a Transcript-
        equivalent close, then close the turn. The browser side receives
        those via `on_event`."""
        if self._ws is None:
            raise OrchestratorNotConfigured("client not connected")
        v = VoiceSpeak(type="voice_speak", session_id=session_id, text=text, turn_seq=turn_seq)
        await self._ws.send(v.model_dump_json())

    async def close(self) -> None:
        if self._ws is not None:
            await self._ws.close()
        if self._reader_task is not None:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except (asyncio.CancelledError, Exception):
                pass
        await self._closed.wait()


def parse_assistant_delta(d: dict) -> AssistantDelta | None:
    """Parse and validate a single orchestrator event. Returns None on
    non-delta events; callers filter the stream themselves."""
    if d.get("type") == "assistant_delta":
        return AssistantDelta.model_validate(d)
    if d.get("type") == "transcript_final":
        return TranscriptFinal.model_validate(d)
    if d.get("type") == "error":
        return ErrorEvent.model_validate(d)
    return None
