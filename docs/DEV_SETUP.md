# Dev Server Setup Guide

Get the full IoT Proxy stack running locally with one admin user in about 10 minutes.

**Domain**: `iotproxy.ung.uz` (configure in your reverse proxy / hosts file as needed)

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 20+ |
| npm | 10+ |
| Docker | 24+ |
| Docker Compose | v2 (plugin, `docker compose`) |
| Git | any recent |

---

## 1. Clone and install dependencies

```bash
git clone <repo-url> iotproxy
cd iotproxy
npm install --workspaces --include-workspace-root
```

---

## 2. Create the backend environment file

Create `backend/.env` (this file is git-ignored):

```env
# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://iotproxy:iotproxy@localhost:5432/iotproxy

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_BULL_URL=redis://localhost:6379/0
REDIS_CACHE_URL=redis://localhost:6380/0

# ── MQTT ──────────────────────────────────────────────────────────────────────
MQTT_BROKER_URL=mqtt://localhost:1883

# ── Object storage (MinIO) ────────────────────────────────────────────────────
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=iotproxy-exports

# ── Mail (MailHog — local catch-all) ─────────────────────────────────────────
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=noreply@iotproxy.ung.uz
SMTP_PASS=unused

# ── Auth ──────────────────────────────────────────────────────────────────────
# Use long random strings in production. Must be at least 32 characters each.
JWT_SECRET=dev-secret-change-me-minimum-32-chars-xxxx
JWT_REFRESH_SECRET=dev-refresh-secret-32-chars-minimum-xx

# ── App ───────────────────────────────────────────────────────────────────────
APP_BASE_URL=http://iotproxy.ung.uz
NODE_ENV=development
```

> **Security note**: never commit `.env` to git. Rotate `JWT_SECRET` and `JWT_REFRESH_SECRET` before any production use.

---

## 3. Start infrastructure services

The infrastructure stack (TimescaleDB, Redis ×2, Mosquitto, MinIO, MailHog) runs in Docker. The backend and frontend run on the host for fast hot-reload.

```bash
# From the repo root
docker compose -f infra/docker/docker-compose.dev.yml up \
  timescaledb redis-bull redis-cache mosquitto minio mailhog \
  --build -d
```

Wait for the health checks to pass (usually ~15 seconds):

```bash
docker compose -f infra/docker/docker-compose.dev.yml ps
```

All listed services should show `healthy` or `running`.

---

## 4. Run database migrations

Migrations create all tables, hypertables, and continuous aggregates.

```bash
cd backend
npm run migrate
```

Expected output ends with:

```
Migration ... has been executed successfully.
```

---

## 5. Create the first admin user

The seed script creates demo data (organizations, sites, sensors, adapters). It does **not** create a user account. Use the SQL snippet below to add a `SYSTEM_ADMIN` user manually.

### 5a. Generate a bcrypt password hash

```bash
node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('changeme123', 10).then(h => console.log(h));
"
```

Copy the printed hash (starts with `$2b$10$…`).

### 5b. Insert the admin user

```bash
# Connect to the database
docker compose -f infra/docker/docker-compose.dev.yml exec timescaledb \
  psql -U iotproxy -d iotproxy
```

Inside the psql prompt, run:

```sql
-- 1. Create an organization for the admin
INSERT INTO organizations (id, name, slug, is_active)
VALUES (
  gen_random_uuid(),
  'UNG',
  'ung',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Create the admin user (replace the hash and email as needed)
INSERT INTO users (id, organization_id, email, password_hash, role, is_active)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM organizations WHERE slug = 'ung'),
  'admin@iotproxy.ung.uz',
  '$2b$10$REPLACE_WITH_HASH_FROM_STEP_5a',
  'SYSTEM_ADMIN',
  true
);

-- 3. Verify
SELECT id, email, role FROM users WHERE email = 'admin@iotproxy.ung.uz';
\q
```

---

## 6. (Optional) Seed demo data

```bash
# From repo root
cd backend
npm run seed
```

This creates one organization (`Acme IoT`), three sites, several sensors, and three site adapters covering the main adapter modes. Useful for exploring the UI without wiring up real devices.

---

## 7. Start the backend

```bash
# From repo root
cd backend
npm run dev
```

The API starts on `http://localhost:3000`. You should see:

```
🚀 Application is running on: http://localhost:3000
📚 API Documentation: http://localhost:3000/api/docs
```

---

## 8. Start the frontend

Open a second terminal:

```bash
cd frontend
npm run dev
```

Vite starts on `http://localhost:5173`. API calls are proxied to the backend on port 3000 automatically.

---

## 9. Log in

Open `http://localhost:5173` (or `https://iotproxy.ung.uz` once nginx is configured — see §10).

| Field | Value |
|-------|-------|
| Email | `admin@iotproxy.ung.uz` |
| Password | `changeme123` (or whatever you set in step 5a) |

After login the dashboard shows all organizations visible to a `SYSTEM_ADMIN`.

---

## 10. Point `iotproxy.ung.uz` to your server

### 10a. DNS

Add an **A record** for `iotproxy.ung.uz` pointing to your server's public IP address in your DNS control panel.

### 10b. Place the certificate file

Copy your `.crt` file to the server (adjust the path to suit your layout):

```bash
sudo mkdir -p /etc/ssl/iotproxy
sudo cp iotproxy.ung.uz.crt /etc/ssl/iotproxy/iotproxy.ung.uz.crt
sudo chmod 644 /etc/ssl/iotproxy/iotproxy.ung.uz.crt
```

> If your CA issued the certificate as a chain (intermediate + leaf), make sure the `.crt` file contains the **full chain** (leaf certificate first, then intermediates). Most CA bundles are already in this format.

### 10c. nginx configuration

Create `/etc/nginx/sites-available/iotproxy`:

```nginx
# Redirect plain HTTP to HTTPS
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

    # Frontend (Vite dev server)
    location / {
        proxy_pass         http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Vite HMR WebSocket
    location /ws {
        proxy_pass         http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
    }

    # Backend API
    location /api {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Socket.IO (real-time dashboard updates)
    location /socket.io {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/iotproxy /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 10d. Update `APP_BASE_URL` in `backend/.env`

```env
APP_BASE_URL=https://iotproxy.ung.uz
```

Restart the backend after changing the env file.

---

## 11. Verify the setup

```bash
# Health check
curl http://localhost:3000/api/v1/health

# Log in and get a JWT
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@iotproxy.ung.uz","password":"changeme123"}' | jq .

# Swagger UI
open http://localhost:3000/api/docs
```

---

## Service reference

| Service | URL / port | Purpose |
|---------|-----------|---------|
| Backend API | `localhost:3000` | NestJS REST + WebSocket |
| Swagger UI | `localhost:3000/api/docs` | Interactive API explorer |
| Frontend (Vite) | `localhost:5173` | React operator UI |
| TimescaleDB | `localhost:5432` | Primary database |
| Redis (BullMQ) | `localhost:6379` | Job queues |
| Redis (cache) | `localhost:6380` | Response cache |
| Mosquitto MQTT | `localhost:1883` | MQTT broker (TCP) |
| Mosquitto WS | `localhost:9002` | MQTT over WebSocket |
| MinIO API | `localhost:9000` | Object storage (exports) |
| MinIO Console | `localhost:9090` | MinIO admin UI |
| MailHog SMTP | `localhost:1025` | Catches outbound emails |
| MailHog UI | `localhost:8025` | View captured emails |

---

## Stopping everything

```bash
# Stop backend and frontend: Ctrl+C in each terminal

# Stop infrastructure containers
docker compose -f infra/docker/docker-compose.dev.yml down

# Also remove volumes (full reset — loses all data)
docker compose -f infra/docker/docker-compose.dev.yml down -v
```

---

## Troubleshooting

**`DATABASE_URL not set`** — make sure `backend/.env` exists and you ran the command from inside `backend/`.

**Migration fails with "relation already exists"** — the database was partially initialized. Run `docker compose ... down -v` and restart from step 3.

**Vite proxy returns 503** — the backend isn't running or crashed on startup. Check the backend terminal for errors.

**Login returns 401 "Invalid credentials"** — double-check the bcrypt hash was generated with `bcrypt` (not `bcryptjs`) and that you copied it without trailing whitespace.

**MQTT messages not arriving** — confirm Mosquitto is healthy (`docker compose ... ps`) and that the backend log shows `[MqttModule] Connected`.
