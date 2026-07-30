'use client';

import Image from 'next/image';
import noDataImage from '@/public/assets/client-dashboard/no-data.png';

interface DashboardEmptyStateProps {
  title: string;
  description: string;
  /** Minimum height so empty state fills a chart card without collapsing. */
  minHeight?: number;
}

/**
 * Shared empty-state block used by the trend chart, distribution chart, and
 * insufficiencies panel. Uses the Figma empty-state illustration
 * (public/assets/client-dashboard/no-data.png).
 */
export function DashboardEmptyState({
  title,
  description,
  minHeight = 280,
}: DashboardEmptyStateProps) {
  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-5 px-4 py-10 text-center"
      style={{ minHeight }}
    >
      <Image
        src={noDataImage}
        alt=""
        priority={false}
        sizes="184px"
        className="h-[123px] w-[184px] object-contain"
      />
      <div className="flex flex-col items-center gap-1">
        <p className="text-base font-semibold text-text-body">{title}</p>
        <p className="max-w-[275px] text-body-md font-normal text-text-subheading">
          {description}
        </p>
      </div>
    </div>
  );
}
