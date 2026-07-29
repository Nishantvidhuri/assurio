// Static config + verifier-panel type aliases. Lifted out of
// video-kyc-verifier-panel.tsx so the panel file stays focused on
// the rendering logic and so the post-call view (final verdict)
// can pull from a shared source without re-importing from the
// panel itself. Convention matches other modules' commons/*.constants.ts.

import type { VideoKycLocation } from './video-call.types';

// ---------------------------------------------------------------------------
// Geographic Location card thresholds
// ---------------------------------------------------------------------------

// Google's `location_type` precision tiers for a forward-geocoded
// address, in decreasing order of precision.
export type DeclaredCoordPrecision =
  | 'ROOFTOP'
  | 'RANGE_INTERPOLATED'
  | 'GEOMETRIC_CENTER'
  | 'APPROXIMATE';

// Distance threshold (declared coord → live GPS) below which the
// verifier sees a green "Within Range" hint tag. Above → red
// "Out of Range" (address mismatch signal). Purely advisory — the
// Pass/Fail verdict is still the verifier's call.
//
// Threshold is ADAPTIVE to the declared-coord precision, because
// Google's forward geocode doesn't always resolve to the exact
// building. A precise "ROOFTOP" match against a precise device GPS
// should be tight (200 m — catches cross-street / neighbouring-
// building fraud); a coarse "APPROXIMATE" (pincode-centroid or
// larger area) match against the same precise GPS is naturally
// hundreds of metres off even when the candidate is genuinely at
// the declared address, so a tight threshold produces false
// mismatches (Wazidpur / Sector 130 Noida case: 323 m gap between
// pincode centroid and real GPS in the same neighborhood).
//
// Values below are the maximum "considered within range" distance
// for each precision tier. Consumer-GPS jitter alone can be
// ±20-50 m even indoors, so 200 m still leaves plenty of headroom
// for a ROOFTOP match.
export const WITHIN_RANGE_METERS_BY_PRECISION: Record<
  DeclaredCoordPrecision,
  number
> = {
  ROOFTOP: 200,
  RANGE_INTERPOLATED: 200,
  GEOMETRIC_CENTER: 500,
  APPROXIMATE: 2000,
};

// Fallback threshold used when the server didn't return a precision
// hint at all (legacy code paths, cache warm from before the schema
// change, non-Google fallback). Uses the loosest tier so we err on
// the side of NOT flagging a false mismatch.
export const WITHIN_RANGE_METERS_FALLBACK = 2000;

/**
 * Pick the "within range" threshold for a given declared-coord
 * precision. Coarser precision → looser threshold. Missing precision
 * falls back to the loosest tier so we don't false-alarm.
 */
export function withinRangeMetersFor(
  precision: DeclaredCoordPrecision | null | undefined,
): number {
  if (!precision) return WITHIN_RANGE_METERS_FALLBACK;
  return (
    WITHIN_RANGE_METERS_BY_PRECISION[precision] ?? WITHIN_RANGE_METERS_FALLBACK
  );
}

// Legacy export — used in places that just want the strict ceiling
// (200 m). Prefer `withinRangeMetersFor(precision)` at call sites
// that know the declared-coord precision.
export const WITHIN_RANGE_METERS =
  WITHIN_RANGE_METERS_BY_PRECISION.ROOFTOP;

// ---------------------------------------------------------------------------
// Identity check rows
// ---------------------------------------------------------------------------

export type IdentityCheckId =
  | 'name'
  | 'period-of-stay'
  | 'geographic-location'
  | 'address-match';

export const IDENTITY_CHECK_TITLES: Record<IdentityCheckId, string> = {
  name: 'Name',
  'period-of-stay': 'Period of Stay',
  'geographic-location': 'Geographic Location',
  'address-match': 'Address Match',
};

export type PassFailVerdict = 'pass' | 'fail' | 'not_answered';
export type AddressMatchVerdict =
  | 'match'
  | 'partial'
  | 'mismatch'
  | 'not_answered';

export interface IdentityCheckState {
  name: PassFailVerdict;
  'period-of-stay': PassFailVerdict;
  'geographic-location': PassFailVerdict;
  'address-match': AddressMatchVerdict;
}

export const INITIAL_IDENTITY_CHECKS: IdentityCheckState = {
  name: 'not_answered',
  'period-of-stay': 'not_answered',
  'geographic-location': 'not_answered',
  'address-match': 'not_answered',
};

// ---------------------------------------------------------------------------
// Final verdict picker
// ---------------------------------------------------------------------------

export type FinalVerdictKind = 'verified' | 'insufficiency' | 'discrepancy';

// ---------------------------------------------------------------------------
// Declared values surfaced on the verifier panel header
// ---------------------------------------------------------------------------

export interface VerifierDeclaredValues {
  candidateName?: string;
  periodOfStay?: string;
  declaredLatitude?: number;
  declaredLongitude?: number;
  // Google Geocoding precision hint for the declared coord. Drives
  // the adaptive Within-Range threshold on the Geographic Location
  // card and the accuracy of the "Coordinates approximated…" hint.
  declaredCoordPrecision?: DeclaredCoordPrecision;
  // Server-composed full address string from the candidate's form
  // (building → locality → city → district → state → pincode →
  // country). Rendered verbatim in the "Provided by candidate" block
  // on the Geographic Location card so the verifier can compare it
  // against the live captured address.
  declaredAddress?: string;
  addressDocument?: {
    documentId: string;
    filename: string;
  };
}

// ---------------------------------------------------------------------------
// Evidence-capture slots
// ---------------------------------------------------------------------------

export const CAPTURE_SLOTS = [
  {
    id: 'selfie',
    title: 'Selfie',
    helper: 'Capture a clear photo of the candidate.',
    minImages: 1,
    maxImages: 1,
  },
  {
    id: 'selfie-with-id',
    title: 'Selfie with ID',
    helper:
      'Capture a clear photo of the candidate holding their government-issued ID.',
    minImages: 1,
    maxImages: 1,
  },
  {
    id: 'house-image',
    title: 'House Image (Interior & Exterior)',
    helper: 'Capture interior and exterior views of the residence.',
    minImages: 2,
    maxImages: 5,
  },
  {
    id: 'door-with-nameplate',
    title: 'Door with Nameplate',
    helper: 'Capture the entrance door with the nameplate visible.',
    minImages: 2,
    maxImages: 5,
  },
  {
    id: 'selfie-at-door',
    title: 'Selfie at Door',
    helper:
      'Capture the candidate at the entrance with the house number or nameplate clearly visible.',
    minImages: 2,
    maxImages: 5,
  },
] as const;

export type SlotId = (typeof CAPTURE_SLOTS)[number]['id'];

export interface CapturedScreenshot {
  localId: string;
  slotId: SlotId;
  slotTitle: string;
  capturedAt: string;
  previewDataUrl: string;
  state: 'uploading' | 'uploaded' | 'failed';
  documentId?: string;
  documentVersionId?: string;
  errorMessage?: string;
  capturedLocation?: VideoKycLocation;
}
