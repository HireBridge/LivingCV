#!/usr/bin/env bash
# Restore a backup tarball into DATA_DIR. The DB is replaced atomically.
#
# The tarball format produced by infra/scripts/backup.sh is exactly:
#   portfolio.db
#   resume/      (only if DATA_DIR/resume existed at backup time)
#
# Usage:
#   DATA_DIR=/data sudo ./infra/scripts/restore.sh /backups/portfolio-2026....tar.gz
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
IN="${1:-}"

if [ -z "$IN" ] || [ ! -f "$IN" ]; then
  echo "Usage: $0 <backup.tar.gz>" >&2
  exit 1
fi

# Stop the web + orchestrator containers so they release the DB before we swap
# the file. Best-effort — if there is nothing to stop (e.g. local dev), this
# is a no-op.
docker compose stop web orchestrator 2>/dev/null || true

mkdir -p "$DATA_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$IN" -C "$TMP"

if [ ! -f "$TMP/portfolio.db" ]; then
  echo "Backup does not contain portfolio.db (got: $(ls -A "$TMP" | head))" >&2
  exit 2
fi

# Atomic DB swap: move the snapshot into place. The destination is
# overwritten. (We don't use cp because resume.sh wants a clean swap.)
mv -f "$TMP/portfolio.db" "$DATA_DIR/portfolio.db"

# Resume/ is optional.
if [ -d "$TMP/resume" ]; then
  rm -rf "$DATA_DIR/resume"
  mv "$TMP/resume" "$DATA_DIR/resume"
fi

echo "Restored from $IN"
docker compose start web orchestrator 2>/dev/null || true
