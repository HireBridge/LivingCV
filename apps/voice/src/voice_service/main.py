"""Voice service entrypoint (FastAPI + websockets).

Browser WS: `${VOICE_WS_PATH:-/voice-ws}` (single connection per session;
voice <-> orchestrator is multiplexed on session_id). Mounted at `/voice-ws`
so Caddy can reverse-proxy the same path publicly with `path_strip
/voice-ws` to the voice container (the orchestrator sits on `internal/voice`
which is never exposed).

Internal HTTP for testing:
    GET  /healthz          liveness
    GET  /info             declared providers + active STT/TTS names

POST /admin/test/stt  body: base64 pcm -> JSON {text}
POST /admin/test/tts  body: text -> raw PCM16 bytes (X-Provider, X-Sample-Rate)

Both `/admin/test/*` endpoints mirror the admin's voice-test buttons.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response

from .orchestrator_client import OrchestratorClient
from .protocol import (
    AssistantDelta,
    AudioChunk,
    ClientControl,
    ClientHello,
    ErrorEvent,
    StatusEvent,
    TranscriptFinal,
    TranscriptPartial,
)
from .stt import STT, MockSTT, decode_audio_b64
from .tts import TTS, MockTTS

log = logging.getLogger("voice_service")
logging.basicConfig(level=os.environ.get("VOICE_LOG_LEVEL", "INFO"))


# ── Provider selection ────────────────────────────────────────────────────────


def build_stt() -> STT:
    """Phase 3 ships only MockSTT. The real Deepgram / Whisper adapters wire
    in here when their API keys are added to app_settings.voice.* in the admin
    console and pulled via the orchestrator's voice settings endpoints
    (Phase 5 polish)."""
    return MockSTT()


def build_tts() -> TTS:
    return MockTTS()


# ── FastAPI ───────────────────────────────────────────────────────────────────

app = FastAPI(title="portfolio-voice-service")
_stt: STT = build_stt()
_tts: TTS = build_tts()


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"ok": "true", "stt": _stt.name, "tts": _tts.name}


@app.get("/info")
async def info() -> dict[str, Any]:
    return {
        "stt": {"active": _stt.name, "options": ["mock", "deepgram", "whisper"]},
        "tts": {"active": _tts.name, "options": ["mock", "cartesia", "elevenlabs", "piper"]},
        "voice_ws_path": VOICE_WS_PATH,
        "orchestrator_url": os.environ.get("ORCHESTRATOR_URL", ""),
    }


@app.post("/admin/test/stt")
async def test_stt(body: dict[str, Any]) -> JSONResponse:
    """Admin voice test button -> STT path. Body: {audio_b64, mime?}."""
    audio = decode_audio_b64(str(body.get("audio_b64") or ""))
    if not audio:
        return JSONResponse(
            {"text": "", "ok": False, "error": "empty audio"}, status_code=400
        )
    text = _stt.transcribe(audio)
    return JSONResponse({"text": text, "ok": True, "provider": _stt.name})


@app.post("/admin/test/tts")
async def test_tts(body: dict[str, Any]) -> Response:
    """Admin voice test button -> TTS path. Body: {text}."""
    text = str(body.get("text") or "")
    pcm = _tts.synthesize(text)
    return Response(
        content=pcm,
        media_type="application/octet-stream",
        headers={"X-Provider": _tts.name, "X-Sample-Rate": str(_tts.sample_rate)},
    )


# ── Browser WebSocket ─────────────────────────────────────────────────────────


async def _after(seconds: float, fn) -> Any:
    """Sleep then call fn, swallowing the cancel cleanly."""
    try:
        await asyncio.sleep(seconds)
        return await fn()
    except asyncio.CancelledError:
        return None


def _internal_ws_url(orchestrator_base: str, session_id: str) -> str:
    """The orchestrator exposes `/internal/voice?session_id=...`. Build the full URL."""
    sep = "&" if "?" in orchestrator_base else "?"
    return (
        f"{orchestrator_base.rstrip('/')}{sep}/internal/voice?session_id={session_id}"
    )


VOICE_WS_PATH = os.environ.get("VOICE_WS_PATH", "/voice-ws")


@app.websocket(VOICE_WS_PATH)
async def browser_ws(ws: WebSocket) -> None:
    """One browser WS per session. Audio in, transcripts + tokens + audio out."""
    await ws.accept()
    orch_url = os.environ.get("ORCHESTRATOR_URL", "")
    if not orch_url:
        err = ErrorEvent(message="voice not configured: ORCHESTRATOR_URL unset")
        await ws.send_json(err.model_dump())
        await ws.close()
        return

    session_id: str = ""
    turn_seq = 0
    audio_buf = bytearray()
    orchestrator: OrchestratorClient | None = None
    pending_flush: asyncio.Task | None = None

    debounce_ms = int(os.environ.get("VOICE_STT_DEBOUNCE_MS", "1000"))

    async def forwarder(payload: dict) -> None:
        try:
            t = payload.get("type")
            if t == "assistant_delta":
                await ws.send_json(AssistantDelta.model_validate(payload).model_dump())
            elif t == "transcript_final":
                await ws.send_json(TranscriptFinal.model_validate(payload).model_dump())
            elif t == "error":
                await ws.send_json(ErrorEvent.model_validate(payload).model_dump())
        except Exception as e:  # pragma: no cover — defensive
            log.exception("forwarder error: %s", e)

    async def flush() -> None:
        nonlocal audio_buf
        if not audio_buf:
            return
        text = _stt.transcribe(bytes(audio_buf)).strip()
        audio_buf.clear()
        if not text or orchestrator is None:
            return
        await ws.send_json(TranscriptPartial(text=text, is_final=False).model_dump())
        await ws.send_json(TranscriptFinal(text=text).model_dump())
        await ws.send_json(StatusEvent(state="thinking").model_dump())
        nonlocal turn_seq
        turn_seq += 1
        await orchestrator.speak(session_id=session_id, text=text, turn_seq=turn_seq)

    try:
        while True:
            msg = await ws.receive_text()
            try:
                payload = json.loads(msg)
            except json.JSONDecodeError:
                await ws.send_json(ErrorEvent(message="bad json").model_dump())
                continue

            t = payload.get("type")
            if t == "client_hello":
                try:
                    hello = ClientHello.model_validate(payload)
                except Exception as e:
                    await ws.send_json(ErrorEvent(message=f"bad hello: {e}").model_dump())
                    await ws.close()
                    return
                session_id = hello.session_id
                orchestrator = OrchestratorClient(_internal_ws_url(orch_url, session_id))
                await orchestrator.connect(forwarder)
                await ws.send_json(StatusEvent(state="listening").model_dump())

            elif t == "audio_chunk":
                if orchestrator is None:
                    continue
                ch = AudioChunk.model_validate(payload)
                pcm = decode_audio_b64(ch.bytes_b64)
                if pcm:
                    audio_buf.extend(pcm)
                if pending_flush is not None and not pending_flush.done():
                    pending_flush.cancel()
                pending_flush = asyncio.create_task(
                    _after(debounce_ms / 1000, flush)
                )

            elif t == "client_control":
                ctrl = ClientControl.model_validate(payload)
                if ctrl.action == "stop":
                    if pending_flush is not None and not pending_flush.done():
                        pending_flush.cancel()
                    await flush()
                    if orchestrator is not None:
                        await orchestrator.close()
                    await ws.send_json(StatusEvent(state="closed").model_dump())
                    await ws.close()
                    return

            else:
                await ws.send_json(ErrorEvent(message=f"unknown type: {t}").model_dump())

    except WebSocketDisconnect:
        log.info("browser disconnected")
    finally:
        if pending_flush is not None and not pending_flush.done():
            pending_flush.cancel()
        if orchestrator is not None:
            await orchestrator.close()


if __name__ == "__main__":
    uvicorn.run(
        "voice_service.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("VOICE_PORT", "8200")),
        log_level=os.environ.get("VOICE_LOG_LEVEL", "info").lower(),
    )
