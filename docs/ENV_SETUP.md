# Environment Variables Setup

## Overview

This project uses a centralized `.env` file at the project root to manage environment variables for both local development and Docker deployments.

## File Structure

```
iotproxy/
├── .env                          # Your local environment variables (gitignored)
├── .env.example                  # Template with all required variables
├── backend/
│   └── .env.example             # Backend-specific template (legacy, optional)
├── frontend/
│   └── .env.local               # Frontend-specific overrides (gitignored)
└── infra/
    └── docker/
        ├── docker-compose.dev.yml
        ├── docker-compose.prod.yml          # Your production config (gitignored)
        └── docker-compose.prod.yml.example  # Production template
```

## Setup Instructions

### 1. Initial Setup

Copy the example file to create your local `.env`:

```bash
cp .env.example .env
```

### 2. Configure Variables

Edit `.env` and update the values according to your environment:

```bash
# Required: Update these for production
JWT_SECRET=your-secure-random-32-char-minimum-secret
JWT_REFRESH_SECRET=your-secure-random-32-char-minimum-refresh-secret

# Optional: Update database credentials
POSTGRES_PASSWORD=your-secure-password

# Optional: Update MinIO credentials
MINIO_ROOT_USER=your-minio-user
MINIO_ROOT_PASSWORD=your-minio-password
```

### 3. Docker Compose Integration

The docker-compose files automatically load variables from the root `.env` file using the `env_file` directive:

```yaml
services:
  backend:
    env_file:
      - ../../.env
    environment:
      # Docker-specific overrides
      DATABASE_URL: postgresql://iotproxy:iotproxy@timescaledb:5432/iotproxy
```

## How It Works

### Variable Priority (Highest to Lowest)

1. **Environment variables** defined in `docker-compose.yml` `environment` section
2. **Variables from `.env` file** loaded via `env_file` directive
3. **System environment variables** (if any)

### Development vs Production

**Development (`docker-compose.dev.yml`):**
- Uses the root `.env` file
- Overrides service URLs to use Docker service names (e.g., `timescaledb`, `redis-bull`)
- Includes development-specific services like MailHog

**Production (`docker-compose.prod.yml`):**
- Uses the root `.env` file
- Must be created from `docker-compose.prod.yml.example`
- Uses production-grade configurations
- No development tools included

## Environment Variables Reference

### Database
- `DATABASE_URL` - Full PostgreSQL connection string
- `POSTGRES_DB` - Database name
- `POSTGRES_USER` - Database user
- `POSTGRES_PASSWORD` - Database password

### Redis
- `REDIS_BULL_URL` - Redis URL for Bull queue
- `REDIS_CACHE_URL` - Redis URL for caching

### MQTT
- `MQTT_BROKER_URL` - MQTT broker connection URL

### Authentication
- `JWT_SECRET` - Secret for JWT token signing (min 32 chars)
- `JWT_REFRESH_SECRET` - Secret for refresh token signing (min 32 chars)

### MinIO (Object Storage)
- `MINIO_ENDPOINT` - MinIO server endpoint
- `MINIO_ROOT_USER` - MinIO root username
- `MINIO_ROOT_PASSWORD` - MinIO root password
- `MINIO_ACCESS_KEY` - MinIO access key
- `MINIO_SECRET_KEY` - MinIO secret key
- `MINIO_BUCKET` - Default bucket name

### SMTP (Email)
- `SMTP_HOST` - SMTP server host
- `SMTP_PORT` - SMTP server port
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password

### Application
- `APP_BASE_URL` - Base URL for the application
- `NODE_ENV` - Environment (development/production)
- `POD_NAME` - Pod/instance identifier

### Frontend (Vite)
- `VITE_API_TARGET` - Backend API URL
- `VITE_WS_TARGET` - WebSocket URL

## Production Deployment

### 1. Create Production Config

```bash
# Copy the production docker-compose template
cp infra/docker/docker-compose.prod.yml.example infra/docker/docker-compose.prod.yml

# Update production-specific settings in docker-compose.prod.yml
```

### 2. Update Production .env

```bash
# Edit .env with production values
nano .env

# Ensure all secrets are updated
# - JWT_SECRET
# - JWT_REFRESH_SECRET
# - POSTGRES_PASSWORD
# - MINIO credentials
# - SMTP credentials (if using real email)
```

### 3. Deploy

```bash
cd infra/docker
docker-compose -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Variables Not Loading in Docker

1. **Check file path**: Ensure `env_file` paths are relative to the docker-compose file location
2. **Verify .env exists**: Make sure `.env` file exists at the project root
3. **Check syntax**: Ensure `.env` uses `KEY=value` format (no spaces around `=`)
4. **Rebuild containers**: Run `docker-compose down && docker-compose up --build`

### Service Connection Issues

If services can't connect to each other:
- Verify service names match in `environment` overrides
- Check that Docker network is properly configured
- Use `docker-compose logs <service>` to debug

### Missing Variables

If variables are missing:
1. Compare your `.env` with `.env.example`
2. Ensure all required variables are set
3. Check for typos in variable names

## Best Practices

1. **Never commit `.env` files** - They contain secrets
2. **Keep `.env.example` updated** - Document all required variables
3. **Use strong secrets in production** - Generate random 32+ character strings
4. **Rotate secrets regularly** - Update JWT secrets and passwords periodically
5. **Use different secrets per environment** - Don't reuse dev secrets in production
6. **Document custom variables** - Add new variables to this documentation

## Migration from Old Setup

If you were using `backend/.env` previously:

1. Copy your `backend/.env` to the project root:
   ```bash
   cp backend/.env .env
   ```

2. Add frontend variables to the root `.env`:
   ```bash
   echo "VITE_API_TARGET=http://localhost:3000" >> .env
   echo "VITE_WS_TARGET=ws://localhost:3000" >> .env
   ```

3. The old `backend/.env` can be kept for local development outside Docker, but Docker will use the root `.env`
