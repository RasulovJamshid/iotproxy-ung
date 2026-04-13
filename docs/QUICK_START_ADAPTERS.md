# Quick Start: Site Adapters

Get started with Site Adapters in 5 minutes.

---

## What are Site Adapters?

Site Adapters normalize and transform data from external sources:

- **Inbound Mapping**: Transform incoming MQTT/API data
- **Pull Configuration**: Fetch data from external APIs on schedule

---

## Quick Examples

### 1. Simple IoT Sensor (MQTT Inbound)

**Step 1:** Create adapter via API or UI

```bash
curl -X PUT http://localhost:3000/api/v1/adapters/your-site-id \
  -H "Authorization: Bearer your-jwt" \
  -H "Content-Type: application/json" \
  -d '{
    "inboundEnabled": true,
    "inboundMapping": {
      "timestamp": "$.ts",
      "temperature": "$.temp",
      "humidity": "$.hum"
    }
  }'
```

**Step 2:** Send MQTT data

```bash
mosquitto_pub -h localhost -p 1883 \
  -t "org/your-org-id/site/your-site-id" \
  -m '{"ts":"2026-04-09T14:30:00Z","temp":22.5,"hum":65}'
```

**Result:** Normalized reading stored:
```json
{
  "timestamp": "2026-04-09T14:30:00Z",
  "temperature": 22.5,
  "humidity": 65
}
```

---

### 2. Weather API (Pull Every 30 Minutes)

**Step 1:** Configure pull adapter

```bash
curl -X PUT http://localhost:3000/api/v1/adapters/your-site-id \
  -H "Authorization: Bearer your-jwt" \
  -H "Content-Type: application/json" \
  -d '{
    "pullEnabled": true,
    "pullUrl": "https://api.weather.com/v1/current",
    "pullMethod": "GET",
    "pullIntervalSeconds": 1800,
    "pullHeaders": {
      "Authorization": "Bearer YOUR_API_KEY"
    },
    "pullQueryParams": {
      "location": "40.7128,-74.0060"
    },
    "pullAuthType": "bearer",
    "pullAuthConfig": {
      "token": "YOUR_API_KEY"
    },
    "pullResponseMapping": {
      "timestamp": "$.observation_time",
      "temperature": "$.temperature",
      "humidity": "$.humidity"
    }
  }'
```

**Step 2:** Trigger manual pull (optional)

```bash
curl -X POST http://localhost:3000/api/v1/adapters/your-site-id/pull/trigger \
  -H "Authorization: Bearer your-jwt"
```

**Result:** Weather data pulled every 30 minutes automatically

---

### 3. Daily Sales Report (Pull Once Per Day)

```json
{
  "pullEnabled": true,
  "pullUrl": "https://pos.example.com/api/sales/today",
  "pullMethod": "GET",
  "pullIntervalSeconds": 86400,
  "pullHeaders": {
    "X-API-Key": "YOUR_POS_KEY"
  },
  "pullAuthType": "apiKey",
  "pullAuthConfig": {
    "apiKey": "YOUR_POS_KEY",
    "headerName": "X-API-Key"
  },
  "pullResponseMapping": {
    "timestamp": "$.report_time",
    "total_sales": "$.totals.sales",
    "transactions": "$.totals.count"
  }
}
```

---

## Using the UI

### Configure Inbound Mapping

1. Navigate to **Adapters** page
2. Select your site
3. Go to **Inbound** tab
4. Toggle "Enable inbound mapping"
5. Add field mappings:
   - **Target Field**: `temperature`
   - **JSONPath**: `$.temp`
6. Click **Save**

### Configure Pull

1. Navigate to **Adapters** page
2. Select your site
3. Go to **Pull** tab
4. Toggle "Enable pull"
5. Fill in:
   - **URL**: `https://api.example.com/data`
   - **Method**: `GET`
   - **Interval**: `3600` (seconds)
   - **Auth Type**: `Bearer Token`
   - **Token**: Your API key
6. Add response mappings
7. Click **Save**
8. Click **Trigger Pull** to test

---

## Common Patterns

### Pattern 1: Nested Data

**Source:**
```json
{
  "sensor": {
    "readings": {
      "temp": 22.5
    }
  }
}
```

**Mapping:**
```json
{
  "temperature": "$.sensor.readings.temp"
}
```

---

### Pattern 2: Array Data

**Source:**
```json
{
  "sensors": [
    {"id": "temp-01", "value": 22.5},
    {"id": "hum-01", "value": 65}
  ]
}
```

**Mapping:**
```json
{
  "sensor_ids": "$.sensors[*].id",
  "values": "$.sensors[*].value"
}
```

---

### Pattern 3: Timestamp Conversion

**Source:**
```json
{
  "time": "2026-04-09T14:30:00Z",
  "temp": 22.5
}
```

**Mapping:**
```json
{
  "timestamp": "$.time",
  "temperature": "$.temp"
}
```

---

## Testing

### Test JSONPath

Use online tools:
- https://jsonpath.com/
- https://jsonpath.herokuapp.com/

### View Adapter Logs

```bash
# Backend logs
docker logs docker-backend-1 --tail 100 -f | grep Adapter
```

### Check Readings

```bash
# Query recent readings
curl http://localhost:3000/api/v1/query/readings \
  -H "Authorization: Bearer your-jwt" \
  -G \
  --data-urlencode "siteId=your-site-id" \
  --data-urlencode "limit=10"
```

---

## Troubleshooting

**Inbound mapping not working?**
- Check MQTT topic: `org/{orgId}/site/{siteId}`
- Verify JSONPath syntax
- Enable discovery mode to see raw payloads

**Pull not triggering?**
- Check `pullEnabled: true`
- Verify API credentials
- Test URL manually with curl
- Check pull interval (minimum 60 seconds)

**No data appearing?**
- Ensure site is ACTIVE or DISCOVERY status
- Check API key has `ingest` permission
- Review backend logs for errors

---

## Next Steps

- See [ADAPTER_EXAMPLES.md](./ADAPTER_EXAMPLES.md) for detailed examples
- See [TERMINOLOGY.md](./TERMINOLOGY.md) for flexible data source concepts
- Explore the Adapters UI at `http://localhost:5173/adapters`

---

## API Reference

### Get Adapter
```http
GET /api/v1/adapters/:siteId
Authorization: Bearer {jwt}
```

### Update Adapter
```http
PUT /api/v1/adapters/:siteId
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "inboundEnabled": true,
  "inboundMapping": {...},
  "pullEnabled": true,
  "pullUrl": "...",
  ...
}
```

### Trigger Manual Pull
```http
POST /api/v1/adapters/:siteId/pull/trigger
Authorization: Bearer {jwt}
```

### Delete Adapter
```http
DELETE /api/v1/adapters/:siteId
Authorization: Bearer {jwt}
```
