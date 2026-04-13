import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSensor, useUpdateSensorStatus, useUpdateSensor, useSensorConfig, useSoftDeleteSensor, useHardDeleteSensor, useTransferSensor } from '../hooks/useSensors';
import { useSite, useSites } from '../hooks/useSites';
import { useReadings, useRawReadings, useDeleteReading, useClearAllReadings } from '../hooks/useReadings';
import { useAlertEvents } from '../hooks/useAlerts';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PageSpinner } from '../components/ui/Spinner';
import { SensorConfigForm } from '../components/SensorConfigForm';
import { api } from '../api/client';
import { formatDistanceToNow, subHours } from 'date-fns';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts';
import { format } from 'date-fns';

const STATUSES = ['ACTIVE', 'DISABLED', 'MAINTENANCE', 'CALIBRATING'];
const RANGES = [
  { label: '1h',  hours: 1 },
  { label: '6h',  hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d',  hours: 168 },
];

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function SensorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SYSTEM_ADMIN';

  const { data: sensor, isLoading } = useSensor(id!);
  const updateStatus = useUpdateSensorStatus();
  const updateSensor = useUpdateSensor();
  const softDelete = useSoftDeleteSensor();
  const hardDelete = useHardDeleteSensor();
  const deleteReading = useDeleteReading();
  const clearAllReadings = useClearAllReadings();
  const transferSensor = useTransferSensor();
  const { data: allSites } = useSites();
  const [editingExternalId, setEditingExternalId] = useState(false);
  const [externalIdDraft, setExternalIdDraft] = useState('');
  const [editingInfo, setEditingInfo] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [intervalDraft, setIntervalDraft] = useState('');
  const [maxRecordsDraft, setMaxRecordsDraft] = useState('');
  const { data: sensorConfig } = useSensorConfig(id);
  const { actualTheme } = useTheme();
  const [rangeHours, setRangeHours] = useState(24);
  const [bottomTab, setBottomTab] = useState<'readings' | 'alerts' | 'config' | 'virtual'>('readings');
  const [virtualOpen, setVirtualOpen] = useState(false);
  const [vName, setVName] = useState('');
  const [vFormula, setVFormula] = useState('');
  const [vUnit, setVUnit] = useState('');
  const [vSubmitting, setVSubmitting] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSiteId, setTransferSiteId] = useState('');
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);

  const { startTs, endTs, intervalMs } = useMemo(() => {
    const now = new Date();
    return {
      startTs:    subHours(now, rangeHours).toISOString(),
      endTs:      now.toISOString(),
      intervalMs: rangeHours <= 6 ? 300_000 : rangeHours <= 24 ? 3_600_000 : 86_400_000,
    };
  }, [rangeHours]);

  const { data: readings, isLoading: readingsLoading } = useReadings({
    sensorId: id!,
    startTs,
    endTs,
    agg: 'AVG',
    intervalMs,
  });
  const { data: site } = useSite(sensor?.siteId ?? '');
  const { data: events } = useAlertEvents(id);
  const { data: rawReadings, isLoading: rawLoading } = useRawReadings(id!, 24, 100);

  const isDark = actualTheme === 'dark';
  const chartTickColor  = isDark ? '#64748b' : '#94a3b8';
  const chartGridColor  = isDark ? '#1e293b' : '#f1f5f9';
  const tooltipBg       = isDark ? '#1e293b' : '#ffffff';
  const tooltipBorder   = isDark ? '#334155' : '#e2e8f0';

  if (isLoading) return <PageSpinner />;
  if (!sensor) return <p className="text-sm text-slate-500 dark:text-slate-400">Sensor not found.</p>;

  const chartData = (readings ?? []).map((r) => ({
    time: format(new Date(r.bucket), rangeHours <= 24 ? 'HH:mm' : 'MMM d'),
    avg: Number(r.avg_val?.toFixed(3)),
    min: Number(r.min_val?.toFixed(3)),
    max: Number(r.max_val?.toFixed(3)),
  }));

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500">
        <Link to="/sites" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Sites</Link>
        <ChevronRight />
        {site && <Link to={`/sites/${site.id}`} className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">{site.name}</Link>}
        <ChevronRight />
        <span className="text-slate-700 dark:text-slate-200 font-medium">{sensor.name}</span>
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
                  await updateSensor.mutateAsync({
                    id: id!,
                    name: nameDraft,
                    description: descDraft || undefined,
                    reportingIntervalSeconds: intervalDraft ? Number(intervalDraft) : undefined,
                    maxRecordsPerSensor: maxRecordsDraft ? Number(maxRecordsDraft) : null,
                  });
                  setEditingInfo(false);
                }}
              >
                <input
                  autoFocus
                  className="input text-lg font-bold py-1 w-full max-w-sm"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Sensor name"
                  required
                />
                <input
                  className="input text-sm py-1 w-full max-w-sm"
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  placeholder="Description (optional)"
                />
                <div className="flex items-center gap-2">
                  <input
                    className="input text-sm py-1 w-32"
                    type="number"
                    min="1"
                    value={intervalDraft}
                    onChange={(e) => setIntervalDraft(e.target.value)}
                    placeholder="Interval (s)"
                  />
                  <span className="text-xs text-slate-400 dark:text-slate-500">reporting interval (sec)</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="input text-sm py-1 w-32"
                    type="number"
                    min="1"
                    value={maxRecordsDraft}
                    onChange={(e) => setMaxRecordsDraft(e.target.value)}
                    placeholder="e.g. 10"
                  />
                  <span className="text-xs text-slate-400 dark:text-slate-500">max records (blank = no limit)</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={updateSensor.isPending} className="btn-primary py-1 text-xs">Save</button>
                  <button type="button" onClick={() => setEditingInfo(false)} className="btn-secondary py-1 text-xs">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="group flex items-start gap-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{sensor.name}</h2>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{sensor.description || <span className="italic">No description</span>}</p>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Badge value={sensor.status} />
                    <Badge value={sensor.connectivityStatus} />
                  </div>
                </div>
                <button
                  onClick={() => { setNameDraft(sensor.name); setDescDraft(sensor.description ?? ''); setIntervalDraft(String(sensor.reportingIntervalSeconds ?? '')); setMaxRecordsDraft(sensor.maxRecordsPerSensor != null ? String(sensor.maxRecordsPerSensor) : ''); setEditingInfo(true); }}
                  className="mt-1 text-xs text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  edit
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 dark:text-slate-500">Status:</span>
              <select
                value={sensor.status}
                onChange={(e) => updateStatus.mutate({ id: id!, status: e.target.value })}
                className="input py-1.5 text-xs"
              >
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <>
                  <button
                    onClick={() => { setTransferSiteId(''); setTransferOpen(true); }}
                    className="text-xs text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                  >
                    Move to site…
                  </button>
                  <span className="text-xs text-slate-300 dark:text-slate-600">|</span>
                </>
              )}
              <button
                onClick={async () => {
                  if (confirm('Soft delete this sensor? It can be restored later.')) {
                    await softDelete.mutateAsync(id!);
                    navigate('/sensors');
                  }
                }}
                disabled={softDelete.isPending}
                className="text-xs text-orange-600 dark:text-orange-400 hover:underline"
              >
                Soft Delete
              </button>
              <span className="text-xs text-slate-300 dark:text-slate-600">|</span>
              <button
                onClick={async () => {
                  const alphanumeric = sensor.name.replace(/[^a-zA-Z0-9]/g, '');
                  const confirmText = alphanumeric.slice(0, 5).toUpperCase();
                  if (confirmText.length === 0) {
                    alert('Cannot delete: sensor name must contain at least one alphanumeric character.');
                    return;
                  }
                  const userInput = prompt(
                    `To permanently delete "${sensor.name}", type these ${confirmText.length} characters in UPPERCASE: ${confirmText}`
                  );
                  if (userInput === confirmText) {
                    await hardDelete.mutateAsync(id!);
                    navigate('/sensors');
                  } else if (userInput !== null) {
                    alert('Confirmation text did not match. Deletion cancelled.');
                  }
                }}
                disabled={hardDelete.isPending}
                className="text-xs text-red-600 dark:text-red-400 hover:underline"
              >
                Hard Delete
              </button>
            </div>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Site', value: site ? <Link to={`/sites/${site.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{site.name}</Link> : '…' },
            { label: 'Last Reading', value: sensor.lastReadingAt ? formatDistanceToNow(new Date(sensor.lastReadingAt), { addSuffix: true }) : '—' },
            { label: 'Reporting Interval', value: sensor.reportingIntervalSeconds ? `${sensor.reportingIntervalSeconds}s` : '—' },
            { label: 'Record Limit', value: sensor.maxRecordsPerSensor != null ? `${sensor.maxRecordsPerSensor} records` : 'No limit' },
            { label: 'ID', value: <span className="font-mono text-xs">{sensor.id}</span> },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs text-slate-400 dark:text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{value}</dd>
            </div>
          ))}
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">External ID
              <span className="ml-1 text-slate-300 dark:text-slate-600">(used to map readings from external APIs)</span>
            </dt>
            <dd className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {editingExternalId ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await updateSensor.mutateAsync({ id: id!, externalId: externalIdDraft || undefined });
                    setEditingExternalId(false);
                  }}
                >
                  <input
                    autoFocus
                    className="input py-1 text-sm font-mono w-64"
                    value={externalIdDraft}
                    onChange={(e) => setExternalIdDraft(e.target.value)}
                    placeholder="e.g. 02709001001000000"
                  />
                  <button type="submit" disabled={updateSensor.isPending} className="btn-primary py-1 text-xs">Save</button>
                  <button type="button" onClick={() => setEditingExternalId(false)} className="btn-secondary py-1 text-xs">Cancel</button>
                </form>
              ) : (
                <button
                  className="flex items-center gap-2 group"
                  onClick={() => { setExternalIdDraft(sensor.externalId ?? ''); setEditingExternalId(true); }}
                >
                  <span className="font-mono">{sensor.externalId ?? <span className="text-slate-400 dark:text-slate-500 italic font-normal">not set</span>}</span>
                  <span className="text-xs text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">edit</span>
                </button>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Readings chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Readings</p>
          <div className="flex items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setRangeHours(r.hours)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  rangeHours === r.hours
                    ? 'bg-blue-600 dark:bg-blue-500 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {readingsLoading ? (
          <div className="flex items-center justify-center h-48">
            <PageSpinner />
          </div>
        ) : chartData.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">No readings in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="avgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: chartTickColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: chartTickColor }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: `1px solid ${tooltipBorder}`,
                  background: tooltipBg,
                  color: isDark ? '#e2e8f0' : '#1e293b',
                }}
              />
              <Area type="monotone" dataKey="avg" stroke="#3b82f6" fill="url(#avgGrad)" strokeWidth={2} dot={false} name="Avg" />
              <Area type="monotone" dataKey="max" stroke={chartTickColor} fill="none" strokeWidth={1} strokeDasharray="4 2" dot={false} name="Max" />
              <Area type="monotone" dataKey="min" stroke={chartTickColor} fill="none" strokeWidth={1} strokeDasharray="4 2" dot={false} name="Min" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bottom tabs */}
      <div className="card">
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-4 -mt-2">
          {(['readings', 'alerts', 'config', 'virtual'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setBottomTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                bottomTab === t
                  ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {t === 'virtual' ? 'Virtual Sensors' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {bottomTab === 'readings' && (() => {
          if (rawLoading) return <PageSpinner />;
          if (!rawReadings || rawReadings.length === 0) {
            return (
              <div>
                <div className="flex justify-end mb-4">
                  <button
                    onClick={async () => {
                      const alphanumeric = sensor.name.replace(/[^a-zA-Z0-9]/g, '');
                      const confirmText = alphanumeric.slice(0, 5).toUpperCase();
                      if (confirmText.length === 0) {
                        alert('Cannot clear: sensor name must contain at least one alphanumeric character.');
                        return;
                      }
                      const userInput = prompt(
                        `To clear ALL readings for "${sensor.name}", type these ${confirmText.length} characters in UPPERCASE: ${confirmText}`
                      );
                      if (userInput === confirmText) {
                        await clearAllReadings.mutateAsync(id!);
                      } else if (userInput !== null) {
                        alert('Confirmation text did not match. Clear all cancelled.');
                      }
                    }}
                    disabled={clearAllReadings.isPending}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Clear All Readings
                  </button>
                </div>
                <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No readings in the last 24 hours.</p>
              </div>
            );
          }
          // Collect all data field keys across all readings
          const fields = Array.from(
            new Set(rawReadings.flatMap((r) => Object.keys(r.processed_data)))
          );
          return (
            <div>
              <div className="flex justify-end mb-4">
                <button
                  onClick={async () => {
                    const alphanumeric = sensor.name.replace(/[^a-zA-Z0-9]/g, '');
                    const confirmText = alphanumeric.slice(0, 5).toUpperCase();
                    if (confirmText.length === 0) {
                      alert('Cannot clear: sensor name must contain at least one alphanumeric character.');
                      return;
                    }
                    const userInput = prompt(
                      `To clear ALL readings for "${sensor.name}", type these ${confirmText.length} characters in UPPERCASE: ${confirmText}`
                    );
                    if (userInput === confirmText) {
                      const result = await clearAllReadings.mutateAsync(id!);
                      alert(`Deleted ${result.deletedCount} readings`);
                    } else if (userInput !== null) {
                      alert('Confirmation text did not match. Clear all cancelled.');
                    }
                  }}
                  disabled={clearAllReadings.isPending}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline"
                >
                  Clear All Readings ({rawReadings.length}+ shown)
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="table-header">
                    <tr>
                      <th className="table-th whitespace-nowrap">Time</th>
                      {fields.map((f) => (
                        <th key={f} className="table-th whitespace-nowrap">{f}</th>
                      ))}
                      <th className="table-th">Quality</th>
                      <th className="table-th">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawReadings.map((r, i) => (
                      <tr key={i} className="table-row">
                        <td className="table-td whitespace-nowrap font-mono text-xs text-slate-500 dark:text-slate-400">
                          {format(new Date(r.phenomenon_time), 'MMM d, HH:mm:ss')}
                        </td>
                        {fields.map((f) => (
                          <td key={f} className="table-td font-mono text-xs">
                            {r.processed_data[f] != null ? String(r.processed_data[f]) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                          </td>
                        ))}
                        <td className="table-td">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            r.quality_code === 'GOOD' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                            r.quality_code === 'BAD'  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                          'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                        }`}>{r.quality_code}</span>
                        </td>
                        <td className="table-td">
                          <button
                            onClick={async () => {
                              if (confirm(`Delete reading from ${format(new Date(r.phenomenon_time), 'MMM d, HH:mm:ss')}?`)) {
                                await deleteReading.mutateAsync({ sensorId: id!, phenomenonTime: r.phenomenon_time });
                              }
                            }}
                            disabled={deleteReading.isPending}
                            className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {bottomTab === 'alerts' && (
          !events || events.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No alert events for this sensor.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {events.slice(0, 20).map((ev) => (
                <div key={ev.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Badge value={ev.severity} />
                    <Badge value={ev.state} />
                    <span className="text-xs text-slate-500 dark:text-slate-400">val={ev.value} / threshold={ev.threshold}</span>
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )
        )}

        {bottomTab === 'config' && (
          <SensorConfigForm
            key={sensorConfig ? 'loaded' : 'empty'}
            sensorId={id!}
            initial={sensorConfig ?? undefined}
          />
        )}

        {bottomTab === 'virtual' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Virtual sensors compute derived values from this sensor's readings using a mathjs formula.
              Use <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-slate-800 dark:text-slate-200">value</code> to refer to the current reading.
            </p>
            <button onClick={() => setVirtualOpen(true)} className="btn-primary flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Virtual Sensor
            </button>
          </div>
        )}
      </div>

      {/* Transfer sensor modal */}
      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Move Sensor to Another Site" width="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Reassign this sensor to a different site within the same organization. Historical readings stay attached to the sensor.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Target Site</label>
            <select
              className="input w-full"
              value={transferSiteId}
              onChange={(e) => setTransferSiteId(e.target.value)}
            >
              <option value="">Select site…</option>
              {allSites?.filter((s) => s.id !== sensor?.siteId).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setTransferOpen(false)} className="btn-secondary">Cancel</button>
            <button
              type="button"
              disabled={!transferSiteId}
              onClick={() => { setTransferOpen(false); setTransferConfirmOpen(true); }}
              className="btn-primary bg-indigo-600 hover:bg-indigo-700"
            >
              Review Move
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={transferConfirmOpen}
        onClose={() => setTransferConfirmOpen(false)}
        onConfirm={async () => {
          await transferSensor.mutateAsync({ id: id!, newSiteId: transferSiteId });
          setTransferConfirmOpen(false);
          navigate(`/sites/${transferSiteId}`);
        }}
        title="Confirm Sensor Move"
        description={`Move "${sensor?.name}" to "${allSites?.find((s) => s.id === transferSiteId)?.name ?? transferSiteId}"? The sensor will appear under the new site immediately.`}
        confirmLabel="Move Sensor"
        loading={transferSensor.isPending}
      />

      {/* Virtual sensor creation modal */}
      <Modal open={virtualOpen} onClose={() => setVirtualOpen(false)} title="Create Virtual Sensor">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setVSubmitting(true);
            try {
              await api.post('/sensors/virtual', {
                siteId: sensor?.siteId,
                sourceSensorId: id,
                name: vName,
                formula: vFormula,
                unit: vUnit || undefined,
              });
              setVirtualOpen(false);
              setVName(''); setVFormula(''); setVUnit('');
            } finally {
              setVSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input className="input" value={vName} onChange={(e) => setVName(e.target.value)} required placeholder="Temperature (Fahrenheit)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Formula <span className="text-red-500">*</span></label>
            <input className="input font-mono" value={vFormula} onChange={(e) => setVFormula(e.target.value)} required placeholder="value * 9/5 + 32" />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              mathjs expression — use{' '}
              <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-slate-800 dark:text-slate-200">value</code>
              {' '}for the source reading
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Unit</label>
            <input className="input" value={vUnit} onChange={(e) => setVUnit(e.target.value)} placeholder="°F" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setVirtualOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={vSubmitting} className="btn-primary">
              {vSubmitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
