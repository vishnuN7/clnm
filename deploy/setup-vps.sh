#!/usr/bin/env bash

set -euo pipefail

echo "Updating package index..."
sudo apt update

echo "Installing Docker, Compose plugin, and firewall tools..."
sudo apt install -y ca-certificates curl gnupg ufw

if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  source /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt update
  sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

sudo systemctl enable docker
sudo systemctl start docker

echo "Configuring firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "Creating SSL directory if needed..."
mkdir -p ./deploy/ssl

echo "Done. Next steps:"
echo "1. Copy .env.example to .env and fill production values."
echo "2. Put fullchain.pem and privkey.pem into deploy/ssl/."
echo "3. Run: docker compose up -d --build"
echo "4. Check status with: docker compose ps"