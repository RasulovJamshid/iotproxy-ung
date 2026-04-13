# Discovery Duplicate Fields - Fix Guide

## Problem

The Discovery Review table shows **duplicate rows** for the same field (e.g., `Участников`, `erg_code` appearing multiple times).

**Root Cause:** The `field_profiles` table was missing a **unique constraint** on `(site_id, field_key)`, allowing duplicate field profiles to be created.

---

## Solution

### **1. Added Unique Index to Entity**

Updated `field-profile.entity.ts` to include:
```typescript
@Index(['siteId', 'fieldKey'], { unique: true })
```

This prevents future duplicates at the application level.

---

### **2. Database Migration**

Created migration: `1712748000000-AddUniqueIndexToFieldProfiles.ts`

**What it does:**
1. **Removes duplicates** - Keeps only the most recent profile per `(site_id, field_key)`
2. **Adds unique index** - Prevents future duplicates at the database level

---

## How to Fix

### **Option 1: Run Migration (Recommended)**

```bash
# Navigate to backend
cd backend

# Run the migration
npm run migration:run
```

This will:
- ✅ Delete duplicate field profiles
- ✅ Keep the most recent one (by `updated_at`)
- ✅ Add unique index to prevent future duplicates

---

### **Option 2: Manual SQL (If migration doesn't work)**

Connect to your PostgreSQL database and run:

```sql
-- Step 1: Remove duplicates (keeps most recent)
DELETE FROM field_profiles
WHERE id NOT IN (
  SELECT DISTINCT ON (site_id, field_key) id
  FROM field_profiles
  ORDER BY site_id, field_key, updated_at DESC
);

-- Step 2: Add unique index
CREATE UNIQUE INDEX idx_field_profiles_site_field 
ON field_profiles (site_id, field_key);
```

---

### **Option 3: Reset Discovery for This Site**

If you want to start fresh:

```sql
-- Replace 'YOUR_SITE_ID' with the actual site ID
DELETE FROM field_profiles WHERE site_id = 'YOUR_SITE_ID';
```

Then:
1. Transition site back to **DISCOVERY** status
2. Send fresh data
3. The unique index will prevent duplicates

---

## Verify the Fix

### **1. Check for Duplicates**

```sql
SELECT site_id, field_key, COUNT(*) as count
FROM field_profiles
GROUP BY site_id, field_key
HAVING COUNT(*) > 1;
```

**Expected result:** 0 rows (no duplicates)

---

### **2. Check Unique Index Exists**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'field_profiles'
  AND indexname = 'idx_field_profiles_site_field';
```

**Expected result:** 1 row showing the unique index

---

### **3. Refresh Discovery Review Page**

1. Go to the site detail page
2. Click **DISCOVERY** tab
3. You should now see **unique fields only** (e.g., 5 fields instead of 10 duplicates)

---

## Why This Happened

The issue occurred because:

1. **No unique constraint** - Database allowed multiple rows with same `(site_id, field_key)`
2. **Concurrent writes** - Multiple ingest workers might have created profiles simultaneously
3. **Race condition** - `findOne()` → `create()` → `save()` is not atomic

**The fix:**
- ✅ Unique index at database level (prevents duplicates)
- ✅ Entity-level index decorator (TypeORM awareness)
- ✅ Migration cleans up existing duplicates

---

## Testing

After applying the fix, test by:

```bash
# Send duplicate data
curl -X POST http://localhost:3000/api/v1/ingest/readings \
  -H "X-API-Key: YOUR_INGEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sensorId": "test",
    "phenomenonTime": "2026-04-10T12:00:00Z",
    "data": {
      "temperature": 23.5,
      "temperature": 24.0
    }
  }'
```

**Expected:** Only **one** `temperature` field profile should exist in the database.

---

## Summary

✅ **Entity updated** - Added `@Index(['siteId', 'fieldKey'], { unique: true })`  
✅ **Migration created** - Cleans duplicates and adds DB constraint  
✅ **Future-proof** - Prevents duplicates at both app and DB level  

**Run the migration to fix your current data!**
