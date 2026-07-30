'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SearchBar } from '@/shared/components/ui';
import { VendorTabs } from './vendor-tabs';
import { VendorDateFilter } from './vendor-date-filter';
import { useVendorDateRange } from '../hooks/use-vendor-date-range';

const OVERVIEW_PATH = '/admin/vendors';
const LOGS_PATH = '/admin/vendors/logs';

interface VendorObservabilityShellProps {
  children: ReactNode;
}

// The overview's range picker. Kept in its own component so the URL-range hook
// only runs on the overview route (the logs tab owns its own date filter).
function OverviewDateFilter() {
  const { range, setRange } = useVendorDateRange();
  return <VendorDateFilter value={range} onChange={setRange} />;
}

// The logs search sits on the tabs row (per Figma). It only writes the `search`
// URL param — the logs page reads it server-side — so it lives in the shell and
// stays put across pagination/filter changes.
function LogsSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get('search') ?? '';
  const [localSearch, setLocalSearch] = useState(currentSearch);

  useEffect(() => {
    setLocalSearch(currentSearch);
  }, [currentSearch]);

  const updateSearch = (value: string) => {
    setLocalSearch(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('search', value);
    } else {
      params.delete('search');
    }
    params.set('page', '1');
    router.replace(`?${params.toString()}`);
  };

  return (
    <SearchBar
      value={localSearch}
      onChange={updateSearch}
      onClear={() => updateSearch('')}
      placeholder="Search by request ID, endpoint or case"
      containerClassName="h-9 w-[320px]"
    />
  );
}

/**
 * Persistent chrome — the "Vendor Management" title and the Overview ⇄ API Call
 * logs tabs — shared by the two observability tabs. Because it lives in the
 * route layout it stays mounted across a tab switch, so only the content below
 * re-renders (mirrors the credits-transactions page). The vendor detail route
 * (`/vendors/<code>`) renders its own chrome, so it passes straight through.
 */
export function VendorObservabilityShell({
  children,
}: VendorObservabilityShellProps) {
  const pathname = usePathname();
  const isOverview = pathname === OVERVIEW_PATH;
  const isLogs = pathname === LOGS_PATH;

  if (!isOverview && !isLogs) {
    return <>{children}</>;
  }

  const chrome = (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-text-body">
            Vendor Management
          </h1>
          <p className="text-sm text-text-subheading">
            Track all external verification vendors in one place.
          </p>
        </div>
        {isOverview ? <OverviewDateFilter /> : null}
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <VendorTabs active={isLogs ? 'logs' : 'overview'} />
        {isLogs ? <LogsSearch /> : null}
      </div>
      <div>{children}</div>
    </>
  );

  // On the overview, a subtle wash sits behind the whole top section — from the
  // very top (title + date filter + tabs) down through the KPIs/chart — matching
  // the vendor detail page. The overview content keeps the ledger on white.
  if (isOverview) {
    return (
      <div className="relative -mx-5 -mt-5 px-5 pt-5">
        {/* Alpha baked into the stops rather than `opacity` — an `opacity` layer
            clipped by the main's rounded `overflow` renders a black corner in
            Chrome when the sidebar toggles. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(315deg, rgba(230,237,255,0.6) 0%, rgba(255,255,255,0.6) 60%)',
          }}
        />
        <div className="relative flex flex-col gap-6">{chrome}</div>
      </div>
    );
  }

  return <div className="flex flex-col gap-6">{chrome}</div>;
}
