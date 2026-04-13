import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSensors, useUpdateSensorStatus, useSoftDeleteSensor, useHardDeleteSensor } from '../hooks/useSensors';
import { useSites } from '../hooks/useSites';
import { Badge } from '../components/ui/Badge';
import { PageSpinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { formatDistanceToNow } from 'date-fns';

const SENSOR_STATUSES = ['ACTIVE', 'DISABLED', 'MAINTENANCE', 'CALIBRATING'];

export default function SensorsPage() {
  const [siteFilter, setSiteFilter] = useState('');
  const { data: sensors, isLoading } = useSensors(siteFilter || undefined);
  const { data: sites } = useSites();
  const updateStatus = useUpdateSensorStatus();
  const softDelete = useSoftDeleteSensor();
  const hardDelete = useHardDeleteSensor();
  const [changingId, setChangingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pg = usePagination(sensors);

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500">{pg.total} sensor{pg.total !== 1 ? 's' : ''}</p>
          <select
            value={siteFilter}
            onChange={(e) => { setSiteFilter(e.target.value); pg.goTo(1); }}
            className="input py-1.5 text-xs w-48"
          >
            <option value="">All sites</option>
            {sites?.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <Link to="/sites" className="text-xs text-blue-600 hover:underline">
          Add sensors via a site →
        </Link>
      </div>

      {sensors?.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No sensors found"
            description="Add sensors from a site's detail page."
          />
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">Site</th>
                <th className="table-th">Status</th>
                <th className="table-th">Connectivity</th>
                <th className="table-th">Last Reading</th>
                <th className="table-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((sensor) => {
                const siteName = sites?.find((s) => s.id === sensor.siteId)?.name ?? sensor.siteId.slice(0, 8);
                return (
                  <tr key={sensor.id} className="table-row">
                    <td className="table-td">
                      <Link to={`/sensors/${sensor.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400">
                        {sensor.name}
                      </Link>
                      {sensor.description && <p className="text-xs text-slate-400 mt-0.5">{sensor.description}</p>}
                    </td>
                    <td className="table-td">
                      <Link to={`/sites/${sensor.siteId}`} className="text-xs text-blue-600 hover:underline">{siteName}</Link>
                    </td>
                    <td className="table-td"><Badge value={sensor.status} /></td>
                    <td className="table-td"><Badge value={sensor.connectivityStatus} /></td>
                    <td className="table-td text-slate-400">
                      {sensor.lastReadingAt
                        ? formatDistanceToNow(new Date(sensor.lastReadingAt), { addSuffix: true })
                        : '—'}
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        {changingId === sensor.id ? (
                          <select
                            autoFocus
                            defaultValue={sensor.status}
                            onBlur={() => setChangingId(null)}
                            onChange={async (e) => {
                              await updateStatus.mutateAsync({ id: sensor.id, status: e.target.value });
                              setChangingId(null);
                            }}
                            className="input py-1 text-xs"
                          >
                            {SENSOR_STATUSES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        ) : (
                          <button
                            onClick={() => setChangingId(sensor.id)}
                            className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:underline"
                          >
                            Change
                          </button>
                        )}
                        {deletingId === sensor.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={async () => {
                                await softDelete.mutateAsync(sensor.id);
                                setDeletingId(null);
                              }}
                              className="text-xs text-orange-600 dark:text-orange-400 hover:underline"
                              disabled={softDelete.isPending}
                            >
                              Soft
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
                                  await hardDelete.mutateAsync(sensor.id);
                                  setDeletingId(null);
                                } else if (userInput !== null) {
                                  alert('Confirmation text did not match. Deletion cancelled.');
                                }
                              }}
                              className="text-xs text-red-600 dark:text-red-400 hover:underline"
                              disabled={hardDelete.isPending}
                            >
                              Hard
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:underline ml-1"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingId(sensor.id)}
                            className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline"
                          >
                            Delete
                          </button>
                        )}
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
    </div>
  );
}
