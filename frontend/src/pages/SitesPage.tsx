import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSites, useCreateSite } from '../hooks/useSites';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { formatDistanceToNow } from 'date-fns';

const COMMISSIONING_STATUSES = ['DISCOVERY', 'REVIEW', 'ACTIVE', 'SUSPENDED'] as const;
const CONNECTIVITY_STATUSES = ['ONLINE', 'OFFLINE', 'UNKNOWN'] as const;

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export default function SitesPage() {
  const { data: sites, isLoading } = useSites();
  const createSite = useCreateSite();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [connectivityFilter, setConnectivityFilter] = useState('');

  const filtered = useMemo(() => {
    if (!sites) return [];
    const q = search.toLowerCase();
    return sites.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !s.description?.toLowerCase().includes(q)) return false;
      if (statusFilter && s.commissioningStatus !== statusFilter) return false;
      if (connectivityFilter && s.connectivityStatus !== connectivityFilter) return false;
      return true;
    });
  }, [sites, search, statusFilter, connectivityFilter]);

  const pg = usePagination(filtered);

  const hasFilters = search !== '' || statusFilter !== '' || connectivityFilter !== '';

  // Reset to page 1 when filters change
  useEffect(() => { pg.goTo(1); }, [search, statusFilter, connectivityFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createSite.mutateAsync({ name, description: description || undefined });
    setOpen(false);
    setName('');
    setDescription('');
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Inventory</p>
          <p className="text-sm text-slate-500">
            {hasFilters ? `${pg.total} of ${sites?.length ?? 0}` : pg.total} site{pg.total !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
          <PlusIcon /> New Site
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="input w-48 h-8 text-sm py-0"
          placeholder="Search sites…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input h-8 text-sm py-0 pr-8 w-44"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {COMMISSIONING_STATUSES.map((s) => (
            <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
          ))}
        </select>
        <select
          className="input h-8 text-sm py-0 pr-8 w-44"
          value={connectivityFilter}
          onChange={(e) => setConnectivityFilter(e.target.value)}
        >
          <option value="">All connectivity</option>
          {CONNECTIVITY_STATUSES.map((s) => (
            <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            className="btn-secondary h-8 text-sm py-0"
            onClick={() => { setSearch(''); setStatusFilter(''); setConnectivityFilter(''); }}
          >
            Clear
          </button>
        )}
      </div>

      {sites?.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No sites yet"
            description="Create your first site to start ingesting IoT data."
            action={
              <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
                <PlusIcon /> New Site
              </button>
            }
          />
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">Status</th>
                <th className="table-th">Connectivity</th>
                <th className="table-th">Last Seen</th>
                <th className="table-th">Created</th>
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 ? (
                <tr>
                  <td colSpan={5} className="table-td text-center text-slate-400 py-8">
                    No sites match the current filters.
                  </td>
                </tr>
              ) : pg.paged.map((site) => (
                <tr key={site.id} className="table-row-interactive">
                  <td className="table-td">
                    <Link to={`/sites/${site.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400">
                      {site.name}
                    </Link>
                    {site.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{site.description}</p>
                    )}
                  </td>
                  <td className="table-td"><Badge value={site.commissioningStatus} /></td>
                  <td className="table-td"><Badge value={site.connectivityStatus} /></td>
                  <td className="table-td text-slate-400">
                    {site.lastSeenAt
                      ? formatDistanceToNow(new Date(site.lastSeenAt), { addSuffix: true })
                      : '—'}
                  </td>
                  <td className="table-td text-slate-400">
                    {formatDistanceToNow(new Date(site.createdAt), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 dark:border-slate-800 px-4">
            <Pagination {...pg} onPage={pg.goTo} onPageSize={pg.changePageSize} />
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Site">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Warehouse A" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Description</label>
            <textarea className="input resize-none" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createSite.isPending} className="btn-primary">
              {createSite.isPending ? 'Creating…' : 'Create Site'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
