# Security policy

> Drafted as part of Phase 5 hardening. Adjust contact info / disclosure
> window before tagging a public release.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest 0.x release | ✅ |
| Older 0.x.y | ❌ |

The repo follows `0.x.y` semver; every minor bump carries breaking
changes (this is a young project — we'll re-evaluate once 1.0 ships).

## Reporting a vulnerability

Please use GitHub's private security advisory flow:

1. Open the repo on GitHub → Security tab → "Advisories" → "New draft security advisory".
2. Describe the issue, including:
   - Reproduction steps.
   - Impact (data exposure, RCE, privilege escalation, …).
   - Affected versions.
   - Whether you've disclosed publicly yet.

We aim to acknowledge within 72 hours and ship a fix within 30 days for
high-severity issues, longer for moderate / low. Public disclosure is
coordinated with the reporter per GitHub's disclosure workflow.

## Security properties

The repo is built around a small set of structural guarantees that hold
independently of the application code:

- **The public MCP surface is server-registered to exactly two tools.**
  `open_source/jobops/src/mcp/define.ts` throws at module load if a tool
  declares both `publicSafe` and `mutates`. The closed public surface is
  verified live by `tests/public-mcp-surface.test.mjs` in the jobops repo
  and statically by `apps/orchestrator/tests/public-mcp.test.ts` here.

- **The orchestrator never holds an admin token.** Its MCP client connects
  only to `JOBOPS_BASE_URL/mcp/public`. A hostile prompt that successfully
  tricks the LLM into emitting a write tool call still fails because the
  public mount doesn't know that tool exists.

- **Encrypted values stay encrypted.** Anything in `app_settings` whose key
  is in `packages/shared/ENCRYPTED_SETTING_KEYS` is stored as
  `v1:<iv>:<tag>:<ciphertext>` and decrypted only in-process. The
  `PORTFOLIO_ENCRYPTION_KEY` is the root: losing it bricks every encrypted
  value. The setup wizard (and the README) make that loud.

- **No hardcoded persona.** `rg -i 'mohith|matt' apps/ packages/` returns
  nothing in committed source. The demo seed (`scripts/seed-demo.ts`)
  uses a fictional "Alex Rivera" — the operator's real content is entered
  through the admin UI.

- **Caddy reverse-proxies all public traffic.** The jobops container is
  not exposed to the public internet; it sits on the internal docker
  network. The orchestrator container is the same.

- **Admin auth is bcrypt + iron-session.** No OAuth, no user tables, no
  RBAC, no multi-tenancy (per `PLAN.md §2 inv 8`).

- **Webhook calls are fire-and-forget with a 5 s timeout.** A slow
  webhook target never blocks the chat turn.
