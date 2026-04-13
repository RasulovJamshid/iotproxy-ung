import React from 'react';
import { useHealth } from '../hooks/useHealth';

function StatusDot({ status }: { status: string }) {
  const ok = status === 'ok';
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
  );
}

function CheckRow({ label, status, detail }: { label: string; status: string; detail?: string }) {
  return (
    <div className="hover-lift flex items-center justify-between rounded-xl border border-transparent py-3 last:border-0 hover:border-slate-100 dark:hover:border-slate-800 hover:bg-white/70 dark:hover:bg-slate-800/50 hover:px-3">
      <div className="flex items-center gap-3">
        <StatusDot status={status} />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      </div>
      <div className="flex items-center gap-3 text-right">
        {detail && <span className="text-xs text-slate-400 dark:text-slate-500">{detail}</span>}
        <span className={`text-xs font-semibold ${status === 'ok' ? 'text-green-600 dark:text-green-400' : status === 'degraded' ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
          {status.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

export default function HealthPage() {
  const { data, isLoading, error, dataUpdatedAt } = useHealth();

  return (
    <div className="max-w-3xl space-y-6">
      {/* Overall status */}
      <div className={`card relative overflow-hidden border-2 ${
        !data ? 'border-slate-200 dark:border-slate-800' :
        data.status === 'ok' ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20' :
        'border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-900/20'
      }`}>
        <div className="pointer-events-none absolute -top-10 right-10 h-28 w-28 rounded-full bg-white/50 dark:bg-white/5 blur-2xl" />
        <div className="flex items-center justify-between z-10 relative">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">System Status</p>
            {isLoading && <p className="mt-1 text-2xl font-bold text-slate-400 dark:text-slate-500">Checking…</p>}
            {error && <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-500">Unreachable</p>}
            {data && (
              <p className={`mt-1 text-2xl font-bold ${data.status === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-yellow-700 dark:text-yellow-400'}`}>
                {data.status === 'ok' ? 'All Systems Operational' : 'Degraded'}
              </p>
            )}
          </div>
          {data && (
            <span className={`flex h-12 w-12 items-center justify-center rounded-full ${data.status === 'ok' ? 'bg-green-100 dark:bg-green-900/40' : 'bg-yellow-100 dark:bg-yellow-900/40'}`}>
              {data.status === 'ok' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-6 h-6 text-green-600 dark:text-green-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-6 h-6 text-yellow-600 dark:text-yellow-400">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              )}
            </span>
          )}
        </div>
        {dataUpdatedAt > 0 && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 z-10 relative">
            Last checked {new Date(dataUpdatedAt).toLocaleTimeString()} · auto-refreshes every 15s
          </p>
        )}
      </div>

      {/* Individual checks */}
      {data && (
        <div className="card border dark:border-slate-800">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Checks</p>
            <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 px-2.5 py-1 text-[11px] text-slate-500 dark:text-slate-400">Auto refresh: 15s</span>
          </div>
          <CheckRow
            label="Database (TimescaleDB)"
            status={data.checks.database}
            detail={data.checks.database_latency_ms != null ? `${data.checks.database_latency_ms}ms` : undefined}
          />
          <CheckRow label="Redis" status={data.checks.redis} />
          <CheckRow
            label="Ingest Queue"
            status={data.checks.queue_depth.status}
            detail={`${data.checks.queue_depth.depth.toLocaleString()} jobs waiting`}
          />
        </div>
      )}

      {error && (
        <div className="card border border-red-200 dark:border-red-900/50 bg-red-50/90 dark:bg-red-900/10">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">Cannot reach backend</p>
          <p className="mt-1 text-xs text-red-500 dark:text-red-500/80">
            The health endpoint is not responding. Check that the backend container is running.
          </p>
        </div>
      )}
    </div>
  );
}
