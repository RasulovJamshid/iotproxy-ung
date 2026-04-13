import React, { useState, useMemo, useEffect } from 'react';
import {
  useAlertRules, useAlertEvents,
  useCreateAlertRule, useUpdateAlertRule, useDeleteAlertRule,
  useUpdateAlertEvent, useDeleteAlertEvent
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

// ── Icons ──────────────────────────────────────────────────────────────────────
const Icon = ({ d, className = 'w-4 h-4' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Icons = {
  Plus:    () => <Icon d="M12 5v14M5 12h14" />,
  Trash:   () => <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-3.5 h-3.5" />,
  Toggle:  () => <Icon d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />,
  Rule:    () => <Icon d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />,
  Event:   () => <Icon d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />,
  Check:   () => <Icon d="M5 13l4 4L19 7" />,
};

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent = false, error = false }: { label: string; value: string | number; sub?: string; accent?: boolean; error?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 border ${accent
      ? 'bg-gradient-to-br from-blue-500 to-indigo-600 border-blue-600/30 text-white'
      : error
      ? 'bg-gradient-to-br from-red-500 to-rose-600 border-red-600/30 text-white'
      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-widest mb-1 ${accent ? 'text-blue-100' : error ? 'text-red-100' : 'text-slate-400 dark:text-slate-500'}`}>{label}</p>
      <p className={`text-3xl font-bold ${accent || error ? 'text-white' : ''}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? 'text-blue-200' : error ? 'text-red-200' : 'text-slate-400 dark:text-slate-500'}`}>{sub}</p>}
    </div>
  );
}

export default function AlertsPage() {
  const { data: rules = [], isLoading: rulesLoading } = useAlertRules();
  const { data: events = [], isLoading: eventsLoading } = useAlertEvents();
  const { data: sensors = [] } = useSensors();
  const createRule = useCreateAlertRule();
  const updateRule = useUpdateAlertRule();
  const deleteRule = useDeleteAlertRule();
  const updateEvent = useUpdateAlertEvent();
  const deleteEvent = useDeleteAlertEvent();

  const [tab, setTab] = useState<'rules' | 'events'>('rules');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);
  
  const rulesPg = usePagination(rules);
  const eventsPg = usePagination(events);
  
  useEffect(() => { rulesPg.goTo(1); }, [tab, rules.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { eventsPg.goTo(1); }, [tab, events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState(defaultForm);

  const set = (k: keyof typeof defaultForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const activeRulesCount = rules.filter(r => r.isActive).length;
  const firingEventsCount = events.filter(e => e.state === 'FIRING').length;

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

  if (rulesLoading && tab === 'rules') return <PageSpinner />;
  if (eventsLoading && tab === 'events') return <PageSpinner />;

  return (
    <div className="space-y-6">
      
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Rules" value={rules.length} accent />
        <StatCard label="Active Rules" value={activeRulesCount} sub={`${rules.length > 0 ? Math.round((activeRulesCount / rules.length) * 100) : 0}% of total`} />
        <StatCard label="Firing Now" value={firingEventsCount} error={firingEventsCount > 0} sub={firingEventsCount > 0 ? 'Requires attention' : 'All clear'} />
        <StatCard label="Resolved Events" value={events.filter(e => e.state === 'RESOLVED').length} />
      </div>

      {/* Tabs Layout */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        {(['rules', 'events'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-3 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px flex items-center gap-2 ${
              tab === t
                ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t === 'rules' ? 'Alert Rules' : 'Event History'}
            {t === 'events' && firingEventsCount > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider ${tab === t ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400'}`}>
                {firingEventsCount} Firing
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Rules Tab */}
      {tab === 'rules' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center py-2">
            <p className="text-sm text-slate-500">{rulesPg.total} rule{rulesPg.total !== 1 ? 's' : ''}</p>
            <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
              <Icons.Plus /> New Rule
            </button>
          </div>

          {rules.length === 0 ? (
            <div className="card">
              <EmptyState 
                title="No alert rules" 
                description="Create a rule to get notified when sensor values breach thresholds."
                action={
                  <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2 mt-4">
                    <Icons.Plus /> Create First Rule
                  </button>
                }
              />
            </div>
          ) : (
            <div className="card-flush">
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="table-th">Rule Condition</th>
                    <th className="table-th">Sensor Scope</th>
                    <th className="table-th">Severity</th>
                    <th className="table-th">Active</th>
                    <th className="table-th w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rulesPg.paged.map((rule) => {
                    const sensor = sensors?.find((s) => s.id === rule.sensorId);
                    return (
                      <tr key={rule.id} className={`table-row group ${!rule.isActive ? 'bg-slate-50 dark:bg-slate-900/30' : ''}`}>
                        <td className="table-td">
                          <div className="flex items-center gap-3">
                            <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs flex-shrink-0 shadow-sm border ${!rule.isActive ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500' : 'bg-gradient-to-br from-amber-100 to-orange-50 text-amber-600 border-amber-200/50 dark:from-amber-900/30 dark:to-orange-900/20 dark:border-amber-800/50 dark:text-amber-400'}`}>
                              <Icons.Rule />
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded border ${!rule.isActive ? 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' : 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-900/30 dark:border-indigo-800/50 dark:text-indigo-300'}`}>
                                  {rule.field} {rule.operator} {rule.threshold}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1">
                                {rule.windowSeconds > 0 ? `window: ${rule.windowSeconds}s` : 'instant'} · cooldown: {rule.cooldownSeconds}s
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="table-td">
                          <span className={`text-sm ${!rule.isActive ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'} font-medium`}>
                            {sensor?.name ?? (rule.sensorId ? <span className="font-mono text-xs">{rule.sensorId.slice(0, 8)}…</span> : 'All Sensors')}
                          </span>
                        </td>
                        <td className="table-td"><Badge value={rule.severity} /></td>
                        <td className="table-td">
                          <button
                            onClick={() => toggleActive(rule.id, rule.isActive)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.isActive ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                            title={rule.isActive ? 'Deactivate rule' : 'Activate rule'}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${rule.isActive ? 'translate-x-4' : 'translate-x-1'}`} />
                          </button>
                        </td>
                        <td className="table-td">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setDeleteId(rule.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Delete rule"
                            >
                              <Icons.Trash />
                            </button>
                          </div>
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
        </div>
      )}

      {/* Events Tab */}
      {tab === 'events' && (
        <div className="space-y-4">
          <div className="py-2">
            <p className="text-sm text-slate-500">{eventsPg.total} event{eventsPg.total !== 1 ? 's' : ''}</p>
          </div>
          
          {events.length === 0 ? (
            <div className="card">
              <EmptyState title="No alert events" description="Events appear here when rules fire." />
            </div>
          ) : (
            <div className="card-flush">
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="table-th">Event / State</th>
                    <th className="table-th">Severity</th>
                    <th className="table-th">Metric Value</th>
                    <th className="table-th">Sensor Origin</th>
                    <th className="table-th">Timestamp</th>
                    <th className="table-th w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsPg.paged.map((ev) => {
                    const sensor = sensors?.find((s) => s.id === ev.sensorId);
                    const isFiring = ev.state === 'FIRING';
                    return (
                      <tr key={ev.id} className={`table-row group ${isFiring ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                        <td className="table-td">
                          <div className="flex items-center gap-3">
                            <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs flex-shrink-0 shadow-sm border ${isFiring ? 'bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50' : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700'}`}>
                              <Icons.Event />
                            </span>
                            <div>
                              <Badge value={ev.state} />
                            </div>
                          </div>
                        </td>
                        <td className="table-td"><Badge value={ev.severity} /></td>
                        <td className="table-td">
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                            {ev.value} <span className="text-slate-400 font-normal">/ {ev.threshold} limit</span>
                          </span>
                        </td>
                        <td className="table-td">
                          <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                            {sensor?.name ?? <span className="font-mono text-xs">{ev.sensorId.slice(0, 8)}…</span>}
                          </span>
                        </td>
                        <td className="table-td text-slate-400 text-xs">
                          {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                        </td>
                        <td className="table-td">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isFiring && (
                              <button
                                onClick={() => updateEvent.mutate({ id: ev.id, state: 'RESOLVED' })}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="Resolve Event"
                              >
                                <Icons.Check />
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteEventId(ev.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Delete Event"
                            >
                              <Icons.Trash />
                            </button>
                          </div>
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
          )}
        </div>
      )}

      {/* Create Rule Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Alert Rule" width="max-w-xl">
        <form onSubmit={handleCreate} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Field <span className="text-red-500 dark:text-red-400">*</span></label>
              <input className="input" value={form.field} onChange={set('field')} required placeholder="e.g. temperature" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Operator</label>
              <select className="input" value={form.operator} onChange={set('operator')}>
                {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Threshold <span className="text-red-500 dark:text-red-400">*</span></label>
              <input className="input" type="number" step="any" value={form.threshold} onChange={set('threshold')} required placeholder="e.g. 100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Severity</label>
              <select className="input" value={form.severity} onChange={set('severity')}>
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Target Sensor (optional)</label>
            <select className="input" value={form.sensorId} onChange={set('sensorId')}>
              <option value="">Apply to all sensors globally</option>
              {sensors?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mt-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Window (sec)</label>
              <input className="input" type="number" min="0" value={form.windowSeconds} onChange={set('windowSeconds')} />
              <p className="text-[10px] text-slate-400 mt-1">Sustain alert over time.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Cooldown (sec)</label>
              <input className="input" type="number" min="0" value={form.cooldownSeconds} onChange={set('cooldownSeconds')} />
              <p className="text-[10px] text-slate-400 mt-1">Delay before firing again.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-5">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createRule.isPending} className="btn-primary">
              {createRule.isPending ? 'Creating…' : 'Create Rule'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { deleteRule.mutate(deleteId!); setDeleteId(null); }}
        title="Delete Alert Rule"
        description="This rule will be permanently deleted and will stop evaluating sensor data immediately. Historical events are kept."
        confirmLabel="Delete Rule"
        danger
        loading={deleteRule.isPending}
      />

      <ConfirmDialog
        open={!!deleteEventId}
        onClose={() => setDeleteEventId(null)}
        onConfirm={() => { deleteEvent.mutate(deleteEventId!); setDeleteEventId(null); }}
        title="Delete Alert Event"
        description="This specific event log will be permanently deleted."
        confirmLabel="Delete Event"
        danger
        loading={deleteEvent.isPending}
      />
    </div>
  );
}
