# LivingCV

A self-hosted, open-source portfolio platform that doubles as an **AI recruiter concierge**. It renders a polished portfolio site from a database (runtime-editable, never build-time), lets recruiters chat with an AI agent that knows your real career data, and exposes a **public MCP endpoint** so third-party recruiter-side AI agents can query a curated, read-only view of you. It is **persona-neutral** — anyone can self-host it with their own content.

Deploy on any Linux VM with Docker in one command:

```bash
git clone https://github.com/HireBridge/LivingCV && cd LivingCV && ./scripts/start.sh
```

See [Quickstart](#quickstart--one-command) for what it does and [Where to host it](#where-to-host-it) for VM options (there's a genuinely free one).

## What you get

- **A public website** rendered from the database — content, projects, case studies, custom sections, and theme are all editable at runtime, never baked in at build time.
- **A classic bundled template** (paper/ink/signal/rust); third parties can add templates against a typed props contract without touching core code (see [`TEMPLATES.md`](./TEMPLATES.md)).
- **Admin console** — first-boot setup wizard, `iron-session` auth, AES-256-GCM-encrypted secrets, and full CRUD for content, projects, case studies, blog posts, custom sections, and the resume PDF.
- **A writing/blog section** with an admin editor, published/draft states, tags, and per-post SEO.
- **Drag-and-drop section ordering** and a **live theme editor** (colors, typography, plus a JSON fallback for fine-grained CSS overrides) with a **custom theme library** — name and save your own themes, then apply, edit, or delete them alongside the four built-in presets.
- **A recruiter chat concierge** — a text agent powered by a self-hosted [jobops](https://www.npmjs.com/package/@mohith_das/jobops) instance plus a portfolio-side orchestrator. Multi-provider LLM (**Anthropic, OpenAI, Gemini, DeepSeek** — bring your own key), tool use over MCP, a work-email gate, per-IP/per-session/daily limits, transcripts, and an optional lead webhook.
- **Optional web search** — when a search provider (Tavily) is configured, the agent can search the web to answer with fresh context. Gated to verified recruiters only.
- **A public MCP endpoint** at `{site.domain}/mcp/public` exposing exactly three read-only tools (`get_career_packet`, `get_career_packet_json`, `get_story_bank_public`) to external MCP clients (Claude.ai, ChatGPT, anything MCP). See [`docs/PUBLIC_MCP.md`](./docs/PUBLIC_MCP.md).
- **A full SEO layer** — dynamic per-domain metadata, OpenGraph/Twitter cards, generated OG images, JSON-LD (Person/WebSite/Article/BreadcrumbList), canonical URLs, `sitemap.xml`, `robots.txt`, a blog RSS feed, a web manifest, Google Analytics + search-engine verification hooks, and a machine-readable [`/llms.txt`](https://llmstxt.org).
- **Optional integrations** — Telegram and Google/email settings, plus an operator-only **master relay MCP** (`/mcp-admin`) for privileged access to your own data — including blog tools (`publish_blog_post`, `update_blog_post`, `list_blog_posts`) so an MCP client like Claude Desktop can write and edit posts directly.
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

orchestrator ──tools/list, tools/call──► jobops /mcp/public   (recruiter tier, no auth, 3 tools)
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
├─ scripts/           start (launcher), update (in-place updater), seed-demo, set-password, smoke-phase2/4
├─ docs/              PUBLIC_MCP.md, case-study template
├─ infra/             Caddyfile, jobops/web/orchestrator Dockerfiles, backup/restore scripts
├─ apps/web/templates/classic/   the bundled template (data-driven)
└─ TEMPLATES.md       contract for adding new templates
```

## Quickstart — one command

You need **Docker** (with compose v2) and `openssl`. Then:

```bash
git clone https://github.com/HireBridge/LivingCV
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

## Where to host it

This is a **stateful, single-VM docker-compose stack** — four small containers
sharing local SQLite files on a persistent volume. It wants a plain Linux VM
with Docker, not a serverless/PaaS platform.

**Resource footprint** (measured, idle):

| Container | RAM |
| --- | --- |
| web (Next.js) | ~90 MB |
| orchestrator | ~130 MB |
| jobops | ~145 MB |
| caddy | ~15 MB |
| **Total** | **~380 MB idle** (~0.6–1 GB under light traffic) |

The one memory spike is building the web image on-box (Next.js build peaks
~1.5 GB). Images total ~4 GB, so plan ~15–20 GB of disk.

**Minimum:** 2 GB RAM, 1–2 vCPU, ~20 GB disk. (1 GB runs it, but add swap or the
on-box image build can OOM.) The images build natively on both x86-64 and arm64,
so any common VM works.

**Cheapest options, best first:**

1. **Oracle Cloud Always Free — Ampere A1 (arm64): $0, forever.** Up to 4 cores /
   24 GB RAM / 200 GB free — wildly over-spec for this, and the intended target.
   Oracle's signup is fussy and A1 capacity varies by region, but it's genuinely
   free.
2. **Hetzner CAX11 (arm) / CX22 (x86): ~€4/mo** — 2 vCPU / 4 GB / 40 GB. The
   cheapest reliable paid VPS.
3. **DigitalOcean / Vultr / Linode: $6/mo** (1 GB, add swap) or **$12/mo** (2 GB,
   comfortable).

**A note on Heroku / Render / Railway and similar PaaS:** they're a poor fit.
Their dyno/container filesystems are **ephemeral** (wiped on every deploy/restart),
which would destroy the SQLite data this app relies on, and their one-process-per-app
model doesn't map to a multi-container compose stack with an internal network.
Running here would mean rewriting the data layer onto a managed Postgres and
splitting the services into separate apps — not worth it. Use a VM.

> LLM and search API usage is billed separately through your own key — that's not
> a hosting cost.

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

`{site.domain}/mcp/public` is the canonical recruiter-side AI endpoint — open, unauthenticated, POST-only. Exactly three read-only tools:

| Tool | Purpose |
| --- | --- |
| `get_career_packet` | Returns the operator's `career_packet` (markdown + version + cv-hash). |
| `get_career_packet_json` | Returns the compiled canonical `career-packet.json` — JSON Resume superset with Lightcast Open Skills IDs and verifiable provenance claims. |
| `get_story_bank_public` | STAR+R stories from `story_bank` — only `story_text`, `reflection`, `competency_tags`. No joins, no application context, no timestamps. |

Everything else (`update_*`, `delete_*`, `import_*`, `enrich_company`, `negotiation_brief`, `find_warm_intros`, …) lives behind the bearer-gated `/mcp` and is reachable only from the orchestrator and the operator's own tooling. The guarantee is **server-side tool registration**, not prompting: a hostile prompt that tricks the LLM into emitting a private tool name still fails, because that tool doesn't exist on the public mount. See [`docs/PUBLIC_MCP.md`](./docs/PUBLIC_MCP.md).

## HireBridge federation

HireBridge is a federated talent network that makes your portfolio discoverable to
third-party recruiters. When connected, your site can receive signed introduction
requests from HireBridge's outbox and have them appear in your jobops contacts.

### Connecting (device auth)

1. Set your **Admin email** in Admin > Settings > General.
2. Go to Admin > Settings > **MCP** and scroll to the HireBridge section.
3. Enter the **HireBridge API URL** (the HireBridge instance you want to join).
4. Click **Connect to HireBridge**. The page calls HireBridge's
   `POST /auth/device` (announcing this site) and `POST /auth/request` (which
   emails the admin a magic link). When you click the magic link on
   HireBridge's side, the page polls `POST /api/hirebridge/poll` (a wrapper
   around `POST /auth/token`) until it succeeds, then persists the
   `access_token`, `intro_secret` (= `hirebridge.token`), `node_id`, and the
   derived `client_id`.

The **Client ID** is **derived**, not entered: it is the first 32 hex chars of
`sha256(lowercase(trim(admin_email)))` — identical to what jobops derives from
its HireBridge email. **The admin email must match across this site and jobops**
for introductions to land in your inbox. jobops is being fixed in parallel;
see `plans_fixes_federation_interop.md`.

### Receiving introductions

The inbox endpoint at `POST /api/inbox` is a public, server-to-server endpoint
that receives introduction requests from HireBridge. Each request carries an
`X-HireBridge-Signature` header — an HMAC-SHA256 hex digest of the JSON body,
signed with the per-node `intro_secret` HireBridge returned at token time. We
store that secret in `hirebridge.token`, so the existing verification code
works unchanged.

When a valid introduction arrives:
- The signature is verified with timing-safe comparison.
- The `candidate_id` in the payload is checked against the derived Client ID
  to prevent cross-portfolio delivery.
- The recruiter's identity is pushed to your jobops instance via `add_contacts`
  (best-effort — inbox delivery succeeds even if the local sync fails).

The inbox is **not gated by the admin session** — it is protected solely by the
HMAC shared secret, so no login state needs to exist between HireBridge and your
instance. **The site must be publicly reachable** for HireBridge to POST to
`/api/inbox`; behind a private LAN, deliveries will silently fail.

### Discovery (forward-looking)

Your portfolio self-describes at `GET /.well-known/portfolio`, which returns the
domain, site title, all public endpoints (`/mcp/public`, `/career-packet.json`,
`/resume`, etc.), and the current HireBridge connection flag. HireBridge does
not yet consume this document — the device-auth flow above and the
outbox-signed delivery are the real paths. Treat `/.well-known/portfolio` as
forward-looking discovery metadata.

### Disconnecting

Click **Disconnect** in the MCP settings tab, which clears all HireBridge
settings (`access_token`, `token`/intro_secret, `node_id`, derived `client_id`,
connection flag, and any pending device-auth state). The operation is immediate
locally — there is no handshake with HireBridge to revoke, so the remote side
may retain stale state until its own TTL expires.

## SEO

Every SEO artifact is generated at request time from your settings, so each self-hoster gets correct SEO for their own domain with zero code edits: `metadataBase` + per-page OpenGraph/Twitter tags, a generated OG image route, JSON-LD structured data, self-referential canonicals, `sitemap.xml` (home + projects + blog + resume, with `lastmod`), `robots.txt` (admin/API disallowed), a blog RSS feed at `/blog/feed.xml`, a web manifest, and optional Google Analytics + Google/Bing site-verification tags from the admin **SEO** settings.

## Operations

### Backups

```bash
# Snapshot the DB from the Docker volume (safe on a live DB in WAL mode).
./infra/scripts/backup.sh          # -> ./backups/portfolio-<ts>.tar.gz
# Restore (stops web + orchestrator, replaces the DB, restarts them).
./infra/scripts/restore.sh ./backups/portfolio-<ts>.tar.gz
```

### Security headers

`infra/Caddyfile` sets `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `X-Frame-Options: DENY` at the edge, plus HSTS via Caddy's automatic HTTPS. Encrypted secrets never leave the server unmasked; the admin UI shows secrets as `••••last4`.

### Logs

Caddy logs the request line; web and orchestrator log to stdout (`docker compose logs web` / `orchestrator`). The admin console also has a **System Logs** viewer backed by a `system_logs` table.

### Updating

One command, on the server, pulls the latest and rebuilds **without touching your data**:

```bash
cd /path/to/LivingCV
./scripts/update.sh            # checks for updates, then applies after a prompt
./scripts/update.sh --check    # only report whether updates are available
./scripts/update.sh --yes      # apply without prompting (for cron/automation)
```

It git-pulls the branch you deployed, rebuilds changed images, and restarts —
your SQLite databases (Docker named volumes), `.env` secrets, and all content
are preserved. New database migrations apply automatically on restart (they're
additive). It refuses to run if you have uncommitted local edits, and takes a
best-effort DB backup first.

The admin console also has **Settings → Updates**, which checks your running
version against the upstream repo on GitHub and tells you if you're behind (and
by how many commits). It intentionally does **not** apply updates from the
browser — the web app runs in a container and can't safely rebuild the host
stack — so it points you to `./scripts/update.sh` on the server. You can retarget
the upstream repo/branch there too (useful if you run your own fork).

### Deploying your own fork (auto-deploy via GitHub Actions)

Don't wire your own deploy secrets directly into `HireBridge/LivingCV` — it's
a shared, public repo, and anyone who ever gets write access there would be
able to trigger a deploy to *your* server. Instead, fork it to your own
account and put your deploy secrets on **your fork** only. There are two ways
to set this up:

**One command**, from your own machine (needs [`gh`](https://cli.github.com)
authenticated and working SSH access to your server already set up):

```bash
./scripts/setup-deploy-fork.sh your-server.example.com ubuntu
```

This forks the repo to your account, adds the `deploy.yml` workflow (upstream
deliberately doesn't ship it — it's specific to one operator's server and
shouldn't live on a shared repo), generates a fresh SSH deploy key and
installs it on your server, sets `DEPLOY_HOST` / `DEPLOY_USER` /
`DEPLOY_SSH_KEY` as secrets on your fork, and clones your fork onto the
server (or repoints an existing `~/LivingCV` checkout's `origin` at it, if
you already ran the plain Quickstart there). It'll prompt you for one thing
it can't automate — see below. Run `PRIVATE_FORK=1 ./scripts/setup-deploy-fork.sh
...` instead if you want your fork private (nothing sensitive is actually in
the repo's code, but it's your call); that also sets up a read-only GitHub
deploy key so the server can still pull it.

**Or by hand**, if you'd rather see every step: fork on GitHub, copy
[`scripts/deploy.yml.template`](./scripts/deploy.yml.template) to
`.github/workflows/deploy.yml` on your fork and push it, generate an SSH
keypair for deploys, add the public half to your server's
`~/.ssh/authorized_keys`, and set `DEPLOY_HOST` / `DEPLOY_USER` /
`DEPLOY_SSH_KEY` as secrets on your fork (`gh secret set NAME --repo
you/LivingCV`).

Either way, one manual step is unavoidable: **GHCR image pushes from a fork
need a personal access token.** GitHub hard-restricts the default Actions
token to read-only on any forked repo — no setting overrides it — so your
fork's `build.yml` can't push container images without one. Create a
classic PAT at [github.com/settings/tokens/new](https://github.com/settings/tokens/new)
with only the `write:packages` scope checked, then:

```bash
gh secret set GHCR_PAT --repo you/LivingCV
```

Settings → Updates already defaults to comparing against `HireBridge/LivingCV`,
so the admin panel will show you when you're behind without any extra config.

### Staying in sync with upstream

Once your fork is deployed, from your fork:

```bash
./scripts/sync-upstream.sh       # pull the latest from HireBridge/LivingCV into your fork
./scripts/sync-and-deploy.sh     # same, and wait for it to build + deploy to your server
```

Both fast-forward only — if your fork has diverged from upstream, they'll
tell you to reconcile manually instead of guessing.

> **Note:** `.github/workflows/deploy.yml` is materialized once onto your
> fork by `setup-deploy-fork.sh` and isn't touched by `sync-upstream.sh` —
> upstream only carries the inert `scripts/deploy.yml.template`, on a
> different path, so a merge has no way to patch your already-copied
> workflow file. If upstream fixes something in the deploy template, you
> won't get it automatically; diff your `deploy.yml` against the current
> [`scripts/deploy.yml.template`](./scripts/deploy.yml.template) occasionally
> and re-copy it by hand if it's changed.

`/admin/setup` is idempotent — re-running it updates the operator password and encryption-key acknowledgement. Encrypted settings persist because the key lives in `.env` and the row format is stable.

## Testing

```bash
npm run ci           # eslint + tsc (5 workspaces) + vitest
# 131 vitest tests across 17 files

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
