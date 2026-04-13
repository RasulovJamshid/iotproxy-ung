import { useState, useEffect } from 'react';

export function usePagination<T>(items: T[] | undefined, initialPageSize = 15) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const total = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Clamp page when items or page size change
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const start = (page - 1) * pageSize;
  const paged = items?.slice(start, start + pageSize) ?? [];

  function goTo(p: number) {
    setPage(Math.min(Math.max(1, p), totalPages));
  }

  function changePageSize(size: number) {
    setPageSize(size);
    setPage(1);
  }

  return {
    page,
    pageSize,
    totalPages,
    total,
    paged,
    goTo,
    changePageSize,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}
