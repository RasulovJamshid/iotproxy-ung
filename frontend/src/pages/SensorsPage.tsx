import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSensors, useUpdateSensorStatus, useSoftDeleteSensor, useHardDeleteSensor } from '../hooks/useSensors';
import { useSites } from '../hooks/useSites';
import { Badge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PageSpinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { formatDistanceToNow } from 'date-fns';
import { useSensorTypes } from '../hooks/useSensorTypes';
import { useSensorCategories } from '../hooks/useSensorCategories';

const SENSOR_STATUSES = ['ACTIVE', 'DISABLED', 'MAINTENANCE', 'CALIBRATING'];

// ── Icons ──────────────────────────────────────────────────────────────────────
const Icon = ({ d, className = 'w-4 h-4' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Icons = {
  Search:  () => <Icon d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />,
  Close:   () => <Icon d="M6 18L18 6M6 6l12 12" />,
  Sensor:  () => <Icon d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />,
  Trash:   () => <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-3.5 h-3.5" />,
  TrashHard: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-red-500">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  Edit:    () => <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />,
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

export default function SensorsPage() {
  const { data: sensorsResponse, isLoading } = useSensors();
  const sensors = sensorsResponse?.data ?? [];
  const { data: sitesResponse } = useSites();
  const sites = sitesResponse?.data ?? [];
  const { data: sensorTypes } = useSensorTypes();
  const { data: sensorCategories } = useSensorCategories();
  const updateStatus = useUpdateSensorStatus();
  const softDelete = useSoftDeleteSensor();
  const hardDelete = useHardDeleteSensor();

  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeIdFilter, setTypeIdFilter] = useState('');
  const [categoryIdFilter, setCategoryIdFilter] = useState('');
  
  const [changingId, setChangingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hardDeletingId, setHardDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sensors.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !s.description?.toLowerCase().includes(q) && !s.id.toLowerCase().includes(q)) return false;
      if (siteFilter && s.siteId !== siteFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (typeIdFilter && s.typeId !== typeIdFilter) return false;
      if (categoryIdFilter && s.categoryId !== categoryIdFilter) return false;
      return true;
    });
  }, [sensors, search, siteFilter, statusFilter, typeIdFilter, categoryIdFilter]);

  const pg = usePagination(filtered);
  const hasFilters = search !== '' || siteFilter !== '' || statusFilter !== '' || typeIdFilter !== '' || categoryIdFilter !== '';

  useEffect(() => { pg.goTo(1); }, [search, siteFilter, statusFilter, typeIdFilter, categoryIdFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = sensors.filter(s => s.status === 'ACTIVE').length;
  const onlineCount = sensors.filter(s => s.connectivityStatus === 'ONLINE').length;

  const targetHardDeleteSensor = sensors.find(s => s.id === hardDeletingId);
  const hardDeleteConfirmText = targetHardDeleteSensor 
    ? (targetHardDeleteSensor.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase() || 'DELETE')
    : undefined;

  const handleSoftDelete = async () => {
    if (deletingId) {
      await softDelete.mutateAsync(deletingId);
      setDeletingId(null);
    }
  };

  const handleHardDelete = async () => {
    if (hardDeletingId) {
      await hardDelete.mutateAsync(hardDeletingId);
      setHardDeletingId(null);
    }
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Sensors" value={sensors.length} accent />
        <StatCard label="Active" value={activeCount} sub={`${sensors.length > 0 ? Math.round((activeCount / sensors.length) * 100) : 0}% of total`} />
        <StatCard label="Online" value={onlineCount} sub={`${sensors.length > 0 ? Math.round((onlineCount / sensors.length) * 100) : 0}% of total`} />
        <StatCard label="Offline" value={sensors.length - onlineCount} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-grow sm:flex-grow-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icons.Search /></span>
            <input
              className="input pl-9 w-full sm:w-56"
              placeholder="Search sensors…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <Icons.Close />
              </button>
            )}
          </div>
          {/* Site Filter */}
          <select
            className="input w-44 text-sm py-1.5"
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
          >
            <option value="">All sites</option>
            {sites?.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {/* Status Filter */}
          <select
            className="input w-36 text-sm py-1.5"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Status: All</option>
            {SENSOR_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {/* Type Filter */}
          <select
            className="input w-40 text-sm py-1.5"
            value={typeIdFilter}
            onChange={(e) => setTypeIdFilter(e.target.value)}
          >
            <option value="">Type: All</option>
            {sensorTypes?.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {/* Category Filter */}
          <select
            className="input w-44 text-sm py-1.5"
            value={categoryIdFilter}
            onChange={(e) => setCategoryIdFilter(e.target.value)}
          >
            <option value="">Category: All</option>
            {sensorCategories?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setSiteFilter(''); setStatusFilter(''); setTypeIdFilter(''); setCategoryIdFilter(''); }}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>
        <Link to="/sites" className="text-xs text-blue-600 hover:underline dark:text-blue-400 whitespace-nowrap">
          Add sensors via a site →
        </Link>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title={hasFilters ? 'No matching sensors' : 'No sensors yet'}
            description={hasFilters ? 'Try adjusting your search or filters.' : 'Add sensors from a site\'s detail page.'}
          />
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">Sensor</th>
                <th className="table-th">Site</th>
                <th className="table-th">Type</th>
                <th className="table-th">Category</th>
                <th className="table-th">Status</th>
                <th className="table-th">Connectivity</th>
                <th className="table-th">Last Reading</th>
                <th className="table-th w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((sensor) => {
                const siteName = sites?.find((s) => s.id === sensor.siteId)?.name ?? sensor.siteId.slice(0, 8);
                return (
                  <tr key={sensor.id} className="table-row group">
                    <td className="table-td">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/20 text-emerald-600 dark:text-emerald-400 shadow-sm border border-emerald-200/50 dark:border-emerald-800/50">
                          <Icons.Sensor />
                        </span>
                        <div>
                          <Link to={`/sensors/${sensor.id}`} className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 leading-tight block">
                            {sensor.name}
                          </Link>
                          {sensor.description && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xs">{sensor.description}</p>
                          )}
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5 leading-none">{sensor.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-td">
                      <Link to={`/sites/${sensor.siteId}`} className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                        {siteName}
                      </Link>
                    </td>
                    <td className="table-td">
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {sensor.type?.name ?? '—'}
                      </span>
                    </td>
                    <td className="table-td">
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {sensor.category?.name ?? '—'}
                      </span>
                    </td>
                    <td className="table-td">
                      {changingId === sensor.id ? (
                        <select
                          autoFocus
                          defaultValue={sensor.status}
                          onBlur={() => setChangingId(null)}
                          onChange={async (e) => {
                            await updateStatus.mutateAsync({ id: sensor.id, status: e.target.value });
                            setChangingId(null);
                          }}
                          className="input py-0.5 px-2 text-[11px] min-h-0 bg-white dark:bg-slate-800 border-indigo-300 dark:border-indigo-700 focus:ring-1 focus:ring-indigo-500"
                        >
                          {SENSOR_STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        <Badge value={sensor.status} />
                      )}
                    </td>
                    <td className="table-td"><Badge value={sensor.connectivityStatus} /></td>
                    <td className="table-td text-slate-400 text-sm">
                      {sensor.lastReadingAt
                        ? formatDistanceToNow(new Date(sensor.lastReadingAt), { addSuffix: true })
                        : '—'}
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setChangingId(sensor.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Change status"
                        >
                          <Icons.Edit />
                        </button>
                        <button
                          onClick={() => setDeletingId(sensor.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Soft delete sensor"
                        >
                          <Icons.Trash />
                        </button>
                        <button
                          onClick={() => setHardDeletingId(sensor.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Hard delete sensor (permanent)"
                        >
                          <Icons.TrashHard />
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

      {/* Soft Delete Confirm */}
      <ConfirmDialog
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleSoftDelete}
        title="Delete Sensor"
        description="Are you sure you want to soft delete this sensor? Data is preserved but ingestion stops."
        confirmLabel="Soft Delete"
        danger
        loading={softDelete.isPending}
      />

      {/* Hard Delete Confirm */}
      <ConfirmDialog
        open={!!hardDeletingId}
        onClose={() => setHardDeletingId(null)}
        onConfirm={handleHardDelete}
        title="Permanently Delete Sensor"
        description="WARNING: This action is irreversible. All sensor data and historical readings will be permanently deleted."
        confirmLabel="Hard Delete"
        confirmText={hardDeleteConfirmText}
        danger
        loading={hardDelete.isPending}
      />
    </div>
  );
}
