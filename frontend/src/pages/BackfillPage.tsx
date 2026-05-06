import React, { useState, useMemo, useEffect } from 'react';
import { formatDistanceToNow, subDays } from 'date-fns';
import { useBackfillRuns, useCreateBackfillRun, useCancelBackfillRun } from '../hooks/useBackfill';
import { useAdapters } from '../hooks/useAdapters';
import { useSites } from '../hooks/useSites';
import { usePagination } from '../hooks/usePagination';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import type { BackfillRun } from '../types';
import type { SiteAdapter } from '@iotproxy/shared';

// ── Constants ─────────────────────────────────────────────────────────────────

const CHUNK_SIZES = [
  { value: 'hour',   label: 'Hour',   description: 'One request per hour — for high-resolution data' },
  { value: 'day',    label: 'Day',    description: 'One request per day — recommended for most cases' },
  { value: 'week',   label: 'Week',   description: 'One request per week — for slower or coarse data' },
  { value: 'month',  label: 'Month',  description: 'One request per month — for low-frequency data' },
  { value: 'custom', label: 'Custom', description: 'Specify an exact window size in seconds' },
] as const;

const TIMESTAMP_STRATEGIES = [
  { value: 'sequence',      label: 'Sequence',      description: 'Distribute readings evenly across the window (best when API returns no timestamps)' },
  { value: 'window-start',  label: 'Window start',  description: 'All readings in the window get the window start time' },
  { value: 'window-mid',    label: 'Window mid',    description: 'All readings get the midpoint of the window' },
  { value: 'window-end',    label: 'Window end',    description: 'All readings get the window end time' },
  { value: 'from-response', label: 'From response', description: 'Use the timestamp returned by the API (falls back to mid if absent)' },
] as const;

const TIME_FORMATS = [
  { value: 'iso8601',  label: 'ISO 8601',     example: (d: Date) => d.toISOString() },
  { value: 'unix_ms',  label: 'Unix ms',      example: (d: Date) => String(d.getTime()) },
  { value: 'unix_s',   label: 'Unix seconds', example: (d: Date) => String(Math.floor(d.getTime() / 1000)) },
  { value: 'custom',   label: 'Custom',       example: () => 'YYYY-MM-DD HH:mm:ss' },
] as const;

const toDatetimeLocal = (d: Date) => d.toISOString().slice(0, 16);

// ── Injection config state ────────────────────────────────────────────────────

interface InjectionState {
  enabled:        boolean;
  mode:           'range' | 'single-date';
  startParamName: string;
  endParamName:   string;
  dateParamName:  string;
  format:         string;
  customFormat:   string;
  location:       'query' | 'body';
}

const DEFAULT_INJECTION: InjectionState = {
  enabled:        false,
  mode:           'range',
  startParamName: 'startDate',
  endParamName:   'endDate',
  dateParamName:  'date',
  format:         'iso8601',
  customFormat:   '',
  location:       'query',
};

function injectionFromAdapter(adapter: SiteAdapter): InjectionState {
  const atp = adapter.pullTimeParams;
  if (!atp?.enabled) return DEFAULT_INJECTION;
  return {
    enabled:        true,
    mode:           'range',
    startParamName: atp.startParamName ?? 'startTime',
    endParamName:   atp.endParamName   ?? 'endTime',
    dateParamName:  'date',
    format:         atp.format         ?? 'iso8601',
    customFormat:   atp.customFormat   ?? '',
    location:       atp.location       ?? 'query',
  };
}

// ── Template variable reference ───────────────────────────────────────────────

const TEMPLATE_VARS = [
  { token: '{{windowStart}}', description: 'Window start — full ISO-8601 timestamp' },
  { token: '{{windowEnd}}',   description: 'Window end — full ISO-8601 timestamp' },
  { token: '{{date}}',        description: 'Window start date only (YYYY-MM-DD)' },
  { token: '{{year}}',        description: 'Year (e.g. 2024)' },
  { token: '{{month}}',       description: 'Month, zero-padded (e.g. 01)' },
  { token: '{{day}}',         description: 'Day, zero-padded (e.g. 15)' },
  { token: '{{hour}}',        description: 'Hour UTC, zero-padded (e.g. 00)' },
  { token: '{{unixStart}}',   description: 'Window start — Unix seconds' },
  { token: '{{unixEnd}}',     description: 'Window end — Unix seconds' },
  { token: '{{unixStartMs}}', description: 'Window start — Unix milliseconds' },
  { token: '{{unixEndMs}}',   description: 'Window end — Unix milliseconds' },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function runProgress(run: BackfillRun): number {
  if (run.totalChunks === 0) return 0;
  return Math.min(100, Math.round(((run.completedChunks + run.failedChunks) / run.totalChunks) * 100));
}

function isActive(run: BackfillRun): boolean {
  return run.status === 'RUNNING' || run.status === 'PENDING';
}

function chunkLabel(run: BackfillRun): string {
  if (run.chunkSize === 'custom' && run.chunkSizeSec) return `${run.chunkSizeSec}s`;
  return CHUNK_SIZES.find((c) => c.value === run.chunkSize)?.label ?? run.chunkSize;
}

function strategyLabel(run: BackfillRun): string {
  return TIMESTAMP_STRATEGIES.find((s) => s.value === run.timestampStrategy)?.label ?? run.timestampStrategy;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BackfillPage() {
  const { data: runs = [], isLoading } = useBackfillRuns();
  const { data: adaptersRaw = [] } = useAdapters();
  const { data: sitesResponse } = useSites();
  const sites = sitesResponse?.data ?? [];

  const createRun = useCreateBackfillRun();
  const cancelRun = useCancelBackfillRun();
  const pg = usePagination(runs);

  // ── Form state ──────────────────────────────────────────────────────────────

  const [open, setOpen]                   = useState(false);
  const [adapterId, setAdapterId]         = useState('');
  const [startDate, setStartDate]         = useState(toDatetimeLocal(subDays(new Date(), 30)));
  const [endDate, setEndDate]             = useState(toDatetimeLocal(new Date()));
  const [chunkSize, setChunkSize]         = useState('day');
  const [chunkSizeSec, setChunkSizeSec]   = useState(3600);
  const [timestampStrategy, setTimestampStrategy] = useState('sequence');
  const [delayMs, setDelayMs]             = useState(0);
  const [injection, setInjection]         = useState<InjectionState>(DEFAULT_INJECTION);

  // ── Cancel state ────────────────────────────────────────────────────────────

  const [cancelTarget, setCancelTarget] = useState<BackfillRun | null>(null);

  // ── Derived maps ────────────────────────────────────────────────────────────

  const siteMap    = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);
  const adapterMap = useMemo(() => new Map(adaptersRaw.map((a) => [a.id, a])), [adaptersRaw]);
  const pullAdapters = useMemo(() => adaptersRaw.filter((a) => a.pullEnabled && a.pullUrl), [adaptersRaw]);

  // Pre-populate injection from adapter's pullTimeParams when adapter is selected
  useEffect(() => {
    if (!adapterId) { setInjection(DEFAULT_INJECTION); return; }
    const adapter = adapterMap.get(adapterId);
    if (adapter) setInjection(injectionFromAdapter(adapter));
  }, [adapterId, adapterMap]);

  const chunkDesc    = CHUNK_SIZES.find((c) => c.value === chunkSize)?.description ?? '';
  const strategyDesc = TIMESTAMP_STRATEGIES.find((s) => s.value === timestampStrategy)?.description ?? '';
  const formatExample = TIME_FORMATS.find((f) => f.value === injection.format)?.example(new Date('2024-01-15T00:00:00Z')) ?? '';

  const totalWindows = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
    if (ms <= 0) return 0;
    const chunkMs =
      chunkSize === 'hour'   ? 3_600_000 :
      chunkSize === 'day'    ? 86_400_000 :
      chunkSize === 'week'   ? 604_800_000 :
      chunkSize === 'month'  ? 2_592_000_000 :
      (chunkSizeSec ?? 3600) * 1000;
    return Math.ceil(ms / chunkMs);
  }, [startDate, endDate, chunkSize, chunkSizeSec]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setAdapterId('');
    setStartDate(toDatetimeLocal(subDays(new Date(), 30)));
    setEndDate(toDatetimeLocal(new Date()));
    setChunkSize('day');
    setChunkSizeSec(3600);
    setTimestampStrategy('sequence');
    setDelayMs(0);
    setInjection(DEFAULT_INJECTION);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const paramName = injection.mode === 'single-date' ? injection.dateParamName : undefined;
    await createRun.mutateAsync({
      adapterId,
      startDate: new Date(startDate).toISOString(),
      endDate:   new Date(endDate).toISOString(),
      chunkSize,
      ...(chunkSize === 'custom' ? { chunkSizeSec } : {}),
      timestampStrategy,
      ...(injection.enabled ? {
        timeParams: {
          mode:           injection.mode,
          startParamName: paramName ?? injection.startParamName,
          endParamName:   paramName ?? injection.endParamName,
          ...(injection.mode === 'single-date' ? { dateParamName: injection.dateParamName } : {}),
          format:         injection.format as any,
          ...(injection.format === 'custom' ? { customFormat: injection.customFormat } : {}),
          location:       injection.location,
        },
      } : {}),
      ...(delayMs > 0 ? { delayBetweenChunksMs: delayMs } : {}),
    });
    setOpen(false);
    resetForm();
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    await cancelRun.mutateAsync(cancelTarget.id);
    setCancelTarget(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Fetch and ingest historical data from configured pull adapters.
        </p>
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Backfill Run
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <PageSpinner />
      ) : runs.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No backfill runs yet"
            description="Start a backfill run to import historical data from an external system day by day."
          />
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">Adapter / Site</th>
                <th className="table-th">Date Range</th>
                <th className="table-th">Chunk</th>
                <th className="table-th">Timestamps</th>
                <th className="table-th">Status</th>
                <th className="table-th">Progress</th>
                <th className="table-th">Readings</th>
                <th className="table-th">Created</th>
                <th className="table-th" />
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((run) => {
                const adapter  = adapterMap.get(run.adapterId);
                const siteName = adapter
                  ? (siteMap.get(adapter.siteId) ?? adapter.siteId.slice(0, 8))
                  : run.adapterId.slice(0, 8);
                const pct = runProgress(run);

                return (
                  <tr key={run.id} className="table-row">
                    <td className="table-td font-medium text-slate-800 dark:text-slate-200">
                      {siteName}
                    </td>

                    <td className="table-td text-slate-400 text-xs whitespace-nowrap">
                      {new Date(run.rangeStart).toLocaleDateString()}
                      <span className="mx-1">→</span>
                      {new Date(run.rangeEnd).toLocaleDateString()}
                    </td>

                    <td className="table-td">
                      <span className="tag font-mono">{chunkLabel(run)}</span>
                    </td>

                    <td className="table-td text-slate-500 text-xs">
                      {strategyLabel(run)}
                    </td>

                    <td className="table-td">
                      <Badge value={run.status} />
                    </td>

                    <td className="table-td min-w-[140px]">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                run.status === 'FAILED'    ? 'bg-red-400' :
                                run.status === 'CANCELLED' ? 'bg-slate-400' :
                                run.status === 'COMPLETED' ? 'bg-green-500' :
                                'bg-blue-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400">{pct}%</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {run.completedChunks}/{run.totalChunks} chunks
                          {run.failedChunks > 0 && (
                            <span className="text-red-400 ml-1">({run.failedChunks} failed)</span>
                          )}
                        </span>
                      </div>
                    </td>

                    <td className="table-td text-slate-500 text-sm tabular-nums">
                      {run.totalReadings.toLocaleString()}
                    </td>

                    <td className="table-td text-slate-400 text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                    </td>

                    <td className="table-td text-right">
                      {isActive(run) && (
                        <button
                          onClick={() => setCancelTarget(run)}
                          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      {run.errorMessage && (
                        <span className="text-xs text-red-400 cursor-help" title={run.errorMessage}>
                          Error ⓘ
                        </span>
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

      {/* ── Create modal ────────────────────────────────────────────────────── */}
      <Modal open={open} onClose={() => { setOpen(false); resetForm(); }} title="New Backfill Run" width="max-w-2xl">
        <form onSubmit={handleCreate} className="space-y-5">

          {/* Adapter */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Adapter <span className="text-red-500">*</span>
            </label>
            {pullAdapters.length === 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                No pull-enabled adapters found. Configure a pull adapter first.
              </p>
            ) : (
              <select
                className="input"
                value={adapterId}
                onChange={(e) => setAdapterId(e.target.value)}
                required
              >
                <option value="">Select an adapter…</option>
                {pullAdapters.map((a) => (
                  <option key={a.id} value={a.id}>
                    {siteMap.get(a.siteId) ?? a.siteId.slice(0, 8)} — {a.pullUrl}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Start <span className="text-red-500">*</span>
              </label>
              <input
                className="input"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                End <span className="text-red-500">*</span>
              </label>
              <input
                className="input"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Chunk size */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Window size
            </label>
            <select className="input" value={chunkSize} onChange={(e) => setChunkSize(e.target.value)}>
              {CHUNK_SIZES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {chunkDesc && <p className="mt-1.5 text-xs text-slate-400">{chunkDesc}</p>}
          </div>

          {chunkSize === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Window size (seconds) <span className="text-red-500">*</span>
              </label>
              <input
                className="input"
                type="number"
                min={60}
                step={60}
                value={chunkSizeSec}
                onChange={(e) => setChunkSizeSec(Number(e.target.value))}
                required
              />
            </div>
          )}

          {totalWindows > 0 && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/40 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
              This will create <strong>{totalWindows.toLocaleString()}</strong> fetch request{totalWindows !== 1 ? 's' : ''}.
              {delayMs > 0 && (
                <span className="ml-1">
                  Estimated time: ~{Math.ceil((totalWindows * delayMs) / 60_000)} min at {delayMs}ms delay.
                </span>
              )}
            </div>
          )}

          {/* ── Template variables reference ─────────────────────────── */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Template variables
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Use these in your adapter's pull URL, query params, headers, or body template.
                Each chunk substitutes the window's actual time values before the request is sent.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {TEMPLATE_VARS.map(({ token, description }) => (
                <div key={token} className="flex items-baseline gap-2 min-w-0">
                  <code className="shrink-0 text-[11px] bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-mono">
                    {token}
                  </code>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{description}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
              e.g.{' '}
              <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">{'?date={{date}}'}</code>
              {' · '}
              <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">{'?from={{unixStart}}&to={{unixEnd}}'}</code>
              {' · '}
              <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">{'/{{year}}/{{month}}/{{day}}'}</code>
            </p>
          </div>

          {/* ── Explicit param injection (optional) ──────────────────── */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {/* Header / toggle */}
            <button
              type="button"
              onClick={() => setInjection((p) => ({ ...p, enabled: !p.enabled }))}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Explicit param injection
                  {injection.enabled && (
                    <span className="ml-2 text-xs font-normal text-blue-500">
                      {injection.mode === 'single-date'
                        ? `${injection.dateParamName} = window start`
                        : `${injection.startParamName} + ${injection.endParamName}`}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Append date params to requests — use when you can't edit the adapter URL.
                </p>
              </div>
              <svg
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${injection.enabled ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {injection.enabled && (
              <div className="px-4 pb-4 space-y-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                {/* Mode toggle */}
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs w-fit">
                  {(['range', 'single-date'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setInjection((p) => ({ ...p, mode: m }))}
                      className={`px-3 py-1.5 font-medium transition-colors ${
                        injection.mode === m
                          ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                          : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      {m === 'range' ? 'Start + End' : 'Single date'}
                    </button>
                  ))}
                </div>

                {/* Param name(s) */}
                {injection.mode === 'single-date' ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Date param name
                    </label>
                    <input
                      className="input font-mono text-sm"
                      placeholder="date"
                      value={injection.dateParamName}
                      onChange={(e) => setInjection((p) => ({ ...p, dateParamName: e.target.value }))}
                    />
                    <p className="mt-1 text-[10px] text-slate-400">
                      Sends one param set to the window start (e.g. <span className="font-mono">?date=2024-01-15</span>).
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Start param name
                      </label>
                      <input
                        className="input font-mono text-sm"
                        placeholder="startDate"
                        value={injection.startParamName}
                        onChange={(e) => setInjection((p) => ({ ...p, startParamName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        End param name
                      </label>
                      <input
                        className="input font-mono text-sm"
                        placeholder="endDate"
                        value={injection.endParamName}
                        onChange={(e) => setInjection((p) => ({ ...p, endParamName: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Format
                    </label>
                    <select
                      className="input"
                      value={injection.format}
                      onChange={(e) => setInjection((p) => ({ ...p, format: e.target.value }))}
                    >
                      {TIME_FORMATS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                    {injection.format !== 'custom' && formatExample && (
                      <p className="mt-1 text-[10px] font-mono text-slate-400">{formatExample}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Location
                    </label>
                    <select
                      className="input"
                      value={injection.location}
                      onChange={(e) => setInjection((p) => ({ ...p, location: e.target.value as 'query' | 'body' }))}
                    >
                      <option value="query">Query string (?param=value)</option>
                      <option value="body">Request body (JSON)</option>
                    </select>
                  </div>
                </div>

                {injection.format === 'custom' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Custom format
                    </label>
                    <input
                      className="input font-mono text-sm"
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      value={injection.customFormat}
                      onChange={(e) => setInjection((p) => ({ ...p, customFormat: e.target.value }))}
                    />
                    <p className="mt-1 text-[10px] text-slate-400">Tokens: YYYY MM DD HH mm ss</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Timestamp strategy */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Timestamp assignment
            </label>
            <select
              className="input"
              value={timestampStrategy}
              onChange={(e) => setTimestampStrategy(e.target.value)}
            >
              {TIMESTAMP_STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {strategyDesc && <p className="mt-1.5 text-xs text-slate-400">{strategyDesc}</p>}
          </div>

          {/* Rate limiting */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Delay between requests
              <span className="ml-1.5 text-xs font-normal text-slate-400">(ms, 0 = no throttle)</span>
            </label>
            <input
              className="input"
              type="number"
              min={0}
              step={100}
              value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value))}
              placeholder="0"
            />
            {delayMs > 0 && (
              <p className="mt-1.5 text-xs text-slate-400">
                ~{Math.round((1000 / delayMs) * 10) / 10} req/sec
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={() => { setOpen(false); resetForm(); }} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createRun.isPending || pullAdapters.length === 0}
              className="btn-primary"
            >
              {createRun.isPending ? 'Starting…' : 'Start Backfill'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Cancel confirmation */}
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancelConfirm}
        title="Cancel backfill run"
        description={
          cancelTarget
            ? `Cancel the backfill run for ${
                siteMap.get(adapterMap.get(cancelTarget.adapterId)?.siteId ?? '') ?? 'this adapter'
              }? Jobs already in the queue will be skipped. Readings ingested so far are kept.`
            : ''
        }
        confirmLabel="Yes, cancel"
        danger
        loading={cancelRun.isPending}
      />
    </div>
  );
}
