'use client';

import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { ReactECharts } from '@/modules/client/dashboard/components/echarts-client';
import { VENDOR_SERIES_COLORS } from '../commons/internal-vendors.constants';
import type { VendorExpensesSeries } from '../commons/internal-vendors.types';

const GRID_LINE_COLOR = '#EDF1F7';

function formatDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

interface VendorExpensesChartProps {
  buckets: string[];
  series: VendorExpensesSeries[];
  previousSeries: VendorExpensesSeries[];
  metric: 'calls' | 'spend';
  showComparison: boolean;
}

export function VendorExpensesChart({
  buckets,
  series,
  previousSeries,
  metric,
  showComparison,
}: VendorExpensesChartProps) {
  const hasData = series.some((s) => s.data.some((value) => value > 0));

  const option = useMemo<EChartsOption>(() => {
    const currentSeries = series.map((s) => ({
      name: s.vendorName,
      type: 'line' as const,
      smooth: false,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: {
        color: VENDOR_SERIES_COLORS[s.vendorCode] ?? '#4B67D1',
        width: 2,
      },
      itemStyle: { color: VENDOR_SERIES_COLORS[s.vendorCode] ?? '#4B67D1' },
      data: s.data,
    }));
    // Prior-period overlay: same colours, dashed + dimmed, aligned by day index.
    const comparisonSeries = showComparison
      ? previousSeries.map((s) => ({
          name: `${s.vendorName} (prev)`,
          type: 'line' as const,
          smooth: false,
          symbol: 'none',
          lineStyle: {
            color: VENDOR_SERIES_COLORS[s.vendorCode] ?? '#4B67D1',
            width: 1.5,
            type: 'dashed' as const,
            opacity: 0.55,
          },
          itemStyle: {
            color: VENDOR_SERIES_COLORS[s.vendorCode] ?? '#4B67D1',
            opacity: 0.55,
          },
          data: s.data,
        }))
      : [];

    return {
      grid: { top: 36, right: 24, bottom: 56, left: 54, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        textStyle: { color: '#374150', fontSize: 12 },
      },
      legend: {
        show: true,
        bottom: 0,
        itemWidth: 12,
        itemHeight: 8,
        textStyle: { fontSize: 11, color: '#374150' },
      },
      xAxis: {
        type: 'category',
        data: buckets.map(formatDayLabel),
        axisLine: { lineStyle: { color: GRID_LINE_COLOR } },
        axisTick: { show: false },
        axisLabel: { color: '#6D7583', fontSize: 11 },
        name: 'Date',
        nameLocation: 'middle',
        nameGap: 32,
        nameTextStyle: { color: '#6D7583', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: GRID_LINE_COLOR } },
        axisLabel: { color: '#6D7583', fontSize: 11 },
        // Rotated title down the left side of the axis (matches Figma).
        name: metric === 'spend' ? 'Spend (₹)' : 'Calls',
        nameLocation: 'middle',
        nameRotate: 90,
        nameGap: 40,
        nameTextStyle: { color: '#6D7583', fontSize: 11 },
      },
      series: [...currentSeries, ...comparisonSeries],
    };
  }, [buckets, series, previousSeries, metric, showComparison]);

  if (!hasData) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-text-disabled">
        No API call activity in this period.
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={{ width: '100%', height: 320 }}
      opts={{ renderer: 'svg' }}
      notMerge
      lazyUpdate
    />
  );
}
