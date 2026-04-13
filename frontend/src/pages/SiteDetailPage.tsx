import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSite, useTransitionSite, useUpdateSite } from '../hooks/useSites';
import { useSensors, useCreateSensor } from '../hooks/useSensors';
import { useSiteLatest } from '../hooks/useReadings';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { PageSpinner } from '../components/ui/Spinner';
import { Tooltip } from '../components/ui/Tooltip';
import { DiscoveryPanel } from '../components/DiscoveryPanel';
import { LiveReadingsFeed } from '../components/LiveReadingsFeed';
import { formatDistanceToNow } from 'date-fns';

const COMMISSIONING_TRANSITIONS: Record<string, string[]> = {
  DISCOVERY:  ['REVIEW'],
  REVIEW:     ['ACTIVE', 'DISCOVERY'],
  ACTIVE:     ['SUSPENDED'],
  SUSPENDED:  ['ACTIVE'],
};

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: site, isLoading: siteLoading } = useSite(id!);
  const { data: sensors, isLoading: sensorsLoading } = useSensors(id);
  const { data: latestReadings } = useSiteLatest(id!);
  const transition = useTransitionSite();
  const updateSite = useUpdateSite();
  const createSensor = useCreateSensor();

  const [createOpen, setCreateOpen] = useState(false);
  const [sensorName, setSensorName] = useState('');
  const [sensorDesc, setSensorDesc] = useState('');
  const [interval, setInterval] = useState('');
  const [editingInfo, setEditingInfo] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');

  if (siteLoading) return <PageSpinner />;
  if (!site) return <p className="text-sm text-slate-500 dark:text-slate-400">Site not found.</p>;

  const nextStatuses = COMMISSIONING_TRANSITIONS[site.commissioningStatus] ?? [];

  const handleCreateSensor = async (e: React.FormEvent) => {
    e.preventDefault();
    await createSensor.mutateAsync({
      siteId: id!,
      name: sensorName,
      description: sensorDesc || undefined,
      reportingIntervalSeconds: interval ? Number(interval) : undefined,
    });
    setCreateOpen(false);
    setSensorName('');
    setSensorDesc('');
    setInterval('');
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500">
        <Link to="/sites" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Sites</Link>
        <ChevronRight />
        <span className="text-slate-700 dark:text-slate-200 font-medium">{site.name}</span>
      </nav>

      {/* Header */}
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editingInfo ? (
              <form
                className="space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await updateSite.mutateAsync({ id: id!, name: nameDraft, description: descDraft || undefined });
                  setEditingInfo(false);
                }}
              >
                <input
                  autoFocus
                  className="input text-lg font-bold py-1 w-full max-w-sm"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Site name"
                  required
                />
                <input
                  className="input text-sm py-1 w-full max-w-sm"
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  placeholder="Description (optional)"
                />
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={updateSite.isPending} className="btn-primary py-1 text-xs">Save</button>
                  <button type="button" onClick={() => setEditingInfo(false)} className="btn-secondary py-1 text-xs">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="group flex items-start gap-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{site.name}</h2>
                  {site.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{site.description}</p>}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Badge value={site.commissioningStatus} />
                    <Badge value={site.connectivityStatus} />
                    {site.lastSeenAt && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        Last seen {formatDistanceToNow(new Date(site.lastSeenAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setNameDraft(site.name); setDescDraft(site.description ?? ''); setEditingInfo(true); }}
                  className="mt-1 text-xs text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  edit
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-3">
            {site.commissioningStatus === 'DISCOVERY' && (
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={site.discoveryEnabled}
                  onChange={(e) => updateSite.mutate({ id: id!, discoveryEnabled: e.target.checked })}
                  className="rounded border-slate-300 dark:border-slate-600 text-blue-600"
                />
                <div className="text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white">Keep discovery active</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Override time window expiration</p>
                </div>
              </label>
            )}

            {nextStatuses.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 dark:text-slate-500">Transition to:</span>
                {nextStatuses.map((s) => (
                  <button
                    key={s}
                    onClick={() => transition.mutate({ id: id!, status: s })}
                    disabled={transition.isPending}
                    className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Created', value: formatDistanceToNow(new Date(site.createdAt), { addSuffix: true }), tooltip: null },
            {
              label: 'Data Sources',
              value: sensors?.length ?? '…',
              tooltip: 'Sensors, metrics, events, or any data streams tracked by this site'
            },
            {
              label: 'Discovery window ends',
              value: site.discoveryWindowEndsAt ? new Date(site.discoveryWindowEndsAt).toLocaleDateString() : '—',
              tooltip: 'Auto-discovery helps identify new data fields and their patterns'
            },
            { label: 'ID', value: <span className="font-mono text-xs">{site.id}</span>, tooltip: null },
          ].map(({ label, value, tooltip }) => (
            <div key={label}>
              <dt className="text-xs text-slate-400 dark:text-slate-500">
                {tooltip ? (
                  <Tooltip content={tooltip}>
                    <span className="border-b border-dotted border-slate-300 dark:border-slate-600">{label}</span>
                  </Tooltip>
                ) : label}
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Data Sources */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            <Tooltip content="Sensors, business metrics, system events, or any time-series data">
              <span className="border-b border-dotted border-slate-300 dark:border-slate-600">Data Sources</span>
            </Tooltip>
          </h3>
          <button onClick={() => setCreateOpen(true)} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Data Source
          </button>
        </div>

        {sensorsLoading ? (
          <PageSpinner />
        ) : sensors?.length === 0 ? (
          <div className="card">
            <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No data sources configured yet.</p>
          </div>
        ) : (
          <div className="card-flush">
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="table-th">Name</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Connectivity</th>
                  <th className="table-th">Last Reading</th>
                  <th className="table-th">Latest Values</th>
                  <th className="table-th">Interval</th>
                </tr>
              </thead>
              <tbody>
                {sensors?.map((sensor) => {
                  const latest = latestReadings?.[sensor.id] as { processed_data?: Record<string, unknown> } | undefined;
                  const dataEntries = latest?.processed_data ? Object.entries(latest.processed_data).slice(0, 4) : [];
                  return (
                  <tr key={sensor.id} className="table-row">
                    <td className="table-td">
                      <Link to={`/sensors/${sensor.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400">
                        {sensor.name}
                      </Link>
                      {sensor.description && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sensor.description}</p>}
                    </td>
                    <td className="table-td"><Badge value={sensor.status} /></td>
                    <td className="table-td"><Badge value={sensor.connectivityStatus} /></td>
                    <td className="table-td text-slate-400 dark:text-slate-500">
                      {sensor.lastReadingAt
                        ? formatDistanceToNow(new Date(sensor.lastReadingAt), { addSuffix: true })
                        : '—'}
                    </td>
                    <td className="table-td">
                      {dataEntries.length > 0 ? (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {dataEntries.map(([k, v]) => (
                            <span key={k} className="text-xs text-slate-600 dark:text-slate-300 font-mono whitespace-nowrap">
                              <span className="text-slate-400 dark:text-slate-500">{k}:</span> {String(v)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="table-td text-slate-400 dark:text-slate-500">
                      {sensor.reportingIntervalSeconds ? `${sensor.reportingIntervalSeconds}s` : '—'}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Discovery panel */}
      {site.commissioningStatus === 'REVIEW' && (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">
            Discovery Review
            <span className="ml-2 rounded-full bg-yellow-100 dark:bg-yellow-900/40 px-2 py-0.5 text-xs text-yellow-700 dark:text-yellow-400">Action required</span>
          </h3>
          <DiscoveryPanel siteId={id!} />
        </div>
      )}

      {/* Live readings feed */}
      {(site.commissioningStatus === 'ACTIVE' || site.commissioningStatus === 'DISCOVERY') && (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Live Feed</h3>
          <LiveReadingsFeed siteId={id!} />
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Data Source">
        <form onSubmit={handleCreateSensor} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input className="input" value={sensorName} onChange={(e) => setSensorName(e.target.value)} required placeholder="e.g., Temperature Sensor, Daily Sales, API Requests" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Description</label>
            <input className="input" value={sensorDesc} onChange={(e) => setSensorDesc(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Reporting Interval (seconds)</label>
            <input className="input" type="number" min="1" value={interval} onChange={(e) => setInterval(e.target.value)} placeholder="60" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createSensor.isPending} className="btn-primary">
              {createSensor.isPending ? 'Adding…' : 'Add Data Source'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
