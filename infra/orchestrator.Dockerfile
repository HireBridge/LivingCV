FROM node:20-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/orchestrator/package.json ./apps/orchestrator/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/crypto/package.json ./packages/crypto/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY packages/shared ./packages/shared
COPY packages/crypto ./packages/crypto
COPY packages/db ./packages/db
COPY apps/orchestrator ./apps/orchestrator
COPY tsconfig.base.json ./
RUN npm run -w @livingcv/shared build \
 && npm run -w @livingcv/crypto build \
 && npm run -w @livingcv/db build \
 && npm run -w @livingcv/orchestrator build

FROM node:20-bookworm-slim AS run
ENV NODE_ENV=production
ENV ORCHESTRATOR_PORT=8100
EXPOSE 8100
WORKDIR /app
RUN useradd --create-home --uid 10001 nodejs
COPY --chown=nodejs:nodejs --from=deps /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs --from=build /app/package.json /app/package-lock.json ./
COPY --chown=nodejs:nodejs --from=build /app/apps/orchestrator ./apps/orchestrator
COPY --chown=nodejs:nodejs --from=build /app/packages ./packages
COPY --chown=nodejs:nodejs --from=build /app/tsconfig.base.json ./
USER nodejs
CMD ["npm", "run", "start", "-w", "@livingcv/orchestrator"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8100/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
