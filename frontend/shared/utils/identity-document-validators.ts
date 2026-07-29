/**
 * Identity document number validators and sanitizers.
 *
 * Each document type exports:
 * - `sanitize(value)` — light keystroke cleanup. Caps to `maxLength` and
 *   normalizes case/whitespace. Does NOT reject mid-typing characters that
 *   don't fit the positional format — wrong-character feedback is the job
 *   of `validate()` on submit, so users can freely edit/retype.
 * - `validate(value)` — returns error string or null (call on submit/next).
 *   Returns "Please enter a valid …" style messages for format mismatches.
 * - `maxLength` — max characters allowed
 * - `minLength` — min characters required
 * - `inputMode` — keyboard hint for mobile
 *
 * @example
 * ```ts
 * import { aadhaar, pan, passport } from '@/shared/utils/identity-document-validators';
 *
 * // On change — only caps length, lets user type freely:
 * const cleaned = aadhaar.sanitize(event.target.value);
 *
 * // On submit — surface "Please enter a valid …" if format is wrong:
 * const error = aadhaar.validate(cleaned);
 * if (error) setError(error);
 * ```
 */

export interface DocumentNumberHandler {
  /** Max characters allowed in the input */
  maxLength: number;
  /** Min characters required for valid input */
  minLength: number;
  /** Keyboard hint for mobile */
  inputMode: 'numeric' | 'text';
  /**
   * Light keystroke cleanup — caps length and normalizes case/whitespace.
   * Allows wrong-format characters; surface format errors via `validate()`
   * on submit instead of stripping mid-type.
   */
  sanitize: (value: string) => string;
  /** Returns error message or null if valid. Call on submit/next, not on every keystroke. */
  validate: (value: string) => string | null;
  /**
   * Live validation for keystroke feedback — only flags WRONG CHARACTERS at
   * the position they were entered. Does NOT report "too short" / min-length
   * errors (those are reserved for `validate()` on submit). Returns null
   * while the user is typing valid characters, even mid-way.
   */
  validateChars: (value: string) => string | null;
}

// ── Aadhaar ────────────────────────────────────────────────────────────
// Format: 12 digits (no spaces)
// Example: 234567890123
export const aadhaar: DocumentNumberHandler = {
  maxLength: 12,
  minLength: 12,
  inputMode: 'numeric',
  // Strip whitespace and cap to 12. Non-digit input is allowed through so
  // `validate()` can complain on submit — but since `inputMode="numeric"`
  // the soft keyboard already nudges digits.
  sanitize: (value) => value.replace(/\s+/g, '').slice(0, 12),
  validate: (value) => {
    if (!value) return 'Aadhaar number is required';
    if (!/^[0-9]+$/.test(value)) return 'Please enter a valid Aadhaar number';
    if (value.length !== 12) return 'Aadhaar number must be exactly 12 digits';
    if (/^[01]/.test(value)) return 'Aadhaar number cannot start with 0 or 1';
    return null;
  },
  validateChars: (value) => {
    if (!value) return null;
    if (!/^[0-9]+$/.test(value)) return 'Please enter a valid Aadhaar number';
    if (/^[01]/.test(value)) return 'Aadhaar number cannot start with 0 or 1';
    return null;
  },
};

// ── PAN ────────────────────────────────────────────────────────────────
// Format: ABCDE1234F (5 letters, 4 digits, 1 letter)
// Example: ABCDE1234F
export const pan: DocumentNumberHandler = {
  maxLength: 10,
  minLength: 10,
  inputMode: 'text',
  sanitize: (value) =>
    value.replace(/\s+/g, '').toUpperCase().slice(0, 10),
  validate: (value) => {
    if (!value) return 'PAN number is required';
    if (value.length !== 10) return 'PAN number must be exactly 10 characters';
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value)) {
      return 'Please enter a valid PAN number (e.g. ABCDE1234F)';
    }
    return null;
  },
  // Per-position rule: 0–4 letter, 5–8 digit, 9 letter. Flag the first
  // position where what was typed doesn't fit; ignore characters not yet
  // typed (so partial input like "ABC" stays valid mid-type).
  validateChars: (value) => {
    if (!value) return null;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      const expectsLetter = i < 5 || i === 9;
      const ok = expectsLetter ? /[A-Z]/.test(ch) : /[0-9]/.test(ch);
      if (!ok) return 'Please enter a valid PAN number (e.g. ABCDE1234F)';
    }
    return null;
  },
};

// ── Driving License ────────────────────────────────────────────────────
// Format: AA-12-YYYY-NNNNNNN
//   AA       — 2-letter state/UT code (e.g. KA, DL, MH)
//   12       — 2-digit RTO code
//   YYYY     — 4-digit year of issue
//   NNNNNNN  — 7-digit serial
// Segments may be separated by a hyphen or space, or run together.
// Examples: KA-01-2020-1234567, KA 01 2020 1234567, KA01202012345567
export const drivingLicense: DocumentNumberHandler = {
  // 15 logical chars + up to 3 separators
  maxLength: 18,
  minLength: 15,
  inputMode: 'text',
  sanitize: (value) => value.toUpperCase().slice(0, 18),
  validate: (value) => {
    if (!value) return 'Driving license number is required';
    if (!/^[A-Z]{2}[-\s]?[0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{7}$/.test(value)) {
      return 'Please enter a valid driving license number (e.g. KA-01-2020-1234567)';
    }
    return null;
  },
  // Walk left-to-right against the AA-12-YYYY-NNNNNNN layout, tracking the
  // logical (separator-skipping) position so half-typed input only complains
  // when a wrong character is actually entered.
  validateChars: (value) => {
    if (!value) return null;
    const msg =
      'Please enter a valid driving license number (e.g. KA-01-2020-1234567)';
    let logical = 0;
    let prevWasSeparator = false;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (ch === '-' || ch === ' ') {
        // Separators are only valid between segments and never consecutive.
        if (prevWasSeparator) return msg;
        if (logical !== 2 && logical !== 4 && logical !== 8) return msg;
        prevWasSeparator = true;
        continue;
      }
      prevWasSeparator = false;
      if (logical >= 15) return msg;
      const expectsLetter = logical < 2;
      const ok = expectsLetter ? /[A-Z]/.test(ch) : /[0-9]/.test(ch);
      if (!ok) return msg;
      logical++;
    }
    return null;
  },
};

// ── Passport (File Number, not booklet number) ─────────────────────────
// The form field captures the Indian passport **file number** — the
// internal Ministry of External Affairs tracking code used by passport
// verify + OCR, NOT the passport booklet number (A1234567).
//
// Format: 12 to 15 alphanumeric characters
//   Positions 1–2  : 2 letters — regional / Passport Seva Kendra code
//                                (e.g. DL, MU, BG, CH)
//   Positions 3–4  : 2 digits  — year of application (e.g. 26)
//   Positions 5–15 : 8 to 11 digits — serial number in the office's queue
// Example: BG2612345678901
export const passport: DocumentNumberHandler = {
  maxLength: 15,
  minLength: 12,
  inputMode: 'text',
  sanitize: (value) => value.replace(/\s+/g, '').toUpperCase().slice(0, 15),
  validate: (value) => {
    if (!value) return 'File number is required';
    if (value.length < 12 || value.length > 15) {
      return 'File number must be 12–15 characters (e.g. BG2612345678901)';
    }
    if (!/^[A-Z]{2}[0-9]{10,13}$/.test(value)) {
      return 'Please enter a valid file number (e.g. BG2612345678901)';
    }
    return null;
  },
  // Per-position rule: 0–1 letter, 2+ digit. Don't enforce total length
  // here — that's `validate()`'s job. Half-typed input like "BG26" stays
  // valid mid-type.
  validateChars: (value) => {
    if (!value) return null;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      const ok = i < 2 ? /[A-Z]/.test(ch) : /[0-9]/.test(ch);
      if (!ok) {
        return 'Please enter a valid file number (e.g. BG2612345678901)';
      }
    }
    return null;
  },
};

// ── Voter ID ───────────────────────────────────────────────────────────
// Format: 3 letters + 7 digits
// Example: ABC1234567
export const voterId: DocumentNumberHandler = {
  maxLength: 10,
  minLength: 10,
  inputMode: 'text',
  sanitize: (value) => value.replace(/\s+/g, '').toUpperCase().slice(0, 10),
  validate: (value) => {
    if (!value) return 'Voter ID is required';
    if (value.length !== 10) return 'Voter ID must be exactly 10 characters';
    if (!/^[A-Z]{3}[0-9]{7}$/.test(value)) {
      return 'Please enter a valid voter ID (e.g. ABC1234567)';
    }
    return null;
  },
  // Per-position rule: 0–2 letters, 3–9 digits.
  validateChars: (value) => {
    if (!value) return null;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      const ok = i < 3 ? /[A-Z]/.test(ch) : /[0-9]/.test(ch);
      if (!ok) return 'Please enter a valid voter ID (e.g. ABC1234567)';
    }
    return null;
  },
};

// ── GST (Goods & Services Tax Identification Number) ──────────────────
// Format: 15 characters
//   Positions 1–2  : 2 digits — state code (01–37, 38, or 97; 25 is reserved
//                              and unused; 00, 39–96 are not real states)
//   Positions 3–7  : 5 letters — PAN entity name
//   Positions 8–11 : 4 digits  — PAN sequence
//   Position  12   : 1 letter  — PAN check letter
//   Position  13   : 1 alphanumeric — entity number (1–9 or A–Z; never 0)
//   Position  14   : literal "Z"
//   Position  15   : 1 alphanumeric — checksum
// Example: 22AAAAA0000A1Z5
//
// Valid state codes (per GSTN): 01–24, 26–37 (J&K through Andhra Pradesh,
// minus reserved 25), 38 (Ladakh), 97 (Other Territory). The regex below
// encodes that subset; tightening here saves a paid upstream lookup against
// "format-valid but impossible state" inputs like 00…, 25…, 39…
const VALID_STATE_CODE_PREFIX = /^(0[1-9]|1[0-9]|2[0-46-9]|3[0-8]|97)/;
const GSTIN_FULL_REGEX =
  /^(0[1-9]|1[0-9]|2[0-46-9]|3[0-8]|97)[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[A-Z0-9]$/;

export const gst: DocumentNumberHandler = {
  maxLength: 15,
  minLength: 15,
  inputMode: 'text',
  sanitize: (value) => value.replace(/\s+/g, '').toUpperCase().slice(0, 15),
  validate: (value) => {
    if (!value) return 'GSTIN is required';
    if (value.length !== 15) return 'GSTIN must be exactly 15 characters';
    if (!GSTIN_FULL_REGEX.test(value)) {
      return 'Please enter a valid GSTIN (e.g. 22AAAAA0000A1Z5)';
    }
    return null;
  },
  // Per-position rule, walked left-to-right against the GSTIN layout.
  // Skips positions the user hasn't typed yet, so a half-typed "22A" stays
  // valid mid-type instead of complaining about missing characters.
  validateChars: (value) => {
    if (!value) return null;
    const msg = 'Please enter a valid GSTIN (e.g. 22AAAAA0000A1Z5)';
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      let ok = false;
      if (i === 0) {
        ok = /[0-9]/.test(ch);
      } else if (i === 1) {
        // Once we have both state digits, validate the pair against the
        // valid-state-code subset. "25", "00", "39"… fail here and the user
        // gets an instant error rather than typing 13 more chars first.
        ok =
          /[0-9]/.test(ch) && VALID_STATE_CODE_PREFIX.test(value.slice(0, 2));
      } else if (i < 7) ok = /[A-Z]/.test(ch);       // PAN entity
      else if (i < 11) ok = /[0-9]/.test(ch);        // PAN sequence
      else if (i === 11) ok = /[A-Z]/.test(ch);      // PAN check letter
      else if (i === 12) ok = /[1-9A-Z]/.test(ch);   // entity number (no 0)
      else if (i === 13) ok = ch === 'Z';            // literal Z
      else ok = /[A-Z0-9]/.test(ch);                 // checksum
      if (!ok) return msg;
    }
    return null;
  },
};

// ── UAN (Universal Account Number) ─────────────────────────────────────
// Format: 12 digits
// Example: 100123456789
export const uan: DocumentNumberHandler = {
  maxLength: 12,
  minLength: 12,
  inputMode: 'numeric',
  sanitize: (value) => value.replace(/\s+/g, '').slice(0, 12),
  validate: (value) => {
    if (!value) return null; // UAN is optional — empty is fine
    if (!/^[0-9]+$/.test(value)) return 'Please enter a valid UAN number';
    if (value.length !== 12) return 'UAN number must be exactly 12 digits';
    return null;
  },
  validateChars: (value) => {
    if (!value) return null;
    if (!/^[0-9]+$/.test(value)) return 'Please enter a valid UAN number';
    return null;
  },
};

// ── Handler lookup by section ID ───────────────────────────────────────
// Keys match the section IDs from the backend verification form config
// (server/.../verification-check-catalog.ts: `identity-${definitionKey}`)

const handlersBySectionId: Record<string, DocumentNumberHandler> = {
  'identity-aadhaar': aadhaar,
  'identity-pan': pan,
  'identity-drivingLicense': drivingLicense,
  'identity-passport': passport,
  'identity-voterId': voterId,
  'identity-uan': uan,
};

const defaultHandler: DocumentNumberHandler = {
  maxLength: 50,
  minLength: 1,
  inputMode: 'text',
  sanitize: (value) => value.slice(0, 50),
  validate: (value) => {
    if (!value) return 'Document number is required';
    return null;
  },
  validateChars: () => null,
};

/**
 * Get the document number handler for a given section ID.
 * Falls back to a permissive default handler for unknown types.
 */
export function getDocumentHandler(sectionId: string): DocumentNumberHandler {
  return handlersBySectionId[sectionId] ?? defaultHandler;
}
