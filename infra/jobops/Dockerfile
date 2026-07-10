# Build a jobops image that tracks the LATEST published release. Two paths:
#   1. `infra/jobops/jobops-local.tgz` is in the build context (produced by
#      `scripts/build-jobops-tarball.sh`) → install that.
#   2. Otherwise install `@mohith_das/jobops@${JOBOPS_VERSION}` from npm.
#      JOBOPS_VERSION defaults to `latest`; CI (build.yml) resolves the
#      concrete latest version at build time and passes it in, so the install
#      layer's cache is busted exactly when a new jobops version is published
#      and the image is reproducible from its build args.
#
# Phase 4 §13 acceptance: the public MCP mount at /mcp/public must list exactly
# the three public read-only tools (`get_career_packet`, `get_career_packet_json`,
# `get_story_bank_public`). Both paths install the same code; the only
# difference is origin.

FROM node:20-bookworm-slim AS deps
WORKDIR /app

ARG JOBOPS_VERSION=latest

# Bring only the build manifest (and the optional local tarball) so Docker
# caches the install step when only source changes.
COPY package.json ./
COPY jobops-local.tgz* ./
RUN if [ -f jobops-local.tgz ]; then \
      npm install -g ./jobops-local.tgz; \
    else \
      npm install -g "@mohith_das/jobops@${JOBOPS_VERSION}"; \
    fi

FROM deps AS run
ENV JOBOPS_HOST=0.0.0.0
ENV JOBOPS_PORT=7891
ENV JOBOPS_SCHEDULER_ENABLED=false
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
EXPOSE 7891
CMD ["jobops", "start"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:7891/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
