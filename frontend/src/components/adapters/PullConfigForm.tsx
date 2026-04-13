import { useState, useEffect } from 'react';
import { Save, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { SiteAdapter, PullAuthType } from '@iotproxy/shared';
import { useUpdateAdapter } from '../../hooks/useAdapters';

interface Props {
  siteId: string;
  adapter?: SiteAdapter;
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

export function PullConfigForm({ siteId, adapter }: Props) {
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

  const [responseMode, setResponseMode] = useState<'single-site' | 'multi-site'>('single-site');
  const [readingsPath, setReadingsPath] = useState('$[*]');
  const [sensorIdPath, setSensorIdPath] = useState('$.sensorId');
  const [phenomenonTimePath, setPhenomenonTimePath] = useState('$.phenomenonTime');
  const [dataPath, setDataPath] = useState('$.data');

  const updateAdapter = useUpdateAdapter();

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
        setResponseMode(adapter.responseMapping.mode);
        setReadingsPath(adapter.responseMapping.readingsPath);
        setSensorIdPath(adapter.responseMapping.fields.sensorId);
        setPhenomenonTimePath(adapter.responseMapping.fields.phenomenonTime);
        setDataPath(
          typeof adapter.responseMapping.fields.data === 'string'
            ? adapter.responseMapping.fields.data
            : '$.data'
        );
      }
    }
  }, [adapter]);

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
          responseMapping: {
            mode: responseMode,
            siteId: responseMode === 'single-site' ? siteId : undefined,
            readingsPath,
            fields: {
              sensorId: sensorIdPath,
              phenomenonTime: phenomenonTimePath,
              data: dataPath,
            },
          },
        },
      });
      alert('Pull configuration saved');
    } catch (err) {
      alert('Failed to save: ' + (err as Error).message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-3">Response Mapping</h3>
            <div className="space-y-4">
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
                  required
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
                    required
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
                    required
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
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="flex justify-end">
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
  );
}
