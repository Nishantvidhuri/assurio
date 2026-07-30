'use client';

import { useRouter } from 'next/navigation';
import { Tag } from '@/shared/components/ui';
import { DashboardEmptyState } from '@/modules/client/dashboard/components/dashboard-empty-state';
import { formatCompactRelativeTime } from '@/shared/utils/relative-time';
import type { VendorAlert } from '../commons/internal-vendors.types';

interface RecentAlertsPanelProps {
  alerts: VendorAlert[];
}

export function RecentAlertsPanel({ alerts }: RecentAlertsPanelProps) {
  const router = useRouter();

  return (
    <div className="flex h-full flex-col gap-3.5 rounded-md border border-border-default bg-white px-5 pb-5 pt-4">
      <h3 className="text-base font-semibold leading-6 text-text-body">
        Recent Alerts &amp; Errors
      </h3>

      {alerts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <DashboardEmptyState
            title="No active vendor alerts"
            description="All vendors are healthy — no low balance or elevated error-rate alerts right now."
            minHeight={0}
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <button
                type="button"
                onClick={() =>
                  router.push(`/admin/vendors/${alert.vendorCode}`)
                }
                className="flex w-full flex-col gap-0.5 bg-transparent p-0 text-left"
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-sm font-medium text-text-body">
                    {alert.vendorName}
                  </span>
                  <Tag
                    variant={
                      alert.type === 'LOW_BALANCE' ? 'Warning' : 'Failure'
                    }
                    label={
                      alert.type === 'LOW_BALANCE' ? 'Low balance' : 'Error'
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-text-subheading">
                  <span>{alert.message}</span>
                  {alert.at ? (
                    <>
                      <span className="size-1 shrink-0 rounded-full bg-current" />
                      <span className="whitespace-nowrap">
                        {formatCompactRelativeTime(alert.at)}
                      </span>
                    </>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
