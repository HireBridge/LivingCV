#!/usr/bin/env bash
# Backup portfolio.db + the resume/ directory under DATA_DIR into a single
# timestamped tarball. Safe to run on a hot DB — sqlite3 .backup uses the
# online-backup API and gets a consistent snapshot.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
OUT_DIR="${BACKUP_DIR:-$(dirname "$DATA_DIR")}/backups"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/portfolio-$TS.tar.gz"

mkdir -p "$OUT_DIR"

echo "Backing up $DATA_DIR -> $OUT"
# SQLite online backup of the portfolio DB.
TMP="$(mktemp -t portfolio-XXXXXX.db)"
sqlite3 "$DATA_DIR/portfolio.db" ".backup '$TMP'"

tar -czf "$OUT" -C "$(dirname "$DATA_DIR")" \
  "$(basename "$DATA_DIR")/portfolio.db" "$([ -d "$DATA_DIR/resume" ] && printf '%s/resume ' "$(basename "$DATA_DIR")")" \
  -T "$DATA_DIR"
rm -f "$TMP"

echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
