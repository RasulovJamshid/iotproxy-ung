/**
 * Development seed script
 * Usage: npm run seed   (from backend/)
 *
 * Creates:
 *   - 1 organization
 *   - 3 sites with sensors
 *   - 3 site_adapters covering the main adapter modes:
 *       1. Pull / single-site / bearer-token auth
 *       2. Pull / multi-site  / API-key auth
 *       3. Inbound push only
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL not set — check backend/.env');
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function uuid() {
  // crypto.randomUUID available since Node 14.17
  return require('crypto').randomUUID();
}

async function upsertOrg(client, id) {
  await client.query(
    `INSERT INTO organizations (id, name, slug, is_active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (slug) DO NOTHING`,
    [id, 'Acme IoT', 'acme-iot'],
  );
  // Fetch the real id in case the org already existed
  const { rows } = await client.query(
    `SELECT id FROM organizations WHERE slug = 'acme-iot' LIMIT 1`,
  );
  return rows[0].id;
}

async function upsertSite(client, orgId, name) {
  const { rows } = await client.query(
    `SELECT id FROM sites WHERE organization_id = $1 AND name = $2 LIMIT 1`,
    [orgId, name],
  );
  if (rows.length) return rows[0].id;

  const id = uuid();
  await client.query(
    `INSERT INTO sites
       (id, organization_id, name, commissioning_status, connectivity_status, discovery_enabled)
     VALUES ($1, $2, $3, 'ACTIVE', 'UNKNOWN', false)`,
    [id, orgId, name],
  );
  return id;
}

async function upsertSensor(client, orgId, siteId, name) {
  const { rows } = await client.query(
    `SELECT id FROM sensors WHERE site_id = $1 AND name = $2 LIMIT 1`,
    [siteId, name],
  );
  if (rows.length) return rows[0].id;

  const id = uuid();
  await client.query(
    `INSERT INTO sensors (id, organization_id, site_id, name, status, connectivity_status)
     VALUES ($1, $2, $3, $4, 'ACTIVE', 'UNKNOWN')`,
    [id, orgId, siteId, name],
  );
  return id;
}

async function upsertAdapter(client, adapter) {
  const existing = await client.query(
    `SELECT id FROM site_adapters WHERE site_id = $1`,
    [adapter.siteId],
  );
  if (existing.rows.length) {
    console.log(`  adapter for site ${adapter.siteId} already exists — skipping`);
    return existing.rows[0].id;
  }

  const id = uuid();
  await client.query(
    `INSERT INTO site_adapters (
       id, site_id, organization_id,
       inbound_enabled, inbound_mapping,
       pull_enabled, pull_url, pull_method, pull_headers,
       pull_auth_type, pull_auth_config, pull_body_template,
       pull_interval_sec, response_mapping
     ) VALUES (
       $1, $2, $3,
       $4, $5,
       $6, $7, $8, $9,
       $10, $11, $12,
       $13, $14
     )`,
    [
      id,
      adapter.siteId,
      adapter.organizationId,
      adapter.inboundEnabled,
      adapter.inboundMapping ? JSON.stringify(adapter.inboundMapping) : null,
      adapter.pullEnabled,
      adapter.pullUrl ?? null,
      adapter.pullMethod ?? 'GET',
      adapter.pullHeaders ? JSON.stringify(adapter.pullHeaders) : null,
      adapter.pullAuthType ?? 'none',
      adapter.pullAuthConfig ? JSON.stringify(adapter.pullAuthConfig) : null,
      adapter.pullBodyTemplate ? JSON.stringify(adapter.pullBodyTemplate) : null,
      adapter.pullIntervalSec ?? 60,
      adapter.responseMapping ? JSON.stringify(adapter.responseMapping) : null,
    ],
  );
  return id;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('Connected to database.');

  try {
    // ── Organization ──────────────────────────────────────────────────────────
    const orgId = await upsertOrg(client, uuid());
    console.log(`Org id: ${orgId}`);

    // ── Site 1: Weather Station — pull / single-site / bearer token ───────────
    const site1Id = await upsertSite(client, orgId, 'Weather Station Alpha');
    const s1Temp   = await upsertSensor(client, orgId, site1Id, 'Temperature');
    const s1Hum    = await upsertSensor(client, orgId, site1Id, 'Humidity');
    const s1Wind   = await upsertSensor(client, orgId, site1Id, 'Wind Speed');
    console.log(`Site 1 (${site1Id}) sensors: ${s1Temp}, ${s1Hum}, ${s1Wind}`);

    await upsertAdapter(client, {
      siteId:         site1Id,
      organizationId: orgId,
      inboundEnabled: false,

      pullEnabled:     true,
      pullUrl:         'https://api.weathersource.example/v1/current',
      pullMethod:      'GET',
      pullHeaders:     { 'Accept': 'application/json' },
      pullAuthType:    'bearerToken',
      pullAuthConfig:  { value: 'REPLACE_WITH_REAL_TOKEN' },
      pullIntervalSec: 300,

      responseMapping: {
        mode:         'single-site',
        siteId:       site1Id,
        readingsPath: '$.observations[*]',
        fields: {
          sensorId:       '$.sensor_id',
          phenomenonTime: '$.timestamp',
          data: {
            temperature_c: '$.temp_c',
            humidity_pct:  '$.rel_humidity',
            wind_speed_ms: '$.wind_speed',
          },
        },
      },
    });
    console.log('Adapter 1 (pull / single-site / bearer) done.');

    // ── Site 2: Industrial Zone — pull / multi-site / API key ─────────────────
    const site2Id = await upsertSite(client, orgId, 'Industrial Zone B');
    const s2Press  = await upsertSensor(client, orgId, site2Id, 'Pressure');
    const s2Flow   = await upsertSensor(client, orgId, site2Id, 'Flow Rate');
    console.log(`Site 2 (${site2Id}) sensors: ${s2Press}, ${s2Flow}`);

    const site3Id = await upsertSite(client, orgId, 'Industrial Zone C');
    const s3Vibr  = await upsertSensor(client, orgId, site3Id, 'Vibration');
    const s3Temp  = await upsertSensor(client, orgId, site3Id, 'Temperature');
    console.log(`Site 3 (${site3Id}) sensors: ${s3Vibr}, ${s3Temp}`);

    await upsertAdapter(client, {
      siteId:         site2Id,
      organizationId: orgId,
      inboundEnabled: false,

      pullEnabled:     true,
      pullUrl:         'https://api.industrialhub.example/v2/readings',
      pullMethod:      'POST',
      pullHeaders:     { 'Content-Type': 'application/json' },
      pullAuthType:    'apiKey',
      pullAuthConfig:  { headerName: 'X-Api-Key', value: 'REPLACE_WITH_REAL_KEY' },
      pullBodyTemplate: { zone_ids: ['B', 'C'], format: 'json' },
      pullIntervalSec: 60,

      responseMapping: {
        mode:            'multi-site',
        sitesPath:       '$.zones[*]',
        siteIdPath:      '$.zone_name',
        siteIdResolver:  'by-name',
        readingsPath:    '$.sensors[*]',
        fields: {
          sensorId:       '$.sensor_name',
          phenomenonTime: '$.recorded_at',
          data: {
            value: '$.value',
            unit:  '$.unit',
          },
        },
      },
    });
    console.log('Adapter 2 (pull / multi-site / api-key) done.');

    // Site 3 gets an inbound-only adapter
    await upsertAdapter(client, {
      siteId:         site3Id,
      organizationId: orgId,

      // ── Inbound push ─────────────────────────────────────────────────────
      inboundEnabled: true,
      inboundMapping: {
        readingsPath: '$.payload.readings[*]',
        fields: {
          sensorId:       '$.device_id',
          phenomenonTime: '$.ts',
          data: {
            vibration_mm_s: '$.vib',
            temperature_c:  '$.tmp',
          },
        },
      },

      pullEnabled: false,
    });
    console.log('Adapter 3 (inbound push only) done.');

    console.log('\nSeed complete.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
