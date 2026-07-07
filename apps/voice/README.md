# Voice service

Pipecat-shaped voice pipeline that relays the browser's mic stream into the
orchestrator and streams TTS audio back. The STT/TTS surfaces are interfaces
— Phase 3 ships `MockSTT` (echo/uppercase) and `MockTTS` (text → reversed
PCM16 bytes); real `DeepgramSTT` / `WhisperSTT` / `CartesiaTTS` /
`PiperTTS` slot in by implementing the same interface. Same for VAD
(`MockVAD` is an energy gate; SileroVAD ships later).

Why mock first? PLAN §14 risk #2 budgets a spike for self-hosted WebRTC.
We ship the pipeline harness + the orchestrator↔voice protocol with the
exact Pipecat shapes, then wire real models behind credentials in Phase 5
(or whenever the operator has API keys / a Whisper.cpp bundle).

# Flow

```
mic → voice (VAD → STT)   ──text──▶  orchestrator (runTurn)
                                  ◀─tokens/audio──
TTS → speakers
```

Wire protocol between voice and orchestrator is JSON over WebSocket at
`/internal/voice` on the orchestrator (docker-network-only). Between
browser and voice, JSON-over-WS at `/ws` on the voice service (also
private by default; Caddy is not configured to expose `/voice-ws` in
Phase 3 because real WebRTC media is a much larger surface).

# Development

    uv sync
    uv run ruff check src tests
    uv run uvicorn voice_service.main:app --port 8200

    # integration smoke (with the portfolio repo's `npm run build` artifacts
    # + a running jobops/orchestrator):
    uv run pytest -q
