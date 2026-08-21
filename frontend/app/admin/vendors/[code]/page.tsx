import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { serverApiRequest } from '@/shared/http/server-api-client';
import { VendorDetail } from '@/modules/internal/vendors/components/vendor-detail';
import { VendorDetailSkeleton } from '@/modules/internal/vendors/components/vendor-detail-skeleton';
import type {
  VendorCode,
  VendorDetailResponse,
  VendorHealthResponse,
} from '@/modules/internal/vendors/commons/internal-vendors.types';

export const metadata: Metadata = {
  title: 'Vendor Detail — Recrify',
};

const VALID_CODES = new Set<VendorCode>([
  'SUREPASS',
  'KONNECTNXT',
  'IN_HOUSE_OCR',
]);

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ dateFrom?: string; dateTo?: string }>;
}

async function VendorDetailPageContent({ params, searchParams }: PageProps) {
  const { code } = await params;
  if (!VALID_CODES.has(code as VendorCode)) {
    notFound();
  }
  const vendorCode = code as VendorCode;

  // Client `dateFrom`/`dateTo` → analytics `from`/`to`; absent falls back to
  // the backend's last-30-days default (matches the picker default).
  const query = await searchParams;
  const params2 = new URLSearchParams();
  if (query.dateFrom) params2.set('from', query.dateFrom);
  if (query.dateTo) params2.set('to', query.dateTo);
  const qs = params2.toString();
  const suffix = qs ? `?${qs}` : '';

  const [detail, health] = await Promise.all([
    serverApiRequest<VendorDetailResponse>(
      `/v1/internal/vendors/${vendorCode}${suffix}`,
      { revalidate: 0 },
    ),
    serverApiRequest<VendorHealthResponse>(
      `/v1/internal/vendors/${vendorCode}/health${suffix}`,
      { revalidate: 0 },
    ),
  ]);

  return <VendorDetail detail={detail} health={health} />;
}

export default function VendorDetailPage({ params, searchParams }: PageProps) {
  return (
    <Suspense fallback={<VendorDetailSkeleton />}>
      <VendorDetailPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
