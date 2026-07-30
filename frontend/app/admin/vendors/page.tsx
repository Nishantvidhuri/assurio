import { Suspense } from 'react';
import type { Metadata } from 'next';
import { serverApiRequest } from '@/shared/http/server-api-client';
import { VendorsOverview } from '@/modules/internal/vendors/components/vendors-overview';
import { VendorsOverviewSkeleton } from '@/modules/internal/vendors/components/vendors-overview-skeleton';
import type { VendorOverviewResponse } from '@/modules/internal/vendors/commons/internal-vendors.types';

export const metadata: Metadata = {
  title: 'Vendor Management — Assurio',
};

interface SearchParams {
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: string;
}

interface PageProps {
  searchParams: Promise<SearchParams>;
}

// Maps the client `dateFrom`/`dateTo` params onto the analytics endpoint's
// `from`/`to` (absent → the backend's last-30-days default), and passes the
// vendors-ledger sort through untouched.
function buildOverviewQuery(query: SearchParams): string {
  const params = new URLSearchParams();
  if (query.dateFrom) params.set('from', query.dateFrom);
  if (query.dateTo) params.set('to', query.dateTo);
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortOrder) params.set('sortOrder', query.sortOrder);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function VendorsOverviewPageContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;

  const overview = await serverApiRequest<VendorOverviewResponse>(
    `/v1/internal/vendors/overview${buildOverviewQuery(query)}`,
    { revalidate: 0 },
  );

  return <VendorsOverview overview={overview} />;
}

export default function VendorsPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<VendorsOverviewSkeleton />}>
      <VendorsOverviewPageContent searchParams={searchParams} />
    </Suspense>
  );
}
