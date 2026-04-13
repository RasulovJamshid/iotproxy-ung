# IoT Proxy

Monorepo for an IoT ingestion and querying platform.

## Workspaces

- `backend` - NestJS API and workers
- `frontend` - React + Vite operator UI
- `shared` - shared types/constants

## Requirements

- Node.js 20+
- npm 10+
- Docker + Docker Compose (for local stack)

## Install

```bash
npm install --workspaces --include-workspace-root
```

## Common commands

```bash
npm run dev
npm run build
npm run test
npm run lint
npm run format:check
```

## Backend utilities

```bash
npm run migrate
npm run seed
```

## Docker development

```bash
docker compose -f infra/docker/docker-compose.dev.yml up --build
```

The frontend proxy is environment-driven:

- Host mode defaults: `http://localhost:3000` and `ws://localhost:3000`
- Docker mode sets `VITE_API_TARGET` and `VITE_WS_TARGET` in compose

## Documentation

- **[Quick Start: Adapters](./docs/QUICK_START_ADAPTERS.md)** - Get started with Site Adapters in 5 minutes
- **[Adapter Examples](./docs/ADAPTER_EXAMPLES.md)** - Real-world examples for inbound mapping and pull configs
- **[Terminology Guide](./docs/TERMINOLOGY.md)** - Understanding flexible data sources beyond IoT sensors

### Key Features

- **Site Adapters**: Transform and normalize data from any source
  - **Inbound Mapping**: JSONPath-based transformation for MQTT/API data
  - **Pull Configuration**: Scheduled fetching from external APIs
- **Discovery Mode**: Auto-detect data fields and patterns
- **WebSocket Control**: Enable/disable real-time updates per API key
- **Flexible Data Sources**: Track IoT sensors, business metrics, API data, or any time-series stream
