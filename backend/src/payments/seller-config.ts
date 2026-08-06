/**
 * Seller ("Billed By") details printed on every tax invoice, plus the bank
 * remittance block. These are our own legal-entity + banking details — edit
 * here (or override via env) if they change. Mirrors Recriauth's sellerSnapshot.
 */
export interface BankDetails {
  name: string;
  account: string;
  ifsc: string;
  swift: string;
  addressLines: string[];
}

export interface SellerDetails {
  legalName: string;
  addressLines: string[];
  email: string;
  phone: string;
  gstin: string;
  pan: string;
  cin: string;
  /** Seller's state — used for the Place of Supply / GST treatment. */
  stateName: string;
  stateCode: string;
  bank: BankDetails;
}

const env = (k: string, fallback: string) => process.env[k]?.trim() || fallback;

export const SELLER: SellerDetails = {
  legalName: env('INVOICE_SELLER_NAME', 'Recrivio Technologies Private Limited'),
  addressLines: (
    env(
      'INVOICE_SELLER_ADDRESS',
      'Ram Ganga Nagar, Awas Yojana M.O 2, R.K. University, Bareilly, Uttar Pradesh, India, 243006',
    )
  )
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean),
  email: env('INVOICE_SELLER_EMAIL', 'support@recrivio.com'),
  phone: env('INVOICE_SELLER_PHONE', '+91 9084693702'),
  gstin: env('INVOICE_SELLER_GSTIN', '09AAOCR5701J1Z0'),
  pan: env('INVOICE_SELLER_PAN', 'AAOCR5701J'),
  cin: env('INVOICE_SELLER_CIN', 'U78300UP2025PTC222138'),
  stateName: env('INVOICE_SELLER_STATE', 'Uttar Pradesh'),
  stateCode: env('INVOICE_SELLER_STATE_CODE', '09'),
  bank: {
    name: env('INVOICE_BANK_NAME', 'HDFC Bank'),
    account: env('INVOICE_BANK_ACCOUNT', '99909457962838'),
    ifsc: env('INVOICE_BANK_IFSC', 'HDFC0004463'),
    swift: env('INVOICE_BANK_SWIFT', 'HDFCINBBXXX'),
    addressLines: env(
      'INVOICE_BANK_ADDRESS',
      'Pilibhit Bypass, Hdfc Bank Ltd Minjumala Khasra No 328 329 1 330 1 331 Plot No 3|Bakey Jagatpur, Bareilly, Uttar Pradesh, 243406',
    )
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
  },
};

/** SAC code for background-verification services (shown in the HSN/SAC column). */
export const DEFAULT_SAC = env('INVOICE_SAC', '998519');
