#!/usr/bin/env bash
# Sync your personal fork's branch with the official upstream LivingCV repo.
#
#   ./scripts/sync-upstream.sh                            # sync main from HireBridge/LivingCV
#   UPSTREAM_REPO=someone/else ./scripts/sync-upstream.sh  # sync from a different upstream
#
# Only for people running their own deploy fork (see README "Staying in sync
# with upstream"). Just updates the repo — it does not deploy anything.
# A plain merge, not fast-forward-only: your fork is expected to carry its
# own deploy.yml (and secrets) that upstream deliberately doesn't have, so a
# strict ff-only would refuse forever after the first such commit. Real
# content conflicts still abort with nothing changed.

set -euo pipefail

UPSTREAM_REPO="${UPSTREAM_REPO:-HireBridge/LivingCV}"
UPSTREAM_URL="https://github.com/$UPSTREAM_REPO.git"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"

echo "=== Fetching $UPSTREAM_REPO@$BRANCH ==="
git fetch upstream "$BRANCH"

if git merge-base --is-ancestor "upstream/$BRANCH" HEAD; then
  echo "✅ Already up to date with $UPSTREAM_REPO@$BRANCH."
  exit 0
fi

echo "=== Merging $UPSTREAM_REPO@$BRANCH ==="
if ! git merge --no-edit "upstream/$BRANCH"; then
  git merge --abort
  echo "❌ Merge conflict syncing with upstream. Resolve manually:" >&2
  echo "   git fetch upstream $BRANCH && git merge upstream/$BRANCH" >&2
  exit 1
fi

echo "=== Pushing to your fork (origin) ==="
git push origin "$BRANCH"

echo "✅ Synced to $(git rev-parse --short HEAD)."
