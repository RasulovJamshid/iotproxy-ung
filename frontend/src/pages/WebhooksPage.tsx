import React, { useState } from 'react';
import { useWebhooks, useCreateWebhook, useDeleteWebhook } from '../hooks/useWebhooks';
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

export default function WebhooksPage() {
  const { data: webhooks, isLoading } = useWebhooks();
  const create = useCreateWebhook();
  const remove = useDeleteWebhook();
  const pg = usePagination(webhooks);

  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);

  const toggle = (ev: string) =>
    setEvents((prev) => prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({ url, events });
    setOpen(false);
    setUrl('');
    setEvents([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Webhook
        </button>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : webhooks?.length === 0 ? (
        <div className="card">
          <EmptyState title="No webhooks" description="Send real-time event notifications to external services." />
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">URL</th>
                <th className="table-th">Events</th>
                <th className="table-th">Active</th>
                <th className="table-th">Created</th>
                <th className="table-th" />
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((wh) => (
                <tr key={wh.id} className="table-row">
                  <td className="table-td">
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate max-w-xs block">{wh.url}</span>
                  </td>
                  <td className="table-td">
                    <div className="flex flex-wrap gap-1">
                      {wh.events?.map((ev) => (
                        <span key={ev} className="tag">{ev}</span>
                      ))}
                    </div>
                  </td>
                  <td className="table-td">
                    <Badge value={wh.isActive} label={wh.isActive ? 'Active' : 'Inactive'} />
                  </td>
                  <td className="table-td text-slate-400">
                    {formatDistanceToNow(new Date(wh.createdAt), { addSuffix: true })}
                  </td>
                  <td className="table-td text-right">
                    <button onClick={() => setDeleteId(wh.id)} className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">Delete</button>
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

      <Modal open={open} onClose={() => setOpen(false)} title="Add Webhook">
        <form onSubmit={handleCreate} className="space-y-4">
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
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={events.includes(ev)}
                    onChange={() => toggle(ev)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-200">{ev}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={create.isPending || events.length === 0} className="btn-primary">
              {create.isPending ? 'Adding…' : 'Add Webhook'}
            </button>
          </div>
        </form>
      </Modal>

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
