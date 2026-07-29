'use client';

import Image from 'next/image';
import noFilteredDataImage from '@/public/assets/empty-states/no-filtered-data.jpg';

interface EmptyFiltersStateProps {
  /** Optional title override (defaults to "No results found") */
  title?: string;
  /** Optional description override */
  description?: string;
  /** Optional className for the wrapper */
  className?: string;
}

/**
 * Empty state shown in tables when filters are applied but return zero results.
 *
 * @example
 * ```tsx
 * {hasActiveFilters && candidates.length === 0 ? (
 *   <EmptyFiltersState />
 * ) : (
 *   <Table>...</Table>
 * )}
 * ```
 */
export function EmptyFiltersState({
  title = 'No results found',
  description = "Looks like this filter didn't return any results. Try changing the filters or removing them to view data.",
  className,
}: EmptyFiltersStateProps) {
  return (
    <div
      className={
        className ??
        'flex h-[calc(100vh-300px)] flex-col items-center justify-center'
      }
    >
      <Image
        src={noFilteredDataImage}
        alt="No results"
        width={255}
        height={107}
      />
      <p className="mt-4 text-body-lg font-semibold text-text-heading">
        {title}
      </p>
      <p className="mt-1 max-w-[320px] text-center text-body-sm font-normal text-text-subheading">
        {description}
      </p>
    </div>
  );
}
