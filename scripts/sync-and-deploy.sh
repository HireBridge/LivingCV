#!/usr/bin/env bash
# Sync your personal fork from upstream, then watch it build and deploy.
#
#   ./scripts/sync-and-deploy.sh
#
# Runs sync-upstream.sh, then watches the resulting CI → "Build container
# images" → "Deploy" GitHub Actions run through to completion, so you know
# the change is actually live (not just queued). Requires `gh` authenticated
# with access to your fork.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BEFORE="$(git rev-parse HEAD)"
"$ROOT/scripts/sync-upstream.sh"
SHA="$(git rev-parse HEAD)"

if [ "$BEFORE" = "$SHA" ]; then
  echo "Nothing to deploy — already up to date."
  exit 0
fi

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
SHORT="$(git rev-parse --short "$SHA")"
echo "=== Waiting for GitHub Actions to build + deploy $SHORT on $REPO ==="

# Poll for a run of $1 (workflow file) whose headSha is our just-pushed
# commit, for up to $2 seconds. The build workflow only starts AFTER CI
# finishes (~1-2 min), and the deploy only after the build (~2-4 min), so
# these waits have to comfortably outlast the whole chain — a too-short
# window (the original bug) errors out before the run even exists.
wait_for_run() {
  local workflow="$1" timeout="$2" waited=0 id
  while [ "$waited" -lt "$timeout" ]; do
    id="$(gh run list --repo "$REPO" --workflow="$workflow" --json headSha,databaseId \
      --jq "[.[] | select(.headSha == \"$SHA\")][0].databaseId" 2>/dev/null || true)"
    if [ -n "$id" ] && [ "$id" != "null" ]; then
      echo "$id"
      return 0
    fi
    sleep 10
    waited=$((waited + 10))
    echo "  …still waiting for $workflow ($waited s)" >&2
  done
  return 1
}

# CI (~1-2 min) then build start — give it up to 8 min of headroom.
BUILD_ID="$(wait_for_run build.yml 480)" || {
  echo "❌ No build run for $SHA appeared in time. It may still be queued behind CI;" >&2
  echo "   check: gh run list --repo $REPO" >&2
  exit 1
}
echo "=== Build run $BUILD_ID ==="
gh run watch "$BUILD_ID" --repo "$REPO" --exit-status

# Deploy is chained off the build; it appears within seconds of the build
# finishing, but give it a few minutes anyway. Filtered by headSha so we
# never latch onto a stale deploy from an earlier push.
DEPLOY_ID="$(wait_for_run deploy.yml 180)" || {
  echo "❌ No deploy run for $SHA appeared in time." >&2
  echo "   check: gh run list --repo $REPO --workflow=deploy.yml" >&2
  exit 1
}
echo "=== Deploy run $DEPLOY_ID ==="
gh run watch "$DEPLOY_ID" --repo "$REPO" --exit-status

echo "✅ Deployed $SHORT."
