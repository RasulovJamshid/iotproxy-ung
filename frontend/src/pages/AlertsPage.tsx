import React, { useState } from 'react';
import {
  useAlertRules, useAlertEvents,
  useCreateAlertRule, useUpdateAlertRule, useDeleteAlertRule,
} from '../hooks/useAlerts';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { useSensors } from '../hooks/useSensors';
import { formatDistanceToNow } from 'date-fns';

const OPERATORS = ['GT', 'GTE', 'LT', 'LTE', 'EQ', 'NEQ'];
const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'];

const defaultForm = {
  sensorId: '',
  field: '',
  operator: 'GT',
  threshold: '',
  severity: 'WARNING',
  windowSeconds: '0',
  cooldownSeconds: '300',
};

export default function AlertsPage() {
  const { data: rules, isLoading: rulesLoading } = useAlertRules();
  const { data: events, isLoading: eventsLoading } = useAlertEvents();
  const { data: sensors } = useSensors();
  const createRule = useCreateAlertRule();
  const updateRule = useUpdateAlertRule();
  const deleteRule = useDeleteAlertRule();

  const [tab, setTab] = useState<'rules' | 'events'>('rules');
  const [createOpen, setCreateOpen] = useState(false);
  const rulesPg = usePagination(rules);
  const eventsPg = usePagination(events);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const set = (k: keyof typeof defaultForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createRule.mutateAsync({
      sensorId: form.sensorId || undefined,
      field: form.field,
      operator: form.operator,
      threshold: Number(form.threshold),
      severity: form.severity,
      windowSeconds: Number(form.windowSeconds),
      cooldownSeconds: Number(form.cooldownSeconds),
    });
    setCreateOpen(false);
    setForm(defaultForm);
  };

  const toggleActive = (id: string, isActive: boolean) =>
    updateRule.mutate({ id, isActive: !isActive });

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['rules', 'events'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t === 'rules' ? 'Rules' : 'Events'}
            {t === 'events' && events && events.filter((e) => e.state === 'FIRING').length > 0 && (
              <span className="ml-2 rounded-full bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 text-xs text-red-600 dark:text-red-400">
                {events.filter((e) => e.state === 'FIRING').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'rules' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Rule
            </button>
          </div>

          {rulesLoading ? (
            <PageSpinner />
          ) : rules?.length === 0 ? (
            <div className="card">
              <EmptyState title="No alert rules" description="Create a rule to get notified when sensor values breach thresholds." />
            </div>
          ) : (
            <div className="card-flush">
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="table-th">Field / Condition</th>
                    <th className="table-th">Sensor</th>
                    <th className="table-th">Severity</th>
                    <th className="table-th">Active</th>
                    <th className="table-th" />
                  </tr>
                </thead>
                <tbody>
                  {rulesPg.paged.map((rule) => {
                    const sensor = sensors?.find((s) => s.id === rule.sensorId);
                    return (
                      <tr key={rule.id} className="table-row">
                        <td className="table-td">
                          <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 px-2 py-0.5 rounded border border-transparent dark:border-slate-700">
                            {rule.field} {rule.operator} {rule.threshold}
                          </span>
                          {rule.windowSeconds > 0 && (
                            <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">over {rule.windowSeconds}s</span>
                          )}
                        </td>
                        <td className="table-td text-slate-400 dark:text-slate-500">
                          {sensor?.name ?? (rule.sensorId ? rule.sensorId.slice(0, 8) + '…' : 'All')}
                        </td>
                        <td className="table-td"><Badge value={rule.severity} /></td>
                        <td className="table-td">
                          <button
                            onClick={() => toggleActive(rule.id, rule.isActive)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.isActive ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${rule.isActive ? 'translate-x-4' : 'translate-x-1'}`} />
                          </button>
                        </td>
                        <td className="table-td text-right">
                          <button
                            onClick={() => setDeleteId(rule.id)}
                            className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-t border-slate-100 dark:border-slate-800 px-4">
                <Pagination {...rulesPg} onPage={rulesPg.goTo} onPageSize={rulesPg.changePageSize} />
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'events' && (
        eventsLoading ? <PageSpinner /> : events?.length === 0 ? (
          <div className="card">
            <EmptyState title="No alert events" description="Events appear here when rules fire." />
          </div>
        ) : (
          <div className="card-flush">
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="table-th">State</th>
                  <th className="table-th">Severity</th>
                  <th className="table-th">Value / Threshold</th>
                  <th className="table-th">Sensor</th>
                  <th className="table-th">When</th>
                </tr>
              </thead>
              <tbody>
                {eventsPg.paged.map((ev) => {
                  const sensor = sensors?.find((s) => s.id === ev.sensorId);
                  return (
                    <tr key={ev.id} className="table-row">
                      <td className="table-td"><Badge value={ev.state} /></td>
                      <td className="table-td"><Badge value={ev.severity} /></td>
                      <td className="table-td font-mono text-xs dark:text-slate-300">
                        {ev.value} / {ev.threshold}
                      </td>
                      <td className="table-td text-slate-400 dark:text-slate-500">
                        {sensor?.name ?? ev.sensorId.slice(0, 8) + '…'}
                      </td>
                      <td className="table-td text-slate-400 dark:text-slate-500">
                        {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-slate-100 dark:border-slate-800 px-4">
              <Pagination {...eventsPg} onPage={eventsPg.goTo} onPageSize={eventsPg.changePageSize} />
            </div>
          </div>
        )
      )}

      {/* Create Rule Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Alert Rule">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Field <span className="text-red-500 dark:text-red-400">*</span></label>
              <input className="input" value={form.field} onChange={set('field')} required placeholder="temperature" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Operator</label>
              <select className="input" value={form.operator} onChange={set('operator')}>
                {OPERATORS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Threshold <span className="text-red-500 dark:text-red-400">*</span></label>
              <input className="input" type="number" step="any" value={form.threshold} onChange={set('threshold')} required placeholder="100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Severity</label>
              <select className="input" value={form.severity} onChange={set('severity')}>
                {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Sensor (optional)</label>
            <select className="input" value={form.sensorId} onChange={set('sensorId')}>
              <option value="">All sensors</option>
              {sensors?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Window (seconds)</label>
              <input className="input" type="number" min="0" value={form.windowSeconds} onChange={set('windowSeconds')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Cooldown (seconds)</label>
              <input className="input" type="number" min="0" value={form.cooldownSeconds} onChange={set('cooldownSeconds')} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createRule.isPending} className="btn-primary">
              {createRule.isPending ? 'Creating…' : 'Create Rule'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { deleteRule.mutate(deleteId!); setDeleteId(null); }}
        title="Delete Rule"
        description="This alert rule will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleteRule.isPending}
      />
    </div>
  );
}
