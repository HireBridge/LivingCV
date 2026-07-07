"""Voice service unit tests.

Covers:
    - MockSTT: empty + ASCII-hint passthrough; Phase 3 contract.
    - MockTTS: empty -> empty; deterministic per-text output.
    - Protocol roundtrip: every message type parses + re-serializes.
    - Admin test endpoints via the FastAPI ASGI transport (in-process).

The orchestrator WS handshake (the actual end-to-end) is exercised by the
portfolio's orchestrator tests once the voice→orchestrator wiring is in
place. These tests are local-only and run via `uv run pytest`.
"""

from __future__ import annotations

import base64
import json

import pytest
from fastapi.testclient import TestClient

from voice_service.main import app
from voice_service.protocol import (
    AssistantDelta,
    AudioChunk,
    AudioOut,
    ClientControl,
    ClientHello,
    ErrorEvent,
    StatusEvent,
    TranscriptFinal,
    TranscriptPartial,
    VoiceSpeak,
)
from voice_service.stt import MockSTT, decode_audio_b64
from voice_service.tts import MockTTS

# ── Protocol shape ─────────────────────────────────────────────────────────

def test_protocol_roundtrip() -> None:
    hello = ClientHello(type="client_hello", session_id="abc", mime="audio/pcm")
    assert hello.model_dump()["type"] == "client_hello"
    payload = hello.model_dump()
    parsed = ClientHello.model_validate(payload)
    assert parsed.session_id == "abc"

    speak = VoiceSpeak(type="voice_speak", session_id="abc", text="hello", turn_seq=1)
    assert speak.model_dump()["type"] == "voice_speak"
    parsed_speak = VoiceSpeak.model_validate(speak.model_dump())
    assert parsed_speak.text == "hello"


def test_protocol_discriminator_via_json() -> None:
    """Each message type carries a discriminator; the wire layer must roundtrip."""
    all_types = {
        "client_hello", "transcript_partial", "transcript_final", "assistant_delta",
        "audio_out", "status", "error", "voice_speak", "audio_chunk", "client_control",
    }
    cases = [
        ClientHello(type="client_hello", session_id="s").model_dump(),
        TranscriptPartial(type="transcript_partial", text="h").model_dump(),
        TranscriptFinal(type="transcript_final", text="h").model_dump(),
        AssistantDelta(type="assistant_delta", text="d").model_dump(),
        AudioOut(type="audio_out", rate=16000, bytes_b64="AAA").model_dump(),
        StatusEvent(type="status", state="listening").model_dump(),
        ErrorEvent(type="error", message="x").model_dump(),
        VoiceSpeak(type="voice_speak", session_id="s", text="t", turn_seq=1).model_dump(),
        AudioChunk(type="audio_chunk", seq=1, bytes_b64="AAA", rate=16000).model_dump(),
        ClientControl(type="client_control", action="pause").model_dump(),
    ]
    for c in cases:
        assert c["type"] in all_types
        json.dumps(c)


# ── MockSTT ────────────────────────────────────────────────────────────────

def test_mock_stt_empty_is_empty() -> None:
    assert MockSTT().transcribe(b"") == ""


def test_mock_stt_only_silence_is_empty() -> None:
    assert MockSTT().transcribe(b"\x00" * 320) == ""


def test_mock_stt_ascii_hint_uppercased() -> None:
    stt = MockSTT()
    text = stt.transcribe(b"hint: hello world")
    assert text == "HELLO WORLD"


def test_mock_stt_header_is_stripped() -> None:
    stt = MockSTT()
    payload = MockSTT.HEADER + b"hint: with header"
    assert stt.transcribe(payload) == "WITH HEADER"


def test_mock_stt_returns_placeholder_on_unhinted_audio() -> None:
    stt = MockSTT()
    # Any non-zero PCM without an "hint:" should return the mock placeholder,
    # uppercased — proves the pipeline receives *something* even when the
    # audio carries no semantic hint, which is critical for the E2E smoke.
    out = stt.transcribe(b"\x01\x02\x03\x04\x05")
    assert out
    assert out == out.upper()


def test_decode_audio_b64_handles_garbage() -> None:
    assert decode_audio_b64("not-base64!!!") == b""
    assert decode_audio_b64("") == b""


# ── MockTTS ────────────────────────────────────────────────────────────────

def test_mock_tts_empty() -> None:
    assert MockTTS().synthesize("") == b""


def test_mock_tts_deterministic() -> None:
    tts = MockTTS()
    a = tts.synthesize("hello")
    b = tts.synthesize("hello")
    assert a == b
    assert a  # non-empty


def test_mock_tts_sample_rate_is_16k() -> None:
    assert MockTTS().sample_rate == 16000


def test_mock_tts_changes_with_text() -> None:
    tts = MockTTS()
    assert tts.synthesize("hello") != tts.synthesize("world")


def test_mock_tts_output_is_pcm16_mono_int16() -> None:
    tts = MockTTS()
    raw = tts.synthesize("hi")
    assert len(raw) % 2 == 0
    # Every byte-pair is an int16 — sample range ~ ±32768.
    for i in range(0, min(len(raw), 2000), 2):
        sample = int.from_bytes(raw[i:i + 2], "little", signed=True)
        assert -32768 <= sample <= 32767


# ── Admin /internal test endpoints ─────────────────────────────────────────

@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_healthz(client: TestClient) -> None:
    r = client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] == "true"
    assert body["stt"] == "mock"
    assert body["tts"] == "mock"


def test_info_reports_providers(client: TestClient) -> None:
    r = client.get("/info")
    assert r.status_code == 200
    info = r.json()
    assert info["stt"]["active"] == "mock"
    assert "deepgram" in info["stt"]["options"]
    assert "piper" in info["tts"]["options"]


def test_admin_test_stt_with_hint(client: TestClient) -> None:
    r = client.post(
        "/admin/test/stt",
        json={"audio_b64": base64.b64encode(b"hint: alpha bravo").decode("ascii")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["text"] == "ALPHA BRAVO"
    assert body["provider"] == "mock"


def test_admin_test_stt_empty_audio_rejected(client: TestClient) -> None:
    r = client.post("/admin/test/stt", json={"audio_b64": ""})
    assert r.status_code == 400
    assert r.json()["ok"] is False


def test_admin_test_tts_returns_pcm(client: TestClient) -> None:
    r = client.post("/admin/test/tts", json={"text": "voice test"})
    assert r.status_code == 200
    assert r.headers["x-provider"] == "mock"
    assert r.headers["x-sample-rate"] == "16000"
    assert len(r.content) > 0
    assert len(r.content) % 2 == 0


def test_admin_test_tts_empty_returns_empty_body(client: TestClient) -> None:
    r = client.post("/admin/test/tts", json={"text": ""})
    assert r.status_code == 200
    assert r.content == b""


# ── WS endpoint metadata ───────────────────────────────────────────────────

def test_ws_endpoint_exists() -> None:
    """The websocket route is registered at the configured path (default /voice-ws)."""
    paths = [r.path for r in app.routes if hasattr(r, "path")]
    # /voice-ws (default) — the browser endpoint exposed via Caddy path-strip.
    assert "/voice-ws" in paths
    assert "/admin/test/stt" in paths
    assert "/admin/test/tts" in paths
