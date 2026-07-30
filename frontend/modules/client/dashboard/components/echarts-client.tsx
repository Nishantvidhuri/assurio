'use client';

import dynamic from 'next/dynamic';

/**
 * Dynamic-only (no SSR) import of echarts-for-react. Loaded by dashboard
 * chart wrappers so the ECharts bundle is code-split out of the initial
 * route payload.
 */
export const ReactECharts = dynamic(() => import('echarts-for-react'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[272px] items-center justify-center text-caption text-text-disabled">
      Loading chart…
    </div>
  ),
});
