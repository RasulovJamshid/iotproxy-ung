import { useState, useEffect } from 'react';
import { Save, HelpCircle, Plus, Trash2, BookTemplate, Zap, ChevronDown, ChevronUp, Play, AlertCircle } from 'lucide-react';
import { SiteAdapter, PullAuthType } from '@iotproxy/shared';
import { useUpdateAdapter, useEvaluateJsonata } from '../../hooks/useAdapters';
import { SaveAsTemplateModal } from './SaveAsTemplateModal';
import { SchemaDiscoveryWizard } from './SchemaDiscoveryWizard';

interface Props {
  siteId: string;
  adapter?: SiteAdapter;
  onTemplateSaved?: () => void;
}

type KVPair = { key: string; value: string };

function recordToKV(rec?: Record<string, string>): KVPair[] {
  if (!rec) return [];
  return Object.entries(rec).map(([key, value]) => ({ key, value }));
}

function kvToRecord(pairs: KVPair[]): Record<string, string> | undefined {
  const filled = pairs.filter((p) => p.key.trim());
  if (filled.length === 0) return undefined;
  return Object.fromEntries(filled.map((p) => [p.key.trim(), p.value]));
}

function KVEditor({
  label,
  pairs,
  onChange,
  valuePlaceholder = 'value',
}: {
  label: string;
  pairs: KVPair[];
  onChange: (pairs: KVPair[]) => void;
  valuePlaceholder?: string;
}) {
  const add = () => onChange([...pairs, { key: '', value: '' }]);
  const remove = (i: number) => onChange(pairs.filter((_, idx) => idx !== i));
  const update = (i: number, field: 'key' | 'value', val: string) =>
    onChange(pairs.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">{label}</label>
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      {pairs.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-slate-500 italic">No entries. Click Add to add one.</p>
      ) : (
        <div className="space-y-2">
          {pairs.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={p.key}
                onChange={(e) => update(i, 'key', e.target.value)}
                placeholder="key"
                className="w-2/5 px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 dark:placeholder:text-slate-500"
              />
              <input
                type="text"
                value={p.value}
                onChange={(e) => update(i, 'value', e.target.value)}
                placeholder={valuePlaceholder}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 dark:placeholder:text-slate-500"
              />
              <button type="button" onClick={() => remove(i)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function C({ children }: { children: string }) {
  return (
    <code className="bg-white dark:bg-slate-800 px-1 rounded border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200 text-[11px]">
      {children}
    </code>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="text-gray-500 dark:text-slate-400 w-32 flex-shrink-0">{label}</span>
      <C>{value}</C>
    </div>
  );
}

function Arrow() {
  return <div className="flex items-center justify-center text-slate-400 dark:text-slate-600 text-lg select-none">↓</div>;
}

function StoredAs({ children }: { children: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">Stored as:</p>
      <pre className="bg-slate-950 text-sky-300 rounded p-3 overflow-x-auto leading-5 text-[11px]">{children}</pre>
    </div>
  );
}

// ── Pull response mapping samples ─────────────────────────────────────────────
function PullSamples() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'rest-nested' | 'flat-array' | 'discriminator' | 'paginated'>('rest-nested');

  const TABS = [
    { id: 'rest-nested'    as const, label: 'REST — nested object' },
    { id: 'flat-array'     as const, label: 'Flat array' },
    { id: 'discriminator'  as const, label: 'Metric-type rows' },
    { id: 'paginated'      as const, label: 'Paginated / POST body' },
  ];

  return (
    <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-slate-800/60 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors font-medium"
      >
        <span className="flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
          API response examples — how to map each pattern
        </span>
        {open
          ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
          : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>

      {open && (
        <div className="p-3 bg-white dark:bg-slate-900/50 space-y-3">
          {/* Tab strip */}
          <div className="flex flex-wrap gap-px rounded overflow-hidden border border-gray-200 dark:border-slate-700 w-fit text-[11px]">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── REST — nested object ── */}
          {tab === 'rest-nested' && (
            <div className="space-y-3 text-gray-700 dark:text-slate-300">
              <p>Standard REST API where readings are in an array under a key, each item containing a nested measurements object.</p>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">API response (GET /api/v2/readings?since={`{{lastPollAt}}`}):</p>
                <pre className="bg-slate-950 text-emerald-400 rounded p-3 overflow-x-auto leading-5">{`{
  "status":  "ok",
  "polledAt": "2026-04-13T10:05:00Z",
  "results": [
    {
      "device":    "SN-001",
      "timestamp": "2026-04-13T10:00:00Z",
      "measurements": { "temperature": 22.5, "humidity": 60.1 }
    },
    {
      "device":    "SN-002",
      "timestamp": "2026-04-13T10:00:30Z",
      "measurements": { "temperature": 19.4, "co2": 412, "tvoc": 0.07 }
    }
  ]
}`}</pre>
              </div>

              <Arrow />

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-2">Response mapping config:</p>
                <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 rounded p-2 border border-slate-200 dark:border-slate-700">
                  <ConfigRow label="Readings Path"  value="$.results[*]" />
                  <ConfigRow label="Sensor ID Path" value="$.device" />
                  <ConfigRow label="Timestamp Path" value="$.timestamp" />
                  <ConfigRow label="Data Path"      value="$.measurements" />
                </div>
              </div>

              <Arrow />

              <StoredAs>{`// Two records written per poll cycle:
{ "sensorId": "<SN-001 UUID>", "phenomenonTime": "2026-04-13T10:00:00Z",
  "processedData": { "temperature": 22.5, "humidity": 60.1 } }

{ "sensorId": "<SN-002 UUID>", "phenomenonTime": "2026-04-13T10:00:30Z",
  "processedData": { "temperature": 19.4, "co2": 412, "tvoc": 0.07 } }`}</StoredAs>
            </div>
          )}

          {/* ── Flat array ── */}
          {tab === 'flat-array' && (
            <div className="space-y-3 text-gray-700 dark:text-slate-300">
              <p>API returns a bare JSON array at the root — no wrapper object. All measurement fields sit alongside the ID and timestamp in each item.</p>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">API response (GET /telemetry/export):</p>
                <pre className="bg-slate-950 text-emerald-400 rounded p-3 overflow-x-auto leading-5">{`[
  {
    "deviceId":  "HUM-01",
    "capturedAt": "2026-04-13T10:00:00Z",
    "temp":  22.5,
    "rh":    60.0,
    "press": 1013.2
  },
  {
    "deviceId":  "HUM-02",
    "capturedAt": "2026-04-13T10:00:10Z",
    "temp":  21.0,
    "rh":    58.5,
    "press": 1012.9
  }
]`}</pre>
              </div>

              <Arrow />

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-2">Response mapping config:</p>
                <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 rounded p-2 border border-slate-200 dark:border-slate-700">
                  <ConfigRow label="Readings Path"  value="$[*]" />
                  <ConfigRow label="Sensor ID Path" value="$.deviceId" />
                  <ConfigRow label="Timestamp Path" value="$.capturedAt" />
                  <ConfigRow label="Data Path"      value="$" />
                </div>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1.5">
                  Data path <C>$</C> captures the whole item. <C>deviceId</C> and <C>capturedAt</C> will be included in <code className="bg-white dark:bg-slate-800 px-0.5 rounded border border-gray-200 dark:border-slate-700">processedData</code> alongside the measurements — harmless but expected.
                </p>
              </div>

              <Arrow />

              <StoredAs>{`{ "sensorId": "<HUM-01 UUID>", "phenomenonTime": "2026-04-13T10:00:00Z",
  "processedData": { "deviceId": "HUM-01", "capturedAt": "...", "temp": 22.5, "rh": 60.0, "press": 1013.2 } }

{ "sensorId": "<HUM-02 UUID>", "phenomenonTime": "2026-04-13T10:00:10Z",
  "processedData": { "deviceId": "HUM-02", "capturedAt": "...", "temp": 21.0, "rh": 58.5, "press": 1012.9 } }`}</StoredAs>
            </div>
          )}

          {/* ── Discriminator ── */}
          {tab === 'discriminator' && (
            <div className="space-y-3 text-gray-700 dark:text-slate-300">
              <p>Industrial or ERP APIs sometimes return one row per metric type — the same device produces multiple rows per timestamp, each with a different "type" label. Use the <strong>Discriminator Field</strong> to combine the type into the sensor ID so each metric maps to its own sensor.</p>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">API response:</p>
                <pre className="bg-slate-950 text-emerald-400 rounded p-3 overflow-x-auto leading-5">{`[
  { "nodeId": "CTR-1", "metric": "temperature", "ts": "2026-04-13T10:00:00Z", "value": 22.5 },
  { "nodeId": "CTR-1", "metric": "humidity",    "ts": "2026-04-13T10:00:00Z", "value": 60.0 },
  { "nodeId": "CTR-1", "metric": "pressure",    "ts": "2026-04-13T10:00:00Z", "value": 1013.2 },
  { "nodeId": "CTR-2", "metric": "temperature", "ts": "2026-04-13T10:00:05Z", "value": 19.1 }
]`}</pre>
              </div>

              <Arrow />

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-2">Response mapping config:</p>
                <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 rounded p-2 border border-slate-200 dark:border-slate-700">
                  <ConfigRow label="Readings Path"       value="$[*]" />
                  <ConfigRow label="Sensor ID Path"      value="$.nodeId" />
                  <ConfigRow label="Discriminator Field" value="$.metric" />
                  <ConfigRow label="Timestamp Path"      value="$.ts" />
                  <ConfigRow label="Data Path"           value="$" />
                </div>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1.5">
                  The discriminator appends the metric value to the sensor ID, so <C>CTR-1</C> + <C>temperature</C> → external ID <C>CTR-1:temperature</C>. Each unique combination must have a matching sensor with that External ID.
                </p>
              </div>

              <Arrow />

              <StoredAs>{`// 4 rows → 4 separate sensor records:
{ "sensorId": "<CTR-1:temperature UUID>", "phenomenonTime": "...", "processedData": { "value": 22.5, ... } }
{ "sensorId": "<CTR-1:humidity UUID>",    "phenomenonTime": "...", "processedData": { "value": 60.0, ... } }
{ "sensorId": "<CTR-1:pressure UUID>",    "phenomenonTime": "...", "processedData": { "value": 1013.2, ... } }
{ "sensorId": "<CTR-2:temperature UUID>", "phenomenonTime": "...", "processedData": { "value": 19.1, ... } }`}</StoredAs>
            </div>
          )}

          {/* ── Paginated / POST body ── */}
          {tab === 'paginated' && (
            <div className="space-y-3 text-gray-700 dark:text-slate-300">
              <p>Some APIs require a POST request with a JSON body specifying the time window. Use template variables in the body template so each poll covers only new data.</p>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">HTTP config:</p>
                <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 rounded p-2 border border-slate-200 dark:border-slate-700">
                  <ConfigRow label="Method"       value="POST" />
                  <ConfigRow label="URL"          value="https://api.example.com/v1/telemetry/query" />
                  <ConfigRow label="Interval"     value="300 (seconds)" />
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">Request body template:</p>
                <pre className="bg-slate-950 text-emerald-400 rounded p-3 overflow-x-auto leading-5">{`{
  "from":    "{{lastPollAt}}",
  "to":      "{{now}}",
  "siteId":  "{{siteId}}",
  "limit":   500
}`}</pre>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                  <C>{'{{lastPollAt}}'}</C> — timestamp of the previous successful poll.<br />
                  <C>{'{{now}}'}</C> — current UTC time.<br />
                  <C>{'{{siteId}}'}</C> — internal site UUID.
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">API response:</p>
                <pre className="bg-slate-950 text-emerald-400 rounded p-3 overflow-x-auto leading-5">{`{
  "page": 1,
  "total": 2,
  "items": [
    {
      "id":        "EQ-405",
      "observedAt": "2026-04-13T10:00:00Z",
      "data": { "flow_lpm": 12.4, "pressure_bar": 3.1, "temp_c": 18.7 }
    },
    {
      "id":        "EQ-406",
      "observedAt": "2026-04-13T10:00:15Z",
      "data": { "flow_lpm": 9.8,  "pressure_bar": 2.9, "temp_c": 19.2 }
    }
  ]
}`}</pre>
              </div>

              <Arrow />

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-2">Response mapping config:</p>
                <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 rounded p-2 border border-slate-200 dark:border-slate-700">
                  <ConfigRow label="Readings Path"  value="$.items[*]" />
                  <ConfigRow label="Sensor ID Path" value="$.id" />
                  <ConfigRow label="Timestamp Path" value="$.observedAt" />
                  <ConfigRow label="Data Path"      value="$.data" />
                </div>
              </div>

              <Arrow />

              <StoredAs>{`{ "sensorId": "<EQ-405 UUID>", "phenomenonTime": "2026-04-13T10:00:00Z",
  "processedData": { "flow_lpm": 12.4, "pressure_bar": 3.1, "temp_c": 18.7 } }

{ "sensorId": "<EQ-406 UUID>", "phenomenonTime": "2026-04-13T10:00:15Z",
  "processedData": { "flow_lpm": 9.8, "pressure_bar": 2.9, "temp_c": 19.2 } }`}</StoredAs>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── JSONata pull samples ──────────────────────────────────────────────────────

interface JsonataSample {
  id: string;
  title: string;
  description: string;
  inputJson: string;
  expression: string;
}

const PULL_SAMPLES: JsonataSample[] = [
  {
    id: 'rest-nested',
    title: 'REST — nested object',
    description: 'Standard REST API: readings are in an array under a key, each item has a nested measurements object.',
    inputJson: JSON.stringify({
      status: 'ok',
      results: [
        { device: 'SN-001', timestamp: '2026-04-17T10:00:00Z', measurements: { temperature: 22.5, humidity: 60.1 } },
        { device: 'SN-002', timestamp: '2026-04-17T10:00:30Z', measurements: { temperature: 19.4, co2: 412 } },
      ],
    }, null, 2),
    expression:
`results.{
  "sensorId":       device,
  "phenomenonTime": timestamp,
  "data":           measurements
}`,
  },
  {
    id: 'flat-array',
    title: 'Flat array',
    description: 'API returns a bare JSON array. All measurement fields sit alongside the ID and timestamp.',
    inputJson: JSON.stringify([
      { deviceId: 'HUM-01', capturedAt: '2026-04-17T10:00:00Z', temp: 22.5, rh: 60.0, press: 1013.2 },
      { deviceId: 'HUM-02', capturedAt: '2026-04-17T10:00:10Z', temp: 21.0, rh: 58.5, press: 1012.9 },
    ], null, 2),
    expression:
`$map($, function($r) {
  {
    "sensorId":       $r.deviceId,
    "phenomenonTime": $r.capturedAt,
    "data": {
      "temperature": $r.temp,
      "humidity":    $r.rh,
      "pressure":    $r.press
    }
  }
})`,
  },
  {
    id: 'epoch',
    title: 'Epoch ms + unit convert',
    description: 'API reports time as Unix milliseconds. Convert epoch to ISO-8601 and transform units in the same expression.',
    inputJson: JSON.stringify([
      { id: 'EQ-405', epoch: 1713340800000, temp_c: 18.7, flow_lpm: 12.4, pressure_bar: 3.1 },
      { id: 'EQ-406', epoch: 1713340815000, temp_c: 19.2, flow_lpm: 9.8,  pressure_bar: 2.9 },
    ], null, 2),
    expression:
`$map($, function($r) {
  {
    "sensorId":       $r.id,
    "phenomenonTime": $fromMillis($r.epoch),
    "data": {
      "temp_f":        $r.temp_c * 1.8 + 32,
      "flow_lpm":      $r.flow_lpm,
      "pressure_psi":  $r.pressure_bar * 14.504
    }
  }
})`,
  },
  {
    id: 'discriminator',
    title: 'One row per metric',
    description: 'Industrial API returns one row per metric type. Combine nodeId + metric into a composite sensor ID.',
    inputJson: JSON.stringify([
      { nodeId: 'CTR-1', metric: 'temperature', ts: '2026-04-17T10:00:00Z', value: 22.5 },
      { nodeId: 'CTR-1', metric: 'humidity',    ts: '2026-04-17T10:00:00Z', value: 60.0 },
      { nodeId: 'CTR-1', metric: 'pressure',    ts: '2026-04-17T10:00:00Z', value: 1013.2 },
      { nodeId: 'CTR-2', metric: 'temperature', ts: '2026-04-17T10:00:05Z', value: 19.1 },
    ], null, 2),
    expression:
`$map($, function($r) {
  {
    "sensorId":       $r.nodeId & ":" & $r.metric,
    "phenomenonTime": $r.ts,
    "data":           { "value": $r.value }
  }
})`,
  },
  {
    id: 'snapshot',
    title: 'Snapshot — no timestamp',
    description: 'API returns a single flat stats object with no timestamp. Use $now() for the reading time and $string() to coerce a numeric ID.',
    inputJson: JSON.stringify({
      id: 1,
      totalVehicles: 23,
      vehiclesInside: 0,
      vehiclesOutside: 23,
      activeVehicles: 22,
      ungVehicles: 21,
      todayEvents: 0,
      todayEntry: 0,
      todayExit: 0,
      todayDenied: 0,
      totalDevices: 1,
      onlineDevices: 0,
      offlineDevices: 0,
    }, null, 2),
    expression:
`[{
  "sensorId":       $string(id),
  "phenomenonTime": $now(),
  "data": {
    "totalVehicles":   totalVehicles,
    "vehiclesInside":  vehiclesInside,
    "vehiclesOutside": vehiclesOutside,
    "activeVehicles":  activeVehicles,
    "todayEntry":      todayEntry,
    "todayExit":       todayExit,
    "todayDenied":     todayDenied,
    "totalDevices":    totalDevices,
    "onlineDevices":   onlineDevices,
    "offlineDevices":  offlineDevices
  }
}]`,
  },
  {
    id: 'filter',
    title: 'Filter active only',
    description: 'Response includes sensors in multiple states. Keep only ACTIVE ones and rename fields.',
    inputJson: JSON.stringify({
      items: [
        { id: 'S-01', status: 'active',   recorded_at: '2026-04-17T10:00:00Z', temp_c: 22.5, pressure_bar: 3.1 },
        { id: 'S-02', status: 'offline',  recorded_at: '2026-04-17T10:00:00Z', temp_c: 18.0, pressure_bar: 2.8 },
        { id: 'S-03', status: 'active',   recorded_at: '2026-04-17T10:00:00Z', temp_c: 20.1, pressure_bar: 3.0 },
      ],
    }, null, 2),
    expression:
`items[status = "active"].{
  "sensorId":       id,
  "phenomenonTime": recorded_at,
  "data": {
    "temperature":    temp_c,
    "pressure_bar":   pressure_bar
  }
}`,
  },
];

function JsonataPullExamples({ onSelect }: { onSelect: (expr: string, sample: string) => void }) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(PULL_SAMPLES[0].id);
  const active = PULL_SAMPLES.find((s) => s.id === activeId)!;

  return (
    <div className="border border-violet-200 dark:border-violet-800/50 rounded-lg overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors font-medium"
      >
        <span className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5" />
          Expression samples — click to load
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="bg-white dark:bg-slate-900/50">
          {/* Tab strip */}
          <div className="flex overflow-x-auto border-b border-violet-100 dark:border-violet-900/50 gap-px bg-violet-50 dark:bg-violet-900/10">
            {PULL_SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className={`px-3 py-2 whitespace-nowrap font-medium transition-colors ${
                  activeId === s.id
                    ? 'bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 border-b-2 border-violet-500 dark:border-violet-400'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>

          {/* Active sample */}
          <div className="p-3 space-y-3">
            <p className="text-[11px] text-gray-500 dark:text-slate-400">{active.description}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">API response:</p>
                <pre className="bg-slate-950 text-emerald-400 rounded p-2 overflow-x-auto leading-5 h-44 text-[11px]">{active.inputJson}</pre>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">Expression:</p>
                <pre className="bg-slate-950 text-violet-300 rounded p-2 overflow-x-auto leading-5 h-44 text-[11px]">{active.expression}</pre>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelect(active.expression, active.inputJson)}
              className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 dark:bg-violet-500 text-white rounded hover:bg-violet-700 dark:hover:bg-violet-600 transition-colors font-medium"
            >
              <Zap className="w-3 h-3" />
              Load this example
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PullConfigForm({ siteId, adapter, onTemplateSaved }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [intervalSec, setIntervalSec] = useState(300);
  const [authType, setAuthType] = useState<PullAuthType>('none');
  const [authHeaderName, setAuthHeaderName] = useState('X-API-Key');
  const [authValue, setAuthValue] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  const [queryParams, setQueryParams] = useState<KVPair[]>([]);
  const [headers, setHeaders] = useState<KVPair[]>([]);
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [bodyError, setBodyError] = useState('');

  const [responseMappingMode, setResponseMappingMode] = useState<'jsonpath' | 'jsonata'>('jsonpath');
  const [responseMode, setResponseMode] = useState<'single-site' | 'multi-site'>('single-site');
  const [readingsPath, setReadingsPath] = useState('$[*]');
  const [sensorIdPath, setSensorIdPath] = useState('$.sensorId');
  const [discriminatorField, setDiscriminatorField] = useState('');
  const [phenomenonTimePath, setPhenomenonTimePath] = useState('$.phenomenonTime');
  const [dataPath, setDataPath] = useState('$.data');
  const [jsonataExpression, setJsonataExpression] = useState('');
  const [jsonataSample, setJsonataSample] = useState('');
  const [jsonataResult, setJsonataResult] = useState<{ result: unknown; readings: unknown[] } | null>(null);
  const [jsonataError, setJsonataError] = useState('');

  const updateAdapter = useUpdateAdapter();
  const evaluateJsonata = useEvaluateJsonata();
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [discoveryMode, setDiscoveryMode] = useState(false);

  useEffect(() => {
    if (adapter) {
      setEnabled(adapter.pullEnabled);
      setUrl(adapter.pullUrl ?? '');
      setMethod(adapter.pullMethod === 'POST' ? 'POST' : 'GET');
      setIntervalSec(adapter.pullIntervalSec);
      setAuthType(adapter.pullAuthType);
      setAuthHeaderName(adapter.pullAuthConfig?.headerName ?? 'X-API-Key');
      setAuthValue(adapter.pullAuthConfig?.value ?? '');
      setAuthUsername(adapter.pullAuthConfig?.username ?? '');
      setAuthPassword(adapter.pullAuthConfig?.password ?? '');

      setQueryParams(recordToKV(adapter.pullQueryParams));
      setHeaders(recordToKV(adapter.pullHeaders));
      setBodyTemplate(
        adapter.pullBodyTemplate ? JSON.stringify(adapter.pullBodyTemplate, null, 2) : ''
      );

      if (adapter.responseMapping) {
        if (adapter.responseMapping.jsonataExpression) {
          setResponseMappingMode('jsonata');
          setJsonataExpression(adapter.responseMapping.jsonataExpression);
          setResponseMode(adapter.responseMapping.mode);
        } else {
          setResponseMappingMode('jsonpath');
          setResponseMode(adapter.responseMapping.mode);
          setReadingsPath(adapter.responseMapping.readingsPath);
          setSensorIdPath(adapter.responseMapping.fields.sensorId);
          setDiscriminatorField(adapter.responseMapping.fields.discriminatorField ?? '');
          setPhenomenonTimePath(adapter.responseMapping.fields.phenomenonTime);
          setDataPath(
            typeof adapter.responseMapping.fields.data === 'string'
              ? adapter.responseMapping.fields.data
              : '$.data'
          );
        }
      }
    }
  }, [adapter]);

  // Apply mapping from Discovery Wizard
  const applyDiscovery = (mapping: {
    readingsPath: string;
    sensorIdPath: string;
    discriminatorField: string | null;
    phenomenonTimePath: string;
    dataPath: string;
  }) => {
    setResponseMappingMode('jsonpath');
    setReadingsPath(mapping.readingsPath);
    setSensorIdPath(mapping.sensorIdPath);
    setDiscriminatorField(mapping.discriminatorField ?? '');
    setPhenomenonTimePath(mapping.phenomenonTimePath);
    setDataPath(mapping.dataPath);
    setDiscoveryMode(false);
  };

  const handleTestJsonata = async () => {
    setJsonataError('');
    setJsonataResult(null);
    let sample: unknown;
    try {
      sample = JSON.parse(jsonataSample);
    } catch {
      setJsonataError('Sample JSON is invalid');
      return;
    }
    try {
      const res = await evaluateJsonata.mutateAsync({ expression: jsonataExpression, sample });
      setJsonataResult(res);
    } catch (err) {
      setJsonataError((err as Error).message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let parsedBody: Record<string, unknown> | undefined;
    if (method === 'POST' && bodyTemplate.trim()) {
      try {
        parsedBody = JSON.parse(bodyTemplate);
      } catch {
        setBodyError('Invalid JSON in body template');
        return;
      }
    }
    setBodyError('');

    const responseMapping = responseMappingMode === 'jsonata'
      ? {
          mode: responseMode,
          siteId: responseMode === 'single-site' ? siteId : undefined,
          jsonataExpression,
          readingsPath: '$[*]',
          fields: { sensorId: '', phenomenonTime: '', data: '' },
        }
      : {
          mode: responseMode,
          siteId: responseMode === 'single-site' ? siteId : undefined,
          readingsPath,
          fields: {
            sensorId: sensorIdPath,
            discriminatorField: discriminatorField.trim() || undefined,
            phenomenonTime: phenomenonTimePath,
            data: dataPath,
          },
        };

    try {
      await updateAdapter.mutateAsync({
        siteId,
        data: {
          pullEnabled: enabled,
          pullUrl: url,
          pullMethod: method,
          pullIntervalSec: intervalSec,
          pullQueryParams: kvToRecord(queryParams),
          pullHeaders: kvToRecord(headers),
          pullBodyTemplate: parsedBody,
          pullAuthType: authType,
          pullAuthConfig:
            authType === 'none'
              ? undefined
              : authType === 'apiKey'
              ? { headerName: authHeaderName, value: authValue }
              : authType === 'bearerToken'
              ? { value: authValue }
              : { username: authUsername, password: authPassword },
          responseMapping,
        },
      });
      alert('Pull configuration saved');
    } catch (err) {
      alert('Failed to save: ' + (err as Error).message);
    }
  };

  // Render discovery wizard overlay
  if (discoveryMode) {
    return (
      <SchemaDiscoveryWizard
        onApply={applyDiscovery}
        onBack={() => setDiscoveryMode(false)}
      />
    );
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="pull-enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 text-blue-600 dark:text-blue-500 rounded focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-700"
          />
          <label htmlFor="pull-enabled" className="text-sm font-medium text-gray-700 dark:text-slate-200">
            Enable scheduled data pull
          </label>
        </div>
        <button
          type="button"
          onClick={() => setDiscoveryMode(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          <Zap className="w-4 h-4" />
          Schema Discovery
        </button>
      </div>

      {enabled && (
        <>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3 text-sm text-blue-800 dark:text-blue-300">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>How it works:</strong> IoTProxy will periodically fetch data from the configured URL.
                Use template variables: <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">{'{{lastPollAt}}'}</code>, <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">{'{{now}}'}</code>, <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">{'{{siteId}}'}</code>
              </div>
            </div>
          </div>

          {/* HTTP Config */}
          <div className="border-t border-gray-200 dark:border-slate-800 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-3">HTTP Request</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  URL *
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.example.com/readings?from={{lastPollAt}}"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Method
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as 'GET' | 'POST')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Interval (seconds)
                  </label>
                  <input
                    type="number"
                    value={intervalSec}
                    onChange={(e) => setIntervalSec(Number(e.target.value))}
                    min={10}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Query Parameters */}
          <div className="border-t border-gray-200 dark:border-slate-800 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-3">Query Parameters</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
              Appended to the URL. Supports template variables: <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">{'{{now}}'}</code>, <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">{'{{lastPollAt}}'}</code>, <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">{'{{siteId}}'}</code>
            </p>
            <KVEditor
              label="Parameters"
              pairs={queryParams}
              onChange={setQueryParams}
              valuePlaceholder="value or {{now}}"
            />
          </div>

          {/* Custom Headers */}
          <div className="border-t border-gray-200 dark:border-slate-800 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-3">Custom Headers</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
              Additional HTTP headers to include. Supports template variables.
            </p>
            <KVEditor
              label="Headers"
              pairs={headers}
              onChange={setHeaders}
              valuePlaceholder="header value"
            />
          </div>

          {/* Body Template (POST only) */}
          {method === 'POST' && (
            <div className="border-t border-gray-200 dark:border-slate-800 pt-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-3">Request Body</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
                JSON body for POST requests. String values support template variables.
              </p>
              <textarea
                value={bodyTemplate}
                onChange={(e) => { setBodyTemplate(e.target.value); setBodyError(''); }}
                placeholder={'{\n  "from": "{{lastPollAt}}",\n  "to": "{{now}}"\n}'}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 placeholder:text-gray-400 dark:placeholder:text-slate-500"
              />
              {bodyError && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{bodyError}</p>
              )}
            </div>
          )}

          {/* Auth Config */}
          <div className="border-t border-gray-200 dark:border-slate-800 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-3">Authentication</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Auth Type
                </label>
                <select
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value as PullAuthType)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                >
                  <option value="none">None</option>
                  <option value="apiKey">API Key (custom header)</option>
                  <option value="bearerToken">Bearer Token</option>
                  <option value="basicAuth">Basic Auth</option>
                </select>
              </div>

              {authType === 'apiKey' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      Header Name
                    </label>
                    <input
                      type="text"
                      value={authHeaderName}
                      onChange={(e) => setAuthHeaderName(e.target.value)}
                      placeholder="X-API-Key"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={authValue}
                      onChange={(e) => setAuthValue(e.target.value)}
                      placeholder="your-api-key"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                    />
                  </div>
                </div>
              )}

              {authType === 'bearerToken' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Token
                  </label>
                  <input
                    type="password"
                    value={authValue}
                    onChange={(e) => setAuthValue(e.target.value)}
                    placeholder="your-bearer-token"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                  />
                </div>
              )}

              {authType === 'basicAuth' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Response Mapping */}
          <div className="border-t border-gray-200 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200">Response Mapping</h3>
              {/* Mapping mode toggle */}
              <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setResponseMappingMode('jsonpath')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    responseMappingMode === 'jsonpath'
                      ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 shadow-sm'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                  }`}
                >
                  JSONPath
                </button>
                <button
                  type="button"
                  onClick={() => setResponseMappingMode('jsonata')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                    responseMappingMode === 'jsonata'
                      ? 'bg-violet-600 dark:bg-violet-500 text-white shadow-sm'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  JSONata
                </button>
              </div>
            </div>

            {responseMappingMode === 'jsonpath' ? (
              <>
                <PullSamples />
                <div className="space-y-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      Response Mode
                    </label>
                    <select
                      value={responseMode}
                      onChange={(e) => setResponseMode(e.target.value as 'single-site' | 'multi-site')}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                    >
                      <option value="single-site">Single Site (all readings for this site)</option>
                      <option value="multi-site">Multi-Site (response contains multiple sites)</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {responseMode === 'single-site'
                        ? 'All readings in the response belong to this site'
                        : 'Response contains data for multiple sites (e.g., aggregator API)'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      Readings Path *
                    </label>
                    <input
                      type="text"
                      value={readingsPath}
                      onChange={(e) => setReadingsPath(e.target.value)}
                      placeholder="$.data[*]"
                      required={responseMappingMode === 'jsonpath'}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                    />
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      JSONPath to array of readings in the response
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        Sensor ID Path *
                      </label>
                      <input
                        type="text"
                        value={sensorIdPath}
                        onChange={(e) => setSensorIdPath(e.target.value)}
                        required={responseMappingMode === 'jsonpath'}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        Timestamp Path *
                      </label>
                      <input
                        type="text"
                        value={phenomenonTimePath}
                        onChange={(e) => setPhenomenonTimePath(e.target.value)}
                        required={responseMappingMode === 'jsonpath'}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        Data Path *
                      </label>
                      <input
                        type="text"
                        value={dataPath}
                        onChange={(e) => setDataPath(e.target.value)}
                        required={responseMappingMode === 'jsonpath'}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                      />
                    </div>
                  </div>

                  {/* Discriminator field */}
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50">
                    <div className="flex items-start gap-2 mb-2">
                      <Zap className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Discriminator Field (optional)</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Use this when a single API response row contains multiple sensor types distinguished by a label field.
                          The sensor ID will be composed as <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{'<sensorId>:<discriminatorValue>'}</code>.
                        </p>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={discriminatorField}
                      onChange={(e) => setDiscriminatorField(e.target.value)}
                      placeholder="e.g. $.metric  (leave blank if not needed)"
                      className="w-full px-3 py-2 border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-gray-400 dark:placeholder:text-slate-500 text-sm font-mono"
                    />
                  </div>
                </div>
              </>
            ) : (
              /* ── JSONata response mapping ── */
              <div className="space-y-4">
                <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded p-3 text-sm text-violet-800 dark:text-violet-300">
                  <div className="flex items-start gap-2">
                    <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong>JSONata mode:</strong> Write a single expression that transforms the entire API response into normalized readings.
                      For single-site, <code className="bg-violet-100 dark:bg-violet-900/40 px-1 rounded">siteId</code> is auto-injected.
                      For multi-site, include <code className="bg-violet-100 dark:bg-violet-900/40 px-1 rounded">siteId</code> in each result object.
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Response Mode
                  </label>
                  <select
                    value={responseMode}
                    onChange={(e) => setResponseMode(e.target.value as 'single-site' | 'multi-site')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  >
                    <option value="single-site">Single Site</option>
                    <option value="multi-site">Multi-Site (include siteId in each result)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    JSONata Expression *
                  </label>
                  <textarea
                    value={jsonataExpression}
                    onChange={(e) => setJsonataExpression(e.target.value)}
                    rows={8}
                    placeholder={`results.{\n  "sensorId":       device,\n  "phenomenonTime": timestamp,\n  "data":           measurements\n}`}
                    required={responseMappingMode === 'jsonata'}
                    className="w-full px-3 py-2 border border-violet-300 dark:border-violet-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                  />
                </div>

                <JsonataPullExamples
                  onSelect={(expr, sample) => {
                    setJsonataExpression(expr);
                    setJsonataSample(sample);
                    setJsonataResult(null);
                    setJsonataError('');
                  }}
                />

                {/* Live tester */}
                <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-semibold text-gray-600 dark:text-slate-300">Test expression against a sample API response</p>
                  <textarea
                    value={jsonataSample}
                    onChange={(e) => { setJsonataSample(e.target.value); setJsonataResult(null); setJsonataError(''); }}
                    rows={6}
                    placeholder={'{\n  "results": [\n    { "device": "SN-01", "timestamp": "2026-04-17T10:00:00Z", "measurements": { "temperature": 22.5 } }\n  ]\n}'}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={handleTestJsonata}
                    disabled={!jsonataExpression || !jsonataSample || evaluateJsonata.isPending}
                    className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 dark:bg-violet-500 text-white text-xs rounded hover:bg-violet-700 dark:hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    {evaluateJsonata.isPending ? 'Evaluating…' : 'Run Expression'}
                  </button>

                  {jsonataError && (
                    <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-400">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      {jsonataError}
                    </div>
                  )}

                  {jsonataResult && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">
                        Normalized readings ({jsonataResult.readings.length} item{jsonataResult.readings.length !== 1 ? 's' : ''}):
                      </p>
                      <pre className="bg-slate-950 text-emerald-400 rounded p-2 overflow-x-auto leading-5 text-[11px]">
                        {JSON.stringify(jsonataResult.readings, null, 2)}
                      </pre>
                      {jsonataResult.readings.length === 0 && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          Expression returned no valid readings. Each object must have a non-empty <code>sensorId</code>.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowTemplateModal(true)}
          disabled={!adapter}
          title={!adapter ? 'Save adapter config first' : 'Save current config as a reusable template'}
          className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-700 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <BookTemplate className="w-4 h-4" />
          Save as Template
        </button>
        <button
          type="submit"
          disabled={updateAdapter.isPending}
          className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          <Save className="w-4 h-4" />
          {updateAdapter.isPending ? 'Saving...' : 'Save Pull Config'}
        </button>
      </div>

    </form>

    {showTemplateModal && (
      <SaveAsTemplateModal 
        siteId={siteId} 
        onClose={() => setShowTemplateModal(false)}
        onSuccess={onTemplateSaved}
      />
    )}
    </>
  );
}
