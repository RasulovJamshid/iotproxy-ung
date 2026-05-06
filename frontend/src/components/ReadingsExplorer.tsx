import React, { useState, useMemo } from 'react';
import { useSearchReadings, useNearestReadings } from '../hooks/useReadings';
import type { SearchReadingsParams } from '../hooks/useReadings';
import { format } from 'date-fns';

interface Props {
  /** Pre-fill sensorIds filter */
  sensorIds?: string[];
  /** Pre-fill siteId filter */
  siteId?: string;
  /** Show site / sensor selector columns */
  multiSensor?: boolean;
}

const AGG_OPTIONS = ['NONE', 'AVG', 'MIN', 'MAX', 'SUM', 'COUNT'] as const;
const SORT_BY_OPTIONS = [
  { value: 'time', label: 'Time' },
  { value: 'value', label: 'Value' },
  { value: 'sensor', label: 'Sensor' },
  { value: 'quality', label: 'Quality' },
] as const;
const PAGE_SIZES = [25, 50, 100, 250];

export function ReadingsExplorer({ sensorIds: defaultSensorIds, siteId: defaultSiteId, multiSensor }: Props) {
  // ── Filter state ──────────────────────────────────────────────
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [exactTime, setExactTime] = useState('');
  const [agg, setAgg] = useState<typeof AGG_OPTIONS[number]>('NONE');
  const [intervalMin, setIntervalMin] = useState('60');
  const [aggField, setAggField] = useState('value');
  const [sortBy, setSortBy] = useState<'time' | 'value' | 'sensor' | 'quality'>('time');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  // ── Nearest-to-time mode ──────────────────────────────────────
  const [nearestMode, setNearestMode] = useState(false);
  const [nearestTs, setNearestTs] = useState('');

  // ── Build search params ───────────────────────────────────────
  const searchParams = useMemo<SearchReadingsParams>(() => {
    const p: SearchReadingsParams = {
      sensorIds: defaultSensorIds,
      siteId: defaultSiteId,
      agg,
      sortBy,
      sortDir,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      aggField: agg !== 'NONE' ? aggField : undefined,
      intervalMs: agg !== 'NONE' ? Number(intervalMin) * 60_000 : undefined,
    };
    if (startDate) {
      p.startTs = startTime
        ? new Date(`${startDate}T${startTime}`).toISOString()
        : new Date(`${startDate}T00:00:00`).toISOString();
    }
    if (endDate) {
      p.endTs = endTime
        ? new Date(`${endDate}T${endTime}`).toISOString()
        : new Date(`${endDate}T23:59:59`).toISOString();
    }
    if (exactTime) p.exactTime = exactTime;
    return p;
  }, [defaultSensorIds, defaultSiteId, startDate, startTime, endDate, endTime, exactTime, agg, intervalMin, aggField, sortBy, sortDir, pageSize, page]);

  const hasRange = !!(startDate || endDate || exactTime);
  const { data: result, isLoading, isFetching } = useSearchReadings(searchParams, hasRange && !nearestMode);

  // Nearest mode – convert datetime-local value to ISO 8601
  const nearestTarget = useMemo(() => {
    if (!nearestTs) return '';
    const d = new Date(nearestTs);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }, [nearestTs]);
  const { data: nearestResult, isLoading: nearestLoading, error: nearestError } = useNearestReadings(
    defaultSensorIds ?? [],
    nearestTarget,
    1,
    nearestMode && !!nearestTarget,
  );

  const rows = result?.data ?? [];
  const meta = result?.meta;
  const totalPages = meta ? Math.ceil(meta.total / meta.limit) : 0;

  const handleReset = () => {
    setStartDate(''); setStartTime(''); setEndDate(''); setEndTime('');
    setExactTime(''); setAgg('NONE'); setSortBy('time'); setSortDir('DESC');
    setPage(1); setNearestMode(false); setNearestTs('');
  };

  return (
    <div className="space-y-4">
      {/* ── Mode toggle ──────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setNearestMode(false); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            !nearestMode
              ? 'bg-blue-600 dark:bg-blue-500 text-white'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Range / Filter
        </button>
        <button
          onClick={() => setNearestMode(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            nearestMode
              ? 'bg-blue-600 dark:bg-blue-500 text-white'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Nearest to Time
        </button>
        <button onClick={handleReset} className="ml-auto text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          Reset
        </button>
      </div>

      {/* ── Nearest mode ─────────────────────────────────────── */}
      {nearestMode && (
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Target timestamp</label>
            <input
              type="datetime-local"
              className="input text-xs py-1.5"
              value={nearestTs}
              onChange={(e) => setNearestTs(e.target.value)}
            />
          </div>
          {nearestLoading && <span className="text-xs text-slate-400 animate-pulse">Searching…</span>}
          {nearestError && <span className="text-xs text-red-500">Error: {(nearestError as Error).message}</span>}
        </div>
      )}

      {/* ── Range / filter controls ──────────────────────────── */}
      {!nearestMode && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Start date</label>
            <input type="date" className="input text-xs py-1.5 w-full" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Start time</label>
            <input type="time" className="input text-xs py-1.5 w-full" value={startTime} onChange={(e) => setStartTime(e.target.value)} step="1" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">End date</label>
            <input type="date" className="input text-xs py-1.5 w-full" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">End time</label>
            <input type="time" className="input text-xs py-1.5 w-full" value={endTime} onChange={(e) => setEndTime(e.target.value)} step="1" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Exact clock time</label>
            <input type="text" className="input text-xs py-1.5 w-full" value={exactTime} onChange={(e) => { setExactTime(e.target.value); setPage(1); }} placeholder="e.g. 11:00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Aggregation</label>
            <select className="input text-xs py-1.5 w-full" value={agg} onChange={(e) => { setAgg(e.target.value as any); setPage(1); }}>
              {AGG_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {agg !== 'NONE' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Interval (min)</label>
                <input type="number" min="1" className="input text-xs py-1.5 w-full" value={intervalMin} onChange={(e) => setIntervalMin(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Agg field</label>
                <input type="text" className="input text-xs py-1.5 w-full" value={aggField} onChange={(e) => setAggField(e.target.value)} placeholder="value" />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sort by</label>
            <select className="input text-xs py-1.5 w-full" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              {SORT_BY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Direction</label>
            <select className="input text-xs py-1.5 w-full" value={sortDir} onChange={(e) => setSortDir(e.target.value as any)}>
              <option value="DESC">Newest first</option>
              <option value="ASC">Oldest first</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Page size</label>
            <select className="input text-xs py-1.5 w-full" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ── Prompt ───────────────────────────────────────────── */}
      {!nearestMode && !hasRange && (
        <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
          Select a start date or exact time to search readings.
        </p>
      )}

      {/* ── Nearest results ──────────────────────────────────── */}
      {nearestMode && nearestResult && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Closest readings to <span className="font-semibold text-slate-700 dark:text-slate-200">{nearestTarget}</span>
          </p>
          {nearestResult.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No readings found near that time.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    {multiSensor && <th className="table-th">Sensor</th>}
                    <th className="table-th">Time</th>
                    <th className="table-th">Data</th>
                    <th className="table-th">Quality</th>
                    <th className="table-th">Distance</th>
                  </tr>
                </thead>
                <tbody>
                  {nearestResult.data.map((r, i) => (
                    <tr key={i} className="table-row">
                      {multiSensor && <td className="table-td font-mono text-xs">{r.sensor_id.slice(0, 8)}…</td>}
                      <td className="table-td whitespace-nowrap font-mono text-xs text-slate-500 dark:text-slate-400">
                        {format(new Date(r.phenomenon_time), 'MMM d, HH:mm:ss')}
                      </td>
                      <td className="table-td font-mono text-xs">
                        {Object.entries(r.processed_data).map(([k, v]) => (
                          <span key={k} className="mr-2">
                            <span className="text-slate-400 dark:text-slate-500">{k}:</span> {String(v)}
                          </span>
                        ))}
                      </td>
                      <td className="table-td text-xs">{String(r.quality_code)}</td>
                      <td className="table-td text-xs text-slate-400">{Number(r.distance_sec).toFixed(1)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Search results ───────────────────────────────────── */}
      {!nearestMode && hasRange && (
        <>
          {/* Meta bar */}
          {meta && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{meta.total}</span> total
              </span>
              {meta.dataStart && (
                <span>
                  Data range: <span className="font-mono text-slate-600 dark:text-slate-300">{format(new Date(meta.dataStart), 'MMM d HH:mm')}</span>
                  {' — '}
                  <span className="font-mono text-slate-600 dark:text-slate-300">{meta.dataEnd ? format(new Date(meta.dataEnd), 'MMM d HH:mm') : '—'}</span>
                </span>
              )}
              {meta.fromDailySummary && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                  Showing archived daily summaries — raw data was removed by retention
                </span>
              )}
              {isFetching && <span className="animate-pulse">Loading…</span>}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No readings match your filters.</p>
          ) : agg === 'NONE' ? (
            /* ── Raw results table ──────────────────────────── */
            <RawTable rows={rows} multiSensor={multiSensor} />
          ) : (
            /* ── Aggregated results table ───────────────────── */
            <AggTable rows={rows} multiSensor={multiSensor} />
          )}

          {/* Pagination */}
          {meta && totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-1">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary py-1 px-2 text-xs disabled:opacity-40">Prev</button>
                <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="btn-secondary py-1 px-2 text-xs disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Raw results sub-table ─────────────────────────────────────────────────

function RawTable({ rows, multiSensor }: { rows: Record<string, unknown>[]; multiSensor?: boolean }) {
  const fields = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) {
      const pd = r.processed_data as Record<string, unknown> | undefined;
      if (pd) Object.keys(pd).forEach((k) => keys.add(k));
    }
    return Array.from(keys);
  }, [rows]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="table-header">
          <tr>
            {multiSensor && <th className="table-th">Sensor</th>}
            <th className="table-th whitespace-nowrap">Time</th>
            {fields.map((f) => <th key={f} className="table-th whitespace-nowrap">{f}</th>)}
            <th className="table-th">Quality</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const pd = (r.processed_data ?? {}) as Record<string, unknown>;
            return (
              <tr key={i} className="table-row">
                {multiSensor && <td className="table-td font-mono text-xs">{String(r.sensor_id ?? '').slice(0, 8)}…</td>}
                <td className="table-td whitespace-nowrap font-mono text-xs text-slate-500 dark:text-slate-400">
                  {r.phenomenon_time ? format(new Date(r.phenomenon_time as string), 'MMM d, HH:mm:ss') : '—'}
                </td>
                {fields.map((f) => (
                  <td key={f} className="table-td font-mono text-xs">
                    {pd[f] != null ? String(pd[f]) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                ))}
                <td className="table-td text-xs">{String(r.quality_code ?? '—')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Aggregated results sub-table ──────────────────────────────────────────

function AggTable({ rows, multiSensor }: { rows: Record<string, unknown>[]; multiSensor?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="table-header">
          <tr>
            {multiSensor && <th className="table-th">Sensor</th>}
            <th className="table-th whitespace-nowrap">Bucket</th>
            <th className="table-th">Avg</th>
            <th className="table-th">Min</th>
            <th className="table-th">Max</th>
            <th className="table-th">Sum</th>
            <th className="table-th">Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="table-row">
              {multiSensor && <td className="table-td font-mono text-xs">{String(r.sensor_id ?? '').slice(0, 8)}…</td>}
              <td className="table-td whitespace-nowrap font-mono text-xs text-slate-500 dark:text-slate-400">
                {r.bucket ? format(new Date(r.bucket as string), 'MMM d, HH:mm') : '—'}
              </td>
              <td className="table-td font-mono text-xs">{r.avg_val != null ? Number(r.avg_val).toFixed(3) : '—'}</td>
              <td className="table-td font-mono text-xs">{r.min_val != null ? Number(r.min_val).toFixed(3) : '—'}</td>
              <td className="table-td font-mono text-xs">{r.max_val != null ? Number(r.max_val).toFixed(3) : '—'}</td>
              <td className="table-td font-mono text-xs">{r.sum_val != null ? Number(r.sum_val).toFixed(3) : '—'}</td>
              <td className="table-td font-mono text-xs">{r.sample_count != null ? String(r.sample_count) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
