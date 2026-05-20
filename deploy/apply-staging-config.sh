#!/usr/bin/env bash
set -euo pipefail
# Usage: ./apply-staging-config.sh MODE VPS_IP
# MODE: nipio | ip | selfsigned

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <mode> [VPS_IP]"
  exit 2
fi

MODE="$1"
VPS_IP="${2-}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$ROOT_DIR/deploy"
BACKEND_ENV_EXAMPLE="$ROOT_DIR/backend/.env.example"
BACKEND_ENV="$ROOT_DIR/backend/.env"
ROOT_ENV_EXAMPLE="$ROOT_DIR/.env.example"
ROOT_ENV="$ROOT_DIR/.env"

cd "$DEPLOY_DIR"

if [ "$MODE" = "nipio" ] || [ "$MODE" = "selfsigned" ]; then
  if [ -z "$VPS_IP" ]; then
    echo "VPS_IP is required for mode $MODE"
    exit 2
  fi
fi

./prepare-staging.sh "$MODE" "$VPS_IP"

case "$MODE" in
  nipio)
    DOMAIN="${VPS_IP}.nip.io"
    ALLOWED_ORIGIN="https://${DOMAIN}"
    ;;
  selfsigned)
    DOMAIN="$VPS_IP"
    ALLOWED_ORIGIN="https://${DOMAIN}"
    ;;
  ip)
    if [ -z "$VPS_IP" ]; then
      echo "For ip mode, provide VPS_IP so we can set ALLOWED_ORIGIN to http://<VPS_IP>"
      exit 2
    fi
    ALLOWED_ORIGIN="http://${VPS_IP}"
    ;;
  *)
    echo "Unknown mode: $MODE"; exit 2
    ;;
esac

echo "Setting ALLOWED_ORIGIN to ${ALLOWED_ORIGIN} in backend and root envs (if present)"

if [ -f "$BACKEND_ENV_EXAMPLE" ]; then
  cp -n "$BACKEND_ENV_EXAMPLE" "$BACKEND_ENV" || true
  if grep -q "^ALLOWED_ORIGIN=" "$BACKEND_ENV"; then
    sed -i.bak "s|^ALLOWED_ORIGIN=.*$|ALLOWED_ORIGIN=${ALLOWED_ORIGIN}|" "$BACKEND_ENV"
  else
    echo "ALLOWED_ORIGIN=${ALLOWED_ORIGIN}" >> "$BACKEND_ENV"
  fi
  echo "Wrote $BACKEND_ENV"
else
  echo "Warning: $BACKEND_ENV_EXAMPLE not found; skipping backend env update"
fi

if [ -f "$ROOT_ENV_EXAMPLE" ]; then
  cp -n "$ROOT_ENV_EXAMPLE" "$ROOT_ENV" || true
  if grep -q "^ALLOWED_ORIGIN=" "$ROOT_ENV"; then
    sed -i.bak "s|^ALLOWED_ORIGIN=.*$|ALLOWED_ORIGIN=${ALLOWED_ORIGIN}|" "$ROOT_ENV"
  else
    echo "ALLOWED_ORIGIN=${ALLOWED_ORIGIN}" >> "$ROOT_ENV"
  fi
  echo "Wrote $ROOT_ENV"
fi

echo "Staging config prepared. Next steps (on VPS):"
echo "  - copy deploy/nginx.conf into /etc/nginx/conf.d/ or mount it into the nginx container"
echo "  - place TLS files into deploy/ssl/ (if using TLS)"
echo "  - run: docker compose up -d --build"
