import type { VendorCode, VendorStatus } from './internal-vendors.types';

// Per-vendor line colours for the overview expenses chart + health charts.
export const VENDOR_SERIES_COLORS: Record<VendorCode, string> = {
  SUREPASS: '#4B67D1',
  KONNECTNXT: '#22C8A9',
  TELECMI: '#8B5CF6',
  IN_HOUSE_OCR: '#F2785C',
};

export type VendorTagVariant =
  | 'Default'
  | 'Primary'
  | 'Warning'
  | 'Success'
  | 'Info'
  | 'Failure';

export const VENDOR_STATUS_TAG: Record<
  VendorStatus,
  { label: string; variant: VendorTagVariant }
> = {
  ACTIVE: { label: 'Active', variant: 'Success' },
  DEGRADED: { label: 'Degraded', variant: 'Warning' },
  DISABLED: { label: 'Disabled', variant: 'Default' },
  DEPRECATED: { label: 'Deprecated', variant: 'Failure' },
};

export const HTTP_METHOD_OPTIONS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
];

export const HTTP_CLASS_OPTIONS = [
  { value: '2xx', label: '2xx Success' },
  { value: '3xx', label: '3xx Redirect' },
  { value: '4xx', label: '4xx Client error' },
  { value: '5xx', label: '5xx Server error' },
];

export const CALL_OUTCOME_OPTIONS = [
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
];

export const VENDOR_FILTER_OPTIONS: { value: VendorCode; label: string }[] = [
  { value: 'SUREPASS', label: 'Surepass' },
  { value: 'KONNECTNXT', label: 'KonnectNXT' },
  { value: 'TELECMI', label: 'TeleCMI' },
  { value: 'IN_HOUSE_OCR', label: 'OCR (In House)' },
];

// Curated endpoint filter for the API-call logs. `value` is a matching token
// consumed by the backend (list-vendor-calls DTO): a token ending in `*` is a
// path-prefix match (dynamic-tail endpoints like /digilocker/status/<id>, or a
// whole group like /ocr/*), everything else is an exact-path match (tolerant
// of a trailing slash / query string). One option may bundle several endpoints
// as a `|`-separated token list (e.g. TeleCMI, in-house OCR). Grouped by
// vendor; kept in sync with the server vendor-endpoints.constants.
export const ENDPOINT_FILTER_OPTIONS = [
  // Surepass · DigiLocker — the whole OAuth + download flow under one option.
  { value: '/digilocker/*', label: 'DigiLocker' },
  // Surepass · KYC verifications
  { value: '/pan/*', label: 'PAN Verification (Surepass)' },
  { value: '/voter-id/*', label: 'Voter ID Verification (Surepass)' },
  { value: '/passport/*', label: 'Passport Verification (Surepass)' },
  { value: '/driving-license/*', label: 'Driving License Verification (Surepass)' },
  { value: '/income/*', label: 'Employment History (Surepass)' },
  // OCR — one option per provider.
  { value: '/ocr/*', label: 'OCR (Surepass)' },
  {
    value: '/aadhaar|/pan|/passport|/driving-license|/voter-id',
    label: 'OCR (In-house)',
  },
  { value: '/mask-identity', label: 'Identity Masking (In-house)' },
  { value: '/utils/usage/balance', label: 'Surepass · Balance' },
  // KonnectNXT
  { value: '/async/v2/bgv-submit', label: 'KonnectNXT · BGV Submit' },
  { value: '/verification/bgv/*', label: 'KonnectNXT · BGV Report Download' },
  { value: '/verification/gst-certificate', label: 'KonnectNXT · GST Certificate' },
  { value: '/verification/crime-check', label: 'KonnectNXT · Crime Check (legacy)' },
  { value: '/credits/transactions', label: 'KonnectNXT · Credit Ledger' },
  // TeleCMI — all telephony endpoints under one option.
  {
    value:
      '/webrtc/click2call|/out_answered|/c2c/hangup|/play|/token|/balance|/user/*',
    label: 'TeleCMI',
  },
];

// Threshold presets for the Settings modal's low-balance dropdown (INR).
export const LOW_BALANCE_THRESHOLD_OPTIONS = [
  { value: '1000', label: '₹ 1,000' },
  { value: '5000', label: '₹ 5,000' },
  { value: '10000', label: '₹ 10,000' },
  { value: '25000', label: '₹ 25,000' },
  { value: '50000', label: '₹ 50,000' },
  { value: '100000', label: '₹ 1,00,000' },
];

// Subscription vendors (e.g. TeleCMI) have no prepaid balance — the alert
// threshold is a number of days before the plan's renewal date.
export const RENEWAL_THRESHOLD_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '15', label: '15 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
];

export function httpStatusTone(
  status: number | null,
  success: boolean,
): 'success' | 'error' | 'neutral' {
  if (status == null) return success ? 'success' : 'error';
  if (status >= 200 && status < 300) return 'success';
  if (status >= 400) return 'error';
  return 'neutral';
}

export function formatLatency(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
}

// Frame formatters for the animated KPI values. `formatInrValue` matches the
// server's formatInr exactly (₹ + rounded en-IN integer) so the tween settles
// on the same string the backend would render.
export const formatInrValue = (n: number): string =>
  `₹${Math.round(n).toLocaleString('en-IN')}`;
export const formatCountValue = (n: number): string =>
  Math.round(n).toLocaleString('en-IN');

export type DeltaTone = 'positive' | 'negative' | 'neutral';

/**
 * Period-over-period comparison badge — identical logic to the client
 * dashboard's DashboardMetricCard: cap at ±999%, render "New" when there was
 * no prior-period baseline, and "0%" when nothing changed.
 */
export function formatDelta(
  value: number,
  previous: number,
): { label: string; tone: DeltaTone } {
  if (previous === 0 && value === 0) {
    return { label: '0%', tone: 'neutral' };
  }
  if (previous === 0) {
    return { label: 'New', tone: 'positive' };
  }
  const raw = ((value - previous) / previous) * 100;
  const clamped = Math.max(-999, Math.min(999, raw));
  const rounded = Math.round(clamped);
  const sign = rounded > 0 ? '+' : '';
  const tone: DeltaTone =
    rounded > 0 ? 'positive' : rounded < 0 ? 'negative' : 'neutral';
  return { label: `${sign}${rounded}%`, tone };
}
