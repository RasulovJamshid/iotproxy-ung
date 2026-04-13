# IoTProxy Terminology Guide

## Overview

IoTProxy uses flexible terminology to support **multiple use cases beyond traditional IoT sensors**. While the system was originally designed for sensor data, it now supports any time-series data stream.

---

## Core Concepts

### 1. **Site**
A logical grouping of related data sources.

**Examples:**
- A physical location (factory, warehouse, retail store)
- A business unit (sales department, customer service)
- A product line (Product A, Product B)
- A system environment (production, staging)

### 2. **Data Source** (internally: `Sensor`)
Any entity that generates time-series data.

**Examples:**
- **IoT Sensors:** Temperature, humidity, pressure, motion
- **Business Metrics:** Daily sales, inventory levels, customer count
- **System Metrics:** API request count, error rate, response time
- **Event Streams:** User logins, transactions, notifications
- **External APIs:** Weather data, stock prices, social media metrics

**Database field:** `sensors` table (legacy name, but semantically flexible)

### 3. **Reading** (internally: `Reading`)
A single data point with a timestamp and associated values.

**Examples:**
- `{ timestamp: "2026-04-09T14:00:00Z", temperature: 22.5 }`
- `{ timestamp: "2026-04-09T00:00:00Z", daily_sales: 1250, product_id: "SKU-123" }`
- `{ timestamp: "2026-04-09T14:30:00Z", api_requests: 5420, errors: 12 }`

---

## UI Terminology Mapping

| **UI Label**       | **Backend Entity** | **Purpose**                                    |
|--------------------|--------------------|------------------------------------------------|
| Data Sources       | `Sensor`           | List of tracked metrics/sensors/streams        |
| Add Data Source    | Create Sensor      | Configure a new data stream                    |
| Live Feed          | Readings Stream    | Real-time data updates via WebSocket           |
| Discovery Mode     | Discovery          | Auto-detect new fields and data patterns       |

---

## Use Case Examples

### Example 1: Traditional IoT
```yaml
Site: Factory Floor A
Data Sources:
  - Temperature Sensor 1
  - Humidity Sensor 2
  - Pressure Gauge 3
Readings:
  - { timestamp: "...", temperature: 22.5, unit: "celsius" }
```

### Example 2: Retail Analytics
```yaml
Site: Store #42 - Downtown
Data Sources:
  - Daily Sales Counter
  - Foot Traffic Counter
  - Inventory Level Tracker
Readings:
  - { timestamp: "...", daily_sales: 1250, product: "SKU-123" }
  - { timestamp: "...", foot_traffic: 342 }
```

### Example 3: API Monitoring
```yaml
Site: Production API Gateway
Data Sources:
  - Request Counter
  - Error Rate Monitor
  - Response Time Tracker
Readings:
  - { timestamp: "...", requests: 5420, errors: 12, avg_latency_ms: 45 }
```

### Example 4: Mixed Use Case
```yaml
Site: Smart Warehouse
Data Sources:
  - Temperature Sensor (IoT)
  - Humidity Sensor (IoT)
  - Daily Shipments (Business Metric)
  - Forklift GPS Tracker (IoT)
  - Inventory API Sync (External API)
Readings:
  - { timestamp: "...", temperature: 18.5 }
  - { timestamp: "...", shipments_today: 45 }
```

---

## API Examples

### Creating a Business Metric Data Source

```http
POST /api/v1/sensors
{
  "siteId": "uuid-of-site",
  "name": "Daily Product Sales",
  "description": "Tracks sales count for Product SKU-123",
  "reportingIntervalSeconds": 86400,  // Once per day
  "status": "ACTIVE"
}
```

### Ingesting Business Data

```http
POST /api/v1/ingest
Headers:
  X-API-Key: iot_xxxxxxxxxxxxx

{
  "siteId": "uuid-of-site",
  "timestamp": "2026-04-09T00:00:00Z",
  "data": {
    "product_id": "SKU-123",
    "daily_sales": 1250,
    "revenue": 37500.00,
    "returns": 3
  }
}
```

---

## Discovery Mode for Non-Sensor Data

Discovery mode works identically for all data types:

1. **Enable Discovery** on a site
2. **Send sample data** via API/MQTT
3. **Review field profiles** (data types, ranges, patterns)
4. **Configure mappings** to normalize field names
5. **Transition to Active** when ready

**Example:** Discovering sales data structure
```json
// Sample payload sent during discovery
{
  "product_sku": "SKU-123",
  "units_sold": 42,
  "revenue_usd": 1260.00,
  "timestamp_utc": "2026-04-09T14:00:00Z"
}

// Discovery learns:
// - product_sku: string (100% string type)
// - units_sold: number (min: 1, max: 500, avg: 42)
// - revenue_usd: number (min: 30, max: 15000, avg: 1260)
```

---

## Best Practices

### Naming Conventions

**Good Data Source Names:**
- ✅ "Temperature Sensor - Room 101"
- ✅ "Daily Sales - Product A"
- ✅ "API Request Counter - /users endpoint"
- ✅ "Customer Satisfaction Score"

**Avoid:**
- ❌ "Sensor 1" (too generic)
- ❌ "Data" (meaningless)
- ❌ "Test" (unclear purpose)

### Field Naming in Readings

Use clear, consistent field names:
```json
// Good
{
  "temperature_celsius": 22.5,
  "humidity_percent": 65,
  "daily_sales_count": 1250
}

// Avoid
{
  "temp": 22.5,        // Ambiguous unit
  "h": 65,             // Unclear abbreviation
  "sales": 1250        // Missing time context
}
```

---

## Migration Notes

**No breaking changes required!** The backend database schema remains unchanged:
- `sensors` table stores all data sources
- `readings` table stores all data points
- UI labels provide user-friendly terminology
- Tooltips clarify flexibility

**Backward compatibility:** Existing IoT sensor configurations work without modification.

---

## Summary

IoTProxy is a **universal time-series data platform** that happens to have excellent IoT support. The "Sensor" terminology in the codebase is semantic—it represents any data source that reports values over time.

**Think of it as:**
- **Site** = Container
- **Data Source** = Anything that generates timestamped data
- **Reading** = A data point

This flexibility allows IoTProxy to handle IoT sensors, business metrics, system monitoring, external API integrations, and custom event streams—all in one unified platform.
