#!/usr/bin/env bash
# Sync your personal fork's branch with the official upstream LivingCV repo.
#
#   ./scripts/sync-upstream.sh                            # sync main from HireBridge/LivingCV
#   UPSTREAM_REPO=someone/else ./scripts/sync-upstream.sh  # sync from a different upstream
#
# Only for people running their own deploy fork (see README "Staying in sync
# with upstream"). Just updates the repo — it does not deploy anything.
# Fast-forward only: if your fork has commits upstream doesn't, this refuses
# rather than merge/rebase for you.

set -euo pipefail

UPSTREAM_REPO="${UPSTREAM_REPO:-HireBridge/LivingCV}"
UPSTREAM_URL="https://github.com/$UPSTREAM_REPO.git"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"

echo "=== Fetching $UPSTREAM_REPO@$BRANCH ==="
git fetch upstream "$BRANCH"

if [ "$(git rev-parse HEAD)" = "$(git rev-parse "upstream/$BRANCH")" ]; then
  echo "✅ Already up to date with $UPSTREAM_REPO@$BRANCH."
  exit 0
fi

echo "=== Fast-forwarding $BRANCH ==="
git merge --ff-only "upstream/$BRANCH"

echo "=== Pushing to your fork (origin) ==="
git push origin "$BRANCH"

echo "✅ Synced to $(git rev-parse --short HEAD)."
