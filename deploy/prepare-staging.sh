#!/usr/bin/env bash
set -euo pipefail
# prepare-staging.sh MODE VPS_IP
# Modes:
#   nipio    - generate nginx.conf for <VPS_IP>.nip.io (no cert issuance)
#   ip       - generate HTTP-only nginx.conf (no TLS)
#   selfsigned - generate self-signed certs into deploy/ssl and nginx.conf

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <mode> [VPS_IP]"
  echo "Modes: nipio, ip, selfsigned"
  exit 2
fi

MODE="$1"
VPS_IP="${2-}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

case "$MODE" in
  nipio)
    if [ -z "$VPS_IP" ]; then
      echo "VPS_IP required for nipio mode"
      exit 2
    fi
    DOMAIN="${VPS_IP}.nip.io"
    sed "s/__DOMAIN__/${DOMAIN}/g" nginx.conf.template > nginx.conf
    echo "Wrote nginx.conf with server_name ${DOMAIN}"
    ;;
  ip)
    cat > nginx.conf <<'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://backend:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
    echo "Wrote HTTP-only deploy/nginx.conf (no TLS). Use for private staging only."
    ;;
  selfsigned)
    if [ -z "$VPS_IP" ]; then
      echo "VPS_IP required for selfsigned mode"
      exit 2
    fi
    DOMAIN="$VPS_IP"
    mkdir -p ssl
    echo "Generating self-signed certs for CN=${DOMAIN} into deploy/ssl/ (insecure for production)"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout ssl/privkey.pem -out ssl/fullchain.pem -subj "/CN=${DOMAIN}" > /dev/null 2>&1
    sed "s/__DOMAIN__/${DOMAIN}/g" nginx.conf.template > nginx.conf
    echo "Wrote nginx.conf and self-signed certs to deploy/ssl/"
    ;;
  *)
    echo "Unknown mode: $MODE"
    exit 2
    ;;
esac

echo "Next: copy deploy/nginx.conf into your nginx config (or mount into nginx container) and start the stack."
