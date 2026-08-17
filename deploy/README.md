# Deploying Assurio to a single EC2 host

Target: **Ubuntu 24.04 LTS**, `c7i-flex.large` (4 GiB), **30 GiB gp3**, Elastic IP.

What ends up running:

| Process | Port | Exposure |
|---|---|---|
| Nginx | 80 / 443 | public |
| Next.js (`assurio-frontend`) | 3000 | loopback |
| NestJS (`assurio-backend`) | 3001 | loopback |
| OpenWA | 2785 | loopback |
| Postgres | 5435 | loopback |
| Redis | 6379 | loopback |
| ClamAV | 3310 | loopback |

Only 80/443 are reachable from the internet. Everything else is loopback-bound
and reached over an SSH tunnel.

---

## 1. Bootstrap the host

```bash
ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP
git clone <your-repo> ~/bg_check
cd ~/bg_check
./deploy/setup-server.sh
exit && ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP   # reconnect for docker group
```

Installs Docker, Node 22, Chromium (for report PDFs), nginx, certbot, a 2 GB
swapfile, and a UFW firewall allowing only SSH + HTTP(S).

## 2. Datastores

```bash
cd ~/bg_check
printf 'POSTGRES_USER=assurio\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=assurio\n' \
  "$(openssl rand -hex 24)" > deploy/.env
chmod 600 deploy/.env

docker compose -f deploy/docker-compose.prod.yml up -d
docker compose -f deploy/docker-compose.prod.yml ps
```

ClamAV downloads ~1 GB of signatures on first boot. Uploads fail closed until
its healthcheck passes — give it a few minutes:

```bash
docker logs -f clamav          # wait for "Self checking every 3600 seconds"
```

## 3. OpenWA (WhatsApp)

```bash
git clone https://github.com/rmyndharis/OpenWA ~/OpenWA
cd ~/OpenWA && docker compose up -d
```

It already binds `127.0.0.1:2785`. To scan the QR and link the phone, tunnel it
— never open 2785 publicly, it grants full control of the WhatsApp session:

```bash
# from your laptop
ssh -i your-key.pem -L 2785:127.0.0.1:2785 ubuntu@YOUR_ELASTIC_IP
# then browse http://localhost:2785
```

Copy the generated key into the backend `.env`:

```bash
cat ~/OpenWA/data/.api-key
```

## 4. App config

Edit `backend/.env` — these MUST change from their local values or verification
links, DigiLocker redirects and WhatsApp invites all break:

```ini
DATABASE_URL=postgresql://assurio:<the password from step 2>@localhost:5435/assurio
REDIS_HOST=127.0.0.1
CLAMAV_HOST=127.0.0.1

APP_URL=https://your-domain.com
PUBLIC_APP_URL=https://your-domain.com
BACKEND_URL=https://your-domain.com/api
DIGILOCKER_REDIRECT_URL=https://your-domain.com/home

OPENWA_URL=http://127.0.0.1:2785/api
OPENWA_API_KEY=<from step 3>
```

And `frontend/.env.local`:

```ini
NEXT_PUBLIC_API_URL=https://your-domain.com/api
```

> `NEXT_PUBLIC_*` values are baked in at build time — change them **before**
> `npm run build`, not after.

## 5. Build, migrate, seed

```bash
cd ~/bg_check/backend
npm ci && npx prisma migrate deploy && npx prisma generate && npm run build
npm run seed:admin                      # creates the admin login

cd ~/bg_check/frontend
npm ci && npm run build
```

## 6. Run as services

```bash
sudo cp ~/bg_check/deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now assurio-backend assurio-frontend
sudo systemctl status assurio-backend --no-pager
```

## 7. Nginx + TLS

```bash
sudo cp ~/bg_check/deploy/nginx/assurio.conf /etc/nginx/sites-available/assurio
sudo sed -i 's/your-domain.com/YOUR_REAL_DOMAIN/' /etc/nginx/sites-available/assurio
sudo ln -sf /etc/nginx/sites-available/assurio /etc/nginx/sites-enabled/assurio
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d YOUR_REAL_DOMAIN
```

Point the domain's A record at the Elastic IP first, or certbot's challenge fails.

## 8. Verify

```bash
curl -I https://YOUR_REAL_DOMAIN                      # Next.js
curl -s -o /dev/null -w '%{http_code}\n' \
  https://YOUR_REAL_DOMAIN/api/subjects               # 401 = up and guarded
journalctl -u assurio-backend -f
```

---

## Redeploying

```bash
cd ~/bg_check && git pull
cd backend  && npm ci && npx prisma migrate deploy && npm run build
cd ../frontend && npm ci && npm run build
sudo systemctl restart assurio-backend assurio-frontend
```

## Notes

- **Env changes need a restart.** `dotenv` reads `.env` once at boot, and
  `NEXT_PUBLIC_*` is compiled into the bundle — a rebuild, not just a restart.
- **Back up Postgres.** Nothing here does:
  `docker exec assurio-postgres pg_dump -U assurio assurio | gzip > backup.sql.gz`
- **Register the KonnectNXT webhook** against `https://your-domain.com/...`
  once the callback route exists (not yet built — polling is used today).
