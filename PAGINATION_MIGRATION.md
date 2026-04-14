# Pagination Migration Guide

## Backend Changes ✅ COMPLETE

All backend endpoints now return paginated responses:

### Response Format
```typescript
{
  data: T[],
  total: number,
  page: number,
  limit: number,
  totalPages: number
}
```

### Query Parameters
- `page` (default: 1)
- `limit` (default: 50, max: 500)

### Affected Endpoints
- `GET /api/v1/sensors?page=1&limit=50`
- `GET /api/v1/sites?page=1&limit=50`
- `GET /api/v1/query/sites/:siteId/latest?page=1&limit=50`

## Frontend Changes

### ✅ Completed
- `/home/jamshid/Documents/Projects/iotproxy/frontend/src/types.ts` - Added `PaginatedResponse<T>` type
- `/home/jamshid/Documents/Projects/iotproxy/frontend/src/hooks/useSensors.ts` - Updated hook
- `/home/jamshid/Documents/Projects/iotproxy/frontend/src/hooks/useSites.ts` - Updated hook
- `/home/jamshid/Documents/Projects/iotproxy/frontend/src/pages/SensorDetailPage.tsx` - Fixed
- `/home/jamshid/Documents/Projects/iotproxy/frontend/src/pages/SensorsPage.tsx` - Fixed

### ⚠️ Needs Update

The following pages use `useSites()` or `useSensors()` and need to be updated:

#### 1. DashboardPage.tsx (Line 108-109)
```typescript
// BEFORE
const sitesQuery = useSites();
const sensorsQuery = useSensors();

// AFTER
const sitesQuery = useSites();
const sites = sitesQuery.data?.data ?? [];
const sensorsQuery = useSensors();
const sensors = sensorsQuery.data?.data ?? [];
```

#### 2. SitesPage.tsx (Line 42)
```typescript
// BEFORE
const { data: sites = [], isLoading } = useSites();

// AFTER
const { data: sitesResponse, isLoading } = useSites();
const sites = sitesResponse?.data ?? [];
```

#### 3. AlertsPage.tsx (Line 63)
```typescript
// BEFORE
const { data: sensors = [] } = useSensors();

// AFTER
const { data: sensorsResponse } = useSensors();
const sensors = sensorsResponse?.data ?? [];
```

#### 4. ExportPage.tsx (Line 16)
```typescript
// BEFORE
const { data: sites } = useSites();

// AFTER
const { data: sitesResponse } = useSites();
const sites = sitesResponse?.data ?? [];
```

#### 5. AdaptersPage.tsx (Line 12)
```typescript
// BEFORE
const { data: sites, isLoading: sitesLoading } = useSites();

// AFTER
const { data: sitesResponse, isLoading: sitesLoading } = useSites();
const sites = sitesResponse?.data ?? [];
```

#### 6. ApiKeysPage.tsx (Line 466, 629)
```typescript
// BEFORE (Line 466)
const { data: ownSites } = useSites();

// AFTER
const { data: ownSitesResponse } = useSites();
const ownSites = ownSitesResponse?.data ?? [];

// BEFORE (Line 629)
const { data: sites = [] } = useSites();

// AFTER
const { data: sitesResponse } = useSites();
const sites = sitesResponse?.data ?? [];
```

#### 7. SiteDetailPage.tsx
```typescript
// Check if it uses useSensors() and update accordingly
```

## Testing Checklist

After updating all pages:

- [ ] Sensors page loads and displays sensors
- [ ] Sites page loads and displays sites
- [ ] Dashboard shows correct counts
- [ ] Sensor detail page transfer modal shows sites
- [ ] Alerts page shows sensors in dropdown
- [ ] Export page shows sites
- [ ] Adapters page shows sites
- [ ] API Keys page shows sites/sensors correctly

## Notes

- Default pagination is 50 items per page
- Maximum limit is 500 items
- All lint errors will resolve after frontend rebuild
- Backend hot-reload will pick up changes automatically
