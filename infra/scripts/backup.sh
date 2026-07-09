#!/usr/bin/env bash
# Backup portfolio.db + the resume/ directory from the Docker named volume
# into a single timestamped tarball. Uses better-sqlite3's online backup API
# inside the web container for a consistent snapshot.
#
# Env:
#   BACKUP_DIR  where to drop the tarball (default ./backups)
#
# Usage:
#   ./infra/scripts/backup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

OUT_DIR="${BACKUP_DIR:-${ROOT}/backups}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${OUT_DIR}/portfolio-${TS}.tar.gz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT_DIR"

echo "=== Backing up portfolio.db from Docker volume ==="

# Use better-sqlite3's online-backup API inside the container for a consistent
# snapshot, then copy it out via docker compose cp.
docker compose exec -T web \
  node -e "require('better-sqlite3')('/data/db/portfolio.db').backup('/data/db/backup.tmp.db')" 2>/dev/null || {
  echo "error: failed to back up portfolio.db via better-sqlite3" >&2
  echo "  Is docker compose running? Try: docker compose ps" >&2
  exit 1
}

docker compose cp "web:/data/db/backup.tmp.db" "$TMP/portfolio.db" 2>/dev/null || {
  echo "error: failed to copy backup file from web container" >&2
  exit 1
}

# Clean up the temp file inside the container.
docker compose exec -T web rm -f /data/db/backup.tmp.db 2>/dev/null || true

# Copy the resume/ directory if it exists.
if docker compose exec -T web test -d /data/db/resume 2>/dev/null; then
  docker compose cp "web:/data/db/resume/." "$TMP/resume/" 2>/dev/null || true
fi

tar -czf "$OUT" -C "$TMP" portfolio.db resume 2>/dev/null || \
  tar -czf "$OUT" -C "$TMP" portfolio.db

echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
