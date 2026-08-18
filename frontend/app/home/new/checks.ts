/**
 * Single source of truth for "which verification checks can we run with the
 * data collected so far". Used by both the in-wizard Review step
 * (app/home/new/page.tsx) and the checkout Review & Pay page
 * (app/home/new/checkout/page.tsx) so the two never drift apart.
 *
 * Each check lists the draft fields it depends on — mirroring the backend
 * DTOs in backend/src/verify/dto.ts. A check runs only when every field it
 * requires is filled.
 */
import type { CandidateDraft } from './draft';
import {
  CREDIT_CHECK_ENABLED,
  PASSPORT_CHECK_ENABLED,
} from '../../lib/feature-flags';

export type CheckFieldKey = keyof Omit<
  CandidateDraft,
  'idDocuments' | 'consentAcceptedAt'
>;

export const CHECK_FIELD_LABELS: Record<CheckFieldKey, string> = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  role: 'Role',
  gender: 'Gender',
  fatherName: "Father's name",
  permanentAddress: 'Permanent address',
  pincode: 'Pincode',
  aadhaar: 'Aadhaar number',
  pan: 'PAN',
  dob: 'Date of birth',
  drivingLicense: 'Driving licence',
  voterId: 'Voter ID',
  passportFileNo: 'Passport file number',
  uan: 'UAN',
};

export interface CheckDef {
  id: string;
  label: string;
  requires: CheckFieldKey[];
  /**
   * True when a verified Aadhaar can stand in for the permanent address this
   * check needs, so leaving the address blank defers the check rather than
   * blocking it. Mirrors the backend: credit builds its structured address from
   * the DigiLocker eAadhaar KYC, and crime falls back to the same address
   * flattened to one line. Both re-fire automatically once DigiLocker completes
   * (see SubjectVerificationService.run).
   */
  addressFromAadhaar?: boolean;
}

/**
 * Each check lists the fields it genuinely needs from the candidate (name is a
 * base field that's always present, so it isn't listed). The checkout's "what
 * we can perform" is derived from these, and the backend orchestrator runs each
 * check using the same rules — so what's shown is exactly what runs.
 */
const ALL_CHECKS: CheckDef[] = [
  { id: 'pan', label: 'PAN verification', requires: ['pan'] },
  { id: 'aadhaar', label: 'Aadhaar (DigiLocker)', requires: ['aadhaar'] },
  {
    id: 'dl',
    label: 'Driving licence',
    requires: ['drivingLicense', 'dob'],
  },
  { id: 'voter', label: 'Voter ID', requires: ['voterId'] },
  { id: 'passport', label: 'Passport', requires: ['passportFileNo', 'dob'] },
  { id: 'employment', label: 'Employment history', requires: ['uan'] },
  {
    id: 'court',
    label: 'Crime / court record',
    requires: ['dob', 'permanentAddress'],
    addressFromAadhaar: true,
  },
  {
    id: 'credit',
    label: 'Credit check',
    requires: ['pan', 'dob', 'permanentAddress'],
    addressFromAadhaar: true,
  },
];

/** Credit and passport are switched off for now — see lib/feature-flags. */
export const CHECKS: CheckDef[] = ALL_CHECKS.filter((c) => {
  if (c.id === 'credit') return CREDIT_CHECK_ENABLED;
  if (c.id === 'passport') return PASSPORT_CHECK_ENABLED;
  return true;
});

export interface PerformableCheck {
  id: string;
  label: string;
  /** Runs by itself once the candidate finishes DigiLocker, which supplies the
   *  address instead of a typed one. */
  afterAadhaar?: boolean;
}

export interface BlockedCheck {
  id: string;
  label: string;
  missing: CheckFieldKey[];
}

/**
 * Turnaround for a check.
 *  • Aadhaar is completed by the candidate themselves in DigiLocker, so it
 *    finishes whenever they do — never "instant" from the client's side.
 *  • Court records are searched manually at source; the vendor documents a
 *    24-48 hour turnaround, so we quote that rather than a flat 24h we cannot
 *    hold to.
 *  • Credit comes from a bureau that reports within 24h.
 *  • Everything else returns straight away once consent is given.
 */
export type CheckEta =
  | 'Instant on consent'
  | 'Within 24 hours'
  | 'Within 24-48 hours'
  | 'Awaiting candidate'
  | 'After Aadhaar KYC';

export function checkEta(id: string): CheckEta {
  if (id === 'aadhaar') return 'Awaiting candidate';
  if (id === 'court') return 'Within 24-48 hours';
  return id === 'credit' ? 'Within 24 hours' : 'Instant on consent';
}

/** Turnaround for a check in the "we'll perform" list, accounting for ones
 *  waiting on DigiLocker to supply the address. */
export function performableEta(check: PerformableCheck): CheckEta {
  return check.afterAadhaar ? 'After Aadhaar KYC' : checkEta(check.id);
}

export interface SplitChecks {
  performable: PerformableCheck[];
  blocked: BlockedCheck[];
}

/** Split the catalog into checks that can run vs. checks blocked by missing
 *  fields (with the specific fields still needed). */
export function splitChecks(draft: CandidateDraft): SplitChecks {
  const filled = (key: CheckFieldKey) => (draft[key] ?? '').trim().length > 0;
  const performable: PerformableCheck[] = [];
  const blocked: BlockedCheck[] = [];
  for (const check of CHECKS) {
    const missing = check.requires.filter((key) => !filled(key));
    if (missing.length === 0) {
      performable.push({ id: check.id, label: check.label });
      continue;
    }
    // Blocked only by the permanent address, on a check the verified Aadhaar
    // can address-fill, and the candidate gave an Aadhaar number: it isn't
    // blocked at all — it fires on its own once DigiLocker completes.
    const onlyNeedsAddress =
      missing.length === 1 && missing[0] === 'permanentAddress';
    if (check.addressFromAadhaar && onlyNeedsAddress && filled('aadhaar')) {
      performable.push({ id: check.id, label: check.label, afterAadhaar: true });
    } else {
      blocked.push({ id: check.id, label: check.label, missing });
    }
  }
  // Lead with the checks that return the moment consent is given; the ones
  // that wait on a vendor or the candidate follow. Sort is stable, so each
  // group keeps its catalog order.
  performable.sort((a, b) => etaRank(performableEta(a)) - etaRank(performableEta(b)));
  return { performable, blocked };
}

/** Display order for the "checks we'll perform" list: soonest first. */
const ETA_ORDER: CheckEta[] = [
  'Instant on consent',
  'Within 24 hours',
  'Within 24-48 hours',
  'After Aadhaar KYC',
  'Awaiting candidate',
];

function etaRank(eta: CheckEta): number {
  return ETA_ORDER.indexOf(eta);
}

/** Human-readable list of the fields a blocked check still needs. */
export function missingLabels(missing: CheckFieldKey[]): string {
  return missing.map((key) => CHECK_FIELD_LABELS[key]).join(', ');
}
