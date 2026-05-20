#!/usr/bin/env bash
set -euo pipefail
# Usage: ./set-domain.sh example.com
# If no argument is provided, the script will use the DOMAIN env var.

cd "$(dirname "$0")"

DOMAIN_ARG="${1-}"
if [ -z "$DOMAIN_ARG" ]; then
  DOMAIN_ARG="${DOMAIN-}"
fi

if [ -z "$DOMAIN_ARG" ]; then
  echo "No domain provided; using wildcard '_' (accepts any host)"
  DOMAIN_ARG="_"
fi

sed "s/__DOMAIN__/${DOMAIN_ARG}/g" nginx.conf.template > nginx.conf
echo "Wrote deploy/nginx.conf with server_name ${DOMAIN_ARG}"

echo "Next: copy deploy/nginx.conf into the server's /etc/nginx/conf.d/ or into your nginx container and reload nginx."
