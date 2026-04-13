# API Key Permissions - Complete Guide

## Overview

API keys in IoTProxy now support **flexible permissions** for both data ingestion and querying. This allows you to create keys with different access levels for various use cases.

---

## ✅ Updated Controllers

The following controllers now support **both JWT and API key authentication**:

1. ✅ **Sensors Controller** (`/api/v1/sensors`)
2. ✅ **Sites Controller** (`/api/v1/sites`)
3. ✅ **Query Controller** (`/api/v1/query`)
4. ✅ **Alerts Controller** (`/api/v1/alerts`)
5. ✅ **Ingest Controller** (`/api/v1/ingest`) *(already supported)*

---

## Permission Types

### **1. `ingest` Permission**

**Purpose:** Send sensor data to the platform

**Allowed Operations:**
- ✅ `POST /api/v1/ingest/readings` (single reading)
- ✅ `POST /api/v1/ingest/readings/bulk` (batch readings)

**Use Cases:**
- IoT devices
- Edge gateways
- Data collectors
- MQTT bridges

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/ingest/readings \
  -H "X-API-Key: iotproxy_live_ingest_key" \
  -H "Content-Type: application/json" \
  -d '{
    "sensorId": "temp-01",
    "phenomenonTime": "2026-04-10T06:30:00Z",
    "data": { "temperature": 23.5 }
  }'
```

---

### **2. `read` Permission**

**Purpose:** Query and read data (read-only access)

**Allowed Operations:**
- ✅ `GET /api/v1/sensors` (list sensors)
- ✅ `GET /api/v1/sensors/:id` (get sensor details)
- ✅ `GET /api/v1/sensors/:id/config` (get sensor config)
- ✅ `GET /api/v1/sites` (list sites)
- ✅ `GET /api/v1/sites/:id` (get site details)
- ✅ `GET /api/v1/query/readings/:sensorId` (time-series query)
- ✅ `GET /api/v1/query/sites/:siteId/latest` (latest readings)
- ✅ `GET /api/v1/alerts/rules` (list alert rules)
- ✅ `GET /api/v1/alerts/events` (get alert events)

**Use Cases:**
- Dashboards (Grafana, Tableau)
- Analytics platforms
- Reporting tools
- Mobile apps (read-only)
- Public data access

**Example:**
```bash
# List all sensors
curl http://localhost:3000/api/v1/sensors \
  -H "X-API-Key: iotproxy_live_read_key"

# Query time-series data
curl "http://localhost:3000/api/v1/query/readings/sensor-uuid?startTs=2026-04-01T00:00:00Z&endTs=2026-04-10T00:00:00Z" \
  -H "X-API-Key: iotproxy_live_read_key"

# Get latest readings for a site
curl http://localhost:3000/api/v1/query/sites/site-uuid/latest \
  -H "X-API-Key: iotproxy_live_read_key"
```

---

### **3. `admin` Permission**

**Purpose:** Full administrative access (read + write + manage)

**Allowed Operations:**
- ✅ **All `ingest` operations**
- ✅ **All `read` operations**
- ✅ `POST /api/v1/sensors` (create sensor)
- ✅ `PATCH /api/v1/sensors/:id` (update sensor)
- ✅ `PATCH /api/v1/sensors/:id/status` (update sensor status)
- ✅ `POST /api/v1/sensors/:id/config` (update sensor config)
- ✅ `POST /api/v1/sensors/virtual` (create virtual sensor)
- ✅ `POST /api/v1/sites` (create site)
- ✅ `PATCH /api/v1/sites/:id` (update site)
- ✅ `PATCH /api/v1/sites/:id/status` (transition site status)
- ✅ `POST /api/v1/alerts/rules` (create alert rule)
- ✅ `PATCH /api/v1/alerts/rules/:id` (update alert rule)
- ✅ `DELETE /api/v1/alerts/rules/:id` (delete alert rule)

**Use Cases:**
- Automation scripts
- CI/CD pipelines
- Infrastructure-as-code tools
- Admin dashboards
- Backup/migration tools

**Example:**
```bash
# Create a new sensor
curl -X POST http://localhost:3000/api/v1/sensors \
  -H "X-API-Key: iotproxy_live_admin_key" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site-uuid",
    "name": "New Temperature Sensor",
    "description": "Warehouse zone A"
  }'

# Update site status
curl -X PATCH http://localhost:3000/api/v1/sites/site-uuid/status \
  -H "X-API-Key: iotproxy_live_admin_key" \
  -H "Content-Type: application/json" \
  -d '{ "status": "ACTIVE" }'
```

---

## Permission Matrix

| Endpoint | `ingest` | `read` | `admin` | JWT |
|----------|----------|--------|---------|-----|
| **POST** `/ingest/readings` | ✅ | ❌ | ✅ | ✅ |
| **GET** `/sensors` | ❌ | ✅ | ✅ | ✅ |
| **GET** `/sensors/:id` | ❌ | ✅ | ✅ | ✅ |
| **POST** `/sensors` | ❌ | ❌ | ✅ | ✅ (ADMIN) |
| **PATCH** `/sensors/:id` | ❌ | ❌ | ✅ | ✅ (ADMIN) |
| **GET** `/sites` | ❌ | ✅ | ✅ | ✅ |
| **POST** `/sites` | ❌ | ❌ | ✅ | ✅ (ADMIN) |
| **GET** `/query/readings/:id` | ❌ | ✅ | ✅ | ✅ |
| **GET** `/alerts/rules` | ❌ | ✅ | ✅ | ✅ |
| **POST** `/alerts/rules` | ❌ | ❌ | ✅ | ✅ (ADMIN) |

---

## Authentication Methods

### **1. API Key (X-API-Key Header)**

```bash
curl http://localhost:3000/api/v1/sensors \
  -H "X-API-Key: iotproxy_live_abc123..."
```

**Supported by:**
- All `/ingest/*` endpoints
- All `/sensors/*` endpoints
- All `/sites/*` endpoints
- All `/query/*` endpoints
- All `/alerts/*` endpoints

---

### **2. JWT Bearer Token**

```bash
curl http://localhost:3000/api/v1/sensors \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Supported by:**
- All endpoints (universal)

---

## Creating API Keys

### **Via Frontend UI**

1. Go to **API Keys** page
2. Click **"Generate Key"**
3. Fill in details:
   - **Name:** Descriptive name (e.g., "Production IoT Gateway")
   - **Site scope:** Optional (restrict to specific site)
   - **Permissions:** Select one or more:
     - ☐ `ingest` - Send data
     - ☐ `read` - Query data
     - ☐ `admin` - Full access
   - **WebSocket:** Enable for real-time updates
   - **Expires at:** Optional expiration date
4. Click **"Generate"**
5. **Copy the key immediately** (shown only once!)

---

### **Via API**

```bash
curl -X POST http://localhost:3000/api/v1/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production IoT Gateway",
    "permissions": ["ingest", "read"],
    "websocketEnabled": true,
    "expiresAt": "2027-01-01T00:00:00Z"
  }'
```

**Response:**
```json
{
  "id": "key-uuid",
  "key": "iotproxy_live_abc123...",
  "prefix": "iotproxy_live_abc",
  "name": "Production IoT Gateway",
  "permissions": ["ingest", "read"],
  "websocketEnabled": true,
  "expiresAt": "2027-01-01T00:00:00Z",
  "createdAt": "2026-04-10T06:30:00Z"
}
```

⚠️ **Save the `key` value immediately - it will not be shown again!**

---

## Permission Combinations

### **Recommended Combinations**

| Use Case | Permissions | Example |
|----------|-------------|---------|
| **IoT Device (send-only)** | `ingest` | Temperature sensor |
| **Dashboard (view-only)** | `read` | Grafana, Tableau |
| **Smart Device (send + query)** | `ingest` + `read` | Smart thermostat |
| **Admin Tool** | `admin` | Infrastructure automation |
| **Public API** | `read` | Public data portal |

---

## Site Scoping

API keys can be **scoped to a specific site**:

```json
{
  "name": "Factory A Gateway",
  "siteId": "factory-a-uuid",
  "permissions": ["ingest"]
}
```

**Effect:**
- ✅ Can only ingest data for Factory A
- ❌ Cannot access Factory B data
- ❌ Cannot access organization-wide endpoints

**Use Cases:**
- Multi-tenant deployments
- Per-site security isolation
- Third-party integrations (limit scope)

---

## Security Best Practices

### **1. Principle of Least Privilege**

✅ **DO:**
- Give `ingest` only to IoT devices
- Give `read` only to dashboards
- Give `admin` only to trusted automation

❌ **DON'T:**
- Give `admin` to IoT devices
- Give `ingest` to public APIs
- Use the same key everywhere

---

### **2. Key Rotation**

✅ **DO:**
- Set expiration dates (30-90 days)
- Rotate keys regularly
- Revoke unused keys immediately

❌ **DON'T:**
- Use keys indefinitely
- Share keys across environments
- Commit keys to Git

---

### **3. Environment Variables**

✅ **DO:**
```bash
# .env
IOT_GATEWAY_KEY=iotproxy_live_abc123...
DASHBOARD_KEY=iotproxy_live_xyz789...
```

❌ **DON'T:**
```javascript
// ❌ Hardcoded in source code
const API_KEY = "iotproxy_live_abc123...";
```

---

## Error Responses

### **401 Unauthorized - Missing Credentials**
```json
{
  "statusCode": 401,
  "message": "No credentials provided"
}
```

**Fix:** Add `X-API-Key` header or `Authorization: Bearer` header

---

### **401 Unauthorized - Invalid Key**
```json
{
  "statusCode": 401,
  "message": "Invalid or expired API key"
}
```

**Fix:** Check if key is:
- Correct (no typos)
- Not revoked
- Not expired

---

### **401 Unauthorized - Insufficient Permission**
```json
{
  "statusCode": 401,
  "message": "API key lacks read permission"
}
```

**Fix:** Create a new key with the required permission (`read`, `admin`, etc.)

---

## Migration Guide

### **Before (JWT Only)**

```bash
# 1. Login to get JWT
curl -X POST http://localhost:3000/api/v1/auth/login \
  -d '{"email":"user@example.com","password":"pass"}'

# 2. Use JWT for all requests
curl http://localhost:3000/api/v1/sensors \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### **After (API Keys Supported)**

```bash
# 1. Generate API key (one-time, via UI or API)

# 2. Use API key for all requests
curl http://localhost:3000/api/v1/sensors \
  -H "X-API-Key: iotproxy_live_abc123..."
```

**Benefits:**
- ✅ No need to login/refresh tokens
- ✅ Long-lived credentials
- ✅ Granular permissions
- ✅ Easy to rotate/revoke

---

## Testing

### **Test `ingest` Permission**

```bash
curl -X POST http://localhost:3000/api/v1/ingest/readings \
  -H "X-API-Key: YOUR_INGEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sensorId": "test-sensor",
    "phenomenonTime": "2026-04-10T06:30:00Z",
    "data": { "value": 42 }
  }'
```

**Expected:** `202 Accepted`

---

### **Test `read` Permission**

```bash
curl http://localhost:3000/api/v1/sensors \
  -H "X-API-Key: YOUR_READ_KEY"
```

**Expected:** `200 OK` with sensor list

---

### **Test `admin` Permission**

```bash
curl -X POST http://localhost:3000/api/v1/sensors \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site-uuid",
    "name": "Test Sensor"
  }'
```

**Expected:** `201 Created` with sensor object

---

## Summary

✅ **API keys now work with all major endpoints**  
✅ **Three permission levels: `ingest`, `read`, `admin`**  
✅ **Flexible authentication: API key OR JWT**  
✅ **Site-scoped keys for multi-tenant security**  
✅ **Backward compatible with existing JWT authentication**

**Use API keys for:**
- 🤖 IoT devices and gateways
- 📊 Dashboards and analytics
- 🔧 Automation and CI/CD
- 🌐 Third-party integrations

**Use JWT for:**
- 👤 User login sessions
- 🖥️ Web application frontend
- 🔐 Admin operations requiring user context
