#!/usr/bin/env bash
# Fork LivingCV and wire it up to auto-deploy to your own server on every
# push, via GitHub Actions — no manual SSH+rebuild needed after this.
#
#   ./scripts/setup-deploy-fork.sh <deploy-host> [deploy-user]
#
# Example:
#   ./scripts/setup-deploy-fork.sh example.com ubuntu
#
# Run this from YOUR OWN machine (not the server) — it needs `gh` CLI
# authenticated (`gh auth login`) and working SSH access to the target
# server already set up (whatever you'd normally use to `ssh user@host`).
#
# What it does:
#   1. Forks HireBridge/LivingCV to your GitHub account (skips if you
#      already have a fork).
#   2. Adds deploy.yml to your fork. Upstream deliberately doesn't ship
#      this — it's specific to your own server and secrets, and shouldn't
#      live on a repo other people might get write access to. See the
#      README section "Deploying your own fork" for why.
#   3. Generates a fresh SSH deploy keypair, installs the public half on
#      your server's authorized_keys, and sets DEPLOY_HOST / DEPLOY_USER /
#      DEPLOY_SSH_KEY as secrets on your fork (never on the shared repo).
#   4. Prompts you to create a GHCR_PAT (classic PAT, write:packages scope)
#      if you don't already have one set — this one step can't be
#      automated, GitHub only lets a human create these.
#   5. On the server: clones your fork to ~/LivingCV (or repoints an
#      existing checkout's `origin` at it if you already ran the plain
#      Quickstart there). If LivingCV isn't running there yet, it prints the
#      start.sh command to finish setup — it does NOT run start.sh for you.
#
# Safe to re-run — every step checks whether it's already done first.
#
# Optional: PRIVATE_FORK=1 ./scripts/setup-deploy-fork.sh ... also makes
# your fork private and sets up a read-only deploy key so the server can
# still pull it (plain HTTPS only works for public repos).

set -euo pipefail

DEPLOY_HOST="${1:?Usage: $0 <deploy-host> [deploy-user]}"
DEPLOY_USER="${2:-ubuntu}"
UPSTREAM_REPO="HireBridge/LivingCV"

command -v gh >/dev/null 2>&1 || { echo "❌ gh CLI is required: https://cli.github.com" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "❌ curl is required." >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "❌ Run 'gh auth login' first." >&2; exit 1; }
ssh -o BatchMode=yes -o ConnectTimeout=5 "$DEPLOY_USER@$DEPLOY_HOST" true 2>/dev/null || {
  echo "❌ Can't SSH to $DEPLOY_USER@$DEPLOY_HOST non-interactively. Set up your own SSH key/agent access first." >&2
  exit 1
}

ME="$(gh api user -q .login)"
FORK_REPO="${FORK_REPO:-$ME/LivingCV}"

echo "=== 1. Fork ==="
if gh repo view "$FORK_REPO" >/dev/null 2>&1; then
  echo "  already have $FORK_REPO"
else
  gh repo fork "$UPSTREAM_REPO" --clone=false --fork-name "$(basename "$FORK_REPO")" >/dev/null
  echo "  forked $UPSTREAM_REPO -> $FORK_REPO"
fi

if [ "${PRIVATE_FORK:-0}" = "1" ] && [ "$(gh repo view "$FORK_REPO" --json visibility -q .visibility)" != "PRIVATE" ]; then
  gh repo edit "$FORK_REPO" --visibility private --accept-visibility-change-consequences >/dev/null
  echo "  set $FORK_REPO to private"
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
# gh repo clone (not plain git clone) so this also works once the fork is
# private — it uses gh's own authenticated credential helper. A just-created
# fork can take a few seconds to become cloneable, so retry before giving up.
cloned=0
for _ in $(seq 1 10); do
  if gh repo clone "$FORK_REPO" "$WORKDIR/fork" -- --quiet 2>/dev/null; then cloned=1; break; fi
  sleep 3
done
[ "$cloned" = "1" ] || { echo "❌ Could not clone $FORK_REPO (fork may still be provisioning — re-run in a moment)." >&2; exit 1; }
cd "$WORKDIR/fork"

echo "=== 2. deploy.yml ==="
if [ -f .github/workflows/deploy.yml ]; then
  echo "  already present"
else
  mkdir -p .github/workflows
  curl -fsSL "https://raw.githubusercontent.com/$UPSTREAM_REPO/main/scripts/deploy.yml.template" -o .github/workflows/deploy.yml
  git add .github/workflows/deploy.yml
  git commit --quiet -m "chore: add fork-only deploy.yml"
  git push --quiet origin main
  echo "  added and pushed"
fi

echo "=== 3. Deploy SSH key + secrets ==="
if gh secret list --repo "$FORK_REPO" | grep -q '^DEPLOY_SSH_KEY'; then
  echo "  DEPLOY_HOST/USER/SSH_KEY already set — leaving as-is (delete them on GitHub first to rotate)"
else
  KEYFILE="$WORKDIR/deploy_key"
  ssh-keygen -t ed25519 -f "$KEYFILE" -N "" -C "$FORK_REPO-deploy" -q
  PUB="$(cat "$KEYFILE.pub")"
  ssh "$DEPLOY_USER@$DEPLOY_HOST" "grep -qF \"\$(echo '$PUB' | awk '{print \$2}')\" ~/.ssh/authorized_keys 2>/dev/null || echo '$PUB' >> ~/.ssh/authorized_keys"
  gh secret set DEPLOY_HOST --repo "$FORK_REPO" --body "$DEPLOY_HOST" >/dev/null
  gh secret set DEPLOY_USER --repo "$FORK_REPO" --body "$DEPLOY_USER" >/dev/null
  gh secret set DEPLOY_SSH_KEY --repo "$FORK_REPO" < "$KEYFILE" >/dev/null
  shred -u "$KEYFILE" 2>/dev/null || rm -f "$KEYFILE"
  echo "  generated a fresh deploy key, installed it on the server, set secrets"
fi

echo "=== 4. GHCR_PAT ==="
if gh secret list --repo "$FORK_REPO" | grep -q '^GHCR_PAT'; then
  echo "  already set"
else
  cat <<EOF
  Forked repos can't push container images with the default GitHub Actions
  token (GitHub restricts it to read-only, unconditionally). You need a
  classic PAT with just the "write:packages" scope:

    1. Open: https://github.com/settings/tokens/new
    2. Check only "write:packages" (leave everything else unchecked)
    3. Generate, copy the token
EOF
  read -rsp "  Paste the token here (or press Enter to skip for now): " GHCR_PAT_INPUT </dev/tty
  echo
  if [ -n "$GHCR_PAT_INPUT" ]; then
    gh secret set GHCR_PAT --repo "$FORK_REPO" --body "$GHCR_PAT_INPUT" >/dev/null
    echo "  set"
  else
    echo "  ⚠️  skipped — builds will fail until you run:"
    echo "     gh secret set GHCR_PAT --repo $FORK_REPO"
  fi
fi

echo "=== 5. Server ==="
if [ "${PRIVATE_FORK:-0}" = "1" ]; then
  SAFE_NAME="$(echo "$FORK_REPO" | tr '/' '_')"
  HOST_ALIAS="github-$SAFE_NAME"
  REPO_KEYFILE="$WORKDIR/repo_key"
  ssh-keygen -t ed25519 -f "$REPO_KEYFILE" -N "" -C "$FORK_REPO-read-only" -q
  gh repo deploy-key add "$REPO_KEYFILE.pub" --repo "$FORK_REPO" --title "$DEPLOY_HOST (read-only pull)" >/dev/null

  # Install the private half on the server (single hop: pipe local file -> remote stdin).
  ssh "$DEPLOY_USER@$DEPLOY_HOST" "umask 077 && mkdir -p ~/.ssh"
  cat "$REPO_KEYFILE" | ssh "$DEPLOY_USER@$DEPLOY_HOST" \
    "cat > ~/.ssh/${SAFE_NAME}_deploykey && chmod 600 ~/.ssh/${SAFE_NAME}_deploykey"

  # A dedicated Host alias so git on the server uses this key only for this
  # repo, without touching the server's own default SSH identity.
  ssh "$DEPLOY_USER@$DEPLOY_HOST" bash -s <<REMOTE
set -e
grep -q '^Host $HOST_ALIAS\$' ~/.ssh/config 2>/dev/null || cat >> ~/.ssh/config <<CONFIG

Host $HOST_ALIAS
  HostName github.com
  User git
  IdentityFile ~/.ssh/${SAFE_NAME}_deploykey
  IdentitiesOnly yes
CONFIG
chmod 600 ~/.ssh/config
ssh -o StrictHostKeyChecking=accept-new -T git@$HOST_ALIAS || true
REMOTE

  CLONE_URL="git@$HOST_ALIAS:$FORK_REPO.git"
  shred -u "$REPO_KEYFILE" 2>/dev/null || rm -f "$REPO_KEYFILE"
  rm -f "$REPO_KEYFILE.pub"
else
  CLONE_URL="https://github.com/$FORK_REPO.git"
fi

ssh "$DEPLOY_USER@$DEPLOY_HOST" "bash -s" "$CLONE_URL" <<'REMOTE'
set -e
CLONE_URL="$1"
if [ -d ~/LivingCV/.git ]; then
  cd ~/LivingCV
  git remote set-url origin "$CLONE_URL"
  echo "  repointed existing ~/LivingCV to your fork"
else
  git clone "$CLONE_URL" ~/LivingCV
  echo "  cloned your fork to ~/LivingCV"
fi
REMOTE

echo
echo "========================================================================"
echo " ✅ Done. $FORK_REPO now auto-deploys to $DEPLOY_USER@$DEPLOY_HOST on push."
echo
echo " If LivingCV isn't running there yet:"
echo "   ssh $DEPLOY_USER@$DEPLOY_HOST 'cd ~/LivingCV && ./scripts/start.sh'"
echo
echo " Going forward, from your fork:"
echo "   ./scripts/sync-upstream.sh       # pull updates from $UPSTREAM_REPO"
echo "   ./scripts/sync-and-deploy.sh     # same, and wait for it to deploy"
echo "========================================================================"
