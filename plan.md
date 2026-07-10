# LivingCV Code Audit — Round 3 Action Plan

Audit date: 2026-07-10. Scope: commits `b244c33..f3bdd91` (the 5 commits after
`cc8b435`: orchestrator resilience, hero diagram, section labels, footer
decouple, image/video embeds + theme presets). The Round 2 plan that previously
lived in this file is fully implemented (commits `8872dad..a5367c4`).

**Headline finding: CI is red at HEAD.** `npm run typecheck` fails with 3
errors and `npm run lint` fails with 4 errors, all introduced in `f3bdd91`.
Because the Deploy workflow only runs after CI succeeds, **nothing since
`f3bdd91` has deployed** — production is running older code. Task 1 unblocks
deploys; do it first.

Rules for the implementing agent:

- Work on a branch (e.g. `fix/audit-round-3`), NOT directly on `main`.
  A green CI on `main` auto-triggers deploy to the production box — the
  operator wants to review before that happens.
- Run everything under **Node 24** (`nvm use 24`). The repo's better-sqlite3
  native module is built for Node 24; under Node 26 every DB test fails with
  `NODE_MODULE_VERSION` mismatch (that mismatch is also what filled
  `apps/orchestrator/crash.log`).
- After each task run `npm run ci` and keep it green.
- Do not modify anything under `infra/jobops/` and do not touch port 7891
  config. Do not write to any production database.

---

## Task 1 — Fix the CI blockers (typecheck + lint) [P0]

All in `apps/web`:

1. `src/app/admin/components/ImageUploader.tsx:14-15` — TS2769: `e.target.files[0]`
   is `File | undefined` and is passed to `formData.append`. Fix:

   ```ts
   const file = e.target.files?.[0];
   if (!file) return;
   ```

   Also lint: the `catch (err)` at line 28 has an unused binding — use bare
   `catch {`.

2. `src/app/admin/content/ThemeTab.tsx:116` — TS2790: `delete newObj.customCss`
   on a non-optional inferred property. Annotate the object so keys are
   optional: `const newObj: Record<string, string> = { ...themeObj, customCss: value, preset: 'custom' };`
   Also lint at line 29: replace `any` (type `PRESET_DATA` as
   `Record<string, Record<string, string>>` or `Record<string, ThemeProps>`).

3. `src/templates/classic/styles.ts:10` — TS2739: `THEME_VAR` is typed
   `Record<keyof ThemeProps, string>` but `ThemeProps` gained `preset` and
   `customCss`, which are not CSS vars. Change the type to
   `Record<ThemeKey, string>` (import `ThemeKey`, already exported from
   `@livingcv/shared`) and adjust `themeOverrides()` to iterate
   `Object.keys(THEME_VAR) as ThemeKey[]`. The `key !== 'customCss'` guard at
   line 302 becomes dead — remove it. Keep the
   `+ (theme.customCss ? ... : '')` tail: that's the feature.

4. `src/app/api/admin/content/save/route.ts:139` — lint `no-explicit-any`:
   type `labels` as `Record<string, { kicker?: string; title?: string; navLabel?: string }>`.

5. `src/app/api/admin/upload/route.ts:21` — lint unused `e`. The whole
   `try/catch` around `mkdir(..., { recursive: true })` is redundant
   (recursive mkdir doesn't throw on existing dirs) — drop the try/catch.
   (This file gets rewritten in Task 2 anyway; just make sure the final
   version is lint-clean.)

6. `apps/web/next-env.d.ts` — was committed with the `next dev` variant
   (`import "./.next/dev/types/routes.d.ts"`). In a clean checkout/CI there is
   no `.next/dev`, so typecheck breaks. Revert to the build variant:
   `import "./.next/types/routes.d.ts";`

**Acceptance:** `npm run ci` passes under Node 24 from a clean checkout
(`npm run build -w @livingcv/shared -w @livingcv/crypto -w @livingcv/db` first,
as CI does).

## Task 2 — Make image uploads actually work in production [P0]

`src/app/api/admin/upload/route.ts` writes to `process.cwd()/public/uploads`.
Two fatal problems in the Docker deployment:

- `next start` only serves `public/` assets that existed **at build time**;
  files written at runtime 404.
- The web container's only volume is `portfolio-data:/data/db`; uploads land
  on the container FS and are destroyed on every redeploy.

Follow the existing resume pattern (`src/app/api/admin/resume/route.ts` +
`src/lib/resume.ts`), which streams to `DATA_DIR`:

1. **POST `/api/admin/upload`** (rewrite):
   - Validate: reject unless `file.type` starts with `image/`; reject
     `image/svg+xml` (script-capable); cap size at 8 MB. Return
     `{ success: false, error }` with 400 on violations.
   - Filename: `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`.
   - Stream to `<DATA_DIR>/uploads/<filename>` with
     `Readable.fromWeb(file.stream())` piped to a write stream — do NOT
     buffer the whole file with `arrayBuffer()` (1 GB RAM box).
   - Respond `{ success: true, url: "/uploads/<filename>" }` (URL shape
     unchanged, so `ImageUploader.tsx` keeps working).
2. **New GET route** `src/app/uploads/[name]/route.ts`:
   - Reject names containing `/` or `..`; look up in `<DATA_DIR>/uploads`.
   - Content-Type from an extension whitelist (png, jpg/jpeg, webp, gif, avif);
     404 anything else.
   - Stream the file; set `Cache-Control: public, max-age=31536000, immutable`
     (filenames are timestamped, safe to cache forever).
3. Add `apps/web/public/uploads/` to `.gitignore` so local-dev uploads never
   get committed.

Use the same `DATA_DIR` resolution `src/lib/resume.ts` uses so dev and Docker
both work.

**Acceptance:** with the compose stack up, upload an image in
Admin → Content → Custom sections; the returned URL renders; `docker compose
down && up -d` and the URL still renders.

## Task 3 — Unblock video embeds in the CSP [P0 for the feature]

`f3bdd91` styles `.prose iframe` for video embeds, but the Caddyfile CSP
(`infra/Caddyfile`) has `default-src 'self'` and no `frame-src`, so browsers
refuse to load YouTube/Vimeo iframes in production. Add to the CSP header:

```
frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com;
```

Leave the rest of the CSP untouched.

**Acceptance:** a blog post containing a `youtube-nocookie.com` iframe renders
the player through Caddy (test with the compose stack, `SITE_ADDRESS=:80`).

## Task 4 — Remove committed junk and credential-bearing scripts [P1]

Delete from git (they are debugging leftovers):

- `apps/orchestrator/crash.log` — 694 lines of local stack traces.
- `apps/orchestrator/run.sh` — while-true respawn loop with a hardcoded
  macOS path (`/Users/mohithdas/.nvm/...`); Docker `restart: unless-stopped`
  already owns restarts in production.
- `scripts/test-login.ts`, `scripts/test-bcrypt.ts` — contain the literal
  password `password123` and a real bcrypt hash.
- `scripts/reset-pwd.ts`, `scripts/setup-local.ts` — silently reset the admin
  password to `password123` if ever executed against a real DB.

These were local testing-only scripts (confirmed with the operator) — delete
outright, no need to preserve or sanitize any of them.

Add `crash.log` to `.gitignore`.

**Manual note for the operator (not automatable):** if `password123` or the
committed bcrypt hash was ever the real admin password, rotate it — the hash
is now in public git history.

## Task 5 — Fix the orchestrator crash-handler regression [P1]

`apps/orchestrator/src/server.ts` (from `b244c33`):

1. `process.on('unhandledRejection', ... process.exit(1))` makes the server
   **less** resilient: a transient rejection (e.g. an SSE write after a client
   disconnect) now kills the process, dropping every in-memory MCP session
   (`transports` map in `masterMcp.ts`) and causing the exact "Session not
   found" failures the commit was meant to fix. Change `unhandledRejection`
   to **log and continue**. Keep exit-on-`uncaughtException` (state is
   unknowable there; Docker restarts the container).
2. `fs.appendFileSync('crash.log', ...)` writes to CWD — that's how the file
   in Task 4 was born; in the container it writes to the ephemeral image FS.
   Log to stderr only (Docker captures it), or to `<DATA_DIR>/crash.log` if a
   file is wanted.
3. Remove the `console.log = console.error` (etc.) monkey-patching. This is an
   HTTP server, not a stdio MCP transport — stdout is not a protocol channel,
   and the patching just makes log levels lie.

Keep the try/catch added around `handlePostMessage` in `masterMcp.ts` — that
part is correct.

**Acceptance:** orchestrator vitest suite passes; `npm run health` behavior
unchanged (`MCP_URL`/`MCP_MASTER_KEY` envs still honored).

## Task 6 — Custom sections: kicker hides title [P2]

`apps/web/src/templates/classic/ClassicTemplate.tsx` (~line 68):

```tsx
{custom.kicker && <p className="section-kicker">{custom.kicker}</p>}
{custom.title && !custom.kicker && <h2 className="section-title">{custom.title}</h2>}
```

Setting a kicker suppresses the title — built-in sections render both. Render
both: kicker as the `<p>`, title as the `<h2>`, each conditional only on
itself.

## Task 7 — Escape `</style>` in customCss injection [P2]

`themeOverrides()` (`apps/web/src/templates/classic/styles.ts`) appends
`theme.customCss` raw into an inline `<style>` block. A value containing
`</style><script>...` breaks out of the tag. It's admin-only input, but
site_content is also writable via the MCP SQL tool, so harden it:

```ts
theme.customCss.replace(/<\//g, '<\\/')
```

(`<\/` is valid CSS string escaping and inert inside a style tag.)

## Task 8 — Pin the Node version for humans and agents [P2]

Add a `.nvmrc` containing `24` at the repo root, and tighten root
`package.json` engines to `">=20 <25"` (better-sqlite3 is ABI-locked to the
Node version it was installed under; Node 26 broke both the local orchestrator
and the test suite this week). Mention `nvm use` in CONTRIBUTING.md's setup
section.

## Task 9 — Clean up the plan.md / PLAN.md confusion [P2]

`plan.md` (this file, lowercase) is the **only** planning document and is the
single source of truth — it is tracked in git and has been for several
rounds of fixes (commit messages already reference "plan.md Task N").

`.gitignore` also has a line for `PLAN.md` (uppercase), inherited from an
older convention of keeping a separate untracked planning doc out of the
public repo. On a case-insensitive filesystem (default macOS/Windows) `PLAN.md`
and `plan.md` are literally the same inode — there is no second file, and the
gitignore rule is dead (it cannot untrack a file already tracked under the
other case). On a case-sensitive filesystem (most CI/Linux runners) it would
silently do nothing to `plan.md` either way, since gitignore doesn't affect
already-tracked files.

Fix: remove the `PLAN.md` line from `.gitignore` (the `REMEDIATION.md`,
`VOICE.md`, `AUDIT_AND_SEO_PLAN.md` lines refer to genuinely separate,
never-tracked files and can stay). Do not create any new `PLAN.md` file —
all planning content lives in `plan.md` going forward, and this file should
be updated/replaced (not duplicated) by future audit rounds.

---

## Verification checklist (run at the end, Node 24)

1. `npm run build -w @livingcv/shared -w @livingcv/crypto -w @livingcv/db`
2. `npm run ci` — lint, typecheck, 73 tests: all green.
3. `docker compose build web orchestrator` succeeds (proves `next build`
   passes with the type fixes).
4. Manual smoke via compose: admin login → upload image → URL serves →
   `docker compose restart web` → URL still serves.
5. `git ls-files | grep -E "crash.log|run.sh|test-login|test-bcrypt|reset-pwd|setup-local"`
   returns nothing.

---

## Execution report

Date executed: 2026-07-10. Branch: `fix/audit-round-3` (off `main`). Node:
v24.12.0 (PATH-forced to nvm's bin ahead of Homebrew's `/opt/homebrew/bin`
because `nvm use 24` alone does not re-prepend PATH on this Mac). All
commits are local; not pushed. Per-task commits below.

### Task 1 — Fix the CI blockers (typecheck + lint)
**Status:** Done.
**Verified:** `npm run build -w @livingcv/shared -w @livingcv/crypto -w @livingcv/db` (clean); `npm run ci` (lint ✓, typecheck ✓, 73 vitest tests ✓).
**Changes:** `apps/web/src/app/admin/components/ImageUploader.tsx` (narrowed `files?.[0]`, replaced `catch (err)` with bare `catch`); `apps/web/src/app/admin/content/ThemeTab.tsx` (`PRESET_DATA: Record<string, Record<string, string>>`, `useState<Record<string, string | undefined>>`, annotated `newObj` in `handleCssChange`); `apps/web/src/templates/classic/styles.ts` (`THEME_VAR: Record<ThemeKey, string>`, iterate `Object.keys(THEME_VAR) as ThemeKey[]`, removed now-dead `key !== 'customCss'` guard); `apps/web/src/app/api/admin/content/save/route.ts` (`labels: Record<string, { kicker?: string; title?: string; navLabel?: string }>`); `apps/web/src/app/api/admin/upload/route.ts` (dropped redundant try/catch around `mkdir({recursive:true})` — superseded by the Task 2 rewrite); `apps/web/next-env.d.ts` (reverted from dev variant to build variant).
**Deviations:** the plan's suggested `Record<string, string>` annotation for `newObj` would not actually make `delete newObj.customCss` legal in TS (the keys would still be required under `Record<string, string>`). Used `Record<string, string | undefined>` and widened the matching `useState` type to keep `setThemeObj` happy. All `themeObj[key]` reads in the file already use `||` fallbacks, so the type widening is safe.

### Task 2 — Make image uploads actually work in production
**Status:** Done.
**Verified:** `npm run ci` (lint ✓, typecheck ✓, 73 tests ✓). End-to-end smoke (live upload + `docker compose down && up -d`) requires a running Docker daemon; deferred to operator.
**Changes:** new `apps/web/src/lib/uploads.ts` mirroring the `resume.ts` pattern (`getUploadsDir`, `getUploadPath`, `mimeForFilename`, `saveUploadStream`); rewrote `apps/web/src/app/api/admin/upload/route.ts` (validates `image/*` + rejects `image/svg+xml` + 8 MB cap; filename `${Date.now()}-${sanitized}`; streams via `Readable.fromWeb(file.stream())` — no `arrayBuffer()` buffering; response shape unchanged); new `apps/web/src/app/uploads/[name]/route.ts` (traversal guard, extension whitelist, streamed response, `Cache-Control: public, max-age=31536000, immutable`); `.gitignore` gained `apps/web/public/uploads/`.
**Deviations:** none.

### Task 3 — Unblock video embeds in the CSP
**Status:** Done.
**Verified:** `npm run ci` (lint ✓, typecheck ✓, 73 tests ✓). Live Caddy test deferred to operator.
**Changes:** `infra/Caddyfile` — appended `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com;` to the existing CSP. Nothing else touched.
**Deviations:** none.

### Task 4 — Remove committed junk and credential-bearing scripts
**Status:** Done.
**Verified:** `git ls-files | grep -E "crash.log|run.sh|test-login|test-bcrypt|reset-pwd|setup-local"` returns empty.
**Changes:** deleted (via `git rm`, no sanitization, per operator instruction) `apps/orchestrator/crash.log`, `apps/orchestrator/run.sh`, `scripts/test-login.ts`, `scripts/test-bcrypt.ts`, `scripts/reset-pwd.ts`, `scripts/setup-local.ts`. `.gitignore` gained `crash.log`.
**Operator action item (manual, not automatable):** if `password123` or the committed bcrypt hash was ever the real admin password, rotate it — the hash is now in public git history.
**Deviations:** none.

### Task 5 — Fix the orchestrator crash-handler regression
**Status:** Done.
**Verified:** `npm run ci` (lint ✓, typecheck ✓, 73 tests ✓).
**Changes:** `apps/orchestrator/src/server.ts` — removed the `console.log = console.error` (etc.) monkey-patching; removed the `import fs from 'node:fs'`; `unhandledRejection` no longer exits the process (logs to stderr and continues), `uncaughtException` still exits (state unknowable, Docker restarts); removed `fs.appendFileSync('crash.log', ...)`.
**Deviations:** chose stderr-only logging over `<DATA_DIR>/crash.log`. Reasoning: the data dir should hold durable user data (DB, uploaded files), not server noise; Docker's container log capture already gives the operator the same visibility, and O4's log-rotation driver makes it bounded. Easy to revisit if a file is later wanted.

### Task 6 — Custom sections: kicker hides title
**Status:** Done.
**Verified:** `npm run ci` (lint ✓, typecheck ✓, 73 tests ✓).
**Changes:** `apps/web/src/templates/classic/ClassicTemplate.tsx:69` — removed `&& !custom.kicker` from the title condition; each element is now conditional only on its own content.
**Deviations:** none.

### Task 7 — Escape `</style>` in customCss injection
**Status:** Done.
**Verified:** `npm run ci` (lint ✓, typecheck ✓, 73 tests ✓).
**Changes:** `apps/web/src/templates/classic/styles.ts` — `theme.customCss.replace(/<\//g, '<\\/')` before the inline `<style>` injection.
**Deviations:** none.

### Task 8 — Pin the Node version for humans and agents
**Status:** Done.
**Verified:** `npm run ci` (lint ✓, typecheck ✓, 73 tests ✓).
**Changes:** new `.nvmrc` containing `24`; `package.json` `engines.node` `">=20"` → `">=20 <25"`; `CONTRIBUTING.md` setup section — new paragraph noting `nvm use` + `.nvmrc` pin + better-sqlite3 ABI-lock constraint.
**Deviations:** none.
**Out-of-scope finding (flagging for a future round):** `CONTRIBUTING.md` lines 24 and 49 still reference `@portfolio/{shared,crypto,db}` workspaces, which do not exist — actual package names are `@livingcv/*`. The suggested `npm run build -w @portfolio/...` command in the setup snippet would fail. Left untouched to keep this task focused.

### Task 9 — Clean up the plan.md / PLAN.md confusion
**Status:** Done.
**Verified:** `git check-ignore plan.md` exits 1 (no longer ignored); `git status` shows `?? plan.md`.
**Changes:** `.gitignore` — removed the `PLAN.md` line. Kept `REMEDIATION.md`, `VOICE.md`, `AUDIT_AND_SEO_PLAN.md` per the plan's note that those refer to genuinely separate, never-tracked files.
**Deviations / surprising finding:** the plan asserted that plan.md "has been tracked in git and has been for several rounds of fixes (commit messages already reference 'plan.md Task N')". `git log --all -- plan.md` returns **no history at all** — plan.md was never tracked. The `.gitignore` line was preventing it from being added in the first place. This is the first commit that tracks plan.md in this repo. The execution report (this section) is included in this commit.

### Verification checklist (re-run at end of plan work, Node 24)
1. `npm run build -w @livingcv/shared -w @livingcv/crypto -w @livingcv/db` — ✅ clean.
2. `npm run ci` (lint, typecheck, 73 tests) — ✅ all green.
3. `docker compose build web orchestrator` — ⚠️ not run. Docker is installed (`Docker version 29.1.2`) but the daemon is not running in this environment (`Cannot connect to the Docker daemon at unix:///Users/mohithdas/.docker/run/docker.sock`). Task 1's fixes addressed the typecheck failures that broke CI; the per-workspace `npm run build` above proves TypeScript compiles; lint and unit tests are clean. End-to-end `next build` inside Docker is deferred to the operator.
4. Manual smoke (admin login → upload image → URL serves → `docker compose restart web` → URL still serves) — ⚠️ deferred to operator (requires Docker daemon + compose stack).
5. `git ls-files | grep -E "crash.log|run.sh|test-login|test-bcrypt|reset-pwd|setup-local"` — ✅ returns nothing.
