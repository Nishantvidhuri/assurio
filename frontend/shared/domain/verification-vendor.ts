// Maps a CandidateCaseCheck.checkDefinitionKey to the upstream vendor that
// runs the check. Static lookup — every check definition has at most one
// vendor, and the mapping is part of the integration contract, not data.
// Manual paths (address, education, reference-check) return null.

export type VerificationVendorKind = 'surepass' | 'konnect-nxt';

export interface VerificationVendor {
  kind: VerificationVendorKind;
  label: string;
}

const SUREPASS: VerificationVendor = { kind: 'surepass', label: 'SurePass' };
const KONNECT_NXT: VerificationVendor = {
  kind: 'konnect-nxt',
  label: 'Konnect NXT',
};

const VENDOR_BY_CHECK_DEFINITION: Record<string, VerificationVendor> = {
  // Identity verification (Aadhaar / PAN / Voter ID / Passport / DL subitems)
  'identity-verification': SUREPASS,
  // Employment — UAN / EPFO history lookup
  employment: SUREPASS,
  // Criminal record check (async, 3–4h SLA)
  'criminal-check': KONNECT_NXT,
};

export function getVendorForCheck(
  checkDefinitionKey: string,
): VerificationVendor | null {
  return VENDOR_BY_CHECK_DEFINITION[checkDefinitionKey] ?? null;
}
