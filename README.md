# Portfolio App

A self-hosted, monorepo-template portfolio platform with:

- **A public website** that renders from a database (runtime-editable, never build-time).
- **A classic template** (paper/ink/signal/rust) bundled; third parties can add templates without touching core code (see [`TEMPLATES.md`](./TEMPLATES.md)).
- **LivingCV Control Panel** (the Admin Console) with a first-boot setup wizard, iron-session auth, AES-256-GCM-encrypted secrets, and full CRUD for content + projects + case studies + the resume PDF.
- **Drag-and-Drop Structural Ordering**: Easily reorder the sections of your portfolio via the admin UI.
- **Advanced Theme Customization**: Real-time control panel for colors, typography, and a fallback JSON editor for fine-grained CSS override.
- **Connectivity Suite**: Native integration for Telegram (bot relays) and Google OAuth (Admin Login/Calendar).
- **Dynamic Contact Integrations**: The Hero section smartly enables a contact button only when connectivity tools are configured, routing to your interactive agent or email.
- **A recruiter concierge** — chat and voice widgets powered by a self-hosted [jobops](https://www.npmjs.com/package/@mohith_das/jobops) instance + a portfolio-side orchestrator (text/voice LLM with tool use, email-gate, limits, transcripts, lead webhook).
- **A public MCP endpoint** at `{site.domain}/mcp/public` that exposes exactly two read-only tools (`get_career_packet`, `get_story_bank_public`) to external recruiter-side AI agents (Claude.ai, ChatGPT, anything MCP). See [`docs/PUBLIC_MCP.md`](./docs/PUBLIC_MCP.md).
- **A machine-readable summary** at `/llms.txt` (per [llmstxt.org](https://llmstxt.org)) — the portfolio is legible to AI agents from day one.
- **Cookieless analytics** — server-side path × day counter; no cookies, no external service.
- **An admin CSV export of leads** and a backup/restore pair.
- **A demo seed** so a fresh clone renders a complete fictional persona before any real content is entered.

> Persona invariant (§2 inv 6): nothing in `apps/` or `packages/` mentions the operator's real name or domain. All persona content lives in the database, the setup wizard, or `scripts/seed-demo.ts` (a clearly-fictional "Alex Rivera"). A stranger can deploy this for themselves purely via the setup wizard.

```
┌──────────────┐  https://{site}
│    Caddy     │  reverse_proxy
│  (TLS, ACME) │  ────────────────► web:3000      (Next.js + classic template)
│  /api/*      │  /api/orchestrator/*   ──────► orchestrator:8100  (recruiter concierge)
│  /voice-ws   │  /voice-ws               ──────► voice:8200       (Pipecat-shaped harness)
│  /mcp*       │  /mcp/*                  ──────► jobops:7891       (MCP, public mount + admin)
└──────────────┘
                /data  (shared SQLite volume; WAL + busy_timeout; both web + orchestrator open it)
```

## Repo layout

```
portfolio_app/
├─ apps/
│  ├─ web/         Next.js 16 (landing, admin, REST API, resume, sitemap, llms.txt)
│  ├─ orchestrator/  Express + @modelcontextprotocol/sdk client (text/voice LLM turn engine)
│  └─ voice/       Python 3.11+ FastAPI + WS (Pipecat-shaped harness; MockSTT/MockTTS in Phase 3)
├─ packages/
│  ├─ db/          better-sqlite3 + WAL + migration runner (shared by web + orchestrator)
│  ├─ crypto/      AES-256-GCM with env-key + bootstrap-key fallback
│  └─ shared/      template props, setting keys, free-email-domains (no DB)
├─ scripts/         seed-demo, smoke-phase2/4, build-jobops-tarball
├─ docs/            PUBLIC_MCP.md, case-study spec
├─ infra/           Caddyfile, jobops/web/orchestrator/voice Dockerfiles
├─ apps/web/templates/classic/   the bundled template (data-driven port of docs/index.html)
├─ PLAN.md          the plan this repo was built from
└─ TEMPLATES.md     contract for adding new templates
```

## Quickstart (≈15 minutes on a fresh box)

### Prerequisites

- Docker 24+ and docker compose v2.
- A domain whose DNS A/AAAA points at the box's public IP.
- Ports 80/443 open on the host (Caddy will mint a Let's Encrypt cert on first boot).
- ~4 GB of free disk and 2 GB of free RAM (more is friendlier; voice models + jobops's bundled tools add up).

### Deploy

```bash
# 1. Clone
git clone https://github.com/<you>/portfolio_app
cd portfolio_app

# 2. Fill in the bootstrap env. The encryption key is the load-bearing
#    secret — lose it and every encrypted app_settings value is unrecoverable.
cp .env.example .env
$EDITOR .env
#    Generate a 32-byte key:  openssl rand -base64 32
#    SESSION_SECRET:       openssl rand -base64 32
#    JOBOPS_AUTH_TOKEN:    openssl rand -hex 32
#    DOMAIN, IP_HASH_SALT: anything

# 3. Bring the stack up.
docker compose up -d

# 4. Visit https://${DOMAIN}/admin/setup and walk the wizard.
#    The wizard: admin password → encryption-key ack → site title/domain
#    → jobops URL + token (tested live) → agent LLM (tested live) → done.

# 5. (Optional) Seed the demo persona so a fresh deployment isn't empty.
docker compose exec -T web npx tsx scripts/seed-demo.ts

# 6. (Optional) Publish the patched jobops build for the orchestrator.
./scripts/build-jobops-tarball.sh
docker compose build jobops web orchestrator
docker compose up -d
```

That's the whole onboarding. After step 6, `/`, `/admin`, `/mcp/public`, and `/api/orchestrator/chat/*` are all live.

## Local dev (no Docker)

```bash
# Node services
npm ci
# build the workspace packages that apps depend on
npm run build -w @portfolio/shared -w @portfolio/crypto -w @portfolio/db

# Voice (Python)
cd apps/voice
uv sync
# (a second terminal) jobops source tree → dist
cd ../../open_source/jobops && npm run build

# (a third terminal) jobops HTTP
JOBOPS_PORT=7891 JOBOPS_AUTH_TOKEN=dev \
  node open_source/jobops/dist/cli.js start

# (a fourth terminal) voice
cd apps/voice && PORT=8200 ORCHESTRATOR_URL=http://127.0.0.1:8100 \
  uv run uvicorn voice_service.main:app --port 8200

# (a fifth terminal) orchestrator
cd apps/orchestrator
DATA_DIR=$PWD/../data ORCHESTRATOR_PORT=8100 \
  SESSION_SECRET=any PORTFOLIO_ENCRYPTION_KEY=$(openssl rand -base64 32) \
  JOBOPS_BASE_URL=http://127.0.0.1:7891 \
  JOBOPS_AUTH_TOKEN=dev \
  npx tsx src/server.ts

# (a sixth terminal) web
cd apps/web
DATA_DIR=$PWD/../../data SESSION_SECRET=any \
  PORTFOLIO_ENCRYPTION_KEY=any \
  npx next dev -p 3000

# Smoke tests
cd ../../
npx tsx scripts/smoke-phase2.ts
npx tsx scripts/smoke-phase4.ts
```

## Architecture

```
┌────────────┐  https://{site}  ┌────────────┐
│   Caddy    │ ───────────────► │    web     │  Next.js (App Router)
│  (TLS)     │  reverse_proxy   │  apps/web  │  classic template + admin + REST
└────────────┘                  └─────┬──────┘
       ▲                              │ reads
       │ /api/orchestrator/*           │ portfolio.db
       │                              │ (WAL)
       │                              ▼
       │                        ┌────────────┐
       │                        │  shared    │   packages/db (better-sqlite3 + WAL)
       │                        │ portfolio  │   packages/crypto (AES-256-GCM)
       │                        │    .db     │   packages/shared (template + settings)
       │                        └────────────┘
       │
       │ /voice-ws                  ▲ reads + writes
       │                              │
       │   ┌──────────────────┐       │ runTurn
       │   │  orchestrator    │ ──────┘ (LLM tool loop)
       │   │ apps/orchestrator│ ◄──── WS (Docker internal only) ────┐
       │   │ Express + MCP   │ ─── tools/list over HTTP/MCP         │
       │   │  client to jobops │                                    │
       │   └────┬─────────────┘                                     │
       │        │                                                    │
       │        │  /internal/voice (WS)  ────────►  ┌──────────┐     │
       │        │                                  │  voice   │ ◄───┘
       │        │                                  │ apps/voice│  (Pipecat-shaped)
       │        ▼                                  │  (Python) │
       │   browser ◄───── /voice-ws ──────►   │           │
       │   widget                            └──────────┘
       │
       │ /mcp*
       │
       │   ┌──────────┐
       └──►│  jobops  │   /mcp/public  (open, 2 public tools)
           │ (npm pkg)│   /mcp         (bearer-gated, full toolset)
           └──────────┘
```

### Public MCP surface

`{site.domain}/mcp/public` is the canonical recruiter-side AI endpoint.
Two read-only tools:

| Tool | Purpose |
| --- | --- |
| `get_career_packet` | Returns the operator's `career_packet` row (markdown + version + cv-hash). |
| `get_story_bank_public` | Returns STAR+R stories from `story_bank` — only `story_text`, `reflection`, `competency_tags`. No joins to `jobs`/`companies`, no application context, no timestamps. |

Everything else (`update_*`, `delete_*`, `import_*`, `purge_*`, `enrich_company`, `negotiation_brief`, `find_warm_intros`, etc.) lives behind the bearer-gated `/mcp` and is reachable only from the orchestrator and the admin dashboard. See [`docs/PUBLIC_MCP.md`](./docs/PUBLIC_MCP.md) for the full trust model and curl transcripts.

## Operations

### Backups

```bash
# Snapshot the DB (uses SQLite online-backup API; safe on a live DB).
DATA_DIR=/data sudo ./infra/scripts/backup.sh
#  -> /backups/portfolio-<ts>.tar.gz

# Restore (stops web + orchestrator, swaps the DB, restarts them).
DATA_DIR=/data sudo ./infra/scripts/restore.sh /backups/portfolio-<ts>.tar.gz
```

### Security headers

`infra/Caddyfile` sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer-when-downgrade`, `X-Frame-Options: DENY` at the edge, plus HSTS via Caddy's automatic HTTPS. The web app sets the same headers server-side as a defense-in-depth.

### Logs

Caddy logs the request line; the web app logs to stdout via `app.listen`'s `console.log` (visible via `docker compose logs web`). The orchestrator logs the same way. Voice uses `uvicorn` with default stdout logging.

### Updating

```bash
git pull
docker compose build --pull
docker compose up -d
# (Optional) re-run the demo seed to update the canned persona.
docker compose exec -T web npx tsx scripts/seed-demo.ts
```

`/admin/setup` is idempotent — re-running it updates the operator password and encryption-key acknowledgement. The encrypted settings persist because the encryption key is in `.env` and the database row format is stable.

## Testing

```bash
# Typecheck + lint + tests
npm run ci
# 33 vitest tests across 6 files
# 20 voice pytest tests in apps/voice

# Operational end-to-end smokes (require jobops source + a port)
./scripts/build-jobops-tarball.sh
npx tsx scripts/smoke-phase2.ts
npx tsx scripts/smoke-phase4.ts
```

## Architecture decision records

- **Why a monorepo** — every process that opens the same SQLite file (web, orchestrator) needs to share migrations, types, and crypto. npm workspaces + compiled `dist/` per package keeps the build incremental without a separate codegen step.
- **Why local SQLite, not Postgres** — the entire portfolio + chat + lead store fits in <1 MB even after years. A single `portfolio.db` file with WAL handles 4 OCPU on Ampere A1 comfortably. Postgres would be operationally more expensive than the whole problem deserves.
- **Why no `any`** — `tsconfig.base.json` sets `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, plus an ESLint config with `@typescript-eslint/no-explicit-any: error`. The MCP SDK is the only place `any` is used (typed-cast), and it's documented in code.
- **Why server-registered tool allow-list, not client-side filtering** — every public surface in this repo is enforced at the server's tool list, not the client's prompt. A hostile prompt that successfully tricked the LLM into emitting `{"name":"update_career_packet",...}` would still fail because the public mount doesn't know that tool exists. See `open_source/jobops/tests/public-mcp-surface.test.mjs` for the live proof.
- **Why MockSTT/MockTTS in Phase 3** — Pipecat + Whisper + Cartesia + Piper are recorded as Phase 5 polish per `PLAN.md §14 risk #2`. The harness uses pydantic interfaces so swapping in real adapters is mechanical. The orchestrator and the public-MCP surface are already wired; only the voice media path is left for the operator to enable when they're ready to bring CPU/disk for whisper.cpp or pay Deepgram.

## License

MIT — see [`LICENSE`](./LICENSE).
