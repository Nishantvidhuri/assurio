import type { ClientUser, ClientUserListMeta, CreateClientUserPayload, UpdateClientUserPayload, BulkDeleteResult } from '@/modules/client/users/commons/client-users.types';
import type { OrganizationBillingModel } from '@/modules/auth/commons/auth.types';
import type {
  Candidate,
  CandidateListMeta,
  CandidateReminderDefaults,
  SendCandidateReminderPayload,
  SendCandidateReminderResponse,
  UpdateCandidatePayload,
  BulkRevokeCandidateVerificationResult,
} from '@/modules/client/candidates/commons/client-candidates.types';

export type { OrganizationBillingModel };

export type CurrencyCode = 'USD' | 'EUR' | 'JPY' | 'INR' | 'GBP';
// CLIENT runs the full flow: admin creates the org, mails the public
// onboarding form, and the set-password mail unlocks only once the
// client submits it. PILOT is the trial flow — no public form at all,
// the set-password mail is available straight after create. Chosen at
// add-client time and immutable afterwards.
export type OrganizationOnboardingType = 'CLIENT' | 'PILOT';
export type InternalClientStatus = 'ACTIVE' | 'DEACTIVATED';
export type SatisfactionBucket = 'UNHAPPY' | 'NEUTRAL' | 'HAPPY';

export interface ClientSatisfactionSummary {
  /** Arithmetic mean across the org's submissions, rounded to 1 decimal. */
  averageRating: number | null;
  bucket: SatisfactionBucket | null;
  submissionCount: number;
  lowRatingCount?: number;
}

export interface InternalClientFeedbackUser {
  id: string;
  name: string;
  email: string;
}

export interface InternalClientFeedbackItem {
  id: string;
  rating: number;
  bucket: SatisfactionBucket;
  selectedTags: string[];
  comment: string | null;
  campaignVersion: string;
  submittedAt: string;
  user: InternalClientFeedbackUser | null;
}

export interface InternalClientFeedbackListResponse {
  data: InternalClientFeedbackItem[];
  meta: PaginationMeta;
  summary: ClientSatisfactionSummary;
}
export type OrganizationDeactivationReason =
  | 'CLIENT_REQUESTED'
  | 'CONTRACT_ENDED'
  | 'COMPLIANCE_KYC_ISSUE'
  | 'OTHER';

export interface DeactivatedByUserSummary {
  id: string;
  name: string;
}
export type OrganizationIndustry =
  | 'AGRICULTURE'
  | 'AUTOMOTIVE'
  | 'BANKING_AND_FINANCIAL_SERVICES'
  | 'BIOTECHNOLOGY'
  | 'CONSTRUCTION'
  | 'CONSULTING'
  | 'E_COMMERCE'
  | 'EDUCATION'
  | 'EDTECH'
  | 'ENERGY_AND_UTILITIES'
  | 'FINTECH'
  | 'FMCG'
  | 'FOOD_AND_BEVERAGE'
  | 'GOVERNMENT'
  | 'HEALTHCARE'
  | 'HOSPITALITY'
  | 'HUMAN_RESOURCES_AND_STAFFING'
  | 'INSURANCE'
  | 'IT_SERVICES'
  | 'LEGAL_SERVICES'
  | 'LOGISTICS_AND_SUPPLY_CHAIN'
  | 'MANUFACTURING'
  | 'MEDIA_AND_ENTERTAINMENT'
  | 'NON_PROFIT'
  | 'OIL_AND_GAS'
  | 'PHARMACEUTICALS'
  | 'PROFESSIONAL_SERVICES'
  | 'REAL_ESTATE'
  | 'RETAIL'
  | 'SOFTWARE_AND_SAAS'
  | 'TELECOMMUNICATIONS'
  | 'TRANSPORTATION'
  | 'TRAVEL_AND_TOURISM'
  | 'OTHER';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface InternalUserOption {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  role: string | null;
}

export interface InternalUserOptionListResponse {
  data: InternalUserOption[];
  meta: PaginationMeta;
}

export interface InternalClientContact {
  userId: string | null;
  name: string;
  designation: string | null;
  email: string;
  phoneNumber: string | null;
  onboardingExpiresAt?: string | null;
}

export interface InternalClientListItem {
  id: string;
  legalName: string;
  orgCode: string;
  isActive: boolean;
  deactivatedAt: string | null;
  deactivationReason: OrganizationDeactivationReason | null;
  deactivationReasonDetail: string | null;
  deactivatedByUser: DeactivatedByUserSummary | null;
  brandName: string | null;
  email: string | null;
  gstin: string | null;
  isGstRegistered: boolean;
  isTestData: boolean;
  onboardingType: OrganizationOnboardingType;
  constitution: string | null;
  industry: OrganizationIndustry | null;
  address: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  activeCasesCount: number;
  satisfaction: ClientSatisfactionSummary;
  creditsBalance: string;
  creditsCurrencyCode: CurrencyCode;
  registrationDate: string | null;
  createdAt: string;
  clientPoc: InternalClientContact | null;
  relationshipManager: InternalClientContact | null;
  financePoc: InternalClientContact | null;
  // True once the client has submitted the onboarding form. Gates the
  // set-password email + every candidate-case / client-user creation
  // path. Legacy orgs are backfilled as true.
  onboardingFormSubmitted: boolean;
  onboardingFormSentAt: string | null;
  // True once the client SPOC has verified email + set password. Drives
  // the disabled state of the "Send onboarding email" menu item.
  onboardingCompleted: boolean;
  // True if the POC user has ever been mailed an onboarding link.
  // Drives the menu label swap to "Resend onboarding email".
  onboardingEmailSent: boolean;
}

export interface InternalClientListResponse {
  data: InternalClientListItem[];
  meta: PaginationMeta;
}

export interface InternalClientDetail {
  id: string;
  legalName: string;
  slug: string;
  orgCode: string;
  isActive: boolean;
  deactivatedAt: string | null;
  deactivationReason: OrganizationDeactivationReason | null;
  deactivationReasonDetail: string | null;
  deactivatedByUser: DeactivatedByUserSummary | null;
  brandName: string | null;
  email: string | null;
  gstin: string | null;
  isGstRegistered: boolean;
  isTestData: boolean;
  // PREPAID orgs spend a credits wallet; POSTPAID orgs accrue rupee
  // consumption auto-invoiced monthly (Net 30). Immutable after creation.
  billingModel: OrganizationBillingModel;
  onboardingType: OrganizationOnboardingType;
  constitution: string | null;
  industry: OrganizationIndustry | null;
  address: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  registrationDate: string | null;
  createdAt: string;
  clientPoc: InternalClientContact | null;
  relationshipManager: InternalClientContact | null;
  financePoc: InternalClientContact | null;
  // True once the client has submitted the onboarding form.
  onboardingFormSubmitted: boolean;
  onboardingFormSentAt: string | null;
  // True once the client SPOC has verified email + set password.
  onboardingCompleted: boolean;
  pricingSettings: {
    currencyCode: CurrencyCode;
    showAddOns: boolean;
  } | null;
  summaryCounts: {
    clientUsersCount: number;
    candidatesCount: number;
    activeCasesCount: number;
    customPackagesCount: number;
  };
}

// Response of GET /v1/internal/clients/:organizationId/billing/postpaid-summary.
// All amounts are decimal strings in rupees. `billingForThisMonth`,
// `outstanding` and `totalDue` are GST-inclusive (18%). The endpoint
// returns 400 for prepaid organizations.
export interface InternalClientPostpaidSummary {
  organizationId: string;
  billingModel: 'POSTPAID';
  asOf: string;
  /** Consumption completed this month, not yet invoiced, incl. GST. */
  billingForThisMonth: string;
  /** Same as `billingForThisMonth` but before GST. */
  billingForThisMonthNet: string;
  /** Invoices raised but not yet paid, incl. GST. */
  outstanding: string;
  /** Outstanding plus all consumption not yet invoiced, incl. GST. */
  totalDue: string;
  unbilled: {
    packagesAmount: string;
    additionalChargesAmount: string;
    netAmount: string;
    grossAmount: string;
  };
  dueInvoicesCount: number;
  oldestDueAt: string | null;
}

export interface InternalClientUsersResponse {
  data: ClientUser[];
  meta: ClientUserListMeta;
}

export interface InternalClientCandidatesResponse {
  data: Candidate[];
  meta: CandidateListMeta;
}

export interface InternalClientCandidateDetailResponse {
  candidate: Candidate;
  reminderDefaults: CandidateReminderDefaults;
}

export interface InternalClientPricingSettings {
  currencyCode: CurrencyCode;
  showAddOns: boolean;
  updatedAt: string;
}

export interface InternalClientPackageSummary {
  id: string;
  type: 'BASE' | 'CUSTOM';
  slot: 'SLOT_1' | 'SLOT_2' | 'SLOT_3' | null;
  name: string;
  description: string;
  price: string;
  status: 'DRAFT' | 'PUBLISHED';
  /** Standard packages only — whether the client can select this package when adding a candidate. */
  selectable: boolean;
  sortOrder: number;
  selectedChecksCount: number;
  /** Present for custom packages on pricing payload — ordered check names for UI preview */
  selectedCheckNames?: string[];
  createdAt: string;
  updatedAt: string;
}

export type CheckSubitemSelectionType = 'CHECKBOX' | 'RADIO';
export type MoveDirection = 'up' | 'down';

export interface InternalClientCheckSubitem {
  id: string;
  definitionKey?: string;
  name: string;
  price: string;
  sortOrder: number;
}

export interface InternalClientCheck {
  id: string;
  definitionKey?: string;
  icon: string;
  name: string;
  enableMultiple: boolean;
  price: string | null;
  subitemSelectionType: CheckSubitemSelectionType | null;
  // Per-option-multiplier checks (reference): drives the per-option
  // Checkbox + NumberCounter selector and the ≤ maxTotal cap.
  perSubitemQuantity?: boolean;
  subitemQuantityMaxTotal?: number | null;
  sortOrder: number;
  subitems: InternalClientCheckSubitem[];
}

export interface InternalClientPackageCheckSelection {
  id: string;
  sortOrder: number;
  quantity: number | null;
  check: InternalClientCheck;
  selectedSubitemIds: string[];
  // subitemId → saved multiplier (per-subitem-quantity checks like reference).
  subitemQuantities?: Record<string, number>;
  selectedSubitems: InternalClientCheckSubitem[];
  // OR grouping key — rows sharing it are mutually-exclusive alternatives.
  orGroupId?: string | null;
}

export interface InternalClientCustomPackageDetail extends InternalClientPackageSummary {
  selectedChecks: InternalClientPackageCheckSelection[];
}

export interface InternalClientPricingResponse {
  settings: InternalClientPricingSettings | null;
  basePackages: InternalClientPackageSummary[];
  customPackages: InternalClientPackageSummary[];
}

export interface InternalClientPricingChecksResponse {
  settings: {
    showAddOns: boolean;
  };
  data: InternalClientCheck[];
  meta: PaginationMeta;
}

export interface CreateInternalClientPayload {
  basicDetails: {
    isGstRegistered: boolean;
    isTestData?: boolean;
    // Defaults to PREPAID on the server. Immutable after creation — the
    // update payload never carries it.
    billingModel?: OrganizationBillingModel;
    // Defaults to CLIENT on the server. Immutable after creation.
    onboardingType?: OrganizationOnboardingType;
    gstin?: string;
    legalName: string;
    // Optional at admin-create: the client finalises brand name + org
    // code at form-submit. Address fields are also captured then.
    brandName?: string;
    orgCode?: string;
    email: string;
    constitution?: string;
    registrationDate?: string;
    industry?: OrganizationIndustry;
    address?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
  pocDetails: {
    clientPocName: string;
    clientPocDesignation: string;
    clientPocEmail: string;
    clientPocPhoneNumber: string;
    relationshipManagerUserId: string;
    financePocUserId: string;
  };
  pricing: {
    currencyCode?: CurrencyCode;
    basePackagePrices: Array<{
      slot: 'SLOT_1' | 'SLOT_2' | 'SLOT_3';
      price: number;
    }>;
    showAddOns: boolean;
    checkPrices?: Array<{
      baseCheckId: string;
      price?: number;
      subitemPrices?: Array<{
        baseCheckSubitemId: string;
        price: number;
      }>;
    }>;
  };
}

export interface UpdateInternalClientPayload {
  basicDetails?: {
    isGstRegistered?: boolean;
    isTestData?: boolean;
    gstin?: string;
    legalName?: string;
    email?: string;
    brandName?: string;
    constitution?: string;
    registrationDate?: string;
    industry?: OrganizationIndustry;
    address?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
  pocDetails?: {
    clientPocName?: string;
    clientPocDesignation?: string;
    clientPocEmail?: string;
    clientPocPhoneNumber?: string;
    relationshipManagerUserId?: string;
    financePocUserId?: string;
  };
}

export interface InternalClientListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  industry?: OrganizationIndustry;
  sortBy?:
    | 'legalName'
    | 'brandName'
    | 'email'
    | 'gstin'
    | 'industry'
    | 'activeCasesCount'
    | 'creditsBalance'
    | 'status'
    | 'registrationDate'
    | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface InternalClientUserListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: 'name' | 'email' | 'role' | 'department' | 'createdAt' | 'candidatesAdded';
  sortOrder?: 'asc' | 'desc';
}

export interface InternalClientCandidateListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?:
    | 'caseReference'
    | 'name'
    | 'email'
    | 'position'
    | 'dateOfJoining'
    | 'addedByName'
    | 'createdAt'
    | 'packageName';
  sortOrder?: 'asc' | 'desc';
}

export interface InternalClientPricingChecksQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: 'sortOrder' | 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface UpdateInternalClientPricingSettingsPayload {
  currencyCode?: CurrencyCode;
  showAddOns?: boolean;
}

export interface UpdateInternalClientBasePackagePricesPayload {
  packages: Array<{
    id: string;
    price: number;
    selectable: boolean;
  }>;
}

export interface UpdateInternalClientCheckPricesPayload {
  items: Array<{
    baseCheckId: string;
    price?: number;
    subitemPrices?: Array<{
      baseCheckSubitemId: string;
      price: number;
    }>;
  }>;
}

export interface CreateInternalClientCustomPackagePayload {
  name: string;
  price: number;
  description?: string;
  status: 'DRAFT' | 'PUBLISHED';
}

export interface UpdateInternalClientCustomPackagePayload {
  name?: string;
  price?: number;
  description?: string;
  status?: 'DRAFT' | 'PUBLISHED';
}

export interface SaveInternalClientCustomPackageDraft {
  initialPackage?: InternalClientCustomPackageDetail | null;
  name: string;
  price: number;
  description: string;
  status: 'DRAFT' | 'PUBLISHED';
  selectedChecks: Array<{
    checkId: string;
    quantity?: number | null;
    selectedSubitemIds?: string[];
    subitemQuantities?: Record<string, number>;
    orGroupId?: string | null;
  }>;
}

export type InternalClientUserMutations = {
  create: (organizationId: string, payload: CreateClientUserPayload) => Promise<{ success: boolean; data?: ClientUser; error?: string }>;
  update: (organizationId: string, userId: string, payload: UpdateClientUserPayload) => Promise<{ success: boolean; data?: ClientUser; error?: string }>;
  delete: (organizationId: string, userId: string) => Promise<{ success: boolean; data?: { deleted: boolean }; error?: string }>;
  bulkDelete: (organizationId: string, ids: string[]) => Promise<{ success: boolean; data?: BulkDeleteResult; error?: string }>;
};

export type InternalClientCandidateMutations = {
  update: (organizationId: string, candidateId: string, payload: UpdateCandidatePayload) => Promise<{ success: boolean; data?: Candidate; error?: string }>;
  revoke: (organizationId: string, candidateId: string) => Promise<{ success: boolean; data?: { revoked: boolean }; error?: string }>;
  bulkRevoke: (organizationId: string, ids: string[]) => Promise<{ success: boolean; data?: BulkRevokeCandidateVerificationResult; error?: string }>;
  sendReminder: (organizationId: string, candidateId: string, payload: SendCandidateReminderPayload) => Promise<{ success: boolean; data?: SendCandidateReminderResponse; error?: string }>;
};

export interface GstinDetails {
  gstin: string;
  legalName: string;
  brandName: string | null;
  constitution: string | null;
  address: string | null;
  additionalAddresses: string[];
  registrationDate: string | null;
  gstStatus: string;
}

export type GstinLookupResult =
  | { status: 'FOUND' | 'INACTIVE'; details: GstinDetails }
  | { status: 'NOT_FOUND' }
  | { status: 'UPSTREAM_ERROR'; message: string };
