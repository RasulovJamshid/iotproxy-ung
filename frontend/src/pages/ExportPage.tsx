import React, { useState } from 'react';
import { useExports, useCreateExport, useDownloadExport } from '../hooks/useExports';
import { useSites } from '../hooks/useSites';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { formatDistanceToNow, subDays } from 'date-fns';

const toDatetimeLocal = (d: Date) => d.toISOString().slice(0, 16);

export default function ExportPage() {
  const { data: exports, isLoading } = useExports();
  const { data: sitesResponse } = useSites();
  const sites = sitesResponse?.data;
  const createExport = useCreateExport();
  const { download, downloading } = useDownloadExport();

  const pg = usePagination(exports);
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState('');
  const [startTs, setStartTs] = useState(toDatetimeLocal(subDays(new Date(), 1)));
  const [endTs, setEndTs] = useState(toDatetimeLocal(new Date()));
  const [format, setFormat] = useState('csv');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createExport.mutateAsync({ siteId, startTs: new Date(startTs).toISOString(), endTs: new Date(endTs).toISOString(), format });
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Export
        </button>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : exports?.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No exports yet"
            description="Export sensor readings as CSV or Parquet for offline analysis."
          />
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">Site</th>
                <th className="table-th">Range</th>
                <th className="table-th">Format</th>
                <th className="table-th">Status</th>
                <th className="table-th">Progress</th>
                <th className="table-th">Created</th>
                <th className="table-th" />
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((job) => {
                const site = sites?.find((s) => s.id === job.siteId);
                return (
                  <tr key={job.id} className="table-row">
                    <td className="table-td font-medium text-slate-800 dark:text-slate-200">{site?.name ?? job.siteId.slice(0, 8)}</td>
                    <td className="table-td text-slate-400">
                      {new Date(job.startTs).toLocaleDateString()} – {new Date(job.endTs).toLocaleDateString()}
                    </td>
                    <td className="table-td">
                      <span className="tag font-mono">{job.format}</span>
                    </td>
                    <td className="table-td"><Badge value={job.status} /></td>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-1.5 rounded-full bg-blue-500 transition-all"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">{job.progress}%</span>
                      </div>
                    </td>
                    <td className="table-td text-slate-400">
                      {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                    </td>
                    <td className="table-td">
                      {job.status === 'COMPLETED' && (
                        <button
                          onClick={() => download(job)}
                          disabled={downloading === job.id}
                          className="text-xs text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {downloading === job.id ? 'Downloading…' : 'Download'}
                        </button>
                      )}
                      {job.errorMessage && (
                        <span className="text-xs text-red-500" title={job.errorMessage}>Error</span>
                      )}
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

      <Modal open={open} onClose={() => setOpen(false)} title="New Export Job">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Site <span className="text-red-500">*</span></label>
            <select className="input" value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
              <option value="">Select a site…</option>
              {sites?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Start</label>
              <input className="input" type="datetime-local" value={startTs} onChange={(e) => setStartTs(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">End</label>
              <input className="input" type="datetime-local" value={endTs} onChange={(e) => setEndTs(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Format</label>
            <select className="input" value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="csv">CSV</option>
              <option value="parquet">Parquet</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createExport.isPending} className="btn-primary">
              {createExport.isPending ? 'Submitting…' : 'Submit Export'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
