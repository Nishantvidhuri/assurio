'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Callout, Switch } from '@/shared/components/ui';
import { useSSEEvent } from '@/shared/hooks/use-sse-event';
import { VendorKpiCard } from './vendor-kpi-card';
import { RecentAlertsPanel } from './recent-alerts-panel';
import { VendorExpensesChart } from './vendor-expenses-chart';
import { VendorsTable } from './vendors-table';
import {
  formatCountValue,
  formatInrValue,
} from '../commons/internal-vendors.constants';
import type { VendorOverviewResponse } from '../commons/internal-vendors.types';

interface VendorsOverviewProps {
  overview: VendorOverviewResponse;
}

export function VendorsOverview({ overview }: VendorsOverviewProps) {
  const router = useRouter();
  const [showComparison, setShowComparison] = useState(true);
  const [alertDismissed, setAlertDismissed] = useState(false);
  // Settings/status changes elsewhere refresh the overview live.
  useSSEEvent('vendor.updated', () => router.refresh());

  const { kpis, alerts, expenses, vendors } = overview;
  const lowBalanceVendors = alerts
    .filter((a) => a.type === 'LOW_BALANCE')
    .map((a) => a.vendorName);
  const errorVendors = alerts
    .filter((a) => a.type === 'HIGH_ERROR_RATE')
    .map((a) => a.vendorName);
  const banner =
    lowBalanceVendors.length > 0
      ? {
          subjects: lowBalanceVendors,
          tail: 'Recharge now to avoid any disruption in service.',
          lead: 'Low balance detected for',
        }
      : errorVendors.length > 0
        ? {
            subjects: errorVendors,
            tail: 'Review the affected vendors to avoid disruption in service.',
            lead: 'Elevated error rate detected for',
          }
        : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Top section — sits on the shell's gradient wash (title/tabs down
          through the KPIs + expenses); the ledger below is on white. */}
      <div className="flex flex-col gap-6">
        {banner && !alertDismissed ? (
          <Callout
            state={lowBalanceVendors.length > 0 ? 'Warning' : 'Error'}
            showAction={false}
            showCloseIcon
            onClose={() => setAlertDismissed(true)}
            multiline
            title={
              <>
                {banner.lead}{' '}
                <span className="font-semibold">
                  {banner.subjects.join(', ')}
                </span>
                . {banner.tail}
              </>
            }
          />
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[7fr_3fr]">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <VendorKpiCard
                label="Total Vendors"
                value={kpis.totalVendors.toLocaleString('en-IN')}
                highlight
              />
              <VendorKpiCard
                label="Total Vendor spend"
                animate={{
                  value: kpis.totalVendorSpendValue,
                  format: formatInrValue,
                }}
                currentValue={kpis.totalVendorSpendValue}
                previousValue={kpis.totalVendorSpendPreviousValue}
              />
              <VendorKpiCard
                label="Total API Calls"
                animate={{
                  value: kpis.totalApiCalls,
                  format: formatCountValue,
                }}
                currentValue={kpis.totalApiCalls}
                previousValue={kpis.totalApiCallsPreviousValue}
              />
            </div>

            <section className="rounded-lg border border-border-default bg-white">
              <div className="flex items-center justify-between border-b border-neutral-300 px-3 py-2.5">
                <p className="text-body-md font-medium leading-5 tracking-body-md text-text-body">
                  {expenses.metric === 'spend'
                    ? 'Vendor expenses'
                    : 'Vendor API calls'}
                </p>
                <label className="flex cursor-pointer items-center gap-2 text-caption font-medium text-text-body">
                  Comparison trends
                  <Switch
                    checked={showComparison}
                    onChange={(event) =>
                      setShowComparison(event.target.checked)
                    }
                  />
                </label>
              </div>
              <div className="px-3 pb-2.5 pt-3">
                <VendorExpensesChart
                  buckets={expenses.buckets}
                  series={expenses.series}
                  previousSeries={expenses.previousSeries}
                  metric={expenses.metric}
                  showComparison={showComparison}
                />
              </div>
            </section>
          </div>

          <RecentAlertsPanel alerts={alerts} />
        </div>
      </div>

      {/* Ledger on white — a full-bleed white panel covers the shell gradient
          from here down, matching the detail page (tables on white). */}
      <div className="-mx-5 bg-white px-5 pb-8 pt-6">
        <VendorsTable vendors={vendors} />
      </div>
    </div>
  );
}
