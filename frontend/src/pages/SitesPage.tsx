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

// ── Icons ──────────────────────────────────────────────────────────────────────
const Icon = ({ d, className = 'w-4 h-4' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Icons = {
  Plus:    () => <Icon d="M12 5v14M5 12h14" />,
  Search:  () => <Icon d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />,
  Close:   () => <Icon d="M6 18L18 6M6 6l12 12" />,
  Site:    () => <Icon d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />,
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

export default function SitesPage() {
  const { data: sitesResponse, isLoading } = useSites();
  const sites = sitesResponse?.data ?? [];
  const createSite = useCreateSite();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [connectivityFilter, setConnectivityFilter] = useState('');

  const filtered = useMemo(() => {
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

  const activeCount = sites.filter(s => s.commissioningStatus === 'ACTIVE').length;
  const onlineCount = sites.filter(s => s.connectivityStatus === 'ONLINE').length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createSite.mutateAsync({ name, description: description || undefined });
    setOpen(false);
    setName('');
    setDescription('');
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Sites" value={sites.length} accent />
        <StatCard label="Active" value={activeCount} sub={`${sites.length > 0 ? Math.round((activeCount / sites.length) * 100) : 0}% of total`} />
        <StatCard label="Online" value={onlineCount} sub={`${sites.length > 0 ? Math.round((onlineCount / sites.length) * 100) : 0}% of total`} />
        <StatCard label="Offline" value={sites.length - onlineCount} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-grow sm:flex-grow-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icons.Search /></span>
            <input
              className="input pl-9 w-full sm:w-48"
              placeholder="Search sites…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <Icons.Close />
              </button>
            )}
          </div>
          {/* Status Filter */}
          <select
            className="input w-36"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Status: All</option>
            {COMMISSIONING_STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
          {/* Connectivity Filter */}
          <select
            className="input w-40"
            value={connectivityFilter}
            onChange={(e) => setConnectivityFilter(e.target.value)}
          >
            <option value="">Connection: All</option>
            {CONNECTIVITY_STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); setConnectivityFilter(''); }}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Icons.Plus /> New Site
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title={hasFilters ? 'No matching sites' : 'No sites yet'}
            description={hasFilters ? 'Try adjusting your search or filters.' : 'Create your first site to start ingesting IoT data.'}
            action={!hasFilters ? (
              <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
                <Icons.Plus /> New Site
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">Site</th>
                <th className="table-th">Status</th>
                <th className="table-th">Connectivity</th>
                <th className="table-th">Last Seen</th>
                <th className="table-th">Created</th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((site) => (
                <tr key={site.id} className="table-row-interactive group cursor-pointer transition-colors" onClick={() => window.location.assign(`/sites/${site.id}`)}>
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-100 to-blue-50 dark:from-indigo-900/30 dark:to-blue-900/20 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/50 transition-colors flex-shrink-0 border border-indigo-200/50 dark:border-indigo-800/50">
                        <Icons.Site />
                      </span>
                      <div>
                        <Link to={`/sites/${site.id}`} className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 leading-tight block">
                          {site.name}
                        </Link>
                        {site.description && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xs">{site.description}</p>
                        )}
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5 leading-none">{site.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-td"><Badge value={site.commissioningStatus} /></td>
                  <td className="table-td"><Badge value={site.connectivityStatus} /></td>
                  <td className="table-td text-slate-400 text-sm">
                    {site.lastSeenAt
                      ? formatDistanceToNow(new Date(site.lastSeenAt), { addSuffix: true })
                      : '—'}
                  </td>
                  <td className="table-td text-slate-400 text-xs">
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

      {/* Create modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="New Site" width="max-w-xl">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Warehouse A" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Description</label>
            <textarea className="input resize-none" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-5">
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
