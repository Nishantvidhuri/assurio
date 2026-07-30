import { IsDateString, IsIn, IsOptional } from 'class-validator';

export const VENDOR_RANGE_VALUES = ['7d', '30d', '90d'] as const;
export type VendorRange = (typeof VENDOR_RANGE_VALUES)[number];

// Sortable columns of the vendors ledger (overview table).
export const VENDOR_LEDGER_SORT_FIELDS = [
  'vendor',
  'status',
  'billing',
  'balance',
  'spendMtd',
  'successRate',
] as const;
export type VendorLedgerSortField = (typeof VENDOR_LEDGER_SORT_FIELDS)[number];

/**
 * Shared time-window selector for the Vendor Management analytics surfaces
 * (overview KPIs, expenses trend, per-vendor health). `range` is the
 * "Last N days" preset; explicit `from`/`to` override it for custom windows.
 */
export class VendorAnalyticsQueryDto {
  @IsOptional()
  @IsIn(VENDOR_RANGE_VALUES)
  range?: VendorRange = '30d';

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  // Vendors-ledger sort (overview table). Independent of the date filter.
  @IsOptional()
  @IsIn(VENDOR_LEDGER_SORT_FIELDS)
  sortBy?: VendorLedgerSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
