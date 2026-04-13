import React from 'react';

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50];

type Props = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPage: (p: number) => void;
  onPageSize: (size: number) => void;
};

function pageRange(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  if (page > 3) pages.push('…');
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) pages.push(p);
  if (page < totalPages - 2) pages.push('…');
  pages.push(totalPages);
  return pages;
}

export function Pagination({ page, totalPages, total, pageSize, hasPrev, hasNext, onPage, onPageSize }: Props) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-1 py-3">
      {/* Left: count + page-size */}
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span>
          {start}–{end} of <span className="font-semibold text-slate-700 dark:text-slate-300">{total}</span>
        </span>
        <span className="text-slate-300 dark:text-slate-700">|</span>
        <label className="flex items-center gap-1.5">
          Rows:
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Right: page buttons */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <PagBtn onClick={() => onPage(page - 1)} disabled={!hasPrev} aria-label="Previous">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
            </svg>
          </PagBtn>

          {pageRange(page, totalPages).map((p, i) =>
            p === '…' ? (
              <span key={`el-${i}`} className="w-8 text-center text-xs text-slate-400 dark:text-slate-600 select-none">…</span>
            ) : (
              <PagBtn key={p} onClick={() => onPage(p as number)} active={p === page}>
                {p}
              </PagBtn>
            )
          )}

          <PagBtn onClick={() => onPage(page + 1)} disabled={!hasNext} aria-label="Next">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </PagBtn>
        </div>
      )}
    </div>
  );
}

function PagBtn({
  onClick,
  disabled,
  active,
  children,
  'aria-label': ariaLabel,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
  'aria-label'?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg px-1.5 text-xs font-medium transition-colors
        ${active
          ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
          : disabled
            ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
        }`}
    >
      {children}
    </button>
  );
}
