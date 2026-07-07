# Multi-stage build for the Next.js web app. arm64-compatible (Ampere A1).
FROM node:20-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything needed for `npm ci` first for cache-friendliness.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/crypto/package.json ./packages/crypto/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm install --no-audit --no-fund

# Build each workspace package to dist/.
FROM deps AS build
COPY packages/shared ./packages/shared
COPY packages/crypto ./packages/crypto
COPY packages/db ./packages/db
COPY apps/web ./apps/web
COPY tsconfig.base.json ./
RUN npm run -w @livingcv/shared build \
 && npm run -w @livingcv/crypto build \
 && npm run -w @livingcv/db build \
 && npm run -w @livingcv/web build

# Runtime image.
FROM node:20-bookworm-slim AS run
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
WORKDIR /app
# Non-root runtime user.
RUN useradd --create-home --uid 10001 nodejs
COPY --chown=nodejs:nodejs --from=deps /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs --from=build /app/package.json /app/package-lock.json ./
COPY --chown=nodejs:nodejs --from=build /app/apps/web ./apps/web
COPY --chown=nodejs:nodejs --from=build /app/packages ./packages
COPY --chown=nodejs:nodejs --from=build /app/tsconfig.base.json ./
USER nodejs
CMD ["npm", "run", "start", "-w", "@livingcv/web"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
