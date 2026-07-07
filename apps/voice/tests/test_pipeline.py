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
    """Local STT mode returns real Pipecat WhisperSTTService (keyless).

    Requires the `[local]` extra (faster-whisper); skipped when it isn't
    installed so the default/CI env (cloud-only) stays green.
    """
    pytest.importorskip("faster_whisper")
    stt = build_pipecat_stt("local")
    from pipecat.services.whisper.stt import WhisperSTTService
    assert isinstance(stt, WhisperSTTService)


def test_provider_selection_local_tts_needs_model():
    """Local TTS mode reaches PiperTTSService but needs a voice model file.
    The ValueError is the expected, actionable error — not a NotImplementedError.

    Requires the `[local]` extra (piper-tts); skipped when absent.
    """
    pytest.importorskip("piper")
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


# NOTE ON THE LOCAL PATH (honest limitation):
# The real Pipecat services (Whisper/Piper/Deepgram/Cartesia) are ASYNC frame
# processors — they are driven by `build_pipeline()` (transport → VAD → STT →
# OrchestratorProcessor → TTS), NOT by a synchronous `.transcribe()/.synthesize()`.
# Only MockSTT/MockTTS implement the sync interface. So these tests verify that
# local mode SELECTS the correct real Pipecat service class; a true end-to-end
# transcription/synthesis round-trip runs through the async pipeline against a
# live transport (documented manual test), which needs model files and audio I/O.

@pytest.mark.slow
def test_local_stt_selects_real_whisper_service():
    """Local mode wires the real Pipecat WhisperSTTService (async).

    Requires the `[local]` extra; skipped otherwise. We assert the service is
    the real async Pipecat class and exposes the async STT entrypoint — not a
    sync `.transcribe()` (which only the mock has).
    """
    pytest.importorskip("faster_whisper")
    from pipecat.services.whisper.stt import WhisperSTTService
    wav_path = os.path.join(os.path.dirname(__file__), "test_tone.wav")
    assert os.path.exists(wav_path)
    stt = build_pipecat_stt("local")
    assert isinstance(stt, WhisperSTTService)
    assert hasattr(stt, "run_stt")  # async frame entrypoint, driven by the pipeline


@pytest.mark.slow
def test_local_tts_selects_real_piper_service():
    """Local mode wires the real Pipecat PiperTTSService (async).

    Requires the `[local]` extra; skipped otherwise.
    """
    pytest.importorskip("piper")
    from pipecat.services.piper.tts import PiperTTSService
    model = os.environ.get("VOICE_PIPER_MODEL", "")
    if not model:
        # Without a model file PiperTTSService construction raises — that's the
        # documented, actionable error, not a silent mock fallback.
        with pytest.raises((ValueError, RuntimeError)):
            build_pipecat_tts("local")
        return
    tts = build_pipecat_tts("local")
    assert isinstance(tts, PiperTTSService)


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
