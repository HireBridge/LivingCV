#!/usr/bin/env bash
# LivingCV one-command launcher.
#
#   ./scripts/start.sh
#
# It will:
#   1. Check Docker is installed.
#   2. Create/complete .env — asks once for a domain, auto-generates every secret.
#   3. Build and start the whole stack (caddy, web, orchestrator, jobops).
#   4. Seed the demo persona (once).
#   5. Print the URL to open.
#
# The only thing left after this is the browser setup wizard (/admin/setup):
# admin password + your LLM API key. Everything else is handled here.
#
# Non-interactive use:  DOMAIN=example.com ./scripts/start.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV="$ROOT/.env"
cd "$ROOT"

# ── 0. Prerequisites ─────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || {
  echo "❌ Docker is required. Install it: https://docs.docker.com/get-docker/" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || {
  echo "❌ docker compose v2 is required (comes with modern Docker Desktop / Engine)." >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || {
  echo "❌ openssl is required to generate secrets." >&2; exit 1; }

# ── 1. .env ──────────────────────────────────────────────────────────────────
[ -f "$ENV" ] || cp "$ROOT/.env.example" "$ENV"

get_var() { grep "^$1=" "$ENV" 2>/dev/null | tail -1 | cut -d= -f2- || true; }

# Set a key in .env, replacing any existing (incl. empty/placeholder) line.
set_var() {
  local key="$1" val="$2" tmp
  tmp="$(mktemp)"
  grep -v "^$key=" "$ENV" > "$tmp" 2>/dev/null || true
  mv "$tmp" "$ENV"
  echo "$key=$val" >> "$ENV"
}

# Generate a secret if the key is empty. $2 = b64|hex.
ensure_secret() {
  local key="$1" kind="$2"
  [ -n "$(get_var "$key")" ] && return 0
  case "$kind" in
    b64) set_var "$key" "$(openssl rand -base64 32)" ;;
    hex) set_var "$key" "$(openssl rand -hex 16)" ;;
  esac
  echo "  • generated $key"
}

echo "=== Configuring .env ==="

# Domain: env var wins; else current .env value (ignoring the example placeholder);
# else prompt once. Blank = local HTTP on http://localhost.
DOMAIN="${DOMAIN:-}"
if [ -z "$DOMAIN" ]; then
  cur="$(get_var DOMAIN)"
  [ "$cur" = "example.com" ] && cur=""   # treat the .env.example placeholder as unset
  DOMAIN="$cur"
fi
if [ -z "$DOMAIN" ] && [ -t 0 ]; then
  echo "Enter the domain this will be served on for automatic HTTPS."
  read -rp "Domain (leave blank to run locally on http://localhost): " DOMAIN </dev/tty || true
fi
DOMAIN="${DOMAIN:-localhost}"
set_var DOMAIN "$DOMAIN"

# SITE_ADDRESS drives Caddy: a real domain → auto-HTTPS; localhost → plain :80.
if [ "$DOMAIN" = "localhost" ] || [ -z "$DOMAIN" ]; then
  set_var SITE_ADDRESS ":80"
  BASE_URL="http://localhost"
else
  set_var SITE_ADDRESS "$DOMAIN"
  BASE_URL="https://$DOMAIN"
fi

# Secrets — generated once, never overwritten if already present.
ensure_secret PORTFOLIO_ENCRYPTION_KEY b64
ensure_secret SESSION_SECRET           b64
ensure_secret JOBOPS_AUTH_TOKEN        hex
ensure_secret IP_HASH_SALT             hex

echo "  • DOMAIN=$DOMAIN"
echo "=== .env ready ==="
echo

# ── 2. Start ─────────────────────────────────────────────────────────────────
# Stamp the web image with the current commit so the admin Updates check works.
export GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"
echo "=== Building + starting the stack (first run pulls/builds images) ==="
docker compose up -d --build --wait

# ── 3. Seed demo persona (idempotent) ────────────────────────────────────────
echo "=== Seeding demo persona (skipped if already seeded) ==="
docker compose exec -T web npx tsx scripts/seed-demo.ts 2>/dev/null || true

# ── 4. Done ──────────────────────────────────────────────────────────────────
cat <<EOF

========================================================================
 ✅ LivingCV is up.

   Site:          $BASE_URL
   Setup wizard:  $BASE_URL/admin/setup
   Admin:         $BASE_URL/admin
   Public MCP:    $BASE_URL/mcp/public

 Finish in the browser (2 minutes):
   1. Open $BASE_URL/admin/setup
   2. Set an admin password + acknowledge the encryption-key backup.
   3. Under Connections, pick your LLM provider (anthropic / openai /
      gemini / deepseek) and paste your API key.

 That's it — nothing else to configure on the box.
========================================================================
EOF

if [ "$DOMAIN" != "localhost" ]; then
  echo " Note: HTTPS needs ports 80/443 open and DNS for $DOMAIN pointed at this box."
  echo "       Caddy fetches the cert automatically on first request."
fi
