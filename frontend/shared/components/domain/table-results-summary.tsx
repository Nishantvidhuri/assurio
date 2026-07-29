'use client';

interface TableResultsSummaryProps {
  visibleCount: number;
  pageSize: number;
  totalItems: number;
}

export function TableResultsSummary({
  visibleCount,
  pageSize,
  totalItems,
}: TableResultsSummaryProps) {
  return (
    <p className="text-body-sm font-medium leading-body-s tracking-body-sm text-text-body">
      Showing <span className="text-text-body">{Math.min(visibleCount, pageSize)}</span>{' '}
      out of <span className="text-text-body">{totalItems}</span>
    </p>
  );
}
