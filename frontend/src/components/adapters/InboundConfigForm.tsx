import { useState, useEffect } from 'react';
import { Save, HelpCircle, BookTemplate, ChevronDown, ChevronUp, Zap, Play, AlertCircle } from 'lucide-react';
import { SiteAdapter } from '@iotproxy/shared';
import { useUpdateAdapter, useEvaluateJsonata } from '../../hooks/useAdapters';
import { SaveAsTemplateModal } from './SaveAsTemplateModal';

// ── Inline code helper ────────────────────────────────────────────────────────
function C({ children }: { children: string }) {
  return (
    <code className="bg-white dark:bg-slate-800 px-1 rounded border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200 text-[11px]">
      {children}
    </code>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-gray-500 dark:text-slate-400 w-28 flex-shrink-0">{label}</span>
      <C>{value}</C>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center justify-center text-slate-400 dark:text-slate-600 text-lg select-none">↓</div>
  );
}

function StoredAs({ children }: { children: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">Stored as:</p>
      <pre className="bg-slate-950 text-sky-300 rounded p-3 overflow-x-auto leading-5 text-[11px]">{children}</pre>
    </div>
  );
}

// ── Inbound mapping samples panel ─────────────────────────────────────────────
function InboundSamples() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'vendor' | 'array' | 'nested' | 'native'>('vendor');

  const TABS = [
    { id: 'vendor' as const,  label: 'Flat custom fields' },
    { id: 'array'  as const,  label: 'Gateway batch' },
    { id: 'nested' as const,  label: 'Deeply nested' },
    { id: 'native' as const,  label: 'Native (no adapter)' },
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
          Payload examples — before &amp; after adapter mapping
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
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

          {/* ── Flat custom fields ── */}
          {tab === 'vendor' && (
            <div className="space-y-3 text-gray-700 dark:text-slate-300">
              <p>Device sends a flat object using its own field names instead of the native schema.</p>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">Incoming push payload:</p>
                <pre className="bg-slate-950 text-emerald-400 rounded p-3 overflow-x-auto leading-5">{`{
  "device_id": "sensor-abc",
  "ts": "2026-04-13T10:00:00Z",
  "payload": {
    "temperature": 22.5,
    "humidity":    60,
    "pressure":    1013.25
  }
}`}</pre>
              </div>

              <Arrow />

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-2">Adapter config to set:</p>
                <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 rounded p-2 border border-slate-200 dark:border-slate-700">
                  <ConfigRow label="Sensor ID Path"  value="$.device_id" />
                  <ConfigRow label="Timestamp Path"  value="$.ts" />
                  <ConfigRow label="Data Path"       value="$.payload" />
                </div>
              </div>

              <Arrow />

              <StoredAs>{`{
  "sensorId":       "<UUID resolved from externalId sensor-abc>",
  "phenomenonTime": "2026-04-13T10:00:00Z",
  "processedData":  { "temperature": 22.5, "humidity": 60, "pressure": 1013.25 }
}`}</StoredAs>
            </div>
          )}

          {/* ── Gateway batch ── */}
          {tab === 'array' && (
            <div className="space-y-3 text-gray-700 dark:text-slate-300">
              <p>A gateway pushes multiple readings for different sensors in a single request, wrapped in an array under a key.</p>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">Incoming push payload:</p>
                <pre className="bg-slate-950 text-emerald-400 rounded p-3 overflow-x-auto leading-5">{`{
  "gateway":   "gw-roof-01",
  "firmware":  "v2.4.1",
  "readings": [
    {
      "nodeId":    "SN-001",
      "recordedAt": "2026-04-13T10:00:00Z",
      "values":    { "temperature": 22.5, "humidity": 60 }
    },
    {
      "nodeId":    "SN-002",
      "recordedAt": "2026-04-13T10:00:00Z",
      "values":    { "temperature": 19.1, "co2": 420, "tvoc": 0.08 }
    }
  ]
}`}</pre>
              </div>

              <Arrow />

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-2">Adapter config to set:</p>
                <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 rounded p-2 border border-slate-200 dark:border-slate-700">
                  <ConfigRow label="Readings Path"   value="$.readings[*]" />
                  <ConfigRow label="Sensor ID Path"  value="$.nodeId" />
                  <ConfigRow label="Timestamp Path"  value="$.recordedAt" />
                  <ConfigRow label="Data Path"       value="$.values" />
                </div>
              </div>

              <Arrow />

              <StoredAs>{`// Two separate records written — one per item in the array:
{ "sensorId": "<SN-001 UUID>", "phenomenonTime": "2026-04-13T10:00:00Z",
  "processedData": { "temperature": 22.5, "humidity": 60 } }

{ "sensorId": "<SN-002 UUID>", "phenomenonTime": "2026-04-13T10:00:00Z",
  "processedData": { "temperature": 19.1, "co2": 420, "tvoc": 0.08 } }`}</StoredAs>
            </div>
          )}

          {/* ── Deeply nested ── */}
          {tab === 'nested' && (
            <div className="space-y-3 text-gray-700 dark:text-slate-300">
              <p>Cloud platform or ERP-style payload where the reading is buried several levels deep.</p>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">Incoming push payload:</p>
                <pre className="bg-slate-950 text-emerald-400 rounded p-3 overflow-x-auto leading-5">{`{
  "meta": { "source": "cloud-bridge", "version": 3 },
  "body": {
    "device": {
      "serial": "DEV-9981",
      "capturedAt": "2026-04-13T10:00:00Z",
      "telemetry": {
        "env": {
          "temp_c":  22.5,
          "rh_pct":  60.0,
          "press_pa": 101325
        }
      }
    }
  }
}`}</pre>
              </div>

              <Arrow />

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-2">Adapter config to set:</p>
                <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 rounded p-2 border border-slate-200 dark:border-slate-700">
                  <ConfigRow label="Sensor ID Path"  value="$.body.device.serial" />
                  <ConfigRow label="Timestamp Path"  value="$.body.device.capturedAt" />
                  <ConfigRow label="Data Path"       value="$.body.device.telemetry.env" />
                </div>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1.5">Dot-notation JSONPath drills into any nesting depth.</p>
              </div>

              <Arrow />

              <StoredAs>{`{
  "sensorId":       "<UUID resolved from externalId DEV-9981>",
  "phenomenonTime": "2026-04-13T10:00:00Z",
  "processedData":  { "temp_c": 22.5, "rh_pct": 60.0, "press_pa": 101325 }
}`}</StoredAs>
            </div>
          )}

          {/* ── Native ── */}
          {tab === 'native' && (
            <div className="space-y-3 text-gray-700 dark:text-slate-300">
              <div className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                <Zap className="w-3.5 h-3.5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <span className="text-green-800 dark:text-green-300">
                  <strong>No adapter required.</strong> If your firmware can use the native schema below, disable the inbound adapter entirely — no transformation runs, the payload is accepted as-is.
                </span>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">Single reading (POST /ingest/readings):</p>
                <pre className="bg-slate-950 text-emerald-400 rounded p-3 overflow-x-auto leading-5">{`{
  "sensorId":       "550e8400-e29b-41d4-a716-446655440000",
  "phenomenonTime": "2026-04-13T10:00:00Z",
  "data": {
    "temperature": 22.5,
    "humidity":    60,
    "pressure":    1013.25
  }
}`}</pre>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">Bulk (POST /ingest/readings/bulk, up to 500):</p>
                <pre className="bg-slate-950 text-emerald-400 rounded p-3 overflow-x-auto leading-5">{`{
  "readings": [
    {
      "sensorId":       "550e8400-e29b-41d4-a716-446655440000",
      "phenomenonTime": "2026-04-13T10:00:00Z",
      "data": { "temperature": 22.5, "humidity": 60 }
    },
    {
      "sensorId":       "661f9511-f3ac-52e5-b827-557766551111",
      "phenomenonTime": "2026-04-13T10:00:05Z",
      "data": { "temperature": 19.1, "co2": 420 }
    }
  ]
}`}</pre>
              </div>

              <div className="text-[11px] text-gray-600 dark:text-slate-400 space-y-0.5">
                <p><strong>sensorId</strong> — UUID from the Sensors page, or the sensor's External ID string.</p>
                <p><strong>phenomenonTime</strong> — ISO-8601 UTC timestamp of when the measurement occurred.</p>
                <p><strong>data</strong> — any flat key/value object; all fields are stored verbatim.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── JSONata inbound samples ───────────────────────────────────────────────────

interface JsonataSample {
  id: string;
  title: string;
  description: string;
  inputJson: string;
  expression: string;
}

const INBOUND_SAMPLES: JsonataSample[] = [
  {
    id: 'single',
    title: 'Single reading',
    description: 'Device sends one flat object. Field names differ from the native schema.',
    inputJson: JSON.stringify({
      device_id: 'SN-01',
      ts: '2026-04-17T10:00:00Z',
      temp: 22.5,
      hum: 60,
    }, null, 2),
    expression:
`[{
  "sensorId":       device_id,
  "phenomenonTime": ts,
  "data": {
    "temperature": temp,
    "humidity":    hum
  }
}]`,
  },
  {
    id: 'array',
    title: 'Batch array under key',
    description: 'Gateway wraps multiple sensor readings in an array under a named key.',
    inputJson: JSON.stringify({
      gateway: 'gw-roof-01',
      readings: [
        { nodeId: 'SN-001', recordedAt: '2026-04-17T10:00:00Z', values: { temperature: 22.5, humidity: 60 } },
        { nodeId: 'SN-002', recordedAt: '2026-04-17T10:00:00Z', values: { temperature: 19.1, co2: 420 } },
      ],
    }, null, 2),
    expression:
`readings.{
  "sensorId":       nodeId,
  "phenomenonTime": recordedAt,
  "data":           values
}`,
  },
  {
    id: 'epoch',
    title: 'Epoch ms timestamp',
    description: 'Sensor reports time as a Unix millisecond epoch. Convert it to ISO-8601 and scale a raw integer value.',
    inputJson: JSON.stringify({
      id: 'DEV-42',
      epoch_ms: 1713340800000,
      raw_temp: 225,
      status: 1,
    }, null, 2),
    expression:
`[{
  "sensorId":       id,
  "phenomenonTime": $fromMillis(epoch_ms),
  "data": {
    "temperature": $number(raw_temp) / 10,
    "status":      status = 1 ? "ok" : "fault"
  }
}]`,
  },
  {
    id: 'discriminator',
    title: 'One row per metric',
    description: 'Each array item represents a different measurement type for the same device. Combine node + metric into a composite sensor ID.',
    inputJson: JSON.stringify([
      { node: 'CTR-1', type: 'temperature', ts: '2026-04-17T10:00:00Z', v: 22.5 },
      { node: 'CTR-1', type: 'humidity',    ts: '2026-04-17T10:00:00Z', v: 60.0 },
      { node: 'CTR-2', type: 'temperature', ts: '2026-04-17T10:00:05Z', v: 19.1 },
    ], null, 2),
    expression:
`$map($, function($r) {
  {
    "sensorId":       $r.node & ":" & $r.type,
    "phenomenonTime": $r.ts,
    "data":           { "value": $r.v }
  }
})`,
  },
  {
    id: 'snapshot',
    title: 'Snapshot — no timestamp',
    description: 'Device pushes a flat stats object with no timestamp field. Use $now() to capture the receive time and $string() to coerce a numeric ID.',
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
    id: 'nested',
    title: 'Deeply nested payload',
    description: 'Cloud-bridge format where telemetry is several levels deep inside a wrapper object.',
    inputJson: JSON.stringify({
      meta: { source: 'cloud-bridge', version: 3 },
      body: {
        device: {
          serial: 'DEV-9981',
          capturedAt: '2026-04-17T10:00:00Z',
          telemetry: { env: { temp_c: 22.5, rh_pct: 60.0, press_pa: 101325 } },
        },
      },
    }, null, 2),
    expression:
`[{
  "sensorId":       body.device.serial,
  "phenomenonTime": body.device.capturedAt,
  "data":           body.device.telemetry.env
}]`,
  },
];

function JsonataInboundExamples({ onSelect }: { onSelect: (expr: string, sample: string) => void }) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(INBOUND_SAMPLES[0].id);
  const active = INBOUND_SAMPLES.find((s) => s.id === activeId)!;

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
            {INBOUND_SAMPLES.map((s) => (
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
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">Input payload:</p>
                <pre className="bg-slate-950 text-emerald-400 rounded p-2 overflow-x-auto leading-5 h-40 text-[11px]">{active.inputJson}</pre>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1">Expression:</p>
                <pre className="bg-slate-950 text-violet-300 rounded p-2 overflow-x-auto leading-5 h-40 text-[11px]">{active.expression}</pre>
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

interface Props {
  siteId: string;
  adapter?: SiteAdapter;
  onTemplateSaved?: () => void;
}

export function InboundConfigForm({ siteId, adapter, onTemplateSaved }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [mappingMode, setMappingMode] = useState<'jsonpath' | 'jsonata'>('jsonpath');
  const [readingsPath, setReadingsPath] = useState('');
  const [sensorIdPath, setSensorIdPath] = useState('$.sensorId');
  const [phenomenonTimePath, setPhenomenonTimePath] = useState('$.phenomenonTime');
  const [dataPath, setDataPath] = useState('$.data');
  const [jsonataExpression, setJsonataExpression] = useState('');
  const [jsonataSample, setJsonataSample] = useState('');
  const [jsonataResult, setJsonataResult] = useState<{ result: unknown; readings: unknown[] } | null>(null);
  const [jsonataError, setJsonataError] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  const updateAdapter = useUpdateAdapter();
  const evaluateJsonata = useEvaluateJsonata();

  useEffect(() => {
    if (adapter) {
      setEnabled(adapter.inboundEnabled);
      const mapping = adapter.inboundMapping;
      if (mapping?.jsonataExpression) {
        setMappingMode('jsonata');
        setJsonataExpression(mapping.jsonataExpression);
      } else {
        setMappingMode('jsonpath');
        setReadingsPath(mapping?.readingsPath ?? '');
        setSensorIdPath(mapping?.fields.sensorId ?? '$.sensorId');
        setPhenomenonTimePath(mapping?.fields.phenomenonTime ?? '$.phenomenonTime');
        setDataPath(
          typeof mapping?.fields.data === 'string' ? mapping.fields.data : '$.data'
        );
      }
    }
  }, [adapter]);

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
      const res = await evaluateJsonata.mutateAsync({ expression: jsonataExpression, sample, siteId });
      setJsonataResult(res);
    } catch (err) {
      setJsonataError((err as Error).message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateAdapter.mutateAsync({
        siteId,
        data: {
          inboundEnabled: enabled,
          inboundMapping: mappingMode === 'jsonata'
            ? {
                jsonataExpression,
                readingsPath: undefined,
                fields: { sensorId: '', phenomenonTime: '', data: '' },
              }
            : {
                readingsPath: readingsPath || undefined,
                fields: {
                  sensorId: sensorIdPath,
                  phenomenonTime: phenomenonTimePath,
                  data: dataPath,
                },
              },
        },
      });
      alert('Inbound mapping saved');
    } catch (err) {
      alert('Failed to save: ' + (err as Error).message);
    }
  };

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="inbound-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-4 h-4 text-blue-600 dark:text-blue-500 rounded focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-700"
        />
        <label htmlFor="inbound-enabled" className="text-sm font-medium text-gray-700 dark:text-slate-200">
          Enable inbound data normalization
        </label>
      </div>

      {enabled && (
        <>
          {/* Mapping mode selector */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setMappingMode('jsonpath')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mappingMode === 'jsonpath'
                  ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
              }`}
            >
              JSONPath (simple)
            </button>
            <button
              type="button"
              onClick={() => setMappingMode('jsonata')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                mappingMode === 'jsonata'
                  ? 'bg-violet-600 dark:bg-violet-500 text-white shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
              }`}
            >
              <Zap className="w-3 h-3" />
              JSONata (advanced)
            </button>
          </div>

          {mappingMode === 'jsonpath' ? (
            <>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3 text-sm text-blue-800 dark:text-blue-300">
                <div className="flex items-start gap-2">
                  <HelpCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>How it works:</strong> When this site pushes data via MQTT/HTTP, IoTProxy will extract fields using JSONPath expressions below.
                    Leave <strong>Readings Path</strong> empty if the payload is a single reading or already an array of readings.
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Readings Path (optional)
                </label>
                <input
                  type="text"
                  value={readingsPath}
                  onChange={(e) => setReadingsPath(e.target.value)}
                  placeholder="$.data[*]"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  JSONPath to array of readings within the payload. Leave empty if payload is already an array.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                    Sensor ID Path *
                  </label>
                  <input
                    type="text"
                    value={sensorIdPath}
                    onChange={(e) => setSensorIdPath(e.target.value)}
                    required={mappingMode === 'jsonpath'}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">e.g. $.device_id</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                    Timestamp Path *
                  </label>
                  <input
                    type="text"
                    value={phenomenonTimePath}
                    onChange={(e) => setPhenomenonTimePath(e.target.value)}
                    required={mappingMode === 'jsonpath'}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">e.g. $.ts or $.timestamp</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                    Data Path *
                  </label>
                  <input
                    type="text"
                    value={dataPath}
                    onChange={(e) => setDataPath(e.target.value)}
                    required={mappingMode === 'jsonpath'}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">e.g. $.payload or $.measurements</p>
                </div>
              </div>

              <InboundSamples />
            </>
          ) : (
            /* ── JSONata mode ── */
            <div className="space-y-4">
              <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded p-3 text-sm text-violet-800 dark:text-violet-300">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>JSONata mode:</strong> Write a single expression that transforms the full push payload into normalized readings.
                    Use <code className="bg-violet-100 dark:bg-violet-900/40 px-1 rounded">$siteId</code> for the site UUID.
                    The expression must return an array of <code className="bg-violet-100 dark:bg-violet-900/40 px-1 rounded">{'{ sensorId, phenomenonTime, data }'}</code> objects.
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  JSONata Expression *
                </label>
                <textarea
                  value={jsonataExpression}
                  onChange={(e) => setJsonataExpression(e.target.value)}
                  rows={8}
                  placeholder={`readings.{\n  "sensorId":       device_id,\n  "phenomenonTime": ts,\n  "data":           { "temperature": temp, "humidity": hum }\n}`}
                  required={mappingMode === 'jsonata'}
                  className="w-full px-3 py-2 border border-violet-300 dark:border-violet-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                />
              </div>

              <JsonataInboundExamples
                onSelect={(expr, sample) => {
                  setJsonataExpression(expr);
                  setJsonataSample(sample);
                  setJsonataResult(null);
                  setJsonataError('');
                }}
              />

              {/* Live tester */}
              <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-3 space-y-3">
                <p className="text-xs font-semibold text-gray-600 dark:text-slate-300">Test expression against a sample payload</p>
                <textarea
                  value={jsonataSample}
                  onChange={(e) => { setJsonataSample(e.target.value); setJsonataResult(null); setJsonataError(''); }}
                  rows={5}
                  placeholder={'{\n  "device_id": "SN-01",\n  "ts": "2026-04-17T10:00:00Z",\n  "temp": 22.5\n}'}
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
                        Expression returned no valid readings. Check that each object has a non-empty <code>sensorId</code> field.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
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
          {updateAdapter.isPending ? 'Saving...' : 'Save Inbound Config'}
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
