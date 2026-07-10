#!/bin/bash
echo "Starting orchestrator keepalive wrapper..."
export PATH="/Users/mohithdas/.nvm/versions/node/v24.12.0/bin:$PATH"
while true; do
  echo "[$(date)] Starting server..."
  npm run start
  echo "[$(date)] Server crashed with exit code $?. Respawning in 2s..."
  sleep 2
done
