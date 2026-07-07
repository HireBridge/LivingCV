# Voice service — Phase 3 (Pipecat-shaped harness; real STT/TTS adapters
# slot in behind the same interfaces in Phase 5 or whenever the operator
# has the keys).
#
# arm64-compatible. Pipecat + Whisper.cpp + Piper are recorded as Phase 5
# polish per PLAN §14 risk #2; this image deliberately ships with the
# mock STT/TTS only.

FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# System deps for any future native Python extension (whisper.cpp bindings,
# piper wheel). Phase 3's pure-python mocks don't need them; including them
# now means a Phase 5 swap doesn't require a Dockerfile change.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

# Copy only the manifests first for cache-friendly installs.
COPY pyproject.toml README.md ./

RUN pip install --no-cache-dir .[dev] && pip uninstall -y pip || true

COPY src ./src

ENV VOICE_PORT=8200
EXPOSE 8200

# Run as a non-root user where possible (best-effort; python slim ships as root
# by default for some images).
RUN useradd --create-home --uid 10001 voice 2>/dev/null || true
USER 10001

CMD ["python", "-m", "uvicorn", "voice_service.main:app", "--host", "0.0.0.0", "--port", "8200"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD ["python", "-c", "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8200/healthz', timeout=3).status == 200 else 1)"]
