import React, { useEffect, useState } from 'react';

interface Props {
  status?: number;
  message?: string;
  onRetry?: () => void;
}

export default function ServerErrorPage({ status, message, onRetry }: Props) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    setCountdown(5);
    const tick = setInterval(() => {
      setCountdown((c: number) => (c <= 1 ? 5 : c - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="card w-full max-w-2xl text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-7 w-7">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Server Issue</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Service temporarily unavailable</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">
          We couldn’t connect to the backend right now. Please retry in a moment.
          {status ? ` (HTTP ${status})` : ''}
        </p>
        {message && <p className="mx-auto mt-2 max-w-xl text-xs text-slate-400 dark:text-slate-500">{message}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onRetry ?? (() => window.location.reload())}
            className="btn-primary"
          >
            Retry Connection
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-secondary"
          >
            Reload App
          </button>
        </div>
        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
          Auto-retrying in <span className="tabular-nums font-semibold text-slate-500 dark:text-slate-400">{countdown}s</span>…
        </p>
      </div>
    </div>
  );
}
