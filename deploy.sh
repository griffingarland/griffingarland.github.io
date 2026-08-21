#!/usr/bin/env bash
# Deploy the site to the self-hosted Caddy box.
#   ./deploy.sh              # uses SERVER below
#   SERVER=me@host ./deploy.sh
set -euo pipefail

SERVER="${SERVER:-griffin@chezgarland.com}"   # <-- set your user@host
REMOTE_DIR="${REMOTE_DIR:-/srv/portfolio}"
SRC="$(cd "$(dirname "$0")" && pwd)"

echo "==> deploying $SRC -> $SERVER:$REMOTE_DIR"

rsync -av --delete \
  --exclude '.git/' \
  --exclude 'CLAUDE.md' \
  --exclude 'README.md' \
  --exclude 'deploy.sh' \
  --exclude '.DS_Store' \
  "$SRC/" "$SERVER:$REMOTE_DIR/"

# Zero-downtime config reload; harmless if the Caddyfile is unchanged.
ssh "$SERVER" 'cd ~/reverse-proxy && docker compose exec -T caddy \
  caddy reload --config /etc/caddy/Caddyfile' || {
    echo "!! caddy reload failed (files are still deployed)" >&2; exit 1; }

echo "==> done"
