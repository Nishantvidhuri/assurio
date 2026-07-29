import type {
  BillingTransaction,
  BillingTransactionListResponse,
  CreateTransactionsExportResponse,
  TransactionsExportUrlResponse,
} from '@/modules/client/billing/commons/client-billing.types';
import type { CurrencyCode } from '@/modules/internal/clients/commons/internal-clients.types';

export interface CreditsBalanceListItem {
  id: string;
  legalName: string;
  brandName: string | null;
  isActive: boolean;
  creditsBalance: string;
  creditsCurrencyCode: CurrencyCode;
  lastRecharge: { amount: string; postedAt: string } | null;
}

export interface CreditsBalanceListResponse {
  data: CreditsBalanceListItem[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

/**
 * One postpaid client's unpaid position. All amounts are GST-inclusive rupee
 * decimal strings (the postpaid book has no credits).
 */
export interface PostpaidOutstandingListItem {
  id: string;
  legalName: string;
  brandName: string | null;
  isActive: boolean;
  /** Consumption completed this month, not yet invoiced. */
  billingForThisMonth: string;
  /** Invoiced but unpaid. */
  outstanding: string;
  /** Outstanding + everything not yet invoiced. */
  totalDue: string;
  dueInvoicesCount: number;
  oldestDueAt: string | null;
  isOverdue: boolean;
}

export interface PostpaidOutstandingListResponse {
  data: PostpaidOutstandingListItem[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  /** Rollup across every row the filters matched, not just this page. */
  summary: {
    clientCount: number;
    billingForThisMonth: string;
    outstanding: string;
    totalDue: string;
    overdueClientCount: number;
  };
}

export interface CrossOrgTransaction extends BillingTransaction {
  organization: {
    id: string;
    legalName: string;
    brandName: string | null;
  };
}

export interface CrossOrgTransactionListResponse
  extends Omit<BillingTransactionListResponse, 'data'> {
  data: CrossOrgTransaction[];
}

export interface ClientFilterOption {
  id: string;
  legalName: string;
  brandName: string | null;
}

export interface ClientFilterListResponse {
  data: ClientFilterOption[];
}

export interface CreateCrossOrgTransactionsExportPayload {
  from: string;
  to: string;
  search?: string;
  organizationIds?: string[];
  type?: string[];
  status?: string[];
}

export type {
  CreateTransactionsExportResponse,
  TransactionsExportUrlResponse,
};
