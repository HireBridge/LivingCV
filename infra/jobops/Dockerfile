# Build a jobops image that consumes the patched v0.15+ release. Two paths:
#   1. `infra/jobops/jobops-local.tgz` is in the build context (produced by
#      `scripts/build-jobops-tarball.sh`) → install that.
#   2. Otherwise pull `@mohith_das/jobops@^0.15.0` from npm (operator must have
#      published the patched version, or be on a registry that has it).
#
# Phase 4 §13 acceptance: the public MCP mount at /mcp/public must list exactly
# the two public tools (`get_career_packet`, `get_story_bank_public`). Both
# paths install the same patched code; the only difference is origin.

FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Bring only the build manifest (and the optional local tarball) so Docker
# caches the install step when only source changes.
COPY package.json ./
COPY jobops-local.tgz* ./
RUN if [ -f jobops-local.tgz ]; then \
      npm install -g ./jobops-local.tgz; \
    else \
      npm install -g @mohith_das/jobops@^0.15.0; \
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
