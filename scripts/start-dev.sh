#!/usr/bin/env bash
# LivingCV one-command launcher. Idempotent, Kubernetes-of-one. Will:
#   1. Generate a .env if missing (or fill any missing required vars).
#   2. Pull/build and start all services (caddy, web, orchestrator, voice, jobops).
#   3. Seed the Alex Rivera demo persona once.
#   4. Print the dashboard URL.
#
# Usage:  ./scripts/start-dev.sh
#
# Set  DOMAIN=example.com  if you have DNS pointed at this box (for TLS).
# Local development (just localhost) works with no extra config.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV="$ROOT/.env"

# 1. Make sure required env vars exist.
[ -f "$ENV" ] || cp "$ROOT/.env.example" "$ENV"

require_var() {
  local key=$1
  local current="$(grep "^$key=" "$ENV" 2>/dev/null | cut -d= -f2- || true)"
  if [ -z "$current" ]; then
    local val="${!key:-}"
    if [ -z "$val" ]; then
      if [ "$key" = "ADMIN_EMAIL" ]; then
        read -rp "Enter admin email: " val </dev/tty
      else
        read -rsp "Enter value for $key (or press Enter to auto-generate): " val </dev/tty
        echo
      fi
    fi
    if [ -z "$val" ]; then
      case "$key" in
        PORTFOLIO_ENCRYPTION_KEY|SESSION_SECRET)
          val="$(openssl rand -base64 32)" ;;
        JOBOPS_AUTH_TOKEN|IP_HASH_SALT)
          val="$(openssl rand -hex 16)" ;;
      esac
    fi
    echo "$key=$val" >> "$ENV"
  fi
}

# These are the mandatory bootstrap vars.
require_var ADMIN_EMAIL
require_var DOMAIN
require_var PORTFOLIO_ENCRYPTION_KEY
require_var SESSION_SECRET
require_var JOBOPS_AUTH_TOKEN
require_var IP_HASH_SALT

# For local dev, default DOMAIN if still empty.
grep -q '^DOMAIN=.' "$ENV" || echo "DOMAIN=localhost" >> "$ENV"

echo "=== .env ready ==="

# 2. Start the stack.
echo "=== docker compose up (building images on first run) ==="
docker compose up -d --wait

# 3. Seed the demo persona (idempotent — no-op if already seeded).
echo "=== seeding demo data ==="
docker compose exec -T web npx tsx scripts/seed-demo.ts 2>/dev/null || true

# 4. Done.
PORT="${WEB_PORT:-3000}"
echo
echo "========================================================================"
echo " LivingCV is running at  http://localhost:$PORT"
echo " Admin setup wizard:    http://localhost:$PORT/admin/setup"
echo " Admin dashboard:       http://localhost:$PORT/admin"
echo " Public MCP:            http://localhost:$PORT/mcp/public"
echo "========================================================================"
echo
echo " After setup:"
echo "   /admin/settings → Connections → LLM provider: deepseek"
echo "   Paste your DeepSeek API key, set model to deepseek-chat"
echo "========================================================================"
