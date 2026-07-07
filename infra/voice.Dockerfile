# Voice service — Phase 5 real STT/TTS adapters (Cloud: Deepgram + Cartesia /
# ElevenLabs; Local: whisper.cpp + Piper). MockSTT/MockTTS remain for CI.
#
# arm64-compatible. The local voice path (whisper.cpp + Piper) requires
# additional model files — see the Dockerfile section on VOICE_LOCAL_MODELS.

FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# System deps: build-essential for any native Python extensions (pywhispercpp,
# piper onnxruntime). On the cloud path, these are no-ops at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential cmake libsndfile1 \
 && rm -rf /var/lib/apt/lists/*

# Copy manifests first for cache-friendly installs.
COPY pyproject.toml README.md ./
RUN pip install --no-cache-dir . && pip uninstall -y pip || true

# Optional: if the operator selects voice.mode=local, they need to also
# `pip install .[local]` and set VOICE_LOCAL_MODELS to a directory containing
# a whisper.cpp ggml model and a Piper .onnx voice model. The image as
# shipped does NOT bundle model files (each is >100 MB); operators add them
# via a volume mount during `docker compose up`.
#
# Example:
#   mkdir -p ./voice-models
#   curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin -o ./voice-models/ggml-base.en.bin
#   docker compose up -v ./voice-models:/models

COPY src ./src

ENV VOICE_PORT=8200
EXPOSE 8200

RUN useradd --create-home --uid 10001 voice 2>/dev/null || true
USER 10001

ENV VOICE_MODE=cloud

CMD ["python", "-m", "uvicorn", "voice_service.main:app", "--host", "0.0.0.0", "--port", "8200"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD ["python", "-c", "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8200/healthz', timeout=3).status == 200 else 1)"]
