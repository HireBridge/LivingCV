#!/usr/bin/env bash
# Sync your personal fork from upstream, then watch it build and deploy.
#
#   ./scripts/sync-and-deploy.sh
#
# Runs sync-upstream.sh, then watches the resulting "Build container images"
# → "Deploy" GitHub Actions run through to completion, so you know the change
# is actually live (not just queued). Requires `gh` authenticated with access
# to your fork.

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
echo "=== Waiting for GitHub Actions to build + deploy $(git rev-parse --short "$SHA") on $REPO ==="

find_run() {
  gh run list --repo "$REPO" --workflow="$1" --json headSha,databaseId \
    --jq "[.[] | select(.headSha == \"$SHA\")][0].databaseId"
}

BUILD_ID=""
for _ in $(seq 1 12); do
  BUILD_ID="$(find_run build.yml)"
  [ -n "$BUILD_ID" ] && [ "$BUILD_ID" != "null" ] && break
  sleep 5
done
if [ -z "$BUILD_ID" ] || [ "$BUILD_ID" = "null" ]; then
  echo "❌ Couldn't find the build run for $SHA — check: gh run list --repo $REPO" >&2
  exit 1
fi
gh run watch "$BUILD_ID" --repo "$REPO" --exit-status

DEPLOY_ID=""
for _ in $(seq 1 12); do
  DEPLOY_ID="$(gh run list --repo "$REPO" --workflow=deploy.yml --json databaseId,event \
    --jq '[.[] | select(.event=="workflow_run")][0].databaseId')"
  [ -n "$DEPLOY_ID" ] && [ "$DEPLOY_ID" != "null" ] && break
  sleep 5
done
if [ -z "$DEPLOY_ID" ] || [ "$DEPLOY_ID" = "null" ]; then
  echo "❌ Couldn't find the deploy run — check: gh run list --repo $REPO --workflow=deploy.yml" >&2
  exit 1
fi
gh run watch "$DEPLOY_ID" --repo "$REPO" --exit-status

echo "✅ Deployed $(git rev-parse --short "$SHA")."
