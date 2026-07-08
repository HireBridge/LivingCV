#!/usr/bin/env bash
# Pull the latest LivingCV and apply it — WITHOUT touching your data.
#
#   ./scripts/update.sh           # check for updates, then apply if any
#   ./scripts/update.sh --check   # only report whether updates are available
#   ./scripts/update.sh --yes     # apply without the confirmation prompt
#
# Your data is safe: the SQLite databases live in Docker named volumes
# (portfolio-data, jobops-data) and your secrets live in .env — none of which
# git or the image rebuild ever touches. New database migrations apply
# automatically on restart (they are additive, never destructive). Only the
# application code and container images are replaced.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CHECK_ONLY=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# ── Prerequisites ─────────────────────────────────────────────────────────────
command -v git >/dev/null 2>&1 || { echo "❌ git is required." >&2; exit 1; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "❌ Not a git checkout. Updates work only when you deployed by cloning the repo." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required." >&2; exit 1; }

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# ── Check ─────────────────────────────────────────────────────────────────────
echo "=== Checking for updates on '$BRANCH' ==="
git fetch --quiet origin "$BRANCH" 2>/dev/null || git fetch --quiet origin || true

LOCAL="$(git rev-parse @ 2>/dev/null || echo none)"
REMOTE="$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo none)"

if [ "$REMOTE" = "none" ]; then
  echo "⚠️  Could not resolve origin/$BRANCH. Is a remote configured? (git remote -v)"; exit 1
fi

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "✅ Already up to date ($(git rev-parse --short @))."
  exit 0
fi

BEHIND="$(git rev-list --count @.."origin/$BRANCH" 2>/dev/null || echo '?')"
echo "⬆️  $BEHIND update(s) available:  $(git rev-parse --short @) → $(git rev-parse --short origin/$BRANCH)"
git --no-pager log --oneline @.."origin/$BRANCH" | head -10 | sed 's/^/     /'

if [ "$CHECK_ONLY" = "1" ]; then
  exit 0
fi

# ── Confirm ───────────────────────────────────────────────────────────────────
if [ "$ASSUME_YES" != "1" ] && [ -t 0 ]; then
  read -rp "Apply these updates now? [y/N] " ans </dev/tty || true
  case "${ans:-}" in y|Y|yes|YES) ;; *) echo "Aborted."; exit 0 ;; esac
fi

# ── Safety: refuse if the working tree has local edits ───────────────────────
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "❌ You have uncommitted local changes to tracked files:" >&2
  git --no-pager status --short --untracked-files=no >&2
  echo "   Commit or 'git stash' them first, then re-run. (Your .env and data are unaffected.)" >&2
  exit 1
fi

# ── Best-effort backup before applying ───────────────────────────────────────
if [ -x "$ROOT/infra/scripts/backup.sh" ]; then
  echo "=== Backing up databases (best effort) ==="
  "$ROOT/infra/scripts/backup.sh" || echo "  (backup step skipped/failed — continuing; data volumes are untouched by the update)"
fi

# ── Apply ─────────────────────────────────────────────────────────────────────
echo "=== Pulling latest code ==="
git pull --ff-only origin "$BRANCH"

export GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"

echo "=== Rebuilding + restarting (data volumes preserved) ==="
docker compose up -d --build --wait

# A rebuilt web container gets a new IP; make Caddy re-resolve its upstream.
docker compose restart caddy >/dev/null 2>&1 || true

echo
echo "========================================================================"
echo " ✅ Updated to $(git rev-parse --short HEAD)."
echo "    Your content, leads, settings, and secrets were preserved."
echo "    New database migrations (if any) applied automatically on restart."
echo "========================================================================"
