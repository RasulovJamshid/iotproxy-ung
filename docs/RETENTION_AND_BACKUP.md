# Data Retention Visualization & Backup System

## Overview

Two critical features have been implemented:
1. **Data Retention Visualization** - Preview what data will be deleted before it happens
2. **Database Backup & Restore** - Full backup/restore system with async processing

---

## 1. Data Retention Visualization

### Backend Implementation

**New Endpoint:**
```
GET /admin/organizations/:orgId/retention-preview
```

**Response:**
```json
{
  "sensors": [
    {
      "sensorId": "uuid",
      "cutoffDate": "2026-04-21T00:00:00Z",
      "readingsToDelete": 15420
    }
  ],
  "summary": {
    "totalSensors": 5,
    "totalReadingsToDelete": 87340,
    "defaultRawRetentionDays": 7,
    "defaultSummaryRetentionMonths": 6
  }
}
```

**Files Modified:**
- `backend/src/admin/retention.service.ts` - Added `previewRetention()` method
- `backend/src/database/timescale.repository.ts` - Added `countReadingsOlderThan()` method
- `backend/src/admin/admin.controller.ts` - Added GET endpoint

### Frontend Implementation

**New Component:**
- `frontend/src/components/RetentionPreview.tsx` - Visual preview of upcoming deletions

**Features:**
- Shows total sensors affected and readings to be deleted
- Per-sensor breakdown with cutoff dates
- Color-coded warnings (amber for pending deletions)
- Auto-refreshes every 60 seconds
- Displays time until deletion ("3 days ago", etc.)

**Integration:**
- Added to Settings page (`frontend/src/pages/SettingsPage.tsx`)
- Only visible to ADMIN and SYSTEM_ADMIN roles

---

## 2. Database Backup & Restore

### Backend Implementation

**New Entity:**
```typescript
// backend/src/admin/backup.entity.ts
{
  id: string;
  organizationId: string;
  backupType: 'FULL' | 'INCREMENTAL';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  filePath?: string;  // S3/MinIO path
  fileSizeBytes?: number;
  tablesIncluded: string[];
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}
```

**New Endpoints:**
```
POST   /admin/organizations/:orgId/backups          - Create backup
GET    /admin/organizations/:orgId/backups          - List backups
GET    /admin/organizations/:orgId/backups/:id      - Get backup details
GET    /admin/organizations/:orgId/backups/:id/download - Get presigned download URL
DELETE /admin/organizations/:orgId/backups/:id      - Delete backup
POST   /admin/organizations/:orgId/backups/:id/restore - Restore backup (SYSTEM_ADMIN only)
```

**Backup Types:**
- **FULL**: All tables (sensor_readings, daily_summaries, sensors, sites, organizations)
- **INCREMENTAL**: Only readings and summaries

**Worker Implementation:**
- `backend/src/admin/backup.worker.ts` - Async backup/restore processing
- Uses `pg_dump` for backups, `psql` for restore
- Uploads to MinIO/S3 for storage
- Tracks progress and errors

**Files Created:**
- `backend/src/admin/backup.entity.ts`
- `backend/src/admin/backup.service.ts`
- `backend/src/admin/backup.worker.ts`
- `backend/src/database/migrations/1745300000000-AddBackupsTable.ts`

**Files Modified:**
- `backend/src/admin/admin.module.ts` - Added backup service/worker
- `backend/src/admin/admin.controller.ts` - Added backup endpoints
- `shared/src/constants/index.ts` - Added BACKUPS queue

### Frontend Implementation

**New Page:**
- `frontend/src/pages/BackupsPage.tsx` - Full backup management UI

**Features:**
- Create backups (FULL or INCREMENTAL)
- View backup history with status badges
- Delete old backups
- Restore backups (SYSTEM_ADMIN only)
- Real-time status updates (PENDING → IN_PROGRESS → COMPLETED/FAILED)
- File size display
- Duration tracking
- Destructive action warnings for restore

**Navigation:**
- Added to System section in sidebar
- Only visible to ADMIN and SYSTEM_ADMIN roles
- Route: `/backups`

**Files Created:**
- `frontend/src/pages/BackupsPage.tsx`
- `frontend/src/hooks/useBackups.ts`

**Files Modified:**
- `frontend/src/App.tsx` - Added route and navigation

---

## Usage

### Data Retention Preview

1. Navigate to **Settings** page
2. Scroll to "Data Retention Defaults" section
3. View the retention preview card showing:
   - Total sensors affected
   - Total readings to be deleted
   - Per-sensor breakdown with cutoff dates
4. Preview updates automatically every minute

### Creating a Backup

1. Navigate to **Backups** page (System → Backups)
2. Click "Create Backup"
3. Select backup type:
   - **Full**: Complete database backup (recommended for disaster recovery)
   - **Incremental**: Only sensor data (faster, smaller)
4. Click "Create Backup"
5. Monitor status in the backup history table

### Downloading a Backup

1. Navigate to **Backups** page
2. Find a completed backup
3. Click "Download" button
4. A presigned URL is generated (valid for 1 hour)
5. Backup file downloads automatically from MinIO

### Restoring a Backup

⚠️ **WARNING**: Restoring overwrites ALL current data. Only SYSTEM_ADMIN can restore.

1. Navigate to **Backups** page
2. Find a completed backup
3. Click "Restore"
4. Confirm the destructive action
5. Wait for restore to complete (runs async)

---

## Technical Details

### Backup Storage

- Backups stored in MinIO/S3 bucket configured in `MINIO_*` env vars
- Path format: `backups/{organizationId}/{filename}.sql`
- Files are SQL dumps created by `pg_dump`

**Production Configuration:**
For production deployments, set `MINIO_EXTERNAL_ENDPOINT` to your publicly accessible MinIO URL:
```bash
MINIO_ENDPOINT=minio:9000                    # Internal Docker hostname
MINIO_EXTERNAL_ENDPOINT=minio.yourdomain.com:9000  # Public URL for downloads
```
This ensures presigned download URLs are accessible from browsers outside the container network.

### Retention Logic

The retention preview uses the same SQL logic as the nightly retention job:
```sql
COALESCE(
  NULLIF(sensor.raw_retention_days, 0),
  NULLIF(site.default_raw_retention_days, 0),
  NULLIF(org.default_raw_retention_days, 0)
)
```

- `0` = unlimited (keep forever)
- `NULL` = inherit from parent level
- Sensors with effective retention of NULL are excluded from deletion

### Async Processing

Both backup and restore operations run asynchronously via BullMQ:
- Queue: `QUEUE_NAMES.BACKUPS`
- Job types: `create-backup`, `restore-backup`
- Status tracking in `backups` table

---

## Migration

Run the migration to create the backups table:
```bash
npm run migrate
```

---

## Security

- **Backups**: ADMIN and SYSTEM_ADMIN can create/view/delete
- **Restore**: SYSTEM_ADMIN only (destructive operation)
- **Retention Preview**: ADMIN and SYSTEM_ADMIN only

---

## Future Enhancements

1. Scheduled automatic backups (daily/weekly)
2. Backup retention policy (auto-delete old backups)
3. Incremental backups based on timestamp
4. Backup encryption
5. Download backup files directly
6. Email notifications on backup completion/failure
7. Backup size estimates before creation
