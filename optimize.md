# LivingCV — Performance Plan for the 1 vCPU / 1 GB OCI Free Instance

Date: 2026-07-10. Target: OCI VM.Standard.E2.1.Micro (1 vCPU AMD, 1 GB RAM)
running `docker-compose.yml` (caddy + web + orchestrator + jobops).

**Verdict: yes, this stack can run comfortably on the box — but the current
setup wastes memory in three specific places, and the deploy process is the
single biggest problem: it builds three Docker images (including `next build`,
which alone wants ~1 GB) ON the 1 GB box while the stack is running.** That is
why the deploy timeout had to be raised to 30 minutes (`cc8b435`).

Ordered by impact. O1 and O2 are the big wins; the rest are cheap insurance.

---

## O1 — Build images in GitHub Actions, pull on the box [biggest win]

**Problem:** `deploy.yml` SSHes in and runs `docker compose up -d --build`.
`next build` + two more image builds compete with the running containers for
1 GB of RAM and 1 vCPU → 20–30 minute deploys, swap thrash / OOM-kill risk
every deploy.

**Change:**

1. New `build.yml` workflow (or a job appended to CI) using
   `docker/build-push-action` to build and push:
   - `ghcr.io/<owner>/livingcv-web` (context `.`, `infra/web.Dockerfile`,
     build-arg `GIT_SHA=${{ github.sha }}`)
   - `ghcr.io/<owner>/livingcv-orchestrator` (`infra/orchestrator.Dockerfile`)
   - `ghcr.io/<owner>/livingcv-jobops` (`infra/jobops/Dockerfile` — build it
     unchanged; do not modify anything inside `infra/jobops/`)
   Tag each with both `latest` and the commit SHA. Platform: `linux/amd64`
   (the target box is AMD x86, despite the "Ampere/arm64" comment in
   web.Dockerfile). Use `cache-from/cache-to: type=gha` for fast rebuilds.
2. `docker-compose.yml`: add `image: ghcr.io/...` lines next to the existing
   `build:` blocks (compose uses `image` when present on `pull`, and `build`
   stays as the local-dev fallback via `docker compose build`).
3. `deploy.yml` script becomes: `git pull --ff-only` (still needed for
   compose/Caddyfile changes) → `docker compose pull` →
   `docker compose up -d --wait` → `docker compose restart caddy`. Drop
   `--build`. Reduce `command_timeout` back to 10m.
4. GHCR auth: in Actions, `docker/login-action` with the built-in
   `GITHUB_TOKEN` (needs `packages: write` permission on the job). On the
   server, either make the GHCR packages public (no login needed) or do a
   one-time `docker login ghcr.io` with a `read:packages` PAT.
5. Keep the `GIT_SHA`/`LIVINGCV_COMMIT` stamp working: it's a build arg, so
   it is baked in at Actions-build time — pass `github.sha` there and the
   admin "updates" check keeps functioning.

**Payoff:** deploys go from ~25 min to ~2 min; the box never runs a compiler
again; zero deploy-time OOM risk.

## O2 — Stop running the orchestrator under tsx in production

**Problem:** `apps/orchestrator/package.json` has `"start": "tsx src/server.ts"`,
and that is what the Docker CMD runs. tsx keeps esbuild + the TypeScript
transform pipeline resident — roughly 60–120 MB extra RSS and slower cold
starts. Worse, the Dockerfile's `npm run build` step is a **no-op**:
`apps/orchestrator/tsconfig.json` sets `"noEmit": true`, so `tsc` emits
nothing and `dist/` never exists.

**Change:**

1. Add `apps/orchestrator/tsconfig.build.json`:
   ```json
   {
     "extends": "./tsconfig.json",
     "compilerOptions": { "noEmit": false, "outDir": "dist", "rootDir": "src" },
     "include": ["src/**/*"]
   }
   ```
2. package.json: `"build": "tsc -p tsconfig.build.json"`, add
   `"start:prod": "node dist/server.js"`. Keep `"start"` (tsx) for local dev.
3. `infra/orchestrator.Dockerfile`: CMD becomes
   `["npm", "run", "start:prod", "-w", "@livingcv/orchestrator"]`.
   The source already uses ESM `.js` import suffixes and `"type": "module"`,
   so the compiled output runs directly under node.
4. Verify the workspace deps (`@livingcv/db` etc.) resolve from `dist/` the
   same way they do today (they're `serverExternal`-style runtime requires of
   built packages already copied into the image).

**Payoff:** ~60–120 MB RAM back on a 1 GB box, faster container start,
healthcheck passes sooner.

## O3 — Next.js standalone output (smaller web image)

**Problem:** the web runtime image copies the ENTIRE monorepo `node_modules`
from the deps stage — which was installed with plain `npm install`, so it
includes every root devDependency (typescript, eslint, vitest, tsx…).
Image is far larger than needed → slow pulls, more disk, more page-cache
pressure at runtime.

**Change:** set `output: 'standalone'` in `apps/web/next.config.mjs`; in the
runtime stage copy only `.next/standalone`, `.next/static`, and `public`, and
change CMD to `node apps/web/server.js` (path as emitted by the standalone
build).

**Caveat:** `scripts/seed-demo.ts` is run in-container via `npx tsx` and needs
the full node_modules. Options: (a) keep the seed flow by also shipping a tiny
`tools` stage image used only for one-off execs, or (b) run seeding from the
host/CI instead. If neither is worth it right now, do O3 last or skip it —
O1+O2 already remove the pressure. Mark this task OPTIONAL.

## O4 — Swap + memory caps (insurance against the OOM killer)

One-time on the box (document in `docs/` or a setup script; requires root):

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10   # persist in /etc/sysctl.d/
```

In `docker-compose.yml`, cap each service so one leak can't take down the box
(values leave ~150 MB for OS + dockerd):

- web: `mem_limit: 384m`, env `NODE_OPTIONS: --max-old-space-size=256`
- orchestrator: `mem_limit: 256m`, `NODE_OPTIONS: --max-old-space-size=160`
- jobops: `mem_limit: 256m` (don't change its internals, just the compose cap)
- caddy: `mem_limit: 64m`

Also add default log rotation so container logs can't eat the disk:

```yaml
x-logging: &logging
  logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
```
applied to each service.

## O5 — Cheaper healthchecks

Each healthcheck spawns a full Node process (`node -e fetch(...)`) every 30 s
in web, orchestrator, and jobops — constant background CPU on a single core.
Raise `interval` to 60 s (keep the generous `start_period`s). Keep the test
commands as-is; node is the only tool guaranteed in those images.

## O6 — Small env wins

- `NEXT_TELEMETRY_DISABLED: "1"` on the web service (kills telemetry I/O).
- `NPM_CONFIG_UPDATE_NOTIFIER: "false"` wherever npm is the entrypoint —
  though after O2/O3 the entrypoints are plain `node`, which is better still
  (npm-as-PID-1 keeps an extra ~40 MB npm process alive per container; using
  `node dist/server.js` directly as CMD avoids it — apply the same idea to
  the web CMD if O3 is done).

---

## Expected end state

| | Before | After O1–O5 |
|---|---|---|
| Deploy time | 20–30 min, on-box builds | ~2 min, pull-only |
| Deploy OOM risk | high (next build on 1 GB) | none |
| Orchestrator RSS | ~150–200 MB (tsx) | ~60–90 MB (node dist) |
| Web image size | very large (full monorepo node_modules) | ~200 MB (standalone, optional) |
| OOM-kill blast radius | whole box | capped per-container + swap |

## Verification

1. Actions build workflow green; `docker compose pull` on a clean machine
   brings up the stack with `docker compose up -d --wait` (no `--build`).
2. `curl -s localhost/healthz`-equivalents pass; admin login, chat, MCP SSE
   (`npm run health` against the box) all work.
3. `docker stats --no-stream` on the box: total container RSS ≤ ~600 MB idle.
4. `free -h` shows swap active; `docker inspect` shows mem limits applied.

---

## Execution report

Date executed: 2026-07-10. Branch: `fix/audit-round-3` (off `main`). Node:
v24.12.0. All commits are local; not pushed. Per-task commits below.

### O1 — Build images in GitHub Actions, pull on the box
**Status:** Done.
**Verified:** YAML syntactically valid (`python3 -c "import yaml; yaml.safe_load(...)"` for all three files). `docker compose config` resolves cleanly with the new `image:` lines + `build:` fallback blocks. End-to-end Actions run + `docker compose pull` requires a live box (Docker daemon not running in this environment) — deferred to operator.
**Changes:**
- New `.github/workflows/build.yml` — `docker/build-push-action@v6` matrix over three images (`livingcv-web`, `livingcv-orchestrator`, `livingcv-jobops`); contexts `.` + per-image dockerfile; platform `linux/amd64`; tags `latest` + `${{ github.sha }}`; `cache-from/cache-to: type=gha`; `packages: write` permission so the built-in `GITHUB_TOKEN` can push. Triggers on `workflow_run` of CI on `main` + `workflow_dispatch`.
- `docker-compose.yml` — added `image: ghcr.io/mohith-das/livingcv-{web,orchestrator,jobops}:latest` next to every existing `build:` block. With both present, `docker compose pull` uses the image, `docker compose build` still works for local dev.
- `.github/workflows/deploy.yml` — `command_timeout` 30m → 10m (also `timeout-minutes` 30 → 15); script switched from `docker compose up -d --build --wait` to `docker compose pull && docker compose up -d --wait`. Kept the `docker compose restart caddy` step.
- All three GHCR images use `${{ github.repository_owner }}` so a fork automatically rebuilds under the new owner's namespace.
- `infra/jobops/` was **read** (to locate `infra/jobops/Dockerfile` for the build matrix) but **not modified**, per the audit-round-3 constraint.
**Deviations:** none. Operator must do one-time `docker login ghcr.io` on the box with a `read:packages` PAT, OR make the GHCR packages public — documented inline as a deploy pre-requisite.

### O2 — Stop running the orchestrator under tsx in production
**Status:** Done.
**Verified:** `npm run build -w @livingcv/orchestrator` now actually emits to `apps/orchestrator/dist/` (14 .js files including `server.js`, `masterMcp.js`); `node --check` parses both `server.js` and `masterMcp.js` without errors. All three `@livingcv/*` packages expose `main: ./dist/index.js` with `type: module`, so `node dist/server.js` resolves them at runtime. `npm run ci` green (lint ✓, typecheck ✓, 73 tests ✓). End-to-end container start deferred to operator (no Docker daemon).
**Changes:**
- `apps/orchestrator/tsconfig.build.json` — replaced the existing file (which had `declaration: false, sourceMap: true` and was never wired to any script) with the plan's explicit `{ noEmit: false, outDir: "dist", rootDir: "src", include: ["src/**/*"] }` form.
- `apps/orchestrator/package.json` — `"build": "tsc"` → `"tsc -p tsconfig.build.json"`; new `"start:prod": "node dist/server.js"`. Kept `"start": "tsx src/server.ts"` for local dev.
- `infra/orchestrator.Dockerfile` — CMD `npm run start` → `npm run start:prod`.
**Deviations:** none.

### O3 — Next.js standalone output (smaller web image)
**Status:** **Skipped** (per the plan's "OPTIONAL" tag and "attempt it only if the seed-demo caveat described there can be solved cleanly; otherwise skip it and say so").
**Why skipped:** the seed-demo caveat can't be solved cleanly. Both options the plan lists add operational cost that exceeds the win:
- (a) **Separate `tools` stage image** — a second image built and pushed to GHCR per commit, just to support a one-off `npx tsx scripts/seed-demo.ts` exec at setup time. Cost: extra build minutes, extra GHCR storage, extra lifecycle. Value: ~one image pulled per box lifetime.
- (b) **Host/CI seeding** — operator clones the repo on the 1 GB box and runs `npm ci`, which pulls in the entire monorepo devDependencies (TypeScript, vitest, eslint, tsx, …). That **re-introduces the exact RAM pressure O1 was designed to remove** — `next build` is gone but `npm ci` itself wants ~300–400 MB on a clean checkout.
- O1+O2 already remove the box-side compiler pressure the plan targeted. The web image still ships a fat `node_modules`, but that's a pull-time and disk cost, not a deploy-time OOM risk.

No code changes for O3.

### O4 — Swap + memory caps (insurance against the OOM killer)
**Status:** Done.
**Verified:** `docker compose config` shows `mem_limit: 402653184` (384 MB) on web, `256 MB` on orchestrator, `256 MB` on jobops, `64 MB` on caddy; logging driver `json-file` with `max-size: 10m` / `max-file: 3` applied to all four. Total reserved: ~960 MB; OS + dockerd keep the remaining ~40 MB on the 1 GB box.
**Changes:** `docker-compose.yml` — added top-level `x-logging: &logging` YAML anchor with the json-file rotation block, applied via `<<: *logging` to each service. Per-service `mem_limit` added. `NODE_OPTIONS: --max-old-space-size=256` on web, `--max-old-space-size=160` on orchestrator (keeps V8 heap inside the container's cgroup slice). jobops gets the cap only (no `NODE_OPTIONS` — its internals are not modified, per the constraint).
**Deviations:** the plan's `fallocate` + `mkswap` + `swapon` + `/etc/fstab` + `sysctl vm.swappiness` block requires root on the box and one-time interactive setup. **Not automatable from this branch** — flagging for the operator to run once on the OCI box.
**Operator action item (manual):** run the swap setup from optimize.md O4 on the box:
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10
```
Persist `vm.swappiness` in `/etc/sysctl.d/`.

### O5 — Cheaper healthchecks
**Status:** Done.
**Verified:** `docker compose config` shows `interval: 1m0s` on all three healthchecks; `start_period`s preserved at 60s/60s/90s. Test commands untouched (still `node -e fetch(...)` — Node is the only tool guaranteed in those images).
**Changes:** `docker-compose.yml` — `interval: 30s` → `interval: 60s` on web, orchestrator, jobops healthchecks.
**Deviations:** none.

### O6 — Small env wins
**Status:** Done.
**Verified:** `docker compose config` shows `NEXT_TELEMETRY_DISABLED: "1"` on web and `NPM_CONFIG_UPDATE_NOTIFIER: "false"` on web + orchestrator. CI green.
**Changes:** `docker-compose.yml` — added the two env vars.
**Deviations:** deliberately did NOT change the web CMD from `npm run start` to `node dist/server.js`. That change is gated on O3 (standalone), per the plan's own note ("apply the same idea to the web CMD if O3 is done"). O3 is skipped, so the CMD swap is deferred too.

### Verification (re-run at end of optimize work)
1. **Actions build workflow green; `docker compose pull` brings up the stack on a clean machine** — ⚠️ not run live. YAML validated locally; the three workflows (`ci.yml`, `build.yml`, `deploy.yml`) parse and `docker compose config` resolves cleanly. Live Actions run + box-side `docker compose pull` requires GitHub Actions + a running Docker daemon + GHCR auth — all three deferred to operator.
2. **`curl -s localhost/healthz`-equivalents pass; admin login, chat, MCP SSE work** — ⚠️ deferred to operator (requires Docker daemon + compose stack).
3. **`docker stats --no-stream` total container RSS ≤ ~600 MB idle** — ⚠️ deferred to operator (requires Docker daemon + compose stack). The caps above (384 + 256 + 256 + 64 = 960 MB) are upper bounds; actual RSS should be well under that at idle.
4. **`free -h` shows swap active; `docker inspect` shows mem limits applied** — ⚠️ swap activation is a one-time operator action (see O4). `docker inspect` will confirm `mem_limit` is applied per service once the stack is up — deferred.
