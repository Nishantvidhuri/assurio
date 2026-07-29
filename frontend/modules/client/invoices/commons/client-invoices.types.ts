import type { BulkSelectionRequest } from '@/shared/commons/bulk-selection.types';

export type InvoiceKind = 'INSTANT_PAID' | 'PAYMENT_DUE';
export type InvoiceBusinessStatus = 'DUE' | 'PAID' | 'VOID';

export type InvoicePaymentMethod =
  | 'RAZORPAY'
  | 'BANK_REMITTANCE'
  | 'BANK_TRANSFER'
  | 'CASH'
  | 'CHEQUE'
  | 'CREDIT_CARD'
  | 'UPI';

export type InvoicePaymentTerms =
  | 'DUE_ON_RECEIPT'
  | 'NET_15'
  | 'NET_30'
  | 'NET_45'
  | 'NET_60'
  | 'NET_90'
  | 'CUSTOM';

export type InvoicePaymentStatus = 'RECORDED' | 'REFUNDED';

export interface InvoicePaymentRecord {
  id: string;
  amount: string;
  method: InvoicePaymentMethod;
  status: InvoicePaymentStatus;
  paidAt: string;
  referenceNumber: string | null;
  razorpayPaymentId: string | null;
  billingTransactionId: string | null;
}

export interface Invoice {
  id: string;
  documentType: 'TAX_INVOICE';
  documentNumber: string;
  status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  kind: InvoiceKind;
  businessStatus: InvoiceBusinessStatus;
  paymentMethod: InvoicePaymentMethod | null;
  totalAmount: string;
  currencyCode: string;
  documentDate: string;
  createdAt: string;
  dueAt: string | null;
  markedPaidAt: string | null;
  voidedAt: string | null;
  // Non-null ⇔ auto-generated postpaid monthly invoice ("2026-07" = the IST
  // calendar month billed).
  billingPeriodKey: string | null;
  initiatedBy: {
    id: string | null;
    name: string;
    email: string | null;
  } | null;
  transactionType:
    | 'CREDITS_TOP_UP'
    | 'PACKAGE_PURCHASE'
    | 'ADDITIONAL_CHARGE'
    | 'REFUND'
    | 'ADJUSTMENT'
    | 'INVOICE_PAYMENT'
    | null;
  transactionSource:
    | 'MANUAL'
    | 'AUTO_RECHARGE'
    | 'MANUAL_INVOICE_SETTLEMENT'
    | null;
}

export interface InvoiceListMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  selectableTotalItems: number;
  totalPages: number;
}

export interface InvoiceListResponse {
  data: Invoice[];
  meta: InvoiceListMeta;
}

export interface InvoiceBulkFilters {
  search?: string;
  minAmount?: number;
  maxAmount?: number;
}

export type InvoiceBulkSelectionPayload =
  BulkSelectionRequest<InvoiceBulkFilters>;

// Credit-top-up invoices carry a single line item shaped like:
//   { description: "Credits Top-Up", credits: "100.00", unitPrice: "1.00", lineSubtotal: "100.00" }
export interface InvoiceLineItem {
  description?: string;
  credits?: string;
  unitPrice?: string;
  lineSubtotal?: string;
}

// Postpaid monthly invoices (billingPeriodKey set) carry grouped line items
// instead of the flat shape above: aggregated Packages / Addons / Additional-
// charges sections. `rate`/`qty` are null on additional-charge rows (only the
// summed amount is shown). All amounts are net (pre-GST) decimal strings.
export interface InvoiceLineItemGroupRow {
  name: string;
  rate: string | null;
  qty: number | null;
  amount: string;
}

export interface InvoiceLineItemGroup {
  section: 'PACKAGE' | 'ADDON' | 'ADDITIONAL_CHARGE';
  title: string;
  rows: InvoiceLineItemGroupRow[];
}

/** True when the invoice carries grouped (postpaid) line items. */
export function isGroupedLineItems(
  lineItems: InvoiceLineItem[] | InvoiceLineItemGroup[],
): lineItems is InvoiceLineItemGroup[] {
  return lineItems.length > 0 && 'rows' in lineItems[0];
}

export interface InvoiceDetail {
  id: string;
  documentType: 'TAX_INVOICE';
  documentNumber: string;
  status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  kind: InvoiceKind;
  businessStatus: InvoiceBusinessStatus;
  currencyCode: string;
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  documentDate: string;
  createdAt: string;
  dueAt: string | null;
  paymentTerms: InvoicePaymentTerms;
  markedPaidAt: string | null;
  voidedAt: string | null;
  // Non-null ⇔ postpaid monthly invoice; also the switch that tells the
  // renderer `lineItems` is the grouped shape and HSN/SAC sits in the meta.
  billingPeriodKey: string | null;
  payments: InvoicePaymentRecord[];
  lineItems: InvoiceLineItem[] | InvoiceLineItemGroup[];
  taxSnapshot: {
    gstRate: string;
    gstRateMultiplier?: string;
    taxableAmount: string;
    gstAmount: string;
    grossAmount?: string;
    appliedAt?: string;
  };
  paymentSnapshot: {
    method: string;
    paidAt: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    billingTransactionId?: string;
    creditsId?: string;
    creditsAmount?: string;
    gstAmount?: string;
    grossAmount?: string;
    autoRechargeAttemptId?: string;
  };
  sellerSnapshot: {
    legalName: string;
    gstin?: string;
    pan?: string;
    cin?: string;
    address?: string;
    email?: string;
    phone?: string;
  };
  buyerSnapshot: {
    legalName: string;
    gstin?: string;
    pan?: string;
    cin?: string;
    address?: string;
    email?: string;
    phone?: string;
    orgCode?: string;
    // Place-of-supply, frozen at generation. Present on postpaid invoices.
    stateName?: string;
    stateCode?: string;
  };
  templateName: string;
  s3Key: string | null;
  pdfGeneratedAt: string | null;
}
