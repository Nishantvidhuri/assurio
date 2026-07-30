'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react';
import { Button, Tag } from '@/shared/components/ui';
import { useSSEEvent } from '@/shared/hooks/use-sse-event';
import { VendorKpiCard } from './vendor-kpi-card';
import { VendorDateFilter } from './vendor-date-filter';
import { VendorHealthSection } from './vendor-health-section';
import { VendorCapabilitiesTable } from './vendor-capabilities-table';
import { VendorRecentLogs } from './vendor-recent-logs';
import { VendorSettingsModal } from './vendor-settings-modal';
import { useVendorDateRange } from '../hooks/use-vendor-date-range';
import {
  VENDOR_STATUS_TAG,
  formatCountValue,
  formatInrValue,
} from '../commons/internal-vendors.constants';
import type {
  VendorDetailResponse,
  VendorHealthResponse,
  VendorSettings,
} from '../commons/internal-vendors.types';

interface VendorDetailProps {
  detail: VendorDetailResponse;
  health: VendorHealthResponse;
}

export function VendorDetail({ detail, health }: VendorDetailProps) {
  const router = useRouter();
  const { range, setRange } = useVendorDateRange();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<VendorSettings>(
    detail.vendor.settings,
  );

  useSSEEvent('vendor.updated', () => router.refresh());

  const { vendor, kpis } = detail;
  const statusTag = VENDOR_STATUS_TAG[vendor.status];

  return (
    <div className="flex flex-col gap-6">
      {/* Subtle diagonal wash behind the whole top section (header + KPIs +
          health) — full-bleed to the content edges and up to the very top. It
          spans the full page height; the capabilities/logs panel below sits on
          white and covers the wash, so it never leaves an exposed edge. */}
      <div className="relative -mx-5 -mt-5 px-5 pt-5">
        {/* Alpha is baked into the gradient stops rather than set via `opacity`
            so this stays a plain paint layer. An `opacity` layer clipped by the
            main's rounded `overflow` renders a black corner in Chrome when the
            sidebar toggles and the area re-composites. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(315deg, rgba(230,237,255,0.6) 0%, rgba(255,255,255,0.6) 60%)',
          }}
        />
        <div className="relative flex flex-col gap-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/admin/vendors"
                aria-label="Back to vendors"
                className="inline-flex items-center justify-center text-text-body transition-colors hover:text-text-subheading"
              >
                <ArrowLeft className="size-5" />
              </Link>
              <h1 className="text-2xl font-semibold text-text-body">
                {vendor.displayName}
              </h1>
              <Tag variant={statusTag.variant} label={statusTag.label} />
            </div>
            <div className="flex items-center gap-3">
              <VendorDateFilter value={range} onChange={setRange} />
              <Button
                variant="secondary"
                leftIcon={<SettingsIcon className="size-4" />}
                onClick={() => setSettingsOpen(true)}
              >
                Settings
              </Button>
            </div>
          </header>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <VendorKpiCard
              label="Available Balance"
              value={kpis.availableBalance ?? '—'}
              subtext={kpis.availableBalanceRunway}
              highlight
            />
            <VendorKpiCard
              label="Spends"
              animate={{ value: kpis.spendValue, format: formatInrValue }}
              currentValue={kpis.spendValue}
              previousValue={kpis.spendPreviousValue}
            />
            <VendorKpiCard
              label="Success Rate"
              value="—"
              // Tween ×10 so the integer-rounding hook preserves the one decimal.
              animate={
                kpis.successRatePct != null
                  ? {
                      value: kpis.successRatePct * 10,
                      format: (n) => `${(n / 10).toFixed(1)}%`,
                    }
                  : undefined
              }
              currentValue={kpis.successRatePct}
              previousValue={kpis.successRatePreviousValue}
            />
            <VendorKpiCard
              label="Total API Calls"
              animate={{ value: kpis.totalApiCalls, format: formatCountValue }}
              currentValue={kpis.totalApiCalls}
              previousValue={kpis.totalApiCallsPreviousValue}
            />
          </div>

          <VendorHealthSection health={health} />

          {/* Capabilities / API logs on white — a full-bleed white panel covers
              the wash below the top section. The flex gap above it reads as a
              gradient band, and pt-6 matches it (same as the overview ledger). */}
          <div className="-mx-5 bg-white px-5 pb-8 pt-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[60fr_40fr]">
              <VendorCapabilitiesTable capabilities={detail.capabilities} />
              <VendorRecentLogs code={vendor.code} calls={detail.recentCalls} />
            </div>
          </div>
        </div>
      </div>

      <VendorSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        code={vendor.code}
        billingModel={vendor.billingModel}
        settings={settings}
        onSaved={(updated) => {
          setSettings(updated);
          router.refresh();
        }}
      />
    </div>
  );
}
