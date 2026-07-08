# LivingCV

A self-hosted, open-source portfolio platform that doubles as an **AI recruiter concierge**. It renders a polished portfolio site from a database (runtime-editable, never build-time), lets recruiters chat with an AI agent that knows your real career data, and exposes a **public MCP endpoint** so third-party recruiter-side AI agents can query a curated, read-only view of you. It is **persona-neutral** — anyone can self-host it with their own content.

## What you get

- **A public website** rendered from the database — content, projects, case studies, custom sections, and theme are all editable at runtime, never baked in at build time.
- **A classic bundled template** (paper/ink/signal/rust); third parties can add templates against a typed props contract without touching core code (see [`TEMPLATES.md`](./TEMPLATES.md)).
- **Admin console** — first-boot setup wizard, `iron-session` auth, AES-256-GCM-encrypted secrets, and full CRUD for content, projects, case studies, blog posts, custom sections, and the resume PDF.
- **A writing/blog section** with an admin editor, published/draft states, tags, and per-post SEO.
- **Drag-and-drop section ordering** and a **live theme editor** (colors, typography, plus a JSON fallback for fine-grained CSS overrides).
- **A recruiter chat concierge** — a text agent powered by a self-hosted [jobops](https://www.npmjs.com/package/@mohith_das/jobops) instance plus a portfolio-side orchestrator. Multi-provider LLM (**Anthropic, OpenAI, Gemini, DeepSeek** — bring your own key), tool use over MCP, a work-email gate, per-IP/per-session/daily limits, transcripts, and an optional lead webhook.
- **Optional web search** — when a search provider (Tavily) is configured, the agent can search the web to answer with fresh context. Gated to verified recruiters only.
- **A public MCP endpoint** at `{site.domain}/mcp/public` exposing exactly two read-only tools (`get_career_packet`, `get_story_bank_public`) to external MCP clients (Claude.ai, ChatGPT, anything MCP). See [`docs/PUBLIC_MCP.md`](./docs/PUBLIC_MCP.md).
- **A full SEO layer** — dynamic per-domain metadata, OpenGraph/Twitter cards, generated OG images, JSON-LD (Person/WebSite/Article/BreadcrumbList), canonical URLs, `sitemap.xml`, `robots.txt`, a blog RSS feed, a web manifest, Google Analytics + search-engine verification hooks, and a machine-readable [`/llms.txt`](https://llmstxt.org).
- **Optional integrations** — Telegram and Google/email settings, plus an operator-only **master relay MCP** (`/mcp-admin`) for privileged access to your own data.
- **Cookieless analytics** (server-side path × day counter), **admin system logs**, a **leads CSV export**, and a **backup/restore** pair.
- **A demo seed** so a fresh clone renders a complete, clearly-fictional persona ("Alex Rivera") before you enter any real content.

> **Persona invariant:** nothing in `apps/` or `packages/` mentions the operator's real name or domain. All persona content lives in the database, the setup wizard, or `scripts/seed-demo.ts`. A stranger can deploy this for themselves purely via the setup wizard.

## Architecture

```
                          https://{site.domain}
┌─────────────────────────────────────────────────────────────┐
│ Caddy  (automatic HTTPS, security headers)                    │
│                                                               │
│   /                          ─────►  web:3000        (Next.js)│
│   /api/orchestrator/api/chat/*  ──►  orchestrator:8100 (chat) │
│   /mcp-admin/*               ─────►  orchestrator:8100 (ops)  │
│   /mcp*                      ─────►  jobops:7891  (MCP server)│
└─────────────────────────────────────────────────────────────┘
        │ web + orchestrator share one SQLite file (WAL)
        ▼
   portfolio.db   ◄── packages/db (better-sqlite3+WAL) · crypto (AES-256-GCM) · shared (types)

   orchestrator ──tools/list, tools/call──► jobops /mcp/public   (recruiter tier, no auth, 2 tools)
   master relay ──bearer──────────────────► jobops /mcp          (operator tier, full toolset)
```

- **web** (Next.js App Router) owns `portfolio.db` and serves the public site, admin console, and REST API.
- **orchestrator** (Express + MCP SDK) runs the single chat "brain" (`runTurn`): email gate → LLM tool loop → jobops `/mcp/public` + local read tools. Pre-gate, the agent has exactly one tool (`submit_work_email`); the recruiter tier can never reach a mutating jobops tool because those tools aren't registered on the public mount.
- **jobops** (npm package, run as its own container) owns its own database and serves both the open `/mcp/public` mount and the bearer-gated `/mcp`. This repo contains **no** jobops source — it's consumed as a dependency.

## Repo layout

```
LivingCV/
├─ apps/
│  ├─ web/            Next.js 16 (landing, admin, REST API, resume, sitemap, og, feed, llms.txt)
│  └─ orchestrator/   Express + @modelcontextprotocol/sdk (chat turn engine, email gate, search)
├─ packages/
│  ├─ db/             better-sqlite3 + WAL + migration runner (shared by web + orchestrator)
│  ├─ crypto/         AES-256-GCM with env-key + bootstrap-key fallback
│  └─ shared/         template props, setting keys, free-email-domains (no DB)
├─ scripts/           start (one-command launcher), seed-demo, set-password, smoke-phase2/4, build-jobops-tarball
├─ docs/              PUBLIC_MCP.md, case-study template
├─ infra/             Caddyfile, jobops/web/orchestrator Dockerfiles, backup/restore scripts
├─ apps/web/templates/classic/   the bundled template (data-driven)
└─ TEMPLATES.md       contract for adding new templates
```

## Quickstart — one command

You need **Docker** (with compose v2) and `openssl`. Then:

```bash
git clone https://github.com/mohith-das/LivingCV
cd LivingCV
./scripts/start.sh
```

That's it. The script asks once for a domain (leave blank to run locally on
`http://localhost`), auto-generates every secret, writes `.env`, builds and
starts the whole stack, and seeds a demo persona. When it finishes it prints
your URL.

The only thing left is the browser setup wizard it points you to
(`/admin/setup`): pick an admin password, acknowledge the encryption-key
backup, and paste your LLM API key (Anthropic / OpenAI / Gemini / DeepSeek).
Nothing else needs configuring on the box.

- **Local:** leave the domain blank → served over `http://localhost`.
- **Public deploy:** enter your domain (or run `DOMAIN=example.com ./scripts/start.sh`).
  With ports 80/443 open and DNS pointed at the box, Caddy fetches a Let's
  Encrypt cert automatically and serves HTTPS. Runs comfortably on an Oracle
  Ampere A1 free instance (arm64).

> The encryption key the script generates is the load-bearing secret — lose it
> and every encrypted value in `app_settings` is unrecoverable. Back up `.env`.

Re-running `./scripts/start.sh` is safe (idempotent): it keeps existing secrets,
rebuilds, and restarts.

### Manual setup (if you'd rather not use the script)

```bash
cp .env.example .env && $EDITOR .env   # set DOMAIN + SITE_ADDRESS, generate the 4 secrets
docker compose up -d
docker compose exec -T web npx tsx scripts/seed-demo.ts   # optional demo persona
```

## Local dev (no Docker)

Run the Node services directly against a local jobops:

```bash
npm ci
npm run build -w @livingcv/shared -w @livingcv/crypto -w @livingcv/db

# jobops HTTP (from the jobops source tree, built to dist/)
JOBOPS_PORT=7891 JOBOPS_AUTH_TOKEN=dev node <jobops>/dist/cli.js start

# orchestrator
cd apps/orchestrator
DATA_DIR=$PWD/../data ORCHESTRATOR_PORT=8100 \
  SESSION_SECRET=any PORTFOLIO_ENCRYPTION_KEY=$(openssl rand -base64 32) \
  JOBOPS_BASE_URL=http://127.0.0.1:7891 JOBOPS_AUTH_TOKEN=dev \
  npx tsx src/server.ts

# web (separate terminal)
cd apps/web
DATA_DIR=$PWD/../../data SESSION_SECRET=any PORTFOLIO_ENCRYPTION_KEY=any \
  npx next dev -p 3000
```

## Public MCP surface

`{site.domain}/mcp/public` is the canonical recruiter-side AI endpoint — open, unauthenticated, POST-only. Exactly two read-only tools:

| Tool | Purpose |
| --- | --- |
| `get_career_packet` | Returns the operator's `career_packet` (markdown + version + cv-hash). |
| `get_story_bank_public` | STAR+R stories from `story_bank` — only `story_text`, `reflection`, `competency_tags`. No joins, no application context, no timestamps. |

Everything else (`update_*`, `delete_*`, `import_*`, `enrich_company`, `negotiation_brief`, `find_warm_intros`, …) lives behind the bearer-gated `/mcp` and is reachable only from the orchestrator and the operator's own tooling. The guarantee is **server-side tool registration**, not prompting: a hostile prompt that tricks the LLM into emitting a private tool name still fails, because that tool doesn't exist on the public mount. See [`docs/PUBLIC_MCP.md`](./docs/PUBLIC_MCP.md).

## SEO

Every SEO artifact is generated at request time from your settings, so each self-hoster gets correct SEO for their own domain with zero code edits: `metadataBase` + per-page OpenGraph/Twitter tags, a generated OG image route, JSON-LD structured data, self-referential canonicals, `sitemap.xml` (home + projects + blog + resume, with `lastmod`), `robots.txt` (admin/API disallowed), a blog RSS feed at `/blog/feed.xml`, a web manifest, and optional Google Analytics + Google/Bing site-verification tags from the admin **SEO** settings.

## Operations

### Backups

```bash
# Snapshot the DB (SQLite online-backup API; safe on a live DB).
DATA_DIR=/data sudo ./infra/scripts/backup.sh        # -> /backups/portfolio-<ts>.tar.gz
# Restore (stops web + orchestrator, swaps the DB, restarts them).
DATA_DIR=/data sudo ./infra/scripts/restore.sh /backups/portfolio-<ts>.tar.gz
```

### Security headers

`infra/Caddyfile` sets `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `X-Frame-Options: DENY` at the edge, plus HSTS via Caddy's automatic HTTPS. Encrypted secrets never leave the server unmasked; the admin UI shows secrets as `••••last4`.

### Logs

Caddy logs the request line; web and orchestrator log to stdout (`docker compose logs web` / `orchestrator`). The admin console also has a **System Logs** viewer backed by a `system_logs` table.

### Updating

```bash
git pull
docker compose build --pull
docker compose up -d
```

`/admin/setup` is idempotent — re-running it updates the operator password and encryption-key acknowledgement. Encrypted settings persist because the key lives in `.env` and the row format is stable.

## Testing

```bash
npm run ci           # eslint + tsc (5 workspaces) + vitest
# 34 vitest tests across 6 files

# Operational end-to-end smokes (require the jobops source tree + a free port)
./scripts/build-jobops-tarball.sh
npx tsx scripts/smoke-phase2.ts
npx tsx scripts/smoke-phase4.ts
```

## Architecture decision records

- **Why a monorepo** — web and orchestrator open the same SQLite file, so they must share migrations, types, and crypto. npm workspaces with a compiled `dist/` per package keeps builds incremental.
- **Why local SQLite, not Postgres** — the whole portfolio + chat + lead store stays under a few MB. A single `portfolio.db` with WAL handles an Ampere A1 box comfortably; Postgres would cost more to operate than the problem deserves.
- **Why jobops as a dependency, never vendored** — jobops is installed from npm and run as its own container; this repo holds no jobops source. That keeps the public/private tool boundary owned by jobops's own tests and lets any self-hoster point at their own instance.
- **Why a server-registered tool allow-list, not client-side filtering** — the recruiter tier can only see tools that are *registered* on the public mount. Enforcing this at the server means no prompt-injection attack can reach a mutating tool, regardless of what it convinces the LLM to emit. A test asserts search is only wired post-gate, and that the pre-gate agent has exactly one tool.
- **Why text-only concierge** — the recruiter concierge is text/chat. A live voice pipeline needs real STT/TTS infrastructure (keys or local models) plus a browser+mic to verify end-to-end, so it is intentionally out of scope for the self-hostable core rather than shipped half-working.

## License

MIT — see [`LICENSE`](./LICENSE).
