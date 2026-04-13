import { useState, useEffect } from 'react';
import { Save, HelpCircle, BookTemplate } from 'lucide-react';
import { SiteAdapter } from '@iotproxy/shared';
import { useUpdateAdapter } from '../../hooks/useAdapters';
import { SaveAsTemplateModal } from './SaveAsTemplateModal';

interface Props {
  siteId: string;
  adapter?: SiteAdapter;
}

export function InboundConfigForm({ siteId, adapter }: Props) {
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

          <div className="bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-800 rounded p-3 text-xs text-gray-700 dark:text-slate-300">
            <strong className="dark:text-slate-200">Example payload:</strong>
            <pre className="mt-2 bg-white dark:bg-slate-950 p-2 rounded border border-gray-300 dark:border-slate-800 overflow-x-auto text-slate-800 dark:text-slate-200">
{`{
  "device_id": "sensor-123",
  "ts": "2026-04-09T08:00:00Z",
  "payload": { "temperature": 22.5, "humidity": 60 }
}`}
            </pre>
            <div className="mt-2 text-gray-600 dark:text-slate-400">
              Paths: <code className="bg-white dark:bg-slate-800 px-1 rounded border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200">$.device_id</code>, <code className="bg-white dark:bg-slate-800 px-1 rounded border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200">$.ts</code>, <code className="bg-white dark:bg-slate-800 px-1 rounded border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200">$.payload</code>
            </div>
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
          {updateAdapter.isPending ? 'Saving...' : 'Save Inbound Config'}
        </button>
      </div>

      {showTemplateModal && (
        <SaveAsTemplateModal siteId={siteId} onClose={() => setShowTemplateModal(false)} />
      )}
    </form>
  );
}
