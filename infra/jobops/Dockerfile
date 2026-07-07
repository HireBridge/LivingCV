FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Prefer the patched npm release now published (0.15+). During dev, before the
# upstream release exists, the build context may include a `jobops-local.tgz`
# produced from the jobops repo via `npm pack`. If present, install it first so
# the patched build wins over the registry version.
COPY packages.txt ./
RUN if [ -f jobops-local.tgz ]; then \
      npm install ./jobops-local.tgz --no-save && \
      cp jobops-local.tgz /jobops-local.tgz; \
    else \
      npm install @mohith_das/jobops@^0.15.0 --no-save; \
    fi

# Startup: run `jobops start` (HTTP mode), bind 0.0.0.0 so Caddy can reverse-proxy.
ENV JOBOPS_HOST=0.0.0.0
ENV JOBOPS_PORT=7891
ENV JOBOPS_SCHEDULER_ENABLED=false
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
EXPOSE 7891
CMD ["sh", "-c", "if [ -f /jobops-local.tgz ]; then npm install -g /jobops-local.tgz; else npm install -g @mohith_das/jobops@^0.15.0; fi && jobops start"]
