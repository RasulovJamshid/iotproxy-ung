import React, { useState, useMemo } from 'react';
import { useWebhooks, useCreateWebhook, useDeleteWebhook, useUpdateWebhook } from '../hooks/useWebhooks';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { formatDistanceToNow } from 'date-fns';

const AVAILABLE_EVENTS = [
  'alert.fired', 'alert.resolved',
  'sensor.offline', 'sensor.online',
  'export.completed', 'export.failed',
];

// ── Icons ──────────────────────────────────────────────────────────────────────
const Icon = ({ d, className = 'w-4 h-4' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Icons = {
  Plus:    () => <Icon d="M12 5v14M5 12h14" />,
  Edit:    () => <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-3.5 h-3.5" />,
  Toggle:  () => <Icon d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />,
  Search:  () => <Icon d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />,
  Close:   () => <Icon d="M6 18L18 6M6 6l12 12" />,
  Webhook: () => <Icon d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />,
  Trash:   () => <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-3.5 h-3.5" />,
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

export default function WebhooksPage() {
  const { data: webhooks = [], isLoading } = useWebhooks();
  const create = useCreateWebhook();
  const update = useUpdateWebhook();
  const remove = useDeleteWebhook();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const filtered = useMemo(() => {
    let list = webhooks;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(w => w.url.toLowerCase().includes(q));
    }
    if (statusFilter === 'active')   list = list.filter(w => w.isActive);
    if (statusFilter === 'inactive') list = list.filter(w => !w.isActive);
    return list;
  }, [webhooks, search, statusFilter]);

  const pg = usePagination(filtered);
  const activeCount = webhooks.filter(w => w.isActive).length;

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  const toggle = (ev: string) =>
    setEvents((prev) => prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]);

  const openCreate = () => {
    setEditingId(null);
    setUrl('');
    setEvents([]);
    setIsActive(true);
    setOpen(true);
  };

  const openEdit = (hook: any) => {
    setEditingId(hook.id);
    setUrl(hook.url);
    setEvents(hook.events || []);
    setIsActive(hook.isActive);
    setOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await update.mutateAsync({ id: editingId, url, events, isActive });
    } else {
      await create.mutateAsync({ url, events, isActive });
    }
    setOpen(false);
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Total Webhooks" value={webhooks.length} accent />
        <StatCard label="Active Webhooks" value={activeCount} sub={`${webhooks.length > 0 ? Math.round((activeCount / webhooks.length) * 100) : 0}% of total`} />
        <StatCard label="Inactive" value={webhooks.length - activeCount} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icons.Search /></span>
            <input
              className="input pl-9 w-64"
              placeholder="Search endpoints…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <Icons.Close />
              </button>
            )}
          </div>
          {/* Status filter */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            {(['all', 'active', 'inactive'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${statusFilter === f ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-400">{pg.total} result{pg.total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Icons.Plus /> Add Webhook
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title={search ? 'No matching webhooks' : 'No webhooks yet'}
            description={search ? 'Try adjusting your search or filter.' : 'Send real-time event notifications to external services.'}
            action={!search ? (
              <button onClick={openCreate} className="btn-primary flex items-center gap-2">
                <Icons.Plus /> Add Webhook
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">Endpoint URL</th>
                <th className="table-th">Events Subscribed</th>
                <th className="table-th">Status</th>
                <th className="table-th">Created</th>
                <th className="table-th w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((wh) => (
                <tr key={wh.id} className={`table-row group ${wh.isActive ? '' : 'bg-slate-50 dark:bg-slate-900/30'}`}>
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs shadow-sm border ${!wh.isActive ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700' : 'bg-gradient-to-br from-pink-100 to-rose-50 text-pink-600 border-pink-200/50 dark:from-pink-900/30 dark:to-rose-900/20 dark:text-pink-400 dark:border-pink-800/50'}`}>
                        <Icons.Webhook />
                      </span>
                      <div>
                        <span className={`font-mono text-xs truncate max-w-[200px] sm:max-w-xs md:max-w-md block ${!wh.isActive ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                          {wh.url}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="table-td">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {wh.events?.map((ev) => (
                        <span key={ev} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {ev}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="table-td">
                    {wh.isActive 
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50">Active</span>
                      : <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Inactive</span>}
                  </td>
                  <td className="table-td text-slate-400 text-xs">
                    {formatDistanceToNow(new Date(wh.createdAt), { addSuffix: true })}
                  </td>
                  <td className="table-td">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => update.mutate({ id: wh.id, isActive: !wh.isActive })}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title={wh.isActive ? "Deactivate" : "Activate"}
                      >
                        <Icons.Toggle />
                      </button>
                      <button
                        onClick={() => openEdit(wh)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Edit Webhook"
                      >
                        <Icons.Edit />
                      </button>
                      <button
                        onClick={() => setDeleteId(wh.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Delete Webhook"
                      >
                        <Icons.Trash />
                      </button>
                    </div>
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

      {/* Create / Edit Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Edit Webhook' : 'Add Webhook'} width="max-w-xl">
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Endpoint URL <span className="text-red-500">*</span></label>
            <input
              className="input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://hooks.example.com/iotproxy"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Events to receive</label>
            <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
              {AVAILABLE_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={events.includes(ev)}
                    onChange={() => toggle(ev)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">{ev}</span>
                </label>
              ))}
            </div>
            {events.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Please select at least one event type.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
             <input type="checkbox" id="isActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
             <label htmlFor="isActive" className="text-sm text-slate-700 dark:text-slate-200 cursor-pointer">Webhook is Active</label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-5">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={create.isPending || update.isPending || events.length === 0} className="btn-primary">
              {editingId ? (update.isPending ? 'Saving…' : 'Save Changes') : (create.isPending ? 'Adding…' : 'Add Webhook')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { remove.mutate(deleteId!); setDeleteId(null); }}
        title="Delete Webhook"
        description="This webhook will be permanently deleted and will stop receiving events."
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}
