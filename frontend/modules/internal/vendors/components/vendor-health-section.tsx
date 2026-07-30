'use client';

import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { ReactECharts } from '@/modules/client/dashboard/components/echarts-client';
import { Divider } from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
import { DeltaBadge } from './delta-badge';
import { formatLatency } from '../commons/internal-vendors.constants';
import type { VendorHealthResponse } from '../commons/internal-vendors.types';

const GRID_LINE_COLOR = '#EDF1F7';
const SUCCESS_COLOR = '#22C55E';
const FAILED_COLOR = '#EF4444';
const ACCENT_COLOR = '#4B67D1';

type LeftMetric = 'calls' | 'latency';

function formatDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function baseAxes(labels: string[], yName: string): EChartsOption {
  return {
    grid: { top: 36, right: 24, bottom: 44, left: 58, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: labels,
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
      splitLine: { lineStyle: { color: GRID_LINE_COLOR } },
      axisLabel: { color: '#6D7583', fontSize: 11 },
      // Rotated title down the left side of the axis (matches Figma).
      name: yName,
      nameLocation: 'middle',
      nameRotate: 90,
      nameGap: 46,
      nameTextStyle: { color: '#6D7583', fontSize: 11 },
    },
  };
}

interface StatTabProps {
  label: string;
  value: string;
  /** Muted note shown beside the value, e.g. the success/failed breakdown. */
  note?: string;
  currentValue?: number | null;
  previousValue?: number | null;
  active?: boolean;
  onClick?: () => void;
}

function StatTab({
  label,
  value,
  note,
  currentValue,
  previousValue,
  active,
  onClick,
}: StatTabProps) {
  const content = (
    <>
      <span className="text-sm font-medium text-text-body">{label}</span>
      <span className="flex items-center gap-2">
        <span className="flex items-baseline gap-1">
          <span className="text-xl font-semibold text-text-heading">
            {value}
          </span>
          {note ? (
            <span className="text-sm font-medium text-text-body">{note}</span>
          ) : null}
        </span>
        <DeltaBadge currentValue={currentValue} previousValue={previousValue} />
      </span>
    </>
  );

  // The uptime header isn't a tab (no onClick) — render it as a plain block so
  // it has no pointer cursor or button interactivity.
  if (!onClick) {
    return <div className="flex flex-col gap-1 p-4 text-left">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 cursor-pointer flex-col gap-1 border-b-2 p-4 text-left transition-colors',
        active
          ? 'border-primary bg-neutral-200'
          : 'border-transparent hover:bg-neutral-100',
      )}
    >
      {content}
    </button>
  );
}

// Left-hand legend beside the calls chart — success/failed totals with their
// share of all calls (matches the Figma health card).
function CallsLegend({
  success,
  failed,
  total,
}: {
  success: number;
  failed: number;
  total: number;
}) {
  const pct = (value: number) =>
    total > 0 ? Math.round((value / total) * 100) : 0;
  const rows = [
    { label: 'Success', color: SUCCESS_COLOR, value: success },
    { label: 'Failed', color: FAILED_COLOR, value: failed },
  ];
  return (
    <div className="flex w-[150px] shrink-0 flex-col items-center justify-center">
      <div className="flex flex-col items-start gap-6">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col items-start gap-1">
            <span className="flex items-center gap-2 text-sm font-medium text-text-subheading">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              {row.label}
            </span>
            <span className="text-xl font-semibold text-text-body">
              {row.value.toLocaleString('en-IN')}
              <span className="ml-1 text-sm font-medium text-text-subheading">
                ({pct(row.value)}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface VendorHealthSectionProps {
  health: VendorHealthResponse;
}

export function VendorHealthSection({ health }: VendorHealthSectionProps) {
  const [leftMetric, setLeftMetric] = useState<LeftMetric>('calls');
  const labels = useMemo(
    () => health.points.map((point) => formatDayLabel(point.date)),
    [health.points],
  );

  const leftOption = useMemo<EChartsOption>(() => {
    if (leftMetric === 'latency') {
      return {
        ...baseAxes(labels, 'ms'),
        series: [
          {
            name: 'Latency (p95)',
            type: 'line',
            smooth: false,
            // Days with no calls have null latency; bridge them so the trend
            // reads as one continuous line instead of fragmenting into
            // disconnected segments / lone floating dots.
            connectNulls: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { color: ACCENT_COLOR, width: 2 },
            itemStyle: { color: ACCENT_COLOR },
            data: health.points.map((point) => point.p95LatencyMs),
          },
        ],
      };
    }
    return {
      // Success/failed totals render as a dedicated left-hand legend, so the
      // chart itself carries no built-in legend.
      ...baseAxes(labels, 'Calls'),
      series: [
        {
          name: 'Success',
          type: 'line',
          smooth: false,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: SUCCESS_COLOR, width: 2 },
          itemStyle: { color: SUCCESS_COLOR },
          data: health.points.map((point) => point.success),
        },
        {
          name: 'Failed',
          type: 'line',
          smooth: false,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: FAILED_COLOR, width: 2 },
          itemStyle: { color: FAILED_COLOR },
          data: health.points.map((point) => point.failed),
        },
      ],
    };
  }, [leftMetric, labels, health.points]);

  const uptimeOption = useMemo<EChartsOption>(() => {
    return {
      ...baseAxes(labels, '%'),
      yAxis: {
        ...(baseAxes(labels, '%').yAxis as object),
        max: 100,
      },
      series: [
        {
          name: 'Uptime',
          type: 'line',
          smooth: true,
          // Uptime is null on days with no calls; connect across them so the
          // area stays one continuous band rather than breaking into
          // disconnected humps with a trailing floating dot.
          connectNulls: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: ACCENT_COLOR, width: 2 },
          itemStyle: { color: ACCENT_COLOR },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(75,103,209,0.35)' },
                { offset: 1, color: 'rgba(75,103,209,0.02)' },
              ],
            },
          },
          data: health.points.map((point) => point.uptimePct),
        },
      ],
    };
  }, [labels, health.points]);

  const { summary, summaryPrevious } = health;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text-body">Health</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[60fr_40fr]">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border-default bg-white">
          <div className="flex items-stretch border-b border-border-default">
            <StatTab
              label="Total calls (success + failed)"
              value={summary.totalCalls.toLocaleString('en-IN')}
              currentValue={summary.totalCalls}
              previousValue={summaryPrevious.totalCalls}
              active={leftMetric === 'calls'}
              onClick={() => setLeftMetric('calls')}
            />
            <Divider orientation="Vertical" className="self-stretch" />
            <StatTab
              label="Latency (p95)"
              value={formatLatency(summary.p95LatencyMs)}
              currentValue={summary.p95LatencyMs}
              previousValue={summaryPrevious.p95LatencyMs}
              active={leftMetric === 'latency'}
              onClick={() => setLeftMetric('latency')}
            />
          </div>
          <div className="flex gap-4 px-5 pb-3 pt-4">
            {leftMetric === 'calls' ? (
              <CallsLegend
                success={summary.success}
                failed={summary.failed}
                total={summary.totalCalls}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              {/* Remount on tab change so ECharts re-measures — the legend
                  appears/disappears, changing the chart's width, and
                  echarts-for-react only auto-resizes on window resize. */}
              <ReactECharts
                key={leftMetric}
                option={leftOption}
                style={{ width: '100%', height: 300 }}
                opts={{ renderer: 'svg' }}
                notMerge
                lazyUpdate
              />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border-default bg-white">
          <div className="border-b border-border-default">
            <StatTab
              label="Uptime"
              value={summary.uptimePct != null ? `${summary.uptimePct}%` : '—'}
              currentValue={summary.uptimePct}
              previousValue={summaryPrevious.uptimePct}
            />
          </div>
          <div className="px-5 pb-3 pt-4">
            <ReactECharts
              option={uptimeOption}
              style={{ width: '100%', height: 300 }}
              opts={{ renderer: 'svg' }}
              notMerge
              lazyUpdate
            />
          </div>
        </div>
      </div>
    </section>
  );
}
