#!/usr/bin/env bash
# Backup portfolio.db + the resume/ directory from the Docker named volume
# into a single timestamped tarball. WAL mode guarantees page-level consistency
# so copying the live file is safe.
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

# Copy the live DB from the web container (the volume is mounted at /data/db).
docker compose cp "web:/data/db/portfolio.db" "$TMP/portfolio.db" 2>/dev/null || {
  echo "error: failed to copy portfolio.db from web container" >&2
  echo "  Is docker compose running? Try: docker compose ps" >&2
  exit 1
}

# Copy the resume/ directory if it exists.
if docker compose exec -T web test -d /data/db/resume 2>/dev/null; then
  docker compose cp "web:/data/db/resume/." "$TMP/resume/" 2>/dev/null || true
fi

tar -czf "$OUT" -C "$TMP" portfolio.db resume 2>/dev/null || \
  tar -czf "$OUT" -C "$TMP" portfolio.db

echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
