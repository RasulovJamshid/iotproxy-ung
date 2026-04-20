import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSites, useCreateSite } from '../hooks/useSites';
import { useSiteGroups } from '../hooks/useSiteGroups';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { formatDistanceToNow } from 'date-fns';
import { SITE_TYPES, SITE_TYPE_LABELS, COMMON_TIMEZONES } from '@iotproxy/shared/constants';

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
  Folder:  () => <Icon d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />,
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
  const { data: groups = [] } = useSiteGroups();
  const createSite = useCreateSite();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  
  // New fields
  const [siteType, setSiteType] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [timezone, setTimezone] = useState('');
  const [tags, setTags] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [connectivityFilter, setConnectivityFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sites.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !s.description?.toLowerCase().includes(q)) return false;
      if (statusFilter && s.commissioningStatus !== statusFilter) return false;
      if (connectivityFilter && s.connectivityStatus !== connectivityFilter) return false;
      if (groupFilter === 'none' && s.groupId) return false;
      if (groupFilter && groupFilter !== 'none' && s.groupId !== groupFilter) return false;
      return true;
    });
  }, [sites, search, statusFilter, connectivityFilter, groupFilter]);

  const pg = usePagination(filtered);
  const hasFilters = search !== '' || statusFilter !== '' || connectivityFilter !== '' || groupFilter !== '';

  // Reset to page 1 when filters change
  useEffect(() => { pg.goTo(1); }, [search, statusFilter, connectivityFilter, groupFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = sites.filter(s => s.commissioningStatus === 'ACTIVE').length;
  const onlineCount = sites.filter(s => s.connectivityStatus === 'ONLINE').length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse tags from comma-separated string
    const parsedTags = tags.trim() ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined;
    
    await createSite.mutateAsync({
      name,
      description: description || undefined,
      groupId: newGroupId || undefined,
      siteType: siteType || undefined,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      timezone: timezone || undefined,
      tags: parsedTags,
    });
    
    // Reset form
    setOpen(false);
    setName('');
    setDescription('');
    setNewGroupId('');
    setSiteType('');
    setLatitude('');
    setLongitude('');
    setTimezone('');
    setTags('');
    setShowAdvanced(false);
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
          {/* Group Filter */}
          {groups.length > 0 && (
            <select
              className="input w-44"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="">Group: All</option>
              <option value="none">Ungrouped</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); setConnectivityFilter(''); setGroupFilter(''); }}
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
                <th className="table-th">Type</th>
                <th className="table-th">Group</th>
                <th className="table-th">Tags</th>
                <th className="table-th">Status</th>
                <th className="table-th">Connectivity</th>
                <th className="table-th">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((site) => {
                const siteGroup = groups.find((g) => g.id === site.groupId);
                return (
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
                  <td className="table-td">
                    {site.siteType ? (
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {SITE_TYPE_LABELS[site.siteType as keyof typeof SITE_TYPE_LABELS] || site.siteType}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="table-td">
                    {siteGroup ? (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white whitespace-nowrap"
                        style={{ backgroundColor: siteGroup.color ?? '#64748b' }}
                      >
                        <Icons.Folder /> {siteGroup.name}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="table-td">
                    {site.tags && site.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {site.tags.slice(0, 3).map((tag, idx) => (
                          <span key={idx} className="inline-block px-2 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded">
                            {tag}
                          </span>
                        ))}
                        {site.tags.length > 3 && (
                          <span className="text-[10px] text-slate-400">+{site.tags.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="table-td"><Badge value={site.commissioningStatus} /></td>
                  <td className="table-td"><Badge value={site.connectivityStatus} /></td>
                  <td className="table-td text-slate-400 text-sm">
                    {site.lastSeenAt
                      ? formatDistanceToNow(new Date(site.lastSeenAt), { addSuffix: true })
                      : '—'}
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

      {/* Create modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="New Site" width="max-w-2xl">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Warehouse A" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Description</label>
            <textarea className="input resize-none" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {groups.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Group</label>
                <select className="input" value={newGroupId} onChange={(e) => setNewGroupId(e.target.value)}>
                  <option value="">No group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Site Type</label>
              <select className="input" value={siteType} onChange={(e) => setSiteType(e.target.value)}>
                <option value="">Select type...</option>
                {Object.entries(SITE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Advanced fields toggle */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-2"
            >
              {showAdvanced ? '▼' : '▶'} Advanced Options
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 pl-4 border-l-2 border-blue-200 dark:border-blue-900">
              {/* Geolocation */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Geolocation</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      className="input"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      placeholder="40.7128"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      className="input"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      placeholder="-74.0060"
                    />
                  </div>
                </div>
              </div>

              {/* Timezone */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Timezone</label>
                <select className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  <option value="">Auto-detect / Default</option>
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Used for proper time display in dashboards
                </p>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Tags</label>
                <input
                  type="text"
                  className="input"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="production, critical, hvac"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Comma-separated tags for filtering and grouping
                </p>
              </div>
            </div>
          )}

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
