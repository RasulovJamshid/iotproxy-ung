import React, { useState, useMemo } from 'react';
import { useApiKeys, useCreateApiKey, useUpdateApiKey, useRevokeApiKey, useDeleteApiKey } from '../hooks/useApiKeys';
import { useSites, useOrgSites } from '../hooks/useSites';
import { useAllOrganizations } from '../hooks/useOrganization';
import { useAuth } from '../contexts/AuthContext';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { formatDistanceToNow } from 'date-fns';
import type { ApiKey } from '../types';

const PERMISSIONS = ['ingest', 'read', 'admin'];

// ── Code samples panel ────────────────────────────────────────────────────────
function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group">
      <pre className="bg-slate-950 text-emerald-400 rounded-lg p-4 overflow-x-auto text-[11px] leading-5 font-mono">{code}</pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 px-2 py-1 text-[10px] rounded bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors opacity-0 group-hover:opacity-100"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

function ApiSamples() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'push-single' | 'push-bulk' | 'single-value' | 'multi-field' | 'pull'>('push-single');
  const [lang, setLang] = useState<'curl' | 'js'>('curl');

  const tabs = [
    { id: 'push-single'  as const, label: 'Push — single' },
    { id: 'push-bulk'    as const, label: 'Push — bulk' },
    { id: 'single-value' as const, label: 'Single-value sensor' },
    { id: 'multi-field'  as const, label: 'Multi-field sensor' },
    { id: 'pull'         as const, label: 'Pull — query' },
  ];

  const pushSingleCurl = `# POST a single sensor reading
curl -X POST https://your-host/ingest/readings \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: iot_YOUR_KEY_HERE" \\
  -d '{
    "sensorId": "550e8400-e29b-41d4-a716-446655440000",
    "phenomenonTime": "2026-04-13T10:00:00Z",
    "data": {
      "temperature": 22.5,
      "humidity": 60,
      "pressure": 1013.25
    }
  }'

# Response (202 Accepted)
{ "accepted": 1, "batchId": "...", "correlationId": "..." }`;

  const pushSingleFetch = `// JavaScript / Node.js
const res = await fetch('https://your-host/ingest/readings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'iot_YOUR_KEY_HERE',
  },
  body: JSON.stringify({
    sensorId: '550e8400-e29b-41d4-a716-446655440000',
    phenomenonTime: new Date().toISOString(),
    data: { temperature: 22.5, humidity: 60 },
  }),
});
const { accepted, batchId } = await res.json();`;

  const pushBulkCurl = `# POST up to 500 readings in one request
curl -X POST https://your-host/ingest/readings/bulk \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: iot_YOUR_KEY_HERE" \\
  -d '{
    "readings": [
      {
        "sensorId": "550e8400-e29b-41d4-a716-446655440000",
        "phenomenonTime": "2026-04-13T10:00:00Z",
        "data": { "temperature": 22.5, "humidity": 60 }
      },
      {
        "sensorId": "661f9511-f3ac-52e5-b827-557766551111",
        "phenomenonTime": "2026-04-13T10:00:05Z",
        "data": { "temperature": 19.1, "co2": 420 }
      }
    ]
  }'

# Response (202 Accepted)
{ "accepted": 2, "batchId": "..." }`;

  const pushBulkFetch = `// JavaScript / Node.js — batch flush example
async function flushBatch(readings) {
  const res = await fetch('https://your-host/ingest/readings/bulk', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'iot_YOUR_KEY_HERE',
    },
    body: JSON.stringify({ readings }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { accepted, batchId }
}`;

  const singleValueCurl = `# One sensor — one measurement per reading.
# data.value is the conventional key; the aggregation views (AVG/MIN/MAX)
# recognise it first so charts work out of the box.

# Single temperature sensor
curl -X POST https://your-host/ingest/readings \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: iot_YOUR_KEY_HERE" \\
  -d '{
    "sensorId": "550e8400-e29b-41d4-a716-446655440000",
    "phenomenonTime": "2026-04-13T10:00:00Z",
    "data": { "value": 22.5 }
  }'

# Flush a batch from three separate sensors (temperature, humidity, CO₂)
curl -X POST https://your-host/ingest/readings/bulk \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: iot_YOUR_KEY_HERE" \\
  -d '{
    "readings": [
      {
        "sensorId": "550e8400-e29b-41d4-a716-446655440000",
        "phenomenonTime": "2026-04-13T10:00:00Z",
        "data": { "value": 22.5 }
      },
      {
        "sensorId": "661f9511-f3ac-52e5-b827-557766551111",
        "phenomenonTime": "2026-04-13T10:00:00Z",
        "data": { "value": 60 }
      },
      {
        "sensorId": "772g0622-g4bd-63f6-c938-668877662222",
        "phenomenonTime": "2026-04-13T10:00:00Z",
        "data": { "value": 412 }
      }
    ]
  }'

# Aggregated query — avg_val / min_val / max_val map directly to data.value
curl "https://your-host/query/readings/SENSOR_UUID?startTs=2026-04-13T00:00:00Z&endTs=2026-04-13T23:59:59Z&agg=AVG&intervalMs=3600000" \\
  -H "X-API-Key: iot_YOUR_KEY_HERE"

# Response: [{ "bucket": "2026-04-13T10:00:00Z", "avg_val": 22.5, "min_val": 21.1, "max_val": 23.9 }]`;

  const singleValueFetch = `// One sensor → one numeric value per reading.
// Use data.value so aggregated chart queries work without extra config.

// Push a single reading
await fetch('https://your-host/ingest/readings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': 'iot_YOUR_KEY_HERE' },
  body: JSON.stringify({
    sensorId:       '550e8400-e29b-41d4-a716-446655440000',
    phenomenonTime: new Date().toISOString(),
    data: { value: 22.5 },
  }),
});

// Flush readings from several dedicated sensors in one bulk call
const SENSORS = {
  temperature: '550e8400-e29b-41d4-a716-446655440000',
  humidity:    '661f9511-f3ac-52e5-b827-557766551111',
  co2:         '772g0622-g4bd-63f6-c938-668877662222',
};

await fetch('https://your-host/ingest/readings/bulk', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': 'iot_YOUR_KEY_HERE' },
  body: JSON.stringify({
    readings: [
      { sensorId: SENSORS.temperature, phenomenonTime: new Date().toISOString(), data: { value: 22.5 } },
      { sensorId: SENSORS.humidity,    phenomenonTime: new Date().toISOString(), data: { value: 60   } },
      { sensorId: SENSORS.co2,         phenomenonTime: new Date().toISOString(), data: { value: 412  } },
    ],
  }),
});

// Aggregated query — avg_val/min_val/max_val map directly to data.value
const sensorId = SENSORS.temperature;
const url = new URL(\`https://your-host/query/readings/\${sensorId}\`);
url.searchParams.set('startTs',    new Date(Date.now() - 86400_000).toISOString());
url.searchParams.set('endTs',      new Date().toISOString());
url.searchParams.set('agg',        'AVG');
url.searchParams.set('intervalMs', '3600000');

const rows = await fetch(url, { headers: { 'X-API-Key': 'iot_YOUR_KEY_HERE' } }).then(r => r.json());
// rows: [{ bucket, avg_val, min_val, max_val }, ...]`;

  const multiFieldCurl = `# A single sensor reading with multiple measurements in one payload.
# All fields are stored as-is inside processed_data (JSONB).
# Use agg=NONE to get every field back; aggregation views
# pick the first numeric field for avg_val/min_val/max_val.

curl -X POST https://your-host/ingest/readings \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: iot_YOUR_KEY_HERE" \\
  -d '{
    "sensorId": "550e8400-e29b-41d4-a716-446655440000",
    "phenomenonTime": "2026-04-13T10:00:00Z",
    "data": {
      "temperature": 22.5,
      "humidity":    60,
      "pressure":    1013.25,
      "co2":         412,
      "tvoc":        0.08,
      "battery":     3.71
    }
  }'

# Raw query — returns the full data object per timestamp
curl "https://your-host/query/readings/SENSOR_UUID?startTs=2026-04-13T00:00:00Z&endTs=2026-04-13T23:59:59Z&agg=NONE" \\
  -H "X-API-Key: iot_YOUR_KEY_HERE"

# Response rows contain the complete processed_data object:
# [{ "phenomenon_time": "...", "processed_data": { "temperature": 22.5, "humidity": 60, ... }, "quality_code": "GOOD" }]

# NOTE: Aggregated queries (agg=AVG/MIN/MAX) collapse to a single numeric
# field (first match: temperature > humidity > pressure > ...).
# For independent charts per field, use one sensor per measurement instead.`;

  const multiFieldFetch = `// JavaScript / Node.js — environment sensor with 6 fields
const res = await fetch('https://your-host/ingest/readings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'iot_YOUR_KEY_HERE',
  },
  body: JSON.stringify({
    sensorId: '550e8400-e29b-41d4-a716-446655440000',
    phenomenonTime: new Date().toISOString(),
    data: {
      temperature: 22.5,
      humidity:    60,
      pressure:    1013.25,
      co2:         412,
      tvoc:        0.08,
      battery:     3.71,
    },
  }),
});

// Raw query — all fields come back per timestamp
const sensorId = '550e8400-e29b-41d4-a716-446655440000';
const url = new URL(\`https://your-host/query/readings/\${sensorId}\`);
url.searchParams.set('startTs', new Date(Date.now() - 3600_000).toISOString());
url.searchParams.set('endTs',   new Date().toISOString());
url.searchParams.set('agg',     'NONE');

const rows = await fetch(url, { headers: { 'X-API-Key': 'iot_YOUR_KEY_HERE' } })
  .then(r => r.json());

// rows[0].processed_data → { temperature: 22.5, humidity: 60, pressure: 1013.25, ... }
// Extract a specific field across all rows:
const temps = rows.map(r => ({ t: r.phenomenon_time, v: r.processed_data.temperature }));

// ⚠ agg=AVG collapses to avg_val (single value) — use agg=NONE when
//   you need all fields, or split into separate sensors per measurement.`;

  const pullCurl = `# Query time-series for a sensor (raw, no aggregation)
curl "https://your-host/query/readings/SENSOR_UUID?startTs=2026-04-13T00:00:00Z&endTs=2026-04-13T23:59:59Z&agg=NONE&limit=1000" \\
  -H "X-API-Key: iot_YOUR_KEY_HERE"

# Hourly average with 1-hour bucket
curl "https://your-host/query/readings/SENSOR_UUID?startTs=2026-04-01T00:00:00Z&endTs=2026-04-13T23:59:59Z&agg=AVG&intervalMs=3600000" \\
  -H "X-API-Key: iot_YOUR_KEY_HERE"

# Available aggregations: AVG | MIN | MAX | SUM | COUNT | NONE`;

  const pullFetch = `// JavaScript / Node.js — fetch last 24 h, 1-hour averages
const sensorId = '550e8400-e29b-41d4-a716-446655440000';
const end   = new Date();
const start = new Date(end - 24 * 60 * 60 * 1000);

const url = new URL(\`https://your-host/query/readings/\${sensorId}\`);
url.searchParams.set('startTs', start.toISOString());
url.searchParams.set('endTs',   end.toISOString());
url.searchParams.set('agg',     'AVG');
url.searchParams.set('intervalMs', '3600000');

const res  = await fetch(url, { headers: { 'X-API-Key': 'iot_YOUR_KEY_HERE' } });
const data = await res.json();
// data: [{ bucket, avg_val, min_val, max_val }, ...]`;

  const samples: Record<typeof tab, { curl: string; js: string }> = {
    'push-single':  { curl: pushSingleCurl,   js: pushSingleFetch  },
    'push-bulk':    { curl: pushBulkCurl,     js: pushBulkFetch    },
    'single-value': { curl: singleValueCurl,  js: singleValueFetch },
    'multi-field':  { curl: multiFieldCurl,   js: multiFieldFetch  },
    'pull':         { curl: pullCurl,         js: pullFetch        },
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Integration Guide</span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">Code samples</span>
        </div>
        <Icon
          d={open ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
          className="w-4 h-4 text-slate-400"
        />
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Operation tabs */}
            <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    tab === t.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* Language tabs */}
            <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
              {(['curl', 'js'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    lang === l
                      ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {l === 'curl' ? 'cURL' : 'JavaScript'}
                </button>
              ))}
            </div>
          </div>

          {tab === 'push-single' && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Send one reading at a time. Requires an API key with <strong>ingest</strong> permission. <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">sensorId</code> must be the UUID from the Sensors page.
            </p>
          )}
          {tab === 'push-bulk' && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Send up to <strong>500 readings</strong> per request. Use this to batch readings from multiple sensors or to flush a local buffer.
            </p>
          )}
          {tab === 'single-value' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Each sensor tracks exactly one measurement. Use <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">data.value</code> as the key — the aggregation engine recognises it first, so <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">avg_val / min_val / max_val</code> in chart queries map to it directly with no extra config.
              </p>
              <div className="flex gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                  ✓ Charts work out of the box
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                  ✓ agg=AVG/MIN/MAX all resolve correctly
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  → one sensor per measurement type
                </span>
              </div>
            </div>
          )}
          {tab === 'multi-field' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                The <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">data</code> object accepts any flat key/value pairs — all fields are stored and returned as-is. Useful for environment sensors that report temperature, humidity, CO₂, etc. in a single packet.
              </p>
              <div className="flex gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                  ✓ Raw queries return all fields
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                  ✓ Alert rules work on any field
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                  ⚠ Aggregated chart picks first numeric field only
                </span>
              </div>
            </div>
          )}
          {tab === 'pull' && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Retrieve historical time-series data. Requires an API key with <strong>read</strong> permission. Use <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">agg=NONE</code> for raw points or specify an aggregation + interval for bucketed results.
            </p>
          )}

          <CodeBlock code={samples[tab][lang]} />
        </div>
      )}
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────
const Icon = ({ d, className = 'w-4 h-4' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Icons = {
  Plus:    () => <Icon d="M12 5v14M5 12h14" />,
  Search:  () => <Icon d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />,
  Close:   () => <Icon d="M6 18L18 6M6 6l12 12" />,
  Key:     () => <Icon d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L6.5 21H3v-3.5l2.5-2.5v-3.5L8 9.5l1.5 1.5 2.143-2.143A6 6 0 1115 7z" />,
  Edit:    () => <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />,
  Revoke:  () => <Icon d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />,
  Trash:   () => <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-3.5 h-3.5" />,
};

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent = false }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 border ${accent
      ? 'bg-gradient-to-br from-blue-500 to-indigo-600 border-blue-600/30 text-white'
      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-widest mb-1 ${accent ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}`}>{label}</p>
      <p className={`text-3xl font-bold ${accent ? 'text-white' : ''}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>{sub}</p>}
    </div>
  );
}

// ── Scope builder ────────────────────────────────────────────────────────────
interface ScopePair { orgId: string; siteId?: string }

interface ScopeBuilderProps {
  isSysAdmin: boolean;
  myOrgId: string;
  scopeType: string;
  onScopeTypeChange: (t: string) => void;
  scopes: ScopePair[];
  onScopesChange: (s: ScopePair[]) => void;
}

function ScopeBuilder({ isSysAdmin, myOrgId, scopeType, onScopeTypeChange, scopes, onScopesChange }: ScopeBuilderProps) {
  const { data: allOrgs } = useAllOrganizations();
  const { data: ownSites } = useSites();

  const [pickerOrgId, setPickerOrgId] = useState('');
  const [pickerSiteId, setPickerSiteId] = useState('');

  // For SYSTEM_ADMIN: load sites for the selected org dynamically
  const { data: orgSites } = useOrgSites(isSysAdmin ? pickerOrgId : undefined);
  const sitesForPicker = isSysAdmin ? (orgSites ?? []) : (ownSites ?? []);

  const removeScope = (idx: number) => onScopesChange(scopes.filter((_, i) => i !== idx));

  const addScope = () => {
    // For regular ADMIN, org is always their own org
    const effectiveOrgId = isSysAdmin ? pickerOrgId : myOrgId;
    if (!effectiveOrgId) return;
    const entry: ScopePair = { orgId: effectiveOrgId, siteId: pickerSiteId || undefined };
    // Avoid duplicates
    const already = scopes.some(
      (s) => s.orgId === entry.orgId && (s.siteId ?? '') === (entry.siteId ?? ''),
    );
    if (!already) onScopesChange([...scopes, entry]);
    setPickerOrgId('');
    setPickerSiteId('');
  };

  const getOrgName = (id: string) => allOrgs?.find((o) => o.id === id)?.name ?? id;
  const getSiteName = (id: string) => ownSites?.find((s) => s.id === id)?.name ?? id;

  const scopeOptions = isSysAdmin
    ? [
        { value: 'GLOBAL', label: 'Global — all organizations and their sites' },
        { value: 'ORGS', label: 'Organizations — all sites within selected organizations' },
        { value: 'SITES', label: 'Sites — specific sites within selected organizations' },
      ]
    : [
        { value: 'ORGS', label: 'All sites in this organization' },
        { value: 'SITES', label: 'Specific sites in this organization' },
      ];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {scopeOptions.map((opt) => (
          <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="scopeType"
              value={opt.value}
              checked={scopeType === opt.value}
              onChange={() => { onScopeTypeChange(opt.value); onScopesChange([]); }}
              className="mt-0.5 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">{opt.label}</span>
          </label>
        ))}
      </div>

      {(scopeType === 'ORGS' || scopeType === 'SITES') && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2 bg-slate-50 dark:bg-slate-800/50">
          {scopes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {scopes.map((s, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                >
                  {isSysAdmin ? getOrgName(s.orgId) : ''}
                  {s.siteId ? (isSysAdmin ? ' / ' : '') + getSiteName(s.siteId) : (scopeType === 'ORGS' ? ' (all sites)' : '')}
                  <button
                    type="button"
                    onClick={() => removeScope(i)}
                    className="ml-0.5 hover:text-blue-900 dark:hover:text-blue-100 focus:outline-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-end">
            {isSysAdmin && (
              <div className="flex-1">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Organization</label>
                <select
                  className="input text-sm py-1.5"
                  value={pickerOrgId}
                  onChange={(e) => { setPickerOrgId(e.target.value); setPickerSiteId(''); }}
                >
                  <option value="">Select org…</option>
                  {allOrgs?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}

            {scopeType === 'SITES' && (
              <div className="flex-1">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Site</label>
                <select
                  className="input text-sm py-1.5"
                  value={pickerSiteId}
                  onChange={(e) => setPickerSiteId(e.target.value)}
                  disabled={isSysAdmin && !pickerOrgId}
                >
                  <option value="">Select site…</option>
                  {sitesForPicker.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={addScope}
              disabled={isSysAdmin ? !pickerOrgId : scopeType === 'SITES' && !pickerSiteId}
              className="btn-secondary text-sm py-1.5 px-3 whitespace-nowrap"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scope summary ────────────────────────────────────────────────────────────
function ScopeSummary({ apiKey, sites, orgs }: { apiKey: ApiKey; sites: any[]; orgs: any[] }) {
  if (apiKey.scopeType === 'GLOBAL') return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800">Global</span>;

  if (apiKey.scopes?.length) {
    const orgOnly = apiKey.scopes.filter((s) => !s.siteId);
    const siteOnly = apiKey.scopes.filter((s) => s.siteId);

    if (apiKey.scopeType === 'ORGS') {
      if (orgOnly.length === 1) {
        const name = orgs.find((o) => o.id === orgOnly[0].orgId)?.name ?? orgOnly[0].orgId;
        return <span>{name} (all sites)</span>;
      }
      return <span>{orgOnly.length} orgs</span>;
    }

    if (siteOnly.length === 1) {
      const name = sites.find((s) => s.id === siteOnly[0].siteId)?.name ?? siteOnly[0].siteId;
      return <span>{name}</span>;
    }
    return <span>{siteOnly.length} sites</span>;
  }

  // Legacy
  if (apiKey.siteId) {
    const site = sites.find((s) => s.id === apiKey.siteId);
    return <span>{site?.name ?? apiKey.siteId}</span>;
  }

  return <span>All sites</span>;
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ApiKeysPage() {
  const { user } = useAuth();
  const isSysAdmin = user?.role === 'SYSTEM_ADMIN';

  const { data: keys = [], isLoading } = useApiKeys();
  const { data: sites = [] } = useSites();
  const { data: orgs = [] } = useAllOrganizations();
  const create = useCreateApiKey();
  const update = useUpdateApiKey();
  const revoke = useRevokeApiKey();
  const deleteKey = useDeleteApiKey();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked'>('all');

  const filteredKeys = useMemo(() => {
    let list = keys;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(k => k.name.toLowerCase().includes(q) || k.prefix.toLowerCase().includes(q));
    }
    if (statusFilter === 'active')   list = list.filter(k => !k.revokedAt);
    if (statusFilter === 'revoked') list = list.filter(k => !!k.revokedAt);
    return list;
  }, [keys, search, statusFilter]);

  const pg = usePagination(filteredKeys);
  const activeCount = keys.filter(k => !k.revokedAt).length;

  // Modals state
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState('ORGS');
  const [scopes, setScopes] = useState<ScopePair[]>([]);
  const [perms, setPerms] = useState<string[]>(['ingest']);
  const [websocketEnabled, setWebsocketEnabled] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');

  const [editKey, setEditKey] = useState<ApiKey | null>(null);
  const [editName, setEditName] = useState('');
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [editWebsocket, setEditWebsocket] = useState(true);
  const [editExpiresAt, setEditExpiresAt] = useState('');

  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const togglePerm = (p: string, current: string[], setter: (v: string[]) => void) =>
    setter(current.includes(p) ? current.filter((x) => x !== p) : [...current, p]);

  const resetCreate = () => {
    setName(''); setScopeType('ORGS'); setScopes([]); setPerms(['ingest']); setWebsocketEnabled(true); setExpiresAt('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    let payload: Parameters<typeof create.mutateAsync>[0] = {
      name, scopeType, permissions: perms, websocketEnabled, expiresAt: expiresAt || undefined,
    };
    if (scopeType !== 'GLOBAL' && scopes.length > 0) payload.scopes = scopes;

    const result = await create.mutateAsync(payload);
    setCreateOpen(false);
    setNewKey(result.key!);
    resetCreate();
  };

  const openEdit = (key: ApiKey) => {
    setEditKey(key);
    setEditName(key.name);
    setEditPerms(key.permissions ?? []);
    setEditWebsocket(key.websocketEnabled ?? true);
    setEditExpiresAt(key.expiresAt ? new Date(key.expiresAt).toISOString().slice(0, 16) : '');
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editKey) return;
    await update.mutateAsync({
      id: editKey.id,
      name: editName,
      permissions: editPerms,
      websocketEnabled: editWebsocket,
      expiresAt: editExpiresAt || undefined,
    });
    setEditKey(null);
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Keys" value={keys.length} accent />
        <StatCard label="Active" value={activeCount} sub={`${keys.length > 0 ? Math.round((activeCount / keys.length) * 100) : 0}% of total`} />
        <StatCard label="Revoked" value={keys.length - activeCount} />
      </div>

      {/* Integration guide */}
      <ApiSamples />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icons.Search /></span>
            <input
              className="input pl-9 w-52"
              placeholder="Search keys…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <Icons.Close />
              </button>
            )}
          </div>
          {/* Status filter */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            {(['all', 'active', 'revoked'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${statusFilter === f ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-400">{pg.total} result{pg.total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
          <Icons.Plus /> Generate Key
        </button>
      </div>

      {/* Table */}
      {filteredKeys.length === 0 ? (
        <div className="card">
          <EmptyState
            title={search ? 'No matching API keys' : 'No API keys'}
            description={search ? 'Try adjusting your search or filters.' : 'Generate a key to authenticate requests.'}
            action={!search ? (
              <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
                <Icons.Plus /> Generate Key
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">API Key Name</th>
                <th className="table-th">Prefix</th>
                <th className="table-th">Permissions</th>
                <th className="table-th">Websocket</th>
                <th className="table-th">Scope</th>
                <th className="table-th">Expires</th>
                <th className="table-th">Status</th>
                <th className="table-th w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((key) => {
                const isRevoked = !!key.revokedAt;
                return (
                  <tr key={key.id} className={`table-row group ${isRevoked ? 'bg-slate-50 dark:bg-slate-900/30' : ''}`}>
                    <td className="table-td">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs shadow-sm border ${isRevoked ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700' : 'bg-gradient-to-br from-indigo-100 to-blue-50 text-indigo-600 border-indigo-200/50 dark:from-indigo-900/30 dark:to-blue-900/20 dark:text-indigo-400 dark:border-indigo-800/50'}`}>
                          <Icons.Key />
                        </span>
                        <div>
                          <p className={`font-semibold leading-tight ${isRevoked ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>{key.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-none">Last used: {key.lastUsedAt ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true }) : 'Never'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-td font-mono text-xs text-slate-500 dark:text-slate-400">{key.prefix}…</td>
                    <td className="table-td">
                      <div className="flex flex-wrap gap-1">
                        {key.permissions?.map((p) => (
                          <span key={p} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="table-td">
                      {key.websocketEnabled
                        ? <span className="text-green-600 dark:text-green-400 text-sm">✓</span>
                        : <span className="text-slate-400 dark:text-slate-600 text-sm">✗</span>}
                    </td>
                    <td className="table-td text-slate-500 dark:text-slate-400 text-sm">
                      <ScopeSummary apiKey={key} sites={sites} orgs={orgs} />
                    </td>
                    <td className="table-td text-slate-400 text-xs">
                      {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="table-td">
                      {isRevoked
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50">Revoked</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50">Active</span>}
                    </td>
                    <td className="table-td">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isRevoked && (
                          <>
                            <button
                              onClick={() => openEdit(key)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Edit API Key"
                            >
                              <Icons.Edit />
                            </button>
                            <button
                              onClick={() => setRevokeId(key.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Revoke API Key"
                            >
                              <Icons.Revoke />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setDeleteId(key.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Delete API Key"
                        >
                          <Icons.Trash />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-slate-100 dark:border-slate-800 px-4">
            <Pagination {...pg} onPage={pg.goTo} onPageSize={pg.changePageSize} />
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); resetCreate(); }} title="Generate API Key" width="max-w-xl">
        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Production Data Ingest" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Scope</label>
            <ScopeBuilder
              isSysAdmin={isSysAdmin}
              myOrgId={user?.organizationId ?? ''}
              scopeType={scopeType}
              onScopeTypeChange={setScopeType}
              scopes={scopes}
              onScopesChange={setScopes}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Permissions</label>
            <div className="flex gap-4">
              {PERMISSIONS.map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={perms.includes(p)} onChange={() => togglePerm(p, perms, setPerms)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-slate-700 dark:text-slate-200 capitalize">{p}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={websocketEnabled} onChange={(e) => setWebsocketEnabled(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Enable WebSocket access</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Expires at (optional)</label>
            <input className="input max-w-sm" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-5">
            <button type="button" onClick={() => { setCreateOpen(false); resetCreate(); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={create.isPending} className="btn-primary">
              {create.isPending ? 'Generating…' : 'Generate Key'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editKey} onClose={() => setEditKey(null)} title="Edit API Key" width="max-w-xl">
        <form onSubmit={handleEdit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Permissions</label>
            <div className="flex gap-4">
              {PERMISSIONS.map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editPerms.includes(p)} onChange={() => togglePerm(p, editPerms, setEditPerms)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-slate-700 dark:text-slate-200 capitalize">{p}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editWebsocket} onChange={(e) => setEditWebsocket(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Enable WebSocket access</span>
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Expires at (optional)</label>
            <input className="input max-w-sm" type="datetime-local" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} />
          </div>
          {editKey && (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700 mt-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Scope: <strong>{editKey.scopeType ?? 'SITES'}</strong>
                {editKey.scopes?.length ? ` (${editKey.scopes.length} entries)` : editKey.siteId ? ' (single site)' : ' (all sites)'}
                <br/>
                <span className="mt-1 block">To change scope, delete and recreate this key.</span>
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-5">
            <button type="button" onClick={() => setEditKey(null)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={update.isPending} className="btn-primary">
              {update.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Generate Success Show Key */}
      <Modal open={!!newKey} onClose={() => setNewKey(null)} title="Save your API key">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
           Please copy this key and store it securely. For your protection, it will <strong>not</strong> be shown again.
        </p>
        <div className="rounded-lg bg-slate-900 border border-slate-700 px-4 py-4 font-mono text-sm text-emerald-400 break-all select-all flex items-center justify-between">
          <span className="mr-4">{newKey}</span>
        </div>
        <div className="flex justify-end mt-5">
          <button onClick={() => { navigator.clipboard.writeText(newKey!); alert('Copied to clipboard!'); }} className="btn-primary flex items-center gap-2">
            Copy to clipboard
          </button>
        </div>
      </Modal>

      {/* Revoke confirm */}
      <ConfirmDialog
        open={!!revokeId}
        onClose={() => setRevokeId(null)}
        onConfirm={() => { revoke.mutate(revokeId!); setRevokeId(null); }}
        title="Revoke API Key"
        description="The key will be disabled immediately. Devices using it will lose access. The record is kept for audit purposes."
        confirmLabel="Revoke Key"
        danger
        loading={revoke.isPending}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { deleteKey.mutate(deleteId!); setDeleteId(null); }}
        title="Delete API Key"
        description="This key will be permanently removed. This cannot be undone."
        confirmLabel="Delete Key"
        danger
        loading={deleteKey.isPending}
      />
    </div>
  );
}
