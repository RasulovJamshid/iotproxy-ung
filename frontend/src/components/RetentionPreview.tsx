import React from 'react';
import { AlertTriangle, Clock, Database, Trash2 } from 'lucide-react';
import { useRetentionPreview } from '../hooks/useRetention';
import { useSensors } from '../hooks/useSensors';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  organizationId: string;
}

export function RetentionPreview({ organizationId }: Props) {
  const { data: preview, isLoading } = useRetentionPreview(organizationId);
  const { data: allSensors } = useSensors();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Clock className="w-4 h-4 animate-spin" />
          Loading retention preview...
        </div>
      </div>
    );
  }

  if (!preview || preview.summary.totalReadingsToDelete === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Database className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              No data scheduled for deletion
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              All sensor data is within retention periods
            </p>
          </div>
        </div>
      </div>
    );
  }

  const sensorMap = new Map((allSensors?.data ?? []).map((s) => [s.id, s]));

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-6">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Data Retention Preview
            </h3>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              The following data will be deleted during the next nightly retention job (02:00 UTC)
            </p>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-xs text-amber-600 dark:text-amber-400">Affected Sensors</p>
                <p className="text-2xl font-bold text-amber-900 dark:text-amber-100 mt-1">
                  {preview.summary.totalSensors}
                </p>
              </div>
              <div>
                <p className="text-xs text-amber-600 dark:text-amber-400">Readings to Delete</p>
                <p className="text-2xl font-bold text-amber-900 dark:text-amber-100 mt-1">
                  {preview.summary.totalReadingsToDelete.toLocaleString()}
                </p>
              </div>
            </div>
            {preview.summary.defaultRawRetentionDays !== undefined && (
              <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-medium">Default retention:</span>{' '}
                  {preview.summary.defaultRawRetentionDays === 0
                    ? 'Unlimited (0 = keep forever)'
                    : `${preview.summary.defaultRawRetentionDays} days`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Per-Sensor Details */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Affected Sensors
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">
                  Sensor
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">
                  Cutoff Date
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-600 dark:text-slate-400">
                  Readings to Delete
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {preview.sensors.map((item) => {
                const sensor = sensorMap.get(item.sensorId);
                const cutoffDate = new Date(item.cutoffDate);
                return (
                  <tr key={item.sensorId} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Trash2 className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {sensor?.name ?? item.sensorId}
                          </p>
                          {sensor?.externalId && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {sensor.externalId}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm text-slate-900 dark:text-slate-100">
                          {cutoffDate.toLocaleDateString()}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatDistanceToNow(cutoffDate, { addSuffix: true })}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-medium text-red-600 dark:text-red-400">
                        {item.readingsToDelete.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
