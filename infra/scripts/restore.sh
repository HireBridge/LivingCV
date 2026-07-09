#!/usr/bin/env bash
# Restore a backup tarball into the Docker named volume.
#
# The tarball format produced by infra/scripts/backup.sh is:
#   portfolio.db
#   resume/      (only if DATA_DIR/resume existed at backup time)
#
# Usage:
#   ./infra/scripts/restore.sh /backups/portfolio-2026....tar.gz
set -euo pipefail

IN="${1:-}"

if [ -z "$IN" ] || [ ! -f "$IN" ]; then
  echo "Usage: $0 <backup.tar.gz>" >&2
  exit 1
fi

# Stop the web + orchestrator containers so they release the DB before we replace
# the file. Best-effort — if there is nothing to stop (e.g. local dev), this is a no-op.
docker compose stop web orchestrator 2>/dev/null || true

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$IN" -C "$TMP"

if [ ! -f "$TMP/portfolio.db" ]; then
  echo "Backup does not contain portfolio.db (got: $(ls -A "$TMP" | head))" >&2
  exit 2
fi

echo "=== Restoring portfolio.db into Docker volume ==="

docker compose cp "$TMP/portfolio.db" "web:/data/db/portfolio.db" || {
  echo "error: failed to copy portfolio.db into web container" >&2
  exit 1
}

if [ -d "$TMP/resume" ]; then
  docker compose exec -T web rm -rf /data/db/resume 2>/dev/null || true
  docker compose cp "$TMP/resume/." "web:/data/db/resume/" || true
fi

echo "Restored from $IN"
docker compose start web orchestrator 2>/dev/null || true
