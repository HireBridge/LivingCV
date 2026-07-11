# Contributing

Thanks for considering a contribution. The repo is a working portfolio platform
aimed at self-hosters; most of what we need is operator polish, not feature
breadth. Read this end-to-end before opening a PR — it lists what we accept
and what we don't.

## Ground rules

- **No persona leakage.** The operator-facing sections of this repo must
  remain persona-neutral. No real names, no real domains, no resume facts.
  The persona invariant is checked by `npm run ci` (grep across `apps/`
  and `packages/`).
- **Backward compatibility for the on-disk DB schema.** A migration is
  required whenever you change a table. Look at `packages/db/migrations/`
  and `src/migrate.ts` for the conventions — numbered `.sql` files,
  idempotent, wrapped in a transaction inside `applyPendingMigrations`.
- **Encrypted values stay encrypted.** Anything in `app_settings` whose key
  is in `packages/shared/ENCRYPTED_SETTING_KEYS` must remain encrypted at
  rest. New encrypted keys must be added to that set + `SETTING_KEYS`.
- **The public MCP surface is closed by structure, not by prompt.** Every
  tool that is reachable from `/mcp/public` must have `publicSafe: true`
  AND `mutates: false` (this is enforced by `defineTool()` in
  `open_source/jobops/src/mcp/define.ts`). A new public tool means editing
  `open_source/jobops/tests/public-mcp-surface.test.mjs`.
- **The orchestrator never holds an admin token.** Its MCP client
  (`apps/orchestrator/src/mcpClient.ts`) connects only to
  `joBOPS_BASE_URL/mcp/public`. Don't add a bearer.

## Pull request checklist

- [ ] `npm run ci` is green (lint + typecheck + the full vitest suite).
- [ ] If you changed a tool, the matching jobops-side test in
      `open_source/jobops/tests/public-mcp-surface.test.mjs` is still green.
- [ ] If you added a tool to the public MCP surface, you updated
      `docs/PUBLIC_MCP.md` and the relevant `llms.txt` content.
- [ ] No real-persona strings (`Mohith`, `Matt Das`, `mattdas.dev`) in
      `apps/` or `packages/` source.
- [ ] No new comments narrating the change inline in committed code.
- [ ] The change is the smallest possible unit that fixes the problem.

## Development setup

Use Node 24 (`nvm use` — a `.nvmrc` at the repo root pins the version). The
repo's `better-sqlite3` native module is ABI-locked to the Node version it
was installed under; Node 25/26 breaks both the local orchestrator and the
test suite.

```bash
# Node services
npm ci
npm run build -w @livingcv/shared -w @livingcv/crypto -w @livingcv/db

# Jobops source — needed for the smoke tests
git clone <jobops-source> /tmp/jobops
(cd /tmp/jobops && npm run build)
```

The first-time jobops setup is non-trivial (it needs a `cv.md` + a
`profile.yml` to seed a packet). The smoke scripts in `scripts/` work
against the open-source repo's prebuilt `dist/` and don't require a
configured packet — the public-mount tools (`get_career_packet`,
`get_story_bank_public`) return whatever the operator has, including
an empty career packet for a brand-new install.

## Release process

1. Cut a `0.x.y` release in this repo.
2. Cut a `0.15.z` release of the jobops dependency first (the public MCP
   patch in `PLAN.md §5` is a hard prerequisite for the portfolio's
   `/mcp/public` route).
3. Bump `infra/jobops/Dockerfile` to the new jobops tag.

## Reporting a security issue

See [`SECURITY.md`](./SECURITY.md) for the disclosure process — report
privately via GitHub's security advisory flow, not a public issue.
