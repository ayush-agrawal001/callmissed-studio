#!/usr/bin/env bash
# One-time bootstrap for a fresh Amazon Linux 2023 or Ubuntu EC2 instance.
# Usage: curl -fsSL <raw url of this file> | bash -s -- <git repo url>
set -euo pipefail
REPO_URL="${1:?usage: ec2-setup.sh <git repo url>}"

# 1 GB instances run out of memory during `next build`; add 2 GB of swap.
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if ! command -v docker >/dev/null; then
  if command -v dnf >/dev/null; then
    sudo dnf install -y docker git
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  else
    sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
  fi
  sudo systemctl enable --now docker
fi

[ -d app ] || git clone "$REPO_URL" app
cd app

if [ ! -f .env.production ]; then
  read -rsp "CallMissed API key: " KEY </dev/tty; echo
  printf 'CALLMISSED_API_KEY=%s\nSESSION_SECRET=%s\n' "$KEY" "$(openssl rand -hex 32)" > .env.production
  chmod 600 .env.production
fi

# sslip.io maps <a-b-c-d>.sslip.io to the IP a.b.c.d, giving a free hostname
# that Let's Encrypt will issue a certificate for.
IP=$(curl -fsS https://checkip.amazonaws.com)
export DOMAIN="${DOMAIN:-${IP//./-}.sslip.io}"
echo "DOMAIN=$DOMAIN" > deploy/.env

sudo DOMAIN="$DOMAIN" docker compose -f deploy/docker-compose.yml up -d --build
echo "Deployed: https://$DOMAIN"
