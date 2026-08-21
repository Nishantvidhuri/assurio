import { Suspense } from 'react';
import type { Metadata } from 'next';
import { serverApiRequest } from '@/shared/http/server-api-client';
import { ApiCallLogs } from '@/modules/internal/vendors/components/api-call-logs';
import { ApiCallLogsSkeleton } from '@/modules/internal/vendors/components/api-call-logs-skeleton';
import type { VendorCallLogResponse } from '@/modules/internal/vendors/commons/internal-vendors.types';

export const metadata: Metadata = {
  title: 'Vendor API Call Logs — Recrify',
};

type SearchParams = Record<string, string | string[] | undefined>;

const PASSTHROUGH_KEYS = [
  'search',
  'vendor',
  'method',
  'endpoint',
  'httpClass',
  'outcome',
  'capability',
  'from',
  'to',
  'sortBy',
  'sortOrder',
];

function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.join(',');
  return value;
}

async function ApiCallLogsPageContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const page = Math.max(1, parseInt(single(query.page) ?? '1', 10) || 1);
  const pageSize = Math.max(
    1,
    parseInt(single(query.pageSize) ?? '20', 10) || 20,
  );

  const parts: string[] = [`page=${page}`, `pageSize=${pageSize}`];
  for (const key of PASSTHROUGH_KEYS) {
    const value = single(query[key]);
    if (value) {
      parts.push(`${key}=${encodeURIComponent(value)}`);
    }
  }

  const response = await serverApiRequest<VendorCallLogResponse>(
    `/v1/internal/vendors/calls?${parts.join('&')}`,
    { revalidate: 0 },
  );

  return <ApiCallLogs response={response} page={page} pageSize={pageSize} />;
}

export default function ApiCallLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<ApiCallLogsSkeleton />}>
      <ApiCallLogsPageContent searchParams={searchParams} />
    </Suspense>
  );
}
