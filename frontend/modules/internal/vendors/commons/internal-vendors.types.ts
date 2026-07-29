// Frontend mirror of the internal Vendor Management API contracts
// (server: src/modules/internal/vendors). Cost/balance fields are present but
// null until the cost slice lands.

export type VendorRange = '7d' | '30d' | '90d';
export type VendorCode = 'SUREPASS' | 'KONNECTNXT' | 'TELECMI' | 'IN_HOUSE_OCR';
export type VendorCategory = 'KYC' | 'BGV' | 'TELEPHONY' | 'OCR';
export type VendorStatus = 'ACTIVE' | 'DEGRADED' | 'DISABLED' | 'DEPRECATED';
export type VendorBillingModel =
  | 'PREPAID'
  | 'POSTPAID'
  | 'INTERNAL'
  | 'SUBSCRIPTION';
export type VendorCapabilityRole = 'PRIMARY' | 'FALLBACK';

export interface RangeMeta {
  label: string;
  from: string;
  to: string;
}

export interface VendorAlert {
  id: string;
  vendorCode: VendorCode;
  vendorName: string;
  type: 'HIGH_ERROR_RATE' | 'LOW_BALANCE';
  severity: 'warning' | 'critical';
  message: string;
  at: string | null;
}

export interface VendorListItem {
  code: VendorCode;
  displayName: string;
  category: VendorCategory;
  status: VendorStatus;
  billingModel: VendorBillingModel;
  currencyCode: string;
  capabilities: string[];
  successRate: number | null;
  totalCalls: number;
  availableBalance: string | null;
  spendMtd: string | null;
}

export interface VendorExpensesSeries {
  vendorCode: VendorCode;
  vendorName: string;
  data: number[];
}

export interface VendorOverviewResponse {
  range: RangeMeta;
  kpis: {
    totalVendors: number;
    totalApiCalls: number;
    totalApiCallsPreviousValue: number;
    totalVendorSpend: string | null;
    totalVendorSpendValue: number;
    totalVendorSpendPreviousValue: number;
  };
  alerts: VendorAlert[];
  expenses: {
    metric: 'calls' | 'spend';
    buckets: string[];
    series: VendorExpensesSeries[];
    previousSeries: VendorExpensesSeries[];
  };
  vendors: VendorListItem[];
}

export interface VendorCapabilityRow {
  code: string;
  displayName: string;
  verificationType: string | null;
  role: VendorCapabilityRole;
  enabled: boolean;
  callsMtd: number | null;
  unitCost: string | null;
}

export interface VendorRecentCall {
  id: string;
  capabilityLabel: string;
  endpoint: string;
  httpStatusCode: number | null;
  success: boolean;
  createdAt: string;
}

export interface VendorSettings {
  lowBalanceThreshold: string | null;
  requestTimeoutMs: number | null;
  syncReportedBalance: boolean;
}

export interface VendorHealthSummary {
  totalCalls: number;
  success: number;
  failed: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  uptimePct: number | null;
}

export interface VendorDetailResponse {
  vendor: {
    code: VendorCode;
    displayName: string;
    category: VendorCategory;
    status: VendorStatus;
    billingModel: VendorBillingModel;
    currencyCode: string;
    settings: VendorSettings;
  };
  range: RangeMeta;
  kpis: {
    availableBalance: string | null;
    availableBalanceRunway: string | null;
    spend: string | null;
    spendValue: number;
    spendPreviousValue: number;
    successRatePct: number | null;
    successRatePreviousValue: number | null;
    totalApiCalls: number;
    totalApiCallsPreviousValue: number;
  };
  health: VendorHealthSummary;
  capabilities: VendorCapabilityRow[];
  recentCalls: VendorRecentCall[];
}

export interface VendorHealthPoint {
  date: string;
  total: number;
  success: number;
  failed: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  uptimePct: number | null;
}

export interface VendorHealthResponse {
  buckets: string[];
  points: VendorHealthPoint[];
  summary: VendorHealthSummary;
  /** Prior equal-length window — powers the header delta badges. */
  summaryPrevious: VendorHealthSummary;
}

export interface VendorCallLogItem {
  id: string;
  vendorCode: VendorCode;
  vendorName: string;
  createdAt: string;
  httpMethod: string;
  endpoint: string;
  httpStatusCode: number | null;
  durationMs: number | null;
  success: boolean;
  whyFailed: string | null;
  description: string;
  retryStatus: string | null;
  caseReference: string | null;
  candidateCaseId: string | null;
  requestId: string | null;
}

export interface VendorCallLogResponse {
  data: VendorCallLogItem[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface VendorCallDetail {
  id: string;
  vendorCode: VendorCode;
  vendorName: string;
  endpoint: string;
  httpMethod: string;
  httpStatusCode: number | null;
  durationMs: number | null;
  success: boolean;
  errorMessage: string | null;
  requestId: string | null;
  createdAt: string;
  whyFailed: string | null;
  description: string;
  caseReference: string | null;
  checkName: string | null;
  verificationType: string | null;
  verificationStatus: string | null;
  requestPayload: unknown;
  responseBody: unknown;
}

export interface UpdateVendorSettingsPayload {
  lowBalanceThreshold?: number | null;
  requestTimeoutMs?: number;
  syncReportedBalance?: boolean;
}
