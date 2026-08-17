/**
 * Structured-address builder for the KonnectNXT v2 BGV credit-report check.
 * Ported from Recriauth (`bgv-check.service.ts`), which derived these rules
 * against the live bureau.
 *
 * KonnectNXT made the structured address mandatory for the credit report:
 * street, city, state, country and pincode must ALL be present or the
 * submission is rejected ("Validation failed for candidate at index 0"). A
 * form-typed address only fills `street`, so it never satisfies this — the
 * caller defers the check until a verified Aadhaar yields the full set, which
 * costs no vendor credit and records no failure.
 */

export interface BgvCandidateAddress {
  address_type: 'Current' | 'Permanent';
  street: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
}

/** The Aadhaar address fields extracted from the DigiLocker eAadhaar XML. */
export interface AadhaarAddressLike {
  country?: string | null;
  district?: string | null;
  state?: string | null;
  house?: string | null;
  locality?: string | null;
  vtc?: string | null;
  subDistrict?: string | null;
  street?: string | null;
  landmark?: string | null;
  pincode?: string | null;
}

/** Shortest free-text address worth sending as a street line. */
const MIN_ADDRESS_CHARS = 10;

/**
 * A usable (non-errored) stored Aadhaar KYC, or null. A `{ __checkError }`
 * result means DigiLocker failed, so it can't supply anything.
 */
export function aadhaarKycOf(
  result: unknown,
): { name?: string | null; dob?: string | null } | null {
  if (!result || typeof result !== 'object' || '__checkError' in result) {
    return null;
  }
  return result as { name?: string | null; dob?: string | null };
}

/**
 * Read the structured address out of a stored Aadhaar KYC result. Returns null
 * for a missing/failed check so the caller falls back to the submitted address.
 */
export function aadhaarAddressOf(result: unknown): AadhaarAddressLike | null {
  if (!aadhaarKycOf(result)) return null;
  const address = (result as { address?: unknown }).address;
  if (!address || typeof address !== 'object') return null;
  return address as AadhaarAddressLike;
}

const str = (v: string | null | undefined): string => (v ?? '').trim();

/**
 * City picker for the bureau's `city` field. Aadhaar's address pyramid for
 * India is: house → street → loc → po → vtc → subdist → dist. For urban
 * Aadhaar the named city usually sits in `subdist` (Tehsil); `vtc` often holds
 * a smaller census town or ward (e.g. "R K Nagar" inside Kanpur). `district`
 * carries the canonical name but with a " Nagar" / " District" / " Rural" /
 * " Urban" suffix the bureau's search doesn't want.
 *
 * Precedence: subdist → district minus admin suffix → vtc.
 */
function pickAadhaarCity(addr: AadhaarAddressLike): string {
  const subDistrict = str(addr.subDistrict);
  if (subDistrict) return subDistrict;
  const stripped = stripDistrictSuffix(str(addr.district));
  if (stripped) return stripped;
  return str(addr.vtc);
}

function stripDistrictSuffix(district: string): string {
  if (!district) return '';
  return district.replace(/\s+(Nagar|District|Rural|Urban)$/i, '').trim();
}

/**
 * Build the candidate's `addresses[]` entry. Preference:
 *   1. Aadhaar's structured address — vendor-verified and complete.
 *   2. The submitted free-text address packed into `street`, with the rest
 *      blank (deliberately incomplete — see isCompleteStructuredAddress).
 * Returns null when there's no usable address at all, so the caller can omit
 * the field entirely.
 */
export function buildBgvAddress(
  aadhaarAddress: AadhaarAddressLike | null,
  submittedAddress: string,
  addressType: BgvCandidateAddress['address_type'] = 'Current',
): BgvCandidateAddress | null {
  if (aadhaarAddress) {
    // Concatenate the Aadhaar line-1 fragments so the bureau receives the most
    // specific identifier available, mirroring how a candidate would type it.
    const street = [
      str(aadhaarAddress.house),
      str(aadhaarAddress.street),
      str(aadhaarAddress.locality),
      str(aadhaarAddress.landmark),
    ]
      .filter((part) => part.length > 0)
      .join(', ');

    return {
      address_type: addressType,
      street,
      city: pickAadhaarCity(aadhaarAddress),
      state: str(aadhaarAddress.state),
      country: str(aadhaarAddress.country) || 'India',
      pincode: str(aadhaarAddress.pincode),
    };
  }

  const submitted = submittedAddress.trim();
  if (submitted.length >= MIN_ADDRESS_CHARS) {
    return {
      address_type: addressType,
      street: submitted,
      city: '',
      state: '',
      country: 'India',
      pincode: '',
    };
  }
  return null;
}

/**
 * Flatten a structured address into a single free-text line, for vendors that
 * take a plain address string (the crime/court check) rather than the bureau's
 * structured fields. Returns '' when there's nothing usable.
 */
export function formatAddressLine(addr: BgvCandidateAddress | null): string {
  if (!addr) return '';
  return [addr.street, addr.city, addr.state, addr.pincode, addr.country]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(', ');
}

/**
 * True only when every structured field the bureau requires is present.
 * (country always defaults to "India" above, so it's effectively a given.)
 */
export function isCompleteStructuredAddress(
  addr: BgvCandidateAddress | null,
): addr is BgvCandidateAddress {
  if (!addr) return false;
  return (
    addr.street.trim().length > 0 &&
    addr.city.trim().length > 0 &&
    addr.state.trim().length > 0 &&
    addr.country.trim().length > 0 &&
    addr.pincode.trim().length > 0
  );
}

/**
 * The bureau wants ISO `YYYY-MM-DD`. Our forms store DOB as `DD-MM-YYYY`, and
 * Aadhaar can hand back either — sending the raw form value is rejected as
 * "Validation failed". Ported from Recriauth's coerceToIsoDate.
 */
export function coerceToIsoDate(value: string): string | null {
  const v = (value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const ddmmyyyy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  const date = new Date(v);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Aadhaar's care-of field carries a relationship prefix — "S/O: Prakash",
 * "D/O Ramesh", "W/O Anil". Strip it to get a clean name. Ported from
 * Recriauth's stripRelationshipPrefix.
 *
 * Returns null for W/O: that's the husband, not the father, and sending it as
 * `father_name` would hand the bureau wrong data for a married woman. We fall
 * through to the next source instead.
 */
function fatherNameFromCareOf(careOf: string | null | undefined): string | null {
  const value = (careOf ?? '').trim();
  if (!value) return null;
  if (/^w\s*\/\s*o\b/i.test(value)) return null;
  const cleaned = value
    .replace(/^(?:s\s*\/\s*o|d\s*\/\s*o|c\s*\/\s*o)\s*:?\s*/i, '')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function readString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Pull a plausible father's-name field out of a stored vendor result. */
function fatherNameFromResult(result: unknown): string | null {
  if (!result || typeof result !== 'object' || '__checkError' in result) {
    return null;
  }
  const outer = result as Record<string, unknown>;
  const data =
    outer.data && typeof outer.data === 'object'
      ? (outer.data as Record<string, unknown>)
      : outer;
  for (const key of ['father_name', 'fathers_name', 'fatherName']) {
    const found = readString(data[key]);
    if (found) return found;
  }
  return null;
}

/**
 * Resolve the candidate's father's name, which the credit bureau requires and
 * which sharpens the criminal-record match. Priority:
 *   1. Verified Aadhaar care-of — vendor-verified, so most trustworthy
 *   2. PAN record — also vendor-sourced
 *   3. Whatever the client typed on the form
 */
export function resolveFatherName(subject: {
  aadhaarResult?: unknown;
  panResult?: unknown;
  fatherName?: string | null;
}): string | null {
  const aadhaar =
    subject.aadhaarResult &&
    typeof subject.aadhaarResult === 'object' &&
    !('__checkError' in subject.aadhaarResult)
      ? (subject.aadhaarResult as { address?: { careOf?: string | null } })
      : null;

  return (
    fatherNameFromResult(subject.aadhaarResult) ??
    fatherNameFromCareOf(aadhaar?.address?.careOf) ??
    fatherNameFromResult(subject.panResult) ??
    (readString(subject.fatherName) || null)
  );
}

/**
 * Reduce a stored phone (often E.164 like +918950789410) to the bare 10-digit
 * local number the vendor expects. Undefined when we can't get 10 digits.
 */
export function normalizePhone(raw: string): string | undefined {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 10) return undefined;
  return digits.length > 10 ? digits.slice(-10) : digits;
}
