import type { BulkSelectionRequest } from '@/shared/commons/bulk-selection.types';

export type AdditionalChargeDecisionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'AUTO_REJECTED';
export type AdditionalChargeTab = 'PENDING' | 'COMPLETED';
export type AdditionalChargeSortBy =
  | 'candidateName'
  | 'requestedByDisplayName'
  | 'checkDisplayName'
  | 'amount'
  | 'requestedAt'
  | 'decidedAt'
  | 'decidedByDisplayName'
  | 'status';

export interface AdditionalChargeApprovalListItem {
  id: string;
  candidateCaseId: string;
  candidateCaseCheckId: string;
  caseReference: string;
  candidateName: string;
  requestedByDisplayName: string;
  backgroundCheck: string;
  checkInstanceLabel: string;
  amount: string;
  currencyCode: string;
  status: AdditionalChargeDecisionStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedByUserId: string | null;
  decidedByDisplayName: string | null;
  // Optional proof PDF attached by internal when the charge was raised.
  documentId: string | null;
  documentName: string | null;
}

export interface AdditionalChargeApprovalListResponse {
  data: AdditionalChargeApprovalListItem[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    selectableTotalItems: number;
    totalPages: number;
  };
}

export interface BulkApproveAdditionalChargesPreview {
  selectedCount: number;
  actionableCount: number;
  skippedCount: number;
  totalAmount: string;
  // Null for postpaid orgs — approvals accrue to the monthly invoice and are
  // never balance-gated (canAfford is always true).
  availableBalance: string | null;
  canAfford: boolean;
  shortfallAmount: string;
}

export interface BulkAdditionalChargesDecisionResult {
  processedIds: string[];
  skippedIds: string[];
  processedCount: number;
  skippedCount: number;
}

export interface AdditionalChargeAutoApprovalSummary {
  enabled: boolean;
  thresholdAmount: string;
  lastChangedAt: string | null;
  lastChangedByName: string | null;
  lastChangedByEmail: string | null;
  lastChangedByRole: string | null;
}

export interface ListAdditionalChargesQuery {
  page?: number;
  pageSize?: number;
  status?: AdditionalChargeTab;
  sortBy?: AdditionalChargeSortBy;
  sortOrder?: 'asc' | 'desc';
}

export interface AdditionalChargeBulkFilters {
  status?: AdditionalChargeTab;
}

export type AdditionalChargeBulkSelectionPayload =
  BulkSelectionRequest<AdditionalChargeBulkFilters>;
