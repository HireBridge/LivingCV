#!/usr/bin/env bash
# Build a jobops tarball from the open_source/jobops source tree and copy it
# into the portfolio's docker build context. The infra/jobops/Dockerfile picks
# this up when present (see "if [ -f jobops-local.tgz ]" branch).
#
# Usage (from the portfolio repo root):
#
#   ./scripts/build-jobops-tarball.sh                  # copies the most recent build
#   ./scripts/build-jobops-tarball.sh --build-first   # run jobops' npm run build
#   ./scripts/build-jobops-tarball.sh --source <path> # override source dir
#
# The output is infra/jobops/jobops-local.tgz (gitignored). This lets the
# portfolio docker build consume the patched v0.15.0 release without requiring
# the operator to have published it to npm.

set -euo pipefail

PORTFOLIO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JOBOPS_SRC="${JOBOPS_SRC:-$PORTFOLIO_ROOT/../open_source/jobops}"
OUT_DIR="$PORTFOLIO_ROOT/infra/jobops"

BUILD_FIRST="no"
for arg in "$@"; do
  case "$arg" in
    --build-first) BUILD_FIRST="yes" ;;
    --source) shift; JOBOPS_SRC="$1" ;;
    --source=*) JOBOPS_SRC="${arg#--source=}" ;;
    --help|-h)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
  shift || true
done

if [ ! -d "$JOBOPS_SRC" ]; then
  echo "error: jobops source not found at $JOBOPS_SRC" >&2
  echo "  pass --source <path> to override" >&2
  exit 1
fi

if [ "$BUILD_FIRST" = "yes" ]; then
  echo "[build-jobops-tarball] running 'npm run build' in $JOBOPS_SRC"
  (cd "$JOBOPS_SRC" && npm run build)
fi

if [ ! -d "$JOBOPS_SRC/dist" ]; then
  echo "error: $JOBOPS_SRC/dist not found — run '$0 --build-first' first" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Use npm pack to produce a clean tarball matching npm's expectations. Pin
# the package version in the output filename for traceability.
VERSION="$(node -e "console.log(require('$JOBOPS_SRC/package.json').version)")"
PACK_NAME="mohith_das-jobops-$VERSION.tgz"

# Pack from a tmpdir to avoid including the node_modules in the tarball.
WORK="$(mktemp -d)"
cp -R "$JOBOPS_SRC/dist" "$WORK/package"
cp    "$JOBOPS_SRC/package.json" "$WORK/package/"
[ -d "$JOBOPS_SRC/modes" ] && cp -R "$JOBOPS_SRC/modes" "$WORK/package/"
[ -d "$JOBOPS_SRC/templates" ] && cp -R "$JOBOPS_SRC/templates" "$WORK/package/"
[ -d "$JOBOPS_SRC/fonts" ] && cp -R "$JOBOPS_SRC/fonts" "$WORK/package/"
[ -d "$JOBOPS_SRC/migrations" ] && cp -R "$JOBOPS_SRC/migrations" "$WORK/package/"
[ -f "$JOBOPS_SRC/cv.example.md" ] && cp "$JOBOPS_SRC/cv.example.md" "$WORK/package/"
[ -f "$JOBOPS_SRC/TEMPLATES.md" ] && cp "$JOBOPS_SRC/TEMPLATES.md" "$WORK/package/"
[ -f "$JOBOPS_SRC/README.md" ] && cp "$JOBOPS_SRC/README.md" "$WORK/package/"
[ -f "$JOBOPS_SRC/LICENSE" ] && cp "$JOBOPS_SRC/LICENSE" "$WORK/package/"

# Reuse the package's own `files` field via `npm pack` so we don't miss a file
# the package author declared.
(cd "$WORK/package" && npm pack --pack-destination "$WORK" >/dev/null)
mv "$WORK/$PACK_NAME" "$OUT_DIR/jobops-local.tgz"
rm -rf "$WORK"

echo "[build-jobops-tarball] wrote $OUT_DIR/jobops-local.tgz"
echo "[build-jobops-tarball] docker build in portfolio will pick this up via the if [ -f jobops-local.tgz ] branch"
