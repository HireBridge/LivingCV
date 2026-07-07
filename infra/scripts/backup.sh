#!/usr/bin/env bash
# Backup portfolio.db + the resume/ directory under DATA_DIR into a single
# timestamped tarball. Safe to run on a hot DB — sqlite3 .backup uses the
# online-backup API and gets a consistent snapshot.
#
# Env:
#   DATA_DIR     the live data directory (default /data)
#   BACKUP_DIR   where to drop the tarball (default <parent of DATA_DIR>/backups)
#   SQLITE_BIN   sqlite3 binary (default: sqlite3 on PATH)
#
# Usage:
#   DATA_DIR=/data sudo ./infra/scripts/backup.sh
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
PARENT_DIR="$(dirname "$DATA_DIR")"
OUT_DIR="${BACKUP_DIR:-${PARENT_DIR}/backups}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
SNAPSHOT="${OUT_DIR}/portfolio-${TS}.snapshot.db"
OUT="${OUT_DIR}/portfolio-${TS}.tar.gz"
SQLITE_BIN="${SQLITE_BIN:-sqlite3}"

mkdir -p "$OUT_DIR"

if [ ! -f "$DATA_DIR/portfolio.db" ]; then
  echo "error: $DATA_DIR/portfolio.db not found" >&2
  exit 1
fi

# Online backup: writes a consistent snapshot next to the eventual tarball.
$SQLITE_BIN "$DATA_DIR/portfolio.db" ".backup '$SNAPSHOT'"

# Build the tarball. The DB goes in under the symbolic name `portfolio.db`
# (BSD tar -s flag is the equivalent of GNU --transform). If a resume/
# directory exists, include it as a sibling. We use two -C args so each
# segment is positioned correctly.
RESUME_ARG=()
if [ -d "$DATA_DIR/resume" ]; then
  RESUME_ARG=(-C "$DATA_DIR" resume)
fi

tar -czf "$OUT" \
  -C "$OUT_DIR" -s "|portfolio-${TS}\.snapshot\.db|portfolio.db|" \
  "${SNAPSHOT##*/}" \
  "${RESUME_ARG[@]}"

rm -f "$SNAPSHOT"

echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
