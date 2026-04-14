import { useState, useEffect } from 'react';
import { Save, HelpCircle, BookTemplate, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { SiteAdapter } from '@iotproxy/shared';
import { useUpdateAdapter } from '../../hooks/useAdapters';
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

interface Props {
  siteId: string;
  adapter?: SiteAdapter;
  onTemplateSaved?: () => void;
}

export function InboundConfigForm({ siteId, adapter, onTemplateSaved }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [readingsPath, setReadingsPath] = useState('');
  const [sensorIdPath, setSensorIdPath] = useState('$.sensorId');
  const [phenomenonTimePath, setPhenomenonTimePath] = useState('$.phenomenonTime');
  const [dataPath, setDataPath] = useState('$.data');
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  const updateAdapter = useUpdateAdapter();

  useEffect(() => {
    if (adapter) {
      setEnabled(adapter.inboundEnabled);
      setReadingsPath(adapter.inboundMapping?.readingsPath ?? '');
      setSensorIdPath(adapter.inboundMapping?.fields.sensorId ?? '$.sensorId');
      setPhenomenonTimePath(adapter.inboundMapping?.fields.phenomenonTime ?? '$.phenomenonTime');
      setDataPath(
        typeof adapter.inboundMapping?.fields.data === 'string'
          ? adapter.inboundMapping.fields.data
          : '$.data'
      );
    }
  }, [adapter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateAdapter.mutateAsync({
        siteId,
        data: {
          inboundEnabled: enabled,
          inboundMapping: {
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
                required
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
                required
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
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">e.g. $.payload or $.measurements</p>
            </div>
          </div>

          <InboundSamples />
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

      {showTemplateModal && (
        <SaveAsTemplateModal 
          siteId={siteId} 
          onClose={() => setShowTemplateModal(false)}
          onSuccess={onTemplateSaved}
        />
      )}
    </form>
  );
}
