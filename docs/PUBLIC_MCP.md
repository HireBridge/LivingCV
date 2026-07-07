# Public MCP endpoint

The portfolio exposes a small, curated MCP surface for external recruiter-side
AI agents (Claude.ai connectors, ChatGPT custom MCP, OpenAI's MCP adapter, your
own agent, etc.). It is **always-open**, **read-only**, and **server-registered**
to list exactly two tools.

> **The public endpoint lives at `{site.domain}/mcp/public`.** That is the
> single URL you give to a client. The other jobops surface (`/mcp`) is bearer
> gated and is **not** reachable from the public internet.

This document is the operator-facing guide. If you are a recruiter trying to
read someone's career packet from your AI tool, jump to [§3](#3-quickstart).

## 1. What is exposed

Two tools, both mutates=`false`, both publicSafe=`true`, both server-registered
on the `jobops /mcp/public` mount (see `open_source/jobops/src/mcp/server.ts`):

| Tool | Purpose |
| --- | --- |
| `get_career_packet` | Returns the active career_packet row (markdown + version + cv-hash). One row per site, edited via `jobops`'s chat or `jobops init` in the source repo. |
| `get_story_bank_public` | Returns the STAR+R stories from `story_bank` — only `story_text`, `reflection`, and `competency_tags`. No joins to `jobs`/`companies`, no application context, no timestamps. Safe to surface to any external client. |

Both are read-only. The orchestrator's recruiter chat goes through a *different*
MCP mount (`/mcp` on the same jobops container) that is bearer-gated and
inaccessible from the public internet; that is where the agent does its work
on the operator's behalf. The public mount is the read-only curtain for
external agents.

## 2. What is **NOT** exposed

Everything else. The operator's jobops has ~50 tools; the public mount ships
the two above and **only** the two. In particular the following are not
reachable from the public internet, ever, regardless of how a hostile prompt
attempts to elicit them:

- Anything in the `update_*`, `delete_*`, `import_*`, `purge_*`, `add_*`,
  `apply_*`, `draft_*`, `edit_*`, `remove_*`, `restore_*`, `reseed_*`,
  `sync_*`, `extract_*`, `batch_*`, `generate_*`, `scan_*`, `render_*`,
  `scheduler_*`, `mark_*` families.
- `enrich_company`, `negotiation_brief`, `deep_research`, `daily_digest`,
  `cost_estimate`, `doctor`, `export_contacts`, `find_warm_intros`,
  `find_founders`, `list_trashed`, `get_top_jobs`, `get_tracker`,
  `get_outreach_queue`, `get_followups_due`, `visa_signal`, `get_report`,
  `evaluate_*`, `apply_prefill`.
- The full auth-gated `/mcp` mount (which lists the full toolset to a bearer
  holder). Caddy does not even proxy to it for unauthenticated clients — it
  requires a token.

The closed public surface is enforced **structurally**, not by prompt:

1. The `jobops` server is built so that `/mcp/public` is mounted with a tool
   list derived by `ALL_TOOLS.filter(t => t.publicSafe === true)`; no client
   can ask `/mcp/public` to list anything else.
2. `defineTool()` throws at module-load if a tool declares both `publicSafe`
   and `mutates`, so a misconfigured opt-in is impossible to ship.
3. The orchestrator's recruiter chat connects only to that public mount and
   never holds an admin token.

`open_source/jobops/tests/public-mcp-surface.test.mjs` enforces this on every
test run (live HTTP against the `/mcp/public` mount).

## 3. Quickstart

### Claude.ai

1. Open Settings → Connectors → Add custom connector.
2. Name it (e.g. "Portfolio career packet").
3. Set the URL to `https://{site.domain}/mcp/public` (no token).
4. Save. Claude will call `tools/list` and show the two tools.
5. In a chat, Claude can now call `get_career_packet` to summarize the
   candidate's background, or `get_story_bank_public` to surface STAR+R
   stories scoped to a competency tag (`competency` argument).

### ChatGPT (Plus/Pro/Edu with custom MCP)

1. Settings → Beta → Connectors → Add.
2. URL: `https://{site.domain}/mcp/public`.
3. No auth. ChatGPT can now list + call the same two tools.

### Any MCP client (curl)

A complete `tools/list` exchange:

```bash
$ curl -sS \
    -X POST \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
    https://example.com/mcp/public
{
  "result": {
    "tools": [
      { "name": "get_career_packet", "title": "Get the active career packet", ... },
      { "name": "get_story_bank_public", "title": "Public story bank (competencies only)", ... }
    ]
  },
  "jsonrpc": "2.0",
  "id": 1
}
```

A complete `tools/call get_career_packet` exchange:

```bash
$ curl -sS \
    -X POST \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
         "params":{"name":"get_career_packet","arguments":{}}}' \
    https://example.com/mcp/public
{
  "result": {
    "content": [{ "type": "text", "text": "## TL;DR\n..." }],
    "structuredContent": { "...": "..." }
  },
  "jsonrpc": "2.0",
  "id": 2
}
```

A complete `tools/call get_story_bank_public` exchange (with the optional
`competency` filter):

```bash
$ curl -sS \
    -X POST \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
         "params":{"name":"get_story_bank_public",
                   "arguments":{"competency":"leadership","limit":10}}}' \
    https://example.com/mcp/public
{
  "result": {
    "count": 3,
    "items": [
      {"story_text": "...", "reflection": "...", "competency_tags": ["leadership", "..."]},
      ...
    ]
  },
  "jsonrpc": "2.0",
  "id": 3
}
```

`get` and `delete` methods on the public mount return `405` (matches jobops's
existing `mountMcp` behavior — see `open_source/jobops/src/mcp/server.ts`).

## 4. Operator deployment notes

### Pinned version

`infra/jobops/Dockerfile` consumes `@mohith_das/jobops@^0.15.0`. The patched
release that ships the public mount was tagged at `0.15.0`. Two build paths:

- **Default** — pull from npm: `npm install -g @mohith_das/jobops@^0.15.0`.
- **Local tarball** — if you have a fork or are mid-publish, run
  `./scripts/build-jobops-tarball.sh` from the portfolio root. The script
  rebuilds jobops and writes `infra/jobops/jobops-local.tgz`, which the
  Dockerfile consumes when present.

### Caddy path

`infra/Caddyfile` proxies `handle /mcp* { reverse_proxy jobops:7891 }`. That
proxies the full `/mcp` path tree to jobops. Two routes are served by
jobops on that prefix:

- `/mcp/public` — open, the 2 public tools.
- `/mcp` — bearer-gated, the full 51-tool surface. Caddy does not add a
  token, so only clients that present their own bearer reach it (the
  orchestrator and the admin dashboard).

External clients should be configured with `{site.domain}/mcp/public`.
Documentation on the public site (footer, `/llms.txt`) uses the same
canonical path.

### Verifying your deployment

After `docker compose up`:

```bash
# 1. Should list exactly 2 tools, no auth required.
curl -sS -X POST -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
    https://example.com/mcp/public | jq '.result.tools[].name'

# 2. Without a token, /mcp should 401 (the bearer gate still works).
curl -sS -o /dev/null -w '%{http_code}\n' \
    -X POST -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
    https://example.com/mcp
# -> 401
```

### Trust model

External agents can read `get_career_packet` (the canonical bio + projects
+ skills) and `get_story_bank_public` (the operator-curated STAR+R stories).
That is the **entire** information flow. They cannot write, mutate, or
read any other state from jobops. The same surface is what powers the
portfolio's chat widget, so external agents and your own concierge are
working from the same source of truth.

For a recruiter-side AI agent, this is the right shape: it can answer
"tell me about the candidate's projects" or "what leadership stories do
they have" without exposing negotiation posture, contacts, job-search
internals, or anything else the operator would reasonably want to keep
between themselves and jobops.

## 5. Troubleshooting

- **Tools/list returns 401** — you're hitting `/mcp` (the auth-gated
  mount), not `/mcp/public`. Caddy is correct; fix the client URL.
- **Tools/list returns 0 tools** — you may be on a jobops version earlier
  than 0.15.0. Update the image (`infra/jobops/Dockerfile` pins
  `^0.15.0`) or rebuild the local tarball.
- **Empty `competency_tags` on stories** — the operator hasn't seeded
  stories. Have them run `jobops init` or add a few via the dashboard.
- **Cloudflare 404 / no-routes-yet** — make sure Caddy is running and
  DNS points at the host. The docker-compose stack boots Caddy as the
  entrypoint; port 80/443 must be reachable.
