# Site Adapter Configuration Examples

This document provides real-world examples of configuring Site Adapters for various integration scenarios.

---

## Table of Contents

1. [Inbound Mapping Examples](#inbound-mapping-examples)
2. [Pull Configuration Examples](#pull-configuration-examples)
3. [Complete Adapter Examples](#complete-adapter-examples)

---

## Inbound Mapping Examples

Inbound mappings transform incoming MQTT/API data into normalized readings.

### Example 1: Simple IoT Device (Flat Structure)

**Incoming MQTT Payload:**
```json
{
  "temp": 22.5,
  "hum": 65,
  "pressure": 1013.25,
  "battery": 87,
  "timestamp": "2026-04-09T14:30:00Z"
}
```

**Inbound Mapping Configuration:**
```json
{
  "enabled": true,
  "mapping": {
    "timestamp": "$.timestamp",
    "temperature": "$.temp",
    "humidity": "$.hum",
    "pressure_hpa": "$.pressure",
    "battery_percent": "$.battery"
  }
}
```

**Resulting Normalized Reading:**
```json
{
  "timestamp": "2026-04-09T14:30:00Z",
  "temperature": 22.5,
  "humidity": 65,
  "pressure_hpa": 1013.25,
  "battery_percent": 87
}
```

---

### Example 2: Nested IoT Sensor Data

**Incoming MQTT Payload:**
```json
{
  "device": {
    "id": "sensor-001",
    "location": "warehouse-a"
  },
  "readings": {
    "environmental": {
      "temperature_c": 18.5,
      "humidity_pct": 45
    },
    "power": {
      "voltage": 3.3,
      "current_ma": 120
    }
  },
  "meta": {
    "timestamp": "2026-04-09T14:30:00Z",
    "signal_strength": -65
  }
}
```

**Inbound Mapping Configuration:**
```json
{
  "enabled": true,
  "mapping": {
    "timestamp": "$.meta.timestamp",
    "device_id": "$.device.id",
    "location": "$.device.location",
    "temperature": "$.readings.environmental.temperature_c",
    "humidity": "$.readings.environmental.humidity_pct",
    "voltage": "$.readings.power.voltage",
    "current_ma": "$.readings.power.current_ma",
    "signal_rssi": "$.meta.signal_strength"
  }
}
```

**Resulting Normalized Reading:**
```json
{
  "timestamp": "2026-04-09T14:30:00Z",
  "device_id": "sensor-001",
  "location": "warehouse-a",
  "temperature": 18.5,
  "humidity": 45,
  "voltage": 3.3,
  "current_ma": 120,
  "signal_rssi": -65
}
```

---

### Example 3: Business Metrics (Daily Sales)

**Incoming API Payload:**
```json
{
  "report_date": "2026-04-09",
  "store_id": "STORE-042",
  "sales": {
    "total_transactions": 342,
    "total_revenue_usd": 12450.75,
    "avg_transaction_value": 36.40
  },
  "inventory": {
    "items_sold": 856,
    "returns": 12
  },
  "traffic": {
    "foot_traffic": 1205,
    "conversion_rate": 0.284
  }
}
```

**Inbound Mapping Configuration:**
```json
{
  "enabled": true,
  "mapping": {
    "timestamp": "$.report_date",
    "store_id": "$.store_id",
    "transactions": "$.sales.total_transactions",
    "revenue": "$.sales.total_revenue_usd",
    "avg_transaction": "$.sales.avg_transaction_value",
    "items_sold": "$.inventory.items_sold",
    "returns": "$.inventory.returns",
    "foot_traffic": "$.traffic.foot_traffic",
    "conversion_rate": "$.traffic.conversion_rate"
  }
}
```

---

### Example 4: Array Extraction (Multiple Sensors in One Payload)

**Incoming MQTT Payload:**
```json
{
  "gateway_id": "gw-001",
  "timestamp": "2026-04-09T14:30:00Z",
  "sensors": [
    {
      "id": "temp-01",
      "type": "temperature",
      "value": 22.5,
      "unit": "celsius"
    },
    {
      "id": "hum-01",
      "type": "humidity",
      "value": 65,
      "unit": "percent"
    }
  ]
}
```

**Inbound Mapping Configuration:**
```json
{
  "enabled": true,
  "mapping": {
    "timestamp": "$.timestamp",
    "gateway_id": "$.gateway_id",
    "sensors": "$.sensors[*]",
    "sensor_id": "$.sensors[*].id",
    "sensor_type": "$.sensors[*].type",
    "value": "$.sensors[*].value",
    "unit": "$.sensors[*].unit"
  }
}
```

---

## Pull Configuration Examples

Pull configurations fetch data from external APIs on a schedule.

### Example 1: Weather API Integration

**Pull Configuration:**
```json
{
  "enabled": true,
  "url": "https://api.weather.com/v1/current",
  "method": "GET",
  "intervalSeconds": 1800,
  "headers": {
    "Authorization": "Bearer ${WEATHER_API_KEY}",
    "Accept": "application/json"
  },
  "queryParams": {
    "location": "40.7128,-74.0060",
    "units": "metric"
  },
  "authType": "bearer",
  "authConfig": {
    "token": "${WEATHER_API_KEY}"
  },
  "responseMapping": {
    "timestamp": "$.observation_time",
    "temperature": "$.temperature",
    "humidity": "$.humidity",
    "pressure": "$.pressure",
    "wind_speed": "$.wind.speed",
    "wind_direction": "$.wind.direction",
    "conditions": "$.weather.description"
  }
}
```

**Expected API Response:**
```json
{
  "observation_time": "2026-04-09T14:30:00Z",
  "temperature": 18.5,
  "humidity": 62,
  "pressure": 1015.3,
  "wind": {
    "speed": 12.5,
    "direction": 180
  },
  "weather": {
    "description": "Partly Cloudy"
  }
}
```

---

### Example 2: Stock Price Monitoring

**Pull Configuration:**
```json
{
  "enabled": true,
  "url": "https://api.stockmarket.com/v2/quote",
  "method": "GET",
  "intervalSeconds": 300,
  "headers": {
    "X-API-Key": "${STOCK_API_KEY}"
  },
  "queryParams": {
    "symbol": "AAPL",
    "interval": "1min"
  },
  "authType": "apiKey",
  "authConfig": {
    "apiKey": "${STOCK_API_KEY}",
    "headerName": "X-API-Key"
  },
  "responseMapping": {
    "timestamp": "$.timestamp",
    "symbol": "$.symbol",
    "price": "$.price",
    "volume": "$.volume",
    "change": "$.change",
    "change_percent": "$.change_percent",
    "high": "$.high",
    "low": "$.low"
  }
}
```

---

### Example 3: E-commerce Analytics API

**Pull Configuration:**
```json
{
  "enabled": true,
  "url": "https://api.shopify.com/admin/api/2024-01/reports/sales.json",
  "method": "GET",
  "intervalSeconds": 3600,
  "headers": {
    "X-Shopify-Access-Token": "${SHOPIFY_TOKEN}",
    "Content-Type": "application/json"
  },
  "queryParams": {
    "date": "today",
    "granularity": "hourly"
  },
  "authType": "apiKey",
  "authConfig": {
    "apiKey": "${SHOPIFY_TOKEN}",
    "headerName": "X-Shopify-Access-Token"
  },
  "responseMapping": {
    "timestamp": "$.report.timestamp",
    "total_sales": "$.report.total_sales",
    "order_count": "$.report.order_count",
    "avg_order_value": "$.report.avg_order_value",
    "gross_revenue": "$.report.gross_revenue",
    "net_revenue": "$.report.net_revenue",
    "refunds": "$.report.refunds"
  }
}
```

---

### Example 4: Database Metrics via REST API

**Pull Configuration:**
```json
{
  "enabled": true,
  "url": "https://monitoring.example.com/api/v1/metrics/database",
  "method": "POST",
  "intervalSeconds": 60,
  "headers": {
    "Authorization": "Basic ${DB_MONITOR_CREDS}",
    "Content-Type": "application/json"
  },
  "body": {
    "database": "production",
    "metrics": ["connections", "queries_per_sec", "cache_hit_ratio"]
  },
  "authType": "basic",
  "authConfig": {
    "username": "${DB_MONITOR_USER}",
    "password": "${DB_MONITOR_PASS}"
  },
  "responseMapping": {
    "timestamp": "$.timestamp",
    "active_connections": "$.metrics.connections.active",
    "idle_connections": "$.metrics.connections.idle",
    "queries_per_sec": "$.metrics.queries_per_sec",
    "cache_hit_ratio": "$.metrics.cache_hit_ratio",
    "slow_queries": "$.metrics.slow_queries"
  }
}
```

---

### Example 5: Social Media Analytics

**Pull Configuration:**
```json
{
  "enabled": true,
  "url": "https://graph.facebook.com/v18.0/me/insights",
  "method": "GET",
  "intervalSeconds": 86400,
  "headers": {
    "Authorization": "Bearer ${FACEBOOK_ACCESS_TOKEN}"
  },
  "queryParams": {
    "metric": "page_impressions,page_engaged_users,page_fans",
    "period": "day"
  },
  "authType": "bearer",
  "authConfig": {
    "token": "${FACEBOOK_ACCESS_TOKEN}"
  },
  "responseMapping": {
    "timestamp": "$.data[0].values[0].end_time",
    "impressions": "$.data[0].values[0].value",
    "engaged_users": "$.data[1].values[0].value",
    "total_fans": "$.data[2].values[0].value"
  }
}
```

---

## Complete Adapter Examples

Full Site Adapter configurations combining inbound and pull.

### Example 1: Smart Building (Inbound MQTT + Weather Pull)

```json
{
  "siteId": "building-hq-001",
  "organizationId": "org-uuid",
  
  "inboundEnabled": true,
  "inboundMapping": {
    "timestamp": "$.ts",
    "floor": "$.location.floor",
    "room": "$.location.room",
    "temperature": "$.sensors.temp",
    "humidity": "$.sensors.hum",
    "co2_ppm": "$.sensors.co2",
    "occupancy": "$.sensors.occupancy"
  },
  
  "pullEnabled": true,
  "pullUrl": "https://api.weather.com/v1/current",
  "pullMethod": "GET",
  "pullIntervalSeconds": 1800,
  "pullHeaders": {
    "Authorization": "Bearer ${WEATHER_API_KEY}"
  },
  "pullQueryParams": {
    "location": "40.7128,-74.0060"
  },
  "pullAuthType": "bearer",
  "pullAuthConfig": {
    "token": "${WEATHER_API_KEY}"
  },
  "pullResponseMapping": {
    "timestamp": "$.observation_time",
    "outdoor_temp": "$.temperature",
    "outdoor_humidity": "$.humidity",
    "outdoor_pressure": "$.pressure"
  }
}
```

---

### Example 2: Retail Store (Sales API Pull Only)

```json
{
  "siteId": "store-042",
  "organizationId": "org-uuid",
  
  "inboundEnabled": false,
  
  "pullEnabled": true,
  "pullUrl": "https://pos.example.com/api/v1/stores/042/sales/today",
  "pullMethod": "GET",
  "pullIntervalSeconds": 3600,
  "pullHeaders": {
    "X-API-Key": "${POS_API_KEY}",
    "Accept": "application/json"
  },
  "pullAuthType": "apiKey",
  "pullAuthConfig": {
    "apiKey": "${POS_API_KEY}",
    "headerName": "X-API-Key"
  },
  "pullResponseMapping": {
    "timestamp": "$.report_time",
    "total_sales": "$.totals.sales",
    "transaction_count": "$.totals.transactions",
    "avg_transaction": "$.totals.avg_value",
    "cash_sales": "$.payment_methods.cash",
    "card_sales": "$.payment_methods.card",
    "refunds": "$.totals.refunds"
  }
}
```

---

### Example 3: Manufacturing Line (MQTT Inbound Only)

```json
{
  "siteId": "factory-line-3",
  "organizationId": "org-uuid",
  
  "inboundEnabled": true,
  "inboundMapping": {
    "timestamp": "$.timestamp",
    "machine_id": "$.machine.id",
    "status": "$.machine.status",
    "production_count": "$.metrics.produced",
    "reject_count": "$.metrics.rejected",
    "cycle_time_sec": "$.metrics.cycle_time",
    "temperature": "$.sensors.temp",
    "vibration": "$.sensors.vibration",
    "power_kw": "$.sensors.power"
  },
  
  "pullEnabled": false
}
```

---

### Example 4: API Gateway Monitoring (Pull with POST)

```json
{
  "siteId": "api-gateway-prod",
  "organizationId": "org-uuid",
  
  "inboundEnabled": false,
  
  "pullEnabled": true,
  "pullUrl": "https://monitoring.example.com/api/metrics",
  "pullMethod": "POST",
  "pullIntervalSeconds": 60,
  "pullHeaders": {
    "Authorization": "Bearer ${MONITOR_TOKEN}",
    "Content-Type": "application/json"
  },
  "pullBody": {
    "service": "api-gateway",
    "environment": "production",
    "metrics": ["requests", "errors", "latency"]
  },
  "pullAuthType": "bearer",
  "pullAuthConfig": {
    "token": "${MONITOR_TOKEN}"
  },
  "pullResponseMapping": {
    "timestamp": "$.timestamp",
    "total_requests": "$.metrics.requests.total",
    "requests_per_sec": "$.metrics.requests.rate",
    "error_count": "$.metrics.errors.count",
    "error_rate": "$.metrics.errors.rate",
    "avg_latency_ms": "$.metrics.latency.avg",
    "p95_latency_ms": "$.metrics.latency.p95",
    "p99_latency_ms": "$.metrics.latency.p99"
  }
}
```

---

## JSONPath Quick Reference

Common JSONPath expressions used in mappings:

| **Expression** | **Description** | **Example** |
|----------------|-----------------|-------------|
| `$.field` | Root level field | `$.temperature` |
| `$.parent.child` | Nested field | `$.sensor.temperature` |
| `$.array[0]` | First array element | `$.readings[0]` |
| `$.array[*]` | All array elements | `$.sensors[*].value` |
| `$.array[*].field` | Field from all array items | `$.sensors[*].id` |
| `$..field` | Recursive descent | `$..temperature` |

---

## Environment Variables

Use environment variables for sensitive credentials:

```bash
# .env file
WEATHER_API_KEY=your-weather-api-key
STOCK_API_KEY=your-stock-api-key
SHOPIFY_TOKEN=your-shopify-token
DB_MONITOR_USER=monitor_user
DB_MONITOR_PASS=secure_password
```

Reference in adapter config:
```json
{
  "pullAuthConfig": {
    "token": "${WEATHER_API_KEY}"
  }
}
```

---

## Testing Adapters

### Test Inbound Mapping

```bash
# Send test MQTT message
mosquitto_pub -h localhost -p 1883 \
  -t "org/your-org-id/site/your-site-id" \
  -m '{"temp":22.5,"hum":65,"timestamp":"2026-04-09T14:30:00Z"}'
```

### Test Pull Configuration

```bash
# Trigger manual pull
curl -X POST http://localhost:3000/api/v1/adapters/your-site-id/pull/trigger \
  -H "Authorization: Bearer your-jwt-token"
```

### View Adapter Status

```bash
# Get adapter configuration
curl http://localhost:3000/api/v1/adapters/your-site-id \
  -H "Authorization: Bearer your-jwt-token"
```

---

## Best Practices

1. **Use descriptive field names** in mappings (e.g., `temperature_celsius` not `temp`)
2. **Always map timestamp** to ensure proper time-series ordering
3. **Test JSONPath expressions** before deploying (use online JSONPath testers)
4. **Set appropriate pull intervals** (don't overwhelm external APIs)
5. **Use environment variables** for API keys and secrets
6. **Monitor adapter logs** for mapping errors
7. **Enable discovery mode** first to understand incoming data structure

---

## Troubleshooting

### Common Issues

**Mapping not working:**
- Verify JSONPath syntax with test data
- Check that source field exists in payload
- Review adapter logs for mapping errors

**Pull not triggering:**
- Verify `pullEnabled: true`
- Check pull interval is reasonable
- Ensure API credentials are valid
- Review network connectivity

**Data not appearing:**
- Confirm site is in ACTIVE or DISCOVERY status
- Check MQTT topic matches pattern: `org/{orgId}/site/{siteId}`
- Verify API key has `ingest` permission

---

For more information, see:
- [TERMINOLOGY.md](./TERMINOLOGY.md) - Understanding flexible data sources
- Backend API documentation
- Frontend Adapter Configuration UI
