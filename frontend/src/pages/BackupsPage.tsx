import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, Download, Trash2, RefreshCw, AlertTriangle, CheckCircle2, Clock, HardDrive, ShieldCheck, Play, Eye } from 'lucide-react';
import { useBackups, useCreateBackup, useDeleteBackup, useRestoreBackup, useDownloadBackup } from '../hooks/useBackups';
import { useRetentionPreview, useRunRetention, RetentionRunResult } from '../hooks/useRetention';
import { useAuth } from '../contexts/AuthContext';
import { PageSpinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { formatDistanceToNow } from 'date-fns';

export default function BackupsPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const { data: backups, isLoading } = useBackups(orgId!);
  const createBackup = useCreateBackup();
  const deleteBackup = useDeleteBackup();
  const restoreBackup = useRestoreBackup();
  const downloadBackup = useDownloadBackup();

  const [createOpen, setCreateOpen] = useState(false);
  const [backupType, setBackupType] = useState<'FULL' | 'INCREMENTAL'>('FULL');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);

  // Retention state
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [retentionConfirmOpen, setRetentionConfirmOpen] = useState(false);
  const [lastRunResult, setLastRunResult] = useState<RetentionRunResult | null>(null);
  const { data: retentionPreview, isFetching: previewFetching } = useRetentionPreview(orgId!, previewEnabled);
  const runRetention = useRunRetention();

  const isSysAdmin = user?.role === 'SYSTEM_ADMIN';
  const isAdmin = user?.role === 'ADMIN' || isSysAdmin;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    await createBackup.mutateAsync({ orgId, backupType });
    setCreateOpen(false);
  };

  const handleDelete = async () => {
    if (!orgId || !deleteId) return;
    await deleteBackup.mutateAsync({ orgId, id: deleteId });
    setDeleteId(null);
  };

  const handleRestore = async () => {
    if (!orgId || !restoreId) return;
    await restoreBackup.mutateAsync({ orgId, id: restoreId });
    setRestoreId(null);
  };

  const handleDownload = async (backupId: string) => {
    if (!orgId) return;
    await downloadBackup.mutateAsync({ orgId, id: backupId });
  };

  const handleRunRetention = async () => {
    if (!orgId) return;
    const result = await runRetention.mutateAsync({ orgId });
    setLastRunResult(result);
    setRetentionConfirmOpen(false);
  };

  if (isLoading) return <PageSpinner />;

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
      IN_PROGRESS: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      COMPLETED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.PENDING}`}>
        {status === 'IN_PROGRESS' && <Clock className="w-3 h-3 animate-spin" />}
        {status === 'COMPLETED' && <CheckCircle2 className="w-3 h-3" />}
        {status === 'FAILED' && <AlertTriangle className="w-3 h-3" />}
        {status}
      </span>
    );
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '—';
    const mb = bytes / 1024 / 1024;
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Database Backups</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Create and manage database backups for disaster recovery
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
            <Database className="w-4 h-4" /> Create Backup
          </button>
        )}
      </div>

      {/* Warning Banner */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Important</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              Backups are stored in MinIO/S3. Restoring a backup will <strong>overwrite all current data</strong>. Only SYSTEM_ADMIN users can restore backups.
            </p>
          </div>
        </div>
      </div>

      {/* Backups List */}
      <div className="card-flush">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Backup History</h3>
        </div>
        {!backups || backups.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <HardDrive className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No backups yet</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Create your first backup to protect your data
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="table-th">Type</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Size</th>
                  <th className="table-th">Created</th>
                  <th className="table-th">Duration</th>
                  <th className="table-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => {
                  const duration = backup.startedAt && backup.completedAt
                    ? Math.round((new Date(backup.completedAt).getTime() - new Date(backup.startedAt).getTime()) / 1000)
                    : null;
                  return (
                    <tr key={backup.id} className="table-row">
                      <td className="table-td">
                        <Badge value={backup.backupType} label={backup.backupType} />
                      </td>
                      <td className="table-td">{getStatusBadge(backup.status)}</td>
                      <td className="table-td font-mono text-xs">{formatBytes(backup.fileSizeBytes)}</td>
                      <td className="table-td">
                        <div>
                          <p className="text-sm text-slate-900 dark:text-slate-100">
                            {new Date(backup.createdAt).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDistanceToNow(new Date(backup.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </td>
                      <td className="table-td text-sm text-slate-600 dark:text-slate-400">
                        {duration ? `${duration}s` : '—'}
                      </td>
                      <td className="table-td text-right">
                        <div className="flex items-center justify-end gap-2">
                          {backup.status === 'COMPLETED' && (
                            <button
                              onClick={() => handleDownload(backup.id)}
                              className="btn-secondary text-xs py-1 px-2 flex items-center gap-1"
                              title="Download backup"
                              disabled={downloadBackup.isPending}
                            >
                              <Download className="w-3 h-3" /> Download
                            </button>
                          )}
                          {backup.status === 'COMPLETED' && isSysAdmin && (
                            <button
                              onClick={() => setRestoreId(backup.id)}
                              className="btn-secondary text-xs py-1 px-2 flex items-center gap-1"
                              title="Restore backup"
                            >
                              <RefreshCw className="w-3 h-3" /> Restore
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => setDeleteId(backup.id)}
                              className="btn-secondary text-xs py-1 px-2 flex items-center gap-1 text-red-600 hover:text-red-700"
                              title="Delete backup"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Data Retention Section */}
      <div className="card-flush">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Data Retention</h3>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewEnabled(true)}
                disabled={previewFetching}
                className="btn-secondary text-xs py-1 px-3 flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                {previewFetching ? 'Loading…' : 'Preview'}
              </button>
              <button
                onClick={() => setRetentionConfirmOpen(true)}
                className="btn-primary text-xs py-1 px-3 flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" /> Run Now
              </button>
            </div>
          )}
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Retention runs automatically at 02:00 UTC each night. Use "Run Now" to trigger an immediate enforcement for this organization.
          </p>

          {/* Last run result */}
          {lastRunResult && (
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">Retention completed</p>
                  <div className="flex flex-wrap gap-4 text-xs text-green-700 dark:text-green-300">
                    <span>Sensors processed: <strong>{lastRunResult.sensorsProcessed}</strong></span>
                    <span>Summaries created: <strong>{lastRunResult.summariesCreated}</strong></span>
                    <span>Raw readings deleted: <strong>{lastRunResult.rawReadingsDeleted.toLocaleString()}</strong></span>
                    <span>Summaries purged: <strong>{lastRunResult.summariesPurged.toLocaleString()}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preview results */}
          {retentionPreview && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Sensors affected</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {retentionPreview.summary.totalSensors}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Raw readings to delete</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {retentionPreview.summary.totalReadingsToDelete.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Raw retention</p>
                  <p className={`text-lg font-semibold mt-0.5 ${retentionPreview.summary.defaultRawRetentionDays ? 'text-slate-900 dark:text-slate-100' : 'text-amber-600 dark:text-amber-400'}`}>
                    {retentionPreview.summary.defaultRawRetentionDays
                      ? `${retentionPreview.summary.defaultRawRetentionDays}d`
                      : 'Not set'}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Summary retention</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {retentionPreview.summary.defaultSummaryRetentionMonths
                      ? `${retentionPreview.summary.defaultSummaryRetentionMonths}mo`
                      : '—'}
                  </p>
                </div>
              </div>

              {retentionPreview.sensors.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-xs">
                    <thead className="table-header">
                      <tr>
                        <th className="table-th">Sensor ID</th>
                        <th className="table-th">Cutoff Date</th>
                        <th className="table-th text-right">Readings to Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retentionPreview.sensors.map((s) => (
                        <tr key={s.sensorId} className="table-row">
                          <td className="table-td font-mono text-slate-600 dark:text-slate-400">{s.sensorId}</td>
                          <td className="table-td">{new Date(s.cutoffDate).toLocaleDateString()}</td>
                          <td className="table-td text-right font-medium">{s.readingsToDelete.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {retentionPreview.sensors.length === 0 && (
                retentionPreview.summary.defaultRawRetentionDays == null ? (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      No raw retention policy is configured for this organization. Set{' '}
                      <strong>Raw Retention Days</strong> in{' '}
                      <Link to="/settings" className="underline hover:no-underline">Settings</Link>{' '}
                      to enable automatic data cleanup.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                    No sensors have data older than the {retentionPreview.summary.defaultRawRetentionDays}-day retention limit — nothing to delete.
                  </p>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Backup Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Backup" width="max-w-md">
        <form onSubmit={handleCreate} className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Create a database backup. This process runs asynchronously and may take several minutes depending on data size.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Backup Type
            </label>
            <select
              className="input"
              value={backupType}
              onChange={(e) => setBackupType(e.target.value as 'FULL' | 'INCREMENTAL')}
            >
              <option value="FULL">Full (all tables)</option>
              <option value="INCREMENTAL">Incremental (readings only)</option>
            </select>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Full backups include all data. Incremental backups only include sensor readings and summaries.
            </p>
          </div>
          {createBackup.error && (
            <p className="text-sm text-red-600">
              {(createBackup.error as any)?.response?.data?.message ?? 'Failed to create backup'}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createBackup.isPending} className="btn-primary">
              {createBackup.isPending ? 'Creating…' : 'Create Backup'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Backup" width="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Are you sure you want to delete this backup? This action cannot be undone.
          </p>
          {deleteBackup.error && (
            <p className="text-sm text-red-600">
              {(deleteBackup.error as any)?.response?.data?.message ?? 'Failed to delete backup'}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleDelete} disabled={deleteBackup.isPending} className="btn-danger">
              {deleteBackup.isPending ? 'Deleting…' : 'Delete Backup'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Retention Run Confirmation */}
      <Modal open={retentionConfirmOpen} onClose={() => setRetentionConfirmOpen(false)} title="Run Retention Now" width="max-w-md">
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Permanent deletion</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  Raw readings older than each sensor's retention limit will be permanently deleted and cannot be recovered.
                  Daily summaries will be created first to preserve aggregated history.
                </p>
              </div>
            </div>
          </div>
          {retentionPreview && retentionPreview.summary.totalReadingsToDelete > 0 && (
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Based on the preview,{' '}
              <strong>{retentionPreview.summary.totalReadingsToDelete.toLocaleString()}</strong> raw readings
              across <strong>{retentionPreview.summary.totalSensors}</strong> sensors will be deleted.
            </p>
          )}
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Are you sure you want to run retention enforcement now?
          </p>
          {runRetention.error && (
            <p className="text-sm text-red-600">
              {(runRetention.error as any)?.response?.data?.message ?? 'Retention run failed'}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setRetentionConfirmOpen(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleRunRetention} disabled={runRetention.isPending} className="btn-danger">
              {runRetention.isPending ? 'Running…' : 'Run Retention'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Restore Confirmation */}
      <Modal open={!!restoreId} onClose={() => setRestoreId(null)} title="Restore Backup" width="max-w-md">
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-900 dark:text-red-100">Destructive Action</p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                  Restoring this backup will <strong>permanently overwrite all current data</strong>. This cannot be undone.
                </p>
              </div>
            </div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Are you absolutely sure you want to proceed?
          </p>
          {restoreBackup.error && (
            <p className="text-sm text-red-600">
              {(restoreBackup.error as any)?.response?.data?.message ?? 'Failed to restore backup'}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setRestoreId(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleRestore} disabled={restoreBackup.isPending} className="btn-danger">
              {restoreBackup.isPending ? 'Restoring…' : 'Restore Backup'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
