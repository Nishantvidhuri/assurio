import type { SelectOption } from '@/shared/components/ui/select-input';
import type {
  CurrencyCode,
  InternalClientStatus,
  OrganizationDeactivationReason,
  OrganizationIndustry,
  SatisfactionBucket,
} from './internal-clients.types';

export const CURRENCY_OPTIONS: SelectOption[] = [
  { label: 'INR', value: 'INR' },
  { label: 'USD', value: 'USD' },
  { label: 'EUR', value: 'EUR' },
  { label: 'JPY', value: 'JPY' },
  { label: 'GBP', value: 'GBP' },
];

export const INDUSTRY_LABELS: Record<OrganizationIndustry, string> = {
  AGRICULTURE: 'Agriculture',
  AUTOMOTIVE: 'Automotive',
  BANKING_AND_FINANCIAL_SERVICES: 'Banking & Financial Services',
  BIOTECHNOLOGY: 'Biotechnology',
  CONSTRUCTION: 'Construction',
  CONSULTING: 'Consulting',
  E_COMMERCE: 'E-Commerce',
  EDUCATION: 'Education',
  EDTECH: 'EdTech',
  ENERGY_AND_UTILITIES: 'Energy & Utilities',
  FINTECH: 'Fintech',
  FMCG: 'FMCG',
  FOOD_AND_BEVERAGE: 'Food & Beverage',
  GOVERNMENT: 'Government',
  HEALTHCARE: 'Healthcare',
  HOSPITALITY: 'Hospitality',
  HUMAN_RESOURCES_AND_STAFFING: 'Human Resources & Staffing',
  INSURANCE: 'Insurance',
  IT_SERVICES: 'IT Services',
  LEGAL_SERVICES: 'Legal Services',
  LOGISTICS_AND_SUPPLY_CHAIN: 'Logistics & Supply Chain',
  MANUFACTURING: 'Manufacturing',
  MEDIA_AND_ENTERTAINMENT: 'Media & Entertainment',
  NON_PROFIT: 'Non-Profit',
  OIL_AND_GAS: 'Oil & Gas',
  PHARMACEUTICALS: 'Pharmaceuticals',
  PROFESSIONAL_SERVICES: 'Professional Services',
  REAL_ESTATE: 'Real Estate',
  RETAIL: 'Retail',
  SOFTWARE_AND_SAAS: 'Software & SaaS',
  TELECOMMUNICATIONS: 'Telecommunications',
  TRANSPORTATION: 'Transportation',
  TRAVEL_AND_TOURISM: 'Travel & Tourism',
  OTHER: 'Other',
};

export const INDUSTRY_OPTIONS: SelectOption[] = Object.entries(INDUSTRY_LABELS).map(
  ([value, label]) => ({
    label,
    value,
  }),
);

export const INTERNAL_CLIENT_STATUS_LABELS: Record<InternalClientStatus, string> = {
  ACTIVE: 'Active',
  DEACTIVATED: 'Deactivated',
};

export const INTERNAL_CLIENT_STATUS_OPTIONS: SelectOption[] = Object.entries(
  INTERNAL_CLIENT_STATUS_LABELS,
).map(([value, label]) => ({
  label,
  value,
}));

export const SATISFACTION_LABELS: Record<SatisfactionBucket, string> = {
  HAPPY: 'Happy',
  UNHAPPY: 'Unhappy',
  NEUTRAL: 'Neutral',
};

export const SATISFACTION_OPTIONS: SelectOption[] = (
  Object.keys(SATISFACTION_LABELS) as SatisfactionBucket[]
).map((value) => ({ value, label: SATISFACTION_LABELS[value] }));

export const PRODUCT_FEEDBACK_TAG_LABELS: Record<string, string> = {
  // Detractor (rating 0–4)
  'slow-turnaround': 'Turnaround was slow',
  'inaccurate-results': 'Results were inaccurate',
  'incomplete-data': 'Data was incomplete',
  'unclear-status': 'Status updates were unclear',
  'unhelpful-support': "Support didn't help",
  'hard-to-use': 'Hard to use',
  // Passive (rating 5–7)
  'wish-faster-turnaround': 'Could be faster',
  'wish-more-accurate': 'Could be more accurate',
  'wish-more-detail': 'More detail in reports',
  'wish-better-updates': 'Better status updates',
  'wish-easier-to-use': 'Easier to use',
  'wish-better-support': 'Better support experience',
  // Promoter (rating 8–10)
  'fast-turnaround': 'Fast turnaround',
  'accurate-results': 'Accurate results',
  'thorough-data': 'Thorough data coverage',
  'clear-status': 'Clear status updates',
  'helpful-support': 'Helpful support',
  'easy-to-use': 'Easy to use',
  // Shared across all three sets
  other: 'Other',
};

export function humanizeFeedbackTag(key: string): string {
  return (
    PRODUCT_FEEDBACK_TAG_LABELS[key] ??
    key
      .split('-')
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join(' ')
  );
}


export const DEACTIVATION_REASON_LABELS: Record<
  OrganizationDeactivationReason,
  string
> = {
  CLIENT_REQUESTED: 'Client requested deactivation',
  CONTRACT_ENDED: 'Contract ended',
  COMPLIANCE_KYC_ISSUE: 'Compliance / KYC issue',
  OTHER: 'Others',
};

export const DEACTIVATION_REASON_OPTIONS: OrganizationDeactivationReason[] = [
  'CLIENT_REQUESTED',
  'CONTRACT_ENDED',
  'COMPLIANCE_KYC_ISSUE',
  'OTHER',
];

export const CLIENT_DETAIL_TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'users', label: 'Users' },
  { key: 'pricing', label: 'Pricing' },
] as const;

export const BASE_PACKAGE_SLOT_LABELS: Record<'SLOT_1' | 'SLOT_2' | 'SLOT_3', string> = {
  SLOT_1: 'Slot 1',
  SLOT_2: 'Slot 2',
  SLOT_3: 'Slot 3',
};

/**
 * Internal admin UI is credit-based (1 credit = 1 INR). All displayed amounts are credits,
 * not rupees. This helper remains only to keep existing callers compiling; it always returns
 * an empty string. Use a trailing " credits" label on labels or via
 * `formatCredits`/`formatCreditsNumber` from `@/shared/lib/format-credits`.
 */
export function currencySymbol(currencyCode: CurrencyCode) {
  void currencyCode;
  return '';
}
