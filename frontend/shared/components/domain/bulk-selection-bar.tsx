'use client';

import type { ReactNode } from 'react';

interface BulkSelectionBarProps {
  summary: string;
  leftAction?: ReactNode;
  rightActions: ReactNode;
}

export function BulkSelectionBar({
  summary,
  leftAction,
  rightActions,
}: BulkSelectionBarProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border-default px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="text-body-sm font-medium leading-body-s tracking-body-sm text-text-body">
          {summary}
        </p>
        {leftAction ? <div className="shrink-0">{leftAction}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-4">{rightActions}</div>
    </div>
  );
}
