export interface CreditsSummary {
  creditsId: string;
  organizationId: string;
  billingModel: 'PREPAID' | 'POSTPAID';
  status: string;
  currencyCode: string;
  availableBalance: string;
  lifetimeCredits: string;
  lifetimeDebits: string;
  lastReconciledAt: string;
  updatedAt: string;
}

/**
 * The three headline numbers a postpaid client sees. `billingForThisMonth`,
 * `outstanding` and `totalDue` are GST-inclusive (18%) decimal strings.
 */
export interface PostpaidBillingSummary {
  organizationId: string;
  billingModel: 'POSTPAID';
  asOf: string;
  billingForThisMonth: string;
  billingForThisMonthNet: string;
  outstanding: string;
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

/** Razorpay order for paying a DUE postpaid invoice (mirrors the top-up order shape). */
export interface CreateInvoicePaymentOrderResponse {
  paymentId: string;
  invoiceId: string;
  documentNumber: string;
  razorpayOrderId: string;
  keyId: string;
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  amountSubunits: number;
  currencyCode: string;
  status: string;
  receipt: string;
  webhookDrivenCrediting: boolean;
}

export type BillingTransactionSource = 'MANUAL' | 'AUTO_RECHARGE';

export type CreditsAutoRechargeStatus =
  | 'DISABLED'
  | 'PENDING_AUTH'
  | 'ACTIVE'
  | 'REQUIRES_ACTION';

export type CreditsAutoRechargeAttemptStatus =
  | 'INITIATED'
  | 'REQUESTED'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'STALE';

export interface CreditsAutoRechargeAttemptSummary {
  id: string;
  status: CreditsAutoRechargeAttemptStatus;
  amount: string;
  triggeredAt: string;
  failureReason: string | null;
  billingTransactionId: string | null;
  razorpayPaymentId: string | null;
}

export interface CreditsAutoRechargeSummary {
  creditsId: string;
  organizationId: string;
  currencyCode: string;
  availableBalance: string;
  enabled: boolean;
  status: CreditsAutoRechargeStatus;
  thresholdAmount: string | null;
  rechargeAmount: string | null;
  maxDailyLimit: string;
  paymentMethodSummary: string | null;
  cardNetwork: string | null;
  cardLast4: string | null;
  cardExpiryMonth: number | null;
  cardExpiryYear: number | null;
  consecutiveFailureCount: number;
  lastTriggeredAt: string | null;
  lastChargedAt: string | null;
  lastFailedAt: string | null;
  lastFailureReason: string | null;
  providerSubscriptionId: string | null;
  openAttempt: CreditsAutoRechargeAttemptSummary | null;
  lastSuccessAttempt: CreditsAutoRechargeAttemptSummary | null;
  lastFailureAttempt: CreditsAutoRechargeAttemptSummary | null;
}

export interface SetupAutoRechargePayload {
  thresholdAmount: number;
  rechargeAmount: number;
}

export interface AuthorizeAutoRechargePayload {
  subscriptionId: string;
  authorizationPaymentId?: string;
  razorpaySignature?: string;
}

export interface UpdateAutoRechargePayload {
  thresholdAmount?: number;
  rechargeAmount?: number;
}

export interface CreditsAutoRechargeSetupResponse {
  summary: CreditsAutoRechargeSummary;
  checkout: {
    keyId: string;
    subscriptionId: string;
    name: string;
    description: string;
  };
}

export interface BillingTransactionActor {
  id: string;
  // For internal Recriauth staff the server returns the brand name
  // "RecriAuth Team" instead of the actual employee name. Email is
  // deliberately not included on the wire to avoid leaking staff
  // contacts into the client portal.
  name: string;
}

export interface BillingTransactionPayment {
  id: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  status: string;
}

export interface BillingTransactionPackagePurchase {
  id: string;
  candidateCase: {
    id: string;
    name: string;
    candidateUserId: string;
    email: string;
  };
  organizationPackage: {
    id: string;
    type: 'BASE' | 'CUSTOM';
    name: string;
  } | null;
  basePackage: {
    id: string;
    name: string;
    slot: string;
  } | null;
}

export interface BillingTransaction {
  id: string;
  type:
    | 'CREDITS_TOP_UP'
    | 'PACKAGE_PURCHASE'
    | 'ADDITIONAL_CHARGE'
    | 'REFUND'
    | 'ADJUSTMENT'
    | 'INVOICE_PAYMENT';
  status: 'POSTED' | 'FAILED' | 'CANCELLED';
  source: BillingTransactionSource;
  amount: string;
  balanceAfter: string | null;
  currencyCode: string;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  postedAt: string | null;
  failedAt: string | null;
  initiatedBy: BillingTransactionActor | null;
  razorpayPayment: BillingTransactionPayment | null;
  packagePurchase: BillingTransactionPackagePurchase | null;
  packagePurchases: BillingTransactionPackagePurchase[];
}

export interface BillingTransactionListResponse {
  data: BillingTransaction[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface CreateTopupOrderPayload {
  // Net credits to purchase. 1 credit = 1 INR. Razorpay is charged credits × 1.18
  // (credits + 18% GST). Integer only.
  credits: number;
}

export interface CreateTopupOrderResponse {
  paymentId: string;
  billingTransactionId: string | null;
  razorpayOrderId: string;
  keyId: string;
  creditsAmount: string;
  gstAmount: string;
  grossAmount: string;
  amountSubunits: number;
  currencyCode: string;
  status: string;
  receipt: string;
  webhookDrivenCrediting: boolean;
}

// One OR-slot resolution: which alternative check the candidate took.
export interface OrGroupSelectionPayload {
  orGroupId: string;
  chosenCheckId: string;
}

export interface CreatePackagePurchasePayload {
  candidateCaseId: string;
  organizationPackageId: string;
  customizedChecks?: Array<{
    checkId: string;
    selectedSubitemIds: string[];
  }>;
  addOnSelections?: Array<{
    checkId: string;
    quantity?: number;
    selectedSubitemIds?: string[];
    subitemQuantities?: Record<string, number>;
  }>;
  orGroupSelections?: OrGroupSelectionPayload[];
  idempotencyKey?: string;
}

export interface CreatePackagePreviewPayload {
  organizationPackageId: string;
  customizedChecks?: Array<{
    checkId: string;
    selectedSubitemIds: string[];
  }>;
  addOnSelections?: Array<{
    checkId: string;
    quantity?: number;
    selectedSubitemIds?: string[];
    subitemQuantities?: Record<string, number>;
  }>;
  orGroupSelections?: OrGroupSelectionPayload[];
}

export interface PackagePricingPreview {
  package: {
    organizationPackageId: string;
    organizationPackageType: 'BASE' | 'CUSTOM';
    basePackageId: string | null;
    name: string;
    description: string;
    slot: string | null;
    currencyCode: string;
    packageAmount: string;
    addOnsAmount: string;
    subtotalAmount: string;
  };
  includedChecks: Array<{
    checkId: string;
    checkName: string;
    icon: string;
    enableMultiple: boolean;
    subitemSelectionType: 'CHECKBOX' | 'RADIO' | null;
    // Reference (per-option multiplier): drives the per-option count label.
    perSubitemQuantity?: boolean;
    packageQuantity: number | null;
    selectedSubitemIds: string[];
    subitemQuantities?: Record<string, number>;
    selectedSubitems: Array<{
      id: string;
      name: string;
      price: string;
      // Per-option multiplier (per-subitem-quantity checks like reference).
      quantity?: number;
    }>;
  }>;
  addOns: Array<{
    checkId: string;
    checkName: string;
    icon: string;
    quantity: number | null;
    selectedSubitemIds: string[];
    subitemQuantities?: Record<string, number>;
    selectedSubitems: Array<{
      id: string;
      name: string;
      price: string;
      // Per-option multiplier (per-subitem-quantity checks like reference).
      quantity?: number;
    }>;
    unitPrice: string | null;
    amount: string;
  }>;
  packageAmount: string;
  addOnsAmount: string;
  subtotalAmount: string;
  currencyCode: string;
  credits: {
    creditsId: string;
    // Null for postpaid orgs — consumption is never balance-gated, so there
    // is no wallet balance to show (canAfford is always true).
    availableBalance: string | null;
    canAfford: boolean;
    shortfallAmount: string;
  };
}

export interface BillingDocumentSummary {
  id: string;
  documentType: 'TAX_INVOICE';
  documentNumber: string;
  status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  totalAmount: string;
  currencyCode: string;
  createdAt: string;
}

export interface BillingDocumentListResponse {
  data: BillingDocumentSummary[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface CreateTransactionsExportPayload {
  /** ISO-8601 timestamp (inclusive). */
  from: string;
  /** ISO-8601 timestamp (inclusive — server adds 1 day for the exclusive bound). */
  to: string;
}

export interface CreateTransactionsExportResponse {
  asyncJobId: string;
}

export interface TransactionsExportUrlResponse {
  url: string;
}
