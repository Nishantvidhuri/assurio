#!/usr/bin/env bash
# One-shot bootstrap for a fresh Ubuntu 24.04 LTS EC2 host.
# Installs everything Assurio needs to run; does NOT deploy the app itself
# (see deploy/README.md for that). Safe to re-run.
set -euo pipefail

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

log "System packages"
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y curl git ca-certificates gnupg ufw

log "Docker Engine + Compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  # Docker publishes per Ubuntu codename and lags brand-new releases. If this
  # release has no repo yet (e.g. 26.04 shortly after launch), fall back to the
  # newest LTS Docker does publish — the packages are compatible.
  CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  if ! curl -fsI "https://download.docker.com/linux/ubuntu/dists/${CODENAME}/Release" >/dev/null 2>&1; then
    echo "   Docker has no repo for '${CODENAME}' yet — falling back to 'noble' (24.04 LTS)."
    CODENAME=noble
  fi
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
fi
sudo usermod -aG docker "$USER"   # takes effect on next login

log "Node.js 22 LTS"
if ! command -v node >/dev/null 2>&1; then
  # NodeSource can lag new Ubuntu releases too; Ubuntu's own package is a fine
  # fallback as long as it is >= 20.
  if ! (curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs); then
    echo "   NodeSource failed — installing Ubuntu's nodejs + npm instead."
    sudo apt-get install -y nodejs npm
  fi
fi
node -v

log "Chromium — used by puppeteer-core for report PDFs"
# PdfService probes /usr/bin/google-chrome-stable, google-chrome,
# chromium-browser, then chromium. The apt package provides /usr/bin/chromium.
sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
# Snap-based chromium has no usable /usr/bin path for puppeteer; fail loudly.
if ! ls /usr/bin/chromium* /usr/bin/google-chrome* >/dev/null 2>&1; then
  echo "!! No Chromium binary under /usr/bin — report PDFs will fail." >&2
  echo "!! Install Google Chrome stable instead, then re-run." >&2
fi

log "Nginx + certbot (TLS)"
sudo apt-get install -y nginx python3-certbot-nginx

log "Swap (2 GB) — protects Next builds and Chromium spikes from the OOM killer"
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

log "Firewall — only SSH + HTTP(S). App and datastore ports stay private."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

log "Disk check"
AVAIL_GB=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
echo "   ${AVAIL_GB}G free on /"
if [ "${AVAIL_GB:-0}" -lt 12 ]; then
  cat <<'WARN'
   !! Less than 12G free. Assurio needs roughly 8G once ClamAV signatures
   !! (~1G), Chromium, Docker images and node_modules are in place — you WILL
   !! run out mid-build. Grow the EBS volume first:
   !!   AWS console -> EC2 -> Volumes -> Modify volume -> 30 GiB, then here:
   !!     sudo growpart /dev/nvme0n1 1 && sudo resize2fs /dev/nvme0n1p1
WARN
fi

log "Done"
echo "Log out and back in so your shell picks up the 'docker' group, then:"
echo "  cd ~/bg_check && docker compose -f deploy/docker-compose.prod.yml up -d"
