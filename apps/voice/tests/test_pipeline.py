"""VOICE.md acceptance tests — Issue 1 properly finished."""

from __future__ import annotations

import os
import wave

import pytest

from voice_service.pipeline import (
    OrchestratorProcessor,
    OrchestratorSession,
    _SyncSTTWrapper,
    _SyncTTSWrapper,
)
from voice_service.stt import MockSTT, build_pipecat_stt
from voice_service.tts import MockTTS, build_pipecat_tts

# ── Helpers ──────────────────────────────────────────────────────────────────

def _read_wav_pcm(path: str) -> bytes:
    with wave.open(path, "rb") as wf:
        return wf.readframes(wf.getnframes())


# ── Provider selection tests ─────────────────────────────────────────────────


def test_provider_selection_mock_mode():
    """Mock mode returns MockSTT/MockTTS keylessly."""
    stt = build_pipecat_stt("mock")
    tts = build_pipecat_tts("mock")
    assert isinstance(stt, MockSTT)
    assert isinstance(tts, MockTTS)


def test_provider_selection_local_mode():
    """Local STT mode returns real Pipecat WhisperSTTService (keyless)."""
    stt = build_pipecat_stt("local")
    from pipecat.services.whisper.stt import WhisperSTTService
    assert isinstance(stt, WhisperSTTService)


def test_provider_selection_local_tts_needs_model():
    """Local TTS mode reaches PiperTTSService but needs a voice model file.
    The ValueError is the expected, actionable error — not a NotImplementedError."""
    with pytest.raises(ValueError, match="Piper TTS voice"):
        build_pipecat_tts("local")


def test_cloud_mode_raises_without_key():
    """Cloud mode with no key: the provider selection helper raises RuntimeError."""
    backup_stt = os.environ.pop("VOICE_STT_API_KEY", None)
    backup_tts = os.environ.pop("VOICE_TTS_API_KEY", None)
    try:
        with pytest.raises(RuntimeError, match="voice.stt_api_key"):
            build_pipecat_stt("cloud", api_key="")
        with pytest.raises(RuntimeError, match="voice.tts_api_key"):
            build_pipecat_tts("cloud", api_key="")
    finally:
        if backup_stt:
            os.environ["VOICE_STT_API_KEY"] = backup_stt
        if backup_tts:
            os.environ["VOICE_TTS_API_KEY"] = backup_tts


# ── Local STT/TTS (keyless, real model) ──────────────────────────────────────


@pytest.mark.slow
def test_whisper_stt_transcribes_bundled_wav():
    """Acceptance #4: real WhisperSTTService on a short bundled WAV (keyless)."""
    wav_path = os.path.join(os.path.dirname(__file__), "test_tone.wav")
    assert os.path.exists(wav_path)
    stt = build_pipecat_stt("local")
    pcm = _read_wav_pcm(wav_path)
    transcript = stt.transcribe(pcm)
    assert isinstance(transcript, str)


@pytest.mark.slow
def test_piper_tts_synthesizes_text():
    """Acceptance #4: real Piper TTS on short text (keyless)."""
    tts = build_pipecat_tts("local")
    pcm = tts.synthesize("hello world")
    assert isinstance(pcm, bytes)
    assert len(pcm) > 0
    assert len(pcm) % 2 == 0


# ── OrchestratorProcessor seam test ──────────────────────────────────────────


def test_orchestrator_processor_has_no_llm():
    """Acceptance #6: OrchestratorProcessor uses OrchestratorClient, never LLM."""
    import inspect
    source = inspect.getsource(OrchestratorProcessor)
    for forbidden in [
        "tool_use", "tool_call", "function_call",
        "Anthropic", "OpenAI", "Gemini",
        "ChatCompletion", "Bedrock", "LangChain", "LlamaIndex",
    ]:
        assert forbidden not in source, f"OrchestratorProcessor must not reference {forbidden}"
    assert "OrchestratorClient" in source


def test_sync_wrappers_hold_names():
    """Legacy MockSTT/MockTTS wrappers carry the provider name."""
    stt = _SyncSTTWrapper(MockSTT(), name="mock-stt")
    tts = _SyncTTSWrapper(MockTTS(), name="mock-tts")
    assert stt.name == "mock-stt"
    assert tts.name == "mock-tts"


# ── Existing tests carry forward ─────────────────────────────────────────────


def test_mock_stt_unchanged():
    stt = MockSTT()
    assert stt.transcribe(b"") == ""
    assert stt.transcribe(b"hint: hello") == "HELLO"


def test_mock_tts_unchanged():
    tts = MockTTS()
    assert tts.synthesize("") == b""
    assert len(tts.synthesize("hello")) > 0


def test_decode_audio_b64_unchanged():
    from voice_service.stt import decode_audio_b64
    assert decode_audio_b64("not-base64") == b""
    assert decode_audio_b64("") == b""


def test_orph_session_carries_url():
    s = OrchestratorSession("http://orch:8100")
    assert s.orchestrator_url == "http://orch:8100"
