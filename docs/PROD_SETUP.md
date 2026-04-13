# Production Server Setup Guide

Deploy IoT Proxy on a single Linux server with HTTPS, one admin user, and all services managed by Docker Compose.

**Domain**: `iotproxy.ung.uz`

---

## Server requirements

| Resource | Minimum |
|----------|---------|
| OS | Ubuntu 22.04 LTS (or any systemd-based Linux) |
| CPU | 2 vCPU |
| RAM | 4 GB |
| Disk | 40 GB SSD (TimescaleDB grows over time — size to your data volume) |
| Open ports | 80, 443, 1883 (MQTT TCP), 9002 (MQTT WebSocket) |

---

## 1. Server preparation

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

---

## 2. Clone the repository

```bash
cd /opt
sudo git clone <repo-url> iotproxy
sudo chown -R $USER:$USER /opt/iotproxy
cd /opt/iotproxy
```

---

## 3. Generate strong secrets

Run each command and save the output — you will paste them into the env file in the next step.

```bash
# JWT secret (access token signing key)
openssl rand -hex 32

# JWT refresh secret (refresh token signing key — must differ from JWT_SECRET)
openssl rand -hex 32

# Database password
openssl rand -hex 16

# MinIO root password
openssl rand -hex 16
```

---

## 4. Create the environment file

Create `/opt/iotproxy/backend/.env` (never commit this file):

```env
# ── Database ──────────────────────────────────────────────────────────────────
# Use the DB password generated in step 3
DATABASE_URL=postgresql://iotproxy:REPLACE_DB_PASSWORD@timescaledb:5432/iotproxy

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_BULL_URL=redis://redis-bull:6379/0
REDIS_CACHE_URL=redis://redis-cache:6379/0

# ── MQTT ──────────────────────────────────────────────────────────────────────
MQTT_BROKER_URL=mqtt://mosquitto:1883

# ── Object storage (MinIO) ────────────────────────────────────────────────────
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=REPLACE_MINIO_PASSWORD
MINIO_BUCKET=iotproxy-exports

# ── Mail ──────────────────────────────────────────────────────────────────────
SMTP_HOST=your.smtp.host
SMTP_PORT=587
SMTP_USER=noreply@iotproxy.ung.uz
SMTP_PASS=your-smtp-password

# ── Auth — paste values from step 3 ──────────────────────────────────────────
JWT_SECRET=REPLACE_WITH_FIRST_OPENSSL_OUTPUT
JWT_REFRESH_SECRET=REPLACE_WITH_SECOND_OPENSSL_OUTPUT

# ── App ───────────────────────────────────────────────────────────────────────
APP_BASE_URL=https://iotproxy.ung.uz
NODE_ENV=production
POD_NAME=backend-1
```

Restrict file permissions:

```bash
chmod 600 /opt/iotproxy/backend/.env
```

---

## 5. Update the production Compose file

The prod Compose file at `infra/docker/docker-compose.prod.yml` needs the database password and MinIO password updated to match the values you set in `.env`. Edit the file:

```bash
nano /opt/iotproxy/infra/docker/docker-compose.prod.yml
```

Change the following lines:

```yaml
# timescaledb service — environment:
POSTGRES_PASSWORD: REPLACE_DB_PASSWORD        # same value as in DATABASE_URL

# minio service — environment:
MINIO_ROOT_PASSWORD: REPLACE_MINIO_PASSWORD   # same value as MINIO_SECRET_KEY

# backend service — environment:
# Remove hardcoded credentials and load from the .env file instead
```

Replace the entire `backend` service `environment:` block with an `env_file` reference so secrets are not duplicated in the Compose file:

```yaml
  backend:
    build:
      context: ../../
      dockerfile: backend/Dockerfile.dev
    restart: unless-stopped
    env_file:
      - ../../backend/.env
    depends_on:
      - timescaledb
      - redis-bull
      - redis-cache
```

And update `APP_BASE_URL` for the frontend service:

```yaml
  frontend:
    environment:
      VITE_API_TARGET: http://backend:3000
      VITE_WS_TARGET: ws://backend:3000
```

---

## 6. Place the SSL certificate

```bash
sudo mkdir -p /etc/ssl/iotproxy
sudo cp /path/to/iotproxy.ung.uz.crt /etc/ssl/iotproxy/iotproxy.ung.uz.crt
sudo chmod 644 /etc/ssl/iotproxy/iotproxy.ung.uz.crt
```

> Your `.crt` file must contain the **full chain** — leaf certificate first, then any intermediate CA certificates. Most institutional CAs issue bundles already in this format.

---

## 7. Build and start all services

```bash
cd /opt/iotproxy
docker compose -f infra/docker/docker-compose.prod.yml up --build -d
```

Wait for TimescaleDB to become healthy (~20 seconds):

```bash
docker compose -f infra/docker/docker-compose.prod.yml ps
```

All services should show `running`.

---

## 8. Run database migrations

```bash
docker compose -f infra/docker/docker-compose.prod.yml exec backend \
  sh -c "npm run migrate"
```

Expected output ends with:

```
Migration ... has been executed successfully.
```

---

## 9. Create the first admin user

### 9a. Generate a bcrypt password hash

```bash
docker compose -f infra/docker/docker-compose.prod.yml exec backend \
  node -e "
    const bcrypt = require('bcrypt');
    bcrypt.hash('REPLACE_WITH_STRONG_PASSWORD', 12).then(h => console.log(h));
  "
```

Copy the printed hash (starts with `$2b$12$…`). Use a strong password — this is your only admin account.

### 9b. Insert the admin user

```bash
docker compose -f infra/docker/docker-compose.prod.yml exec timescaledb \
  psql -U iotproxy -d iotproxy
```

Inside the psql prompt:

```sql
-- 1. Create the organization
INSERT INTO organizations (id, name, slug, is_active)
VALUES (
  gen_random_uuid(),
  'UNG',
  'ung',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Create the SYSTEM_ADMIN user
--    Replace the hash and email below
INSERT INTO users (id, organization_id, email, password_hash, role, is_active)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM organizations WHERE slug = 'ung'),
  'admin@iotproxy.ung.uz',
  '$2b$12$REPLACE_WITH_HASH_FROM_STEP_9a',
  'SYSTEM_ADMIN',
  true
);

-- 3. Verify
SELECT id, email, role, is_active FROM users WHERE email = 'admin@iotproxy.ung.uz';
\q
```

---

## 10. Install and configure nginx

```bash
sudo apt install -y nginx
```

Create `/etc/nginx/sites-available/iotproxy`:

```nginx
# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name iotproxy.ung.uz;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name iotproxy.ung.uz;

    ssl_certificate     /etc/ssl/iotproxy/iotproxy.ung.uz.crt;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Increase buffer for large API responses (bulk readings, exports)
    proxy_buffer_size          128k;
    proxy_buffers              4 256k;
    proxy_busy_buffers_size    256k;
    client_max_body_size       10m;

    # Frontend
    location / {
        proxy_pass         http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # Backend REST API
    location /api {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Socket.IO (real-time dashboard updates)
    location /socket.io {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

Enable the site and reload:

```bash
sudo ln -s /etc/nginx/sites-available/iotproxy /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl enable --now nginx
```

---

## 11. Expose MQTT ports (optional)

If IoT devices connect directly to the MQTT broker, open ports on the firewall:

```bash
sudo ufw allow 1883/tcp   # MQTT TCP
sudo ufw allow 9002/tcp   # MQTT over WebSocket
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

> Port 1883 is **unauthenticated** by default (development Mosquitto config). For production, replace the `allow_anonymous true` line in `infra/mosquitto/mosquitto.conf` with proper ACL-based authentication before exposing this port publicly.

---

## 12. Configure auto-start on reboot

Create a systemd service so Docker Compose restarts automatically after a server reboot:

```bash
sudo tee /etc/systemd/system/iotproxy.service > /dev/null <<'EOF'
[Unit]
Description=IoT Proxy Docker Compose stack
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/iotproxy
ExecStart=docker compose -f infra/docker/docker-compose.prod.yml up -d --remove-orphans
ExecStop=docker compose -f infra/docker/docker-compose.prod.yml down
TimeoutStartSec=180

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable iotproxy
```

---

## 13. Verify the deployment

```bash
# Health check
curl -s https://iotproxy.ung.uz/api/v1/health | jq .

# Login and get a JWT
curl -s -X POST https://iotproxy.ung.uz/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@iotproxy.ung.uz","password":"REPLACE_WITH_STRONG_PASSWORD"}' | jq .

# Swagger UI
# Open in browser: https://iotproxy.ung.uz/api/docs
```

---

## Service layout

All services run inside Docker on the internal Compose network (`iotproxy_default`). Only nginx is exposed to the internet.

```
Internet
   │
   ▼
nginx :443 (HTTPS)
   ├── /          → frontend :5173  (React UI)
   ├── /api       → backend  :3000  (NestJS REST)
   └── /socket.io → backend  :3000  (Socket.IO)

Internal network only:
   backend → timescaledb :5432
   backend → redis-bull   :6379
   backend → redis-cache  :6380
   backend → mosquitto    :1883
   backend → minio        :9000
```

---

## Updating the application

```bash
cd /opt/iotproxy
git pull

# Rebuild changed images and restart affected containers only
docker compose -f infra/docker/docker-compose.prod.yml up --build -d

# Run any new migrations
docker compose -f infra/docker/docker-compose.prod.yml exec backend \
  sh -c "npm run migrate"
```

---

## Useful operations

```bash
# View live backend logs
docker compose -f infra/docker/docker-compose.prod.yml logs -f backend

# View all service logs
docker compose -f infra/docker/docker-compose.prod.yml logs -f

# Open a psql shell
docker compose -f infra/docker/docker-compose.prod.yml exec timescaledb \
  psql -U iotproxy -d iotproxy

# Restart a single service
docker compose -f infra/docker/docker-compose.prod.yml restart backend

# Stop everything (data volumes are preserved)
docker compose -f infra/docker/docker-compose.prod.yml down
```

---

## Backup

TimescaleDB volumes persist inside Docker named volumes. Take a logical dump regularly:

```bash
# Dump to /opt/backups (create the directory first)
mkdir -p /opt/backups

docker compose -f /opt/iotproxy/infra/docker/docker-compose.prod.yml exec timescaledb \
  pg_dump -U iotproxy iotproxy | gzip > /opt/backups/iotproxy-$(date +%F).sql.gz
```

Automate with cron:

```bash
# /etc/cron.d/iotproxy-backup
0 2 * * * root docker compose -f /opt/iotproxy/infra/docker/docker-compose.prod.yml exec -T timescaledb pg_dump -U iotproxy iotproxy | gzip > /opt/backups/iotproxy-$(date +\%F).sql.gz
```

---

## Monitoring (optional)

A Prometheus + Grafana + Loki stack is available:

```bash
docker compose -f infra/docker/docker-compose.monitoring.yml up -d
```

| Service | Internal port | Purpose |
|---------|--------------|---------|
| Prometheus | 9090 | Metrics scraping |
| Grafana | 3001 | Dashboards |
| Loki | 3100 | Log aggregation |

> Monitoring ports are **not** exposed in the nginx config above. Access them over SSH tunnel or add separate nginx location blocks behind authentication.

---

## Troubleshooting

**Container exits immediately** — check logs: `docker compose ... logs backend`. Common cause: missing or malformed `backend/.env`.

**Migration fails** — the database may not be ready yet. Wait 30 seconds and retry. If the error is "relation already exists", the database was already initialized; safe to ignore.

**nginx `502 Bad Gateway`** — the frontend or backend container isn't running. Run `docker compose ... ps` and check which service is unhealthy.

**HTTPS not working** — verify nginx can read the certificate (`sudo nginx -t`) and that the `.crt` file contains the full chain (leaf + intermediates).

**Login returns `401 Invalid credentials`** — verify the hash was generated with `bcrypt` (cost factor 12) and copied without trailing whitespace or newlines.
