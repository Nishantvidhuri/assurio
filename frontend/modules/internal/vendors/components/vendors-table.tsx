'use client';

import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  type StatusVariant,
} from '@/shared/components/ui';
import { useSortParams } from '@/shared/hooks/use-sort-params';
import {
  VENDOR_STATUS_TAG,
  type VendorTagVariant,
} from '../commons/internal-vendors.constants';
import type { VendorListItem } from '../commons/internal-vendors.types';

const BILLING_LABEL: Record<VendorListItem['billingModel'], string> = {
  PREPAID: 'Prepaid',
  POSTPAID: 'Postpaid',
  INTERNAL: 'Internal',
  SUBSCRIPTION: 'Subscription',
};

// The status tag palette maps onto the RDS status-chip variants.
const STATUS_CHIP_VARIANT: Record<VendorTagVariant, StatusVariant> = {
  Default: 'Default',
  Primary: 'Primary',
  Info: 'Primary',
  Warning: 'Warning',
  Success: 'Success',
  Failure: 'Failure',
};

function dash(value: string | null): string {
  return value ?? '—';
}

interface VendorsTableProps {
  vendors: VendorListItem[];
}

export function VendorsTable({ vendors }: VendorsTableProps) {
  const router = useRouter();
  const { toggleSort, getSortOrder } = useSortParams();

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text-body">Vendors</h2>
      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHeaderCell
              type="default"
              label="Vendor"
              sortable
              sortOrder={getSortOrder('vendor')}
              onSort={() => toggleSort('vendor')}
              roundedLeft
            />
            <TableHeaderCell
              className="w-[40%]"
              type="default"
              label="Capabilities"
            />
            <TableHeaderCell
              type="default"
              label="Status"
              sortable
              sortOrder={getSortOrder('status')}
              onSort={() => toggleSort('status')}
            />
            <TableHeaderCell
              type="default"
              label="Billing"
              sortable
              sortOrder={getSortOrder('billing')}
              onSort={() => toggleSort('billing')}
            />
            <TableHeaderCell
              className="[&>div]:justify-end"
              type="number"
              label="Avl. Balance"
              sortable
              sortOrder={getSortOrder('balance')}
              onSort={() => toggleSort('balance')}
            />
            <TableHeaderCell
              className="[&>div]:justify-end"
              type="number"
              label="Spends MTD"
              sortable
              sortOrder={getSortOrder('spendMtd')}
              onSort={() => toggleSort('spendMtd')}
            />
            <TableHeaderCell
              className="[&>div]:justify-end"
              type="number"
              label="Success rate"
              sortable
              sortOrder={getSortOrder('successRate')}
              onSort={() => toggleSort('successRate')}
              roundedRight
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendors.map((vendor) => {
            const statusTag = VENDOR_STATUS_TAG[vendor.status];
            return (
              <TableRow key={vendor.code}>
                <TableCell
                  type="default"
                  value={
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/admin/vendors/${vendor.code}`,
                        )
                      }
                      className="whitespace-nowrap text-body-md font-medium leading-[22px] tracking-body-md text-text-link hover:underline"
                    >
                      {vendor.displayName}
                    </button>
                  }
                />
                <TableCell
                  className="w-[40%] whitespace-normal"
                  type="default"
                  value={vendor.capabilities.join(', ') || '—'}
                />
                <TableCell
                  type="status"
                  statusLabel={statusTag.label}
                  statusVariant={STATUS_CHIP_VARIANT[statusTag.variant]}
                />
                <TableCell
                  type="default"
                  value={BILLING_LABEL[vendor.billingModel]}
                />
                <TableCell type="number" value={dash(vendor.availableBalance)} />
                <TableCell type="number" value={dash(vendor.spendMtd)} />
                <TableCell
                  type="number"
                  value={
                    vendor.successRate != null ? `${vendor.successRate}%` : '—'
                  }
                />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
