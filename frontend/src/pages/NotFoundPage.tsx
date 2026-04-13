import React from 'react';
import { Link } from 'react-router-dom';

const quickLinks = [
  { to: '/sites', label: 'Sites' },
  { to: '/sensors', label: 'Sensors' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/health', label: 'Health' },
];

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="card w-full max-w-2xl text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-7 w-7">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 115.82 1c0 2-3 2-3 4" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">404 Error</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Page not found</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">
          The page you requested does not exist or may have been moved.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/" className="btn-primary">
            Go to Dashboard
          </Link>
          <button type="button" onClick={() => window.history.back()} className="btn-secondary">
            Go Back
          </button>
        </div>

        <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Quick links</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {quickLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
