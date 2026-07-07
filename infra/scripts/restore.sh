#!/usr/bin/env bash
# Restore a backup tarball into DATA_DIR. The DB is replaced atomically.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
IN="${1:-}"

if [ -z "$IN" ] || [ ! -f "$IN" ]; then
  echo "Usage: $0 <backup.tar.gz>" >&2
  exit 1
fi

# Stop the web + orchestrator containers so they release the DB before we swap
# the file. Best-effort — if there is nothing to stop, this is a no-op.
docker compose stop web orchestrator 2>/dev/null || true

mkdir -p "$DATA_DIR"
# Extract into a temp dir then move into place.
TMP="$(mktemp -d)"
tar -xzf "$IN" -C "$TMP"
# The tarball contains <DATA_DIR_BASENAME>/portfolio.db ...
BASENAME="$(basename "$DATA_DIR")"
if [ ! -f "$TMP/$BASENAME/portfolio.db" ]; then
  echo "Backup does not contain $BASENAME/portfolio.db" >&2
  rm -rf "$TMP"
  exit 2
fi
mv "$TMP/$BASENAME/portfolio.db" "$DATA_DIR/portfolio.db"
# Resume/ is optional.
if [ -d "$TMP/$BASENAME/resume" ]; then
  rm -rf "$DATA_DIR/resume"
  mv "$TMP/$BASENAME/resume" "$DATA_DIR/resume"
fi
rm -rf "$TMP"

echo "Restored from $IN"
docker compose start web orchestrator 2>/dev/null || true
