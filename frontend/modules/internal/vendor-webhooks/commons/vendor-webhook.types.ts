export type VendorWebhookProvider =
  | 'SUREPASS'
  | 'KONNECTNXT'
  | 'IN_HOUSE_OCR'
  | 'TELECMI';

export type VendorWebhookStatus =
  | 'PENDING'
  | 'PROCESSED'
  | 'IGNORED'
  | 'FAILED';

export interface VendorWebhookEventListItem {
  id: string;
  provider: VendorWebhookProvider;
  eventType: string;
  caseId: string | null;
  // Groups every row of one call/case (TeleCMI vcid / KonnectNXT caseId) — the
  // viewer colour-bands rows that share it.
  correlationId: string | null;
  status: VendorWebhookStatus;
  dedupeKey: string;
  lastError: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface VendorWebhookListMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface VendorWebhookListResponse {
  data: VendorWebhookEventListItem[];
  meta: VendorWebhookListMeta;
}

export interface VendorWebhookRelatedRecord {
  kind: 'verificationCall' | 'vendorVerification';
  id: string;
  candidateCaseId: string | null;
  candidateCaseCheckId: string | null;
  label: string | null;
  status: string;
}

export interface VendorWebhookEventDetail {
  event: VendorWebhookEventListItem & {
    payloadRaw: string;
    payloadJson: unknown;
  };
  related: VendorWebhookRelatedRecord | null;
}
