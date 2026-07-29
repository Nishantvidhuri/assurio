/* ═══════════════════════════════════════════════════════════════════════════
 * normalizers — canonicalize raw vendor / OCR values before comparison.
 *
 * Each field type needs a different canonical form so that cosmetic
 * differences (case, punctuation, separators, abbreviations, date formats)
 * don't read as mismatches. These are pure string functions with no React /
 * DOM dependency, so the whole engine can later be lifted server-side.
 * ═══════════════════════════════════════════════════════════════════════ */

/** True when a value carries no comparable signal. */
export function isBlank(v: string | null | undefined): boolean {
  return v == null || v.trim().length === 0;
}

/* ── Identifiers ──────────────────────────────────────────────────────────
 * PAN, Aadhaar, passport no., DL no., EPIC, UAN, blood group. Strip spaces
 * and hyphens (vendors vary "KA-01-2020" vs "KA 01 2020") and uppercase. No
 * fuzzy matching — identifiers are binary.
 */
export function normalizeIdentifier(v: string): string {
  return v.replace(/[\s\-]/g, '').toUpperCase();
}

/** Matches a masked identifier such as Aadhaar `XXXXXXXX1234`. */
const MASKED_IDENTIFIER = /[X*]{2,}\d{2,}/i;

/** Last 4 digits of an identifier, ignoring all non-digit characters. */
function lastFourDigits(v: string): string {
  return v.replace(/\D/g, '').slice(-4);
}

/**
 * Detects whether either side of an identifier comparison is masked.
 * (e.g. Aadhaar OCR gives the full 12 digits, the verify API returns only
 * `XXXXXXXX1234`.) When masked, a strict equality check would always fail.
 */
export function isMaskedIdentifier(v: string): boolean {
  return MASKED_IDENTIFIER.test(v);
}

/**
 * Compares two identifiers where at least one is masked: equal when their
 * last 4 digits agree (and both actually have 4 digits to compare). Generic,
 * not Aadhaar-specific.
 */
export function compareMaskedIdentifier(a: string, b: string): boolean {
  const lastA = lastFourDigits(a);
  const lastB = lastFourDigits(b);
  return lastA.length === 4 && lastA === lastB;
}

/* ── Names ────────────────────────────────────────────────────────────────
 * Full name, father / care-of name. Strip honorifics and relation prefixes,
 * drop diacritics and punctuation, uppercase, collapse whitespace.
 */
const NAME_PREFIXES = /\b(?:MR|MRS|MS|DR|SHRI|SMT|S\/O|D\/O|W\/O|C\/O)\b/g;

export function normalizeName(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (combining marks)
    .toUpperCase()
    .replace(NAME_PREFIXES, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ') // drop punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalized name split into word tokens (empty array for blank input). */
export function nameTokens(v: string): string[] {
  const normalized = normalizeName(v);
  return normalized.length === 0 ? [] : normalized.split(' ');
}

/* ── Dates ────────────────────────────────────────────────────────────────
 * DOB, issue date. Coerce to YYYY-MM-DD. Year-only values (OCR sometimes
 * yields a bare YOB) return the 4-digit year so the strategy can do a
 * year-to-year comparison. Known placeholder / sentinel dates and anything
 * unparseable return null → NOT_PROVIDED, never a mismatch.
 *
 * NOTE: logic mirrors the server's identity-verify-dob-resolver.ts
 * `normalizeDobToYmd`. Duplicated here because that module is NestJS server
 * code; this matches the repo's share-by-duplication convention across tiers.
 */
const SENTINEL_DATES = new Set([
  '0000-00-00',
  '1800-01-01',
  '1900-01-01',
  '0001-01-01',
]);

export function normalizeDate(v: string): string | null {
  const trimmed = v.trim();
  if (trimmed.length === 0) return null;

  // Bare year (YOB only).
  if (/^\d{4}$/.test(trimmed)) return trimmed;

  // Already YYYY-MM-DD.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return SENTINEL_DATES.has(trimmed) ? null : trimmed;
  }

  // DD/MM/YYYY or DD-MM-YYYY → flip + dash-separate.
  const dmy = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    const ymd = `${yyyy}-${mm}-${dd}`;
    return SENTINEL_DATES.has(ymd) ? null : ymd;
  }

  return null;
}

/** True when a normalized date is a bare 4-digit year. */
export function isYearOnly(v: string): boolean {
  return /^\d{4}$/.test(v);
}

/* ── Gender ───────────────────────────────────────────────────────────────
 * Normalize M/Male → M, F/Female → F, Other/Transgender → O.
 */
export function normalizeGender(v: string): string {
  const t = v.trim().toUpperCase();
  if (/^M(ALE)?$/.test(t)) return 'M';
  if (/^F(EMALE)?$/.test(t)) return 'F';
  if (/^(O|OTHER|T|TG|TRANSGENDER)$/.test(t)) return 'O';
  return t;
}

/* ── Addresses ────────────────────────────────────────────────────────────
 * Uppercase, strip punctuation, collapse whitespace, then expand common
 * abbreviations so equivalent forms converge before fuzzy similarity.
 */
const ADDRESS_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bROAD\b/g, 'RD'],
  [/\bSTREET\b/g, 'ST'],
  [/\bMARG\b/g, 'RD'],
  [/\bNAGAR\b/g, 'NGR'],
  [/\bSECTOR\b/g, 'SEC'],
  [/\bAPARTMENTS?\b/g, 'APT'],
  [/\bBUILDING\b/g, 'BLDG'],
  [/\bFLOOR\b/g, 'FLR'],
  [/\bHOUSE\s*NO\b/g, 'HNO'],
  [/\bHOUSE\b/g, 'HNO'],
  [/\bOPPOSITE\b/g, 'OPP'],
  [/\bDISTRICT\b/g, 'DIST'],
  [/\bPOST\s*OFFICE\b/g, 'PO'],
];

export function normalizeAddress(v: string): string {
  let out = v
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [pattern, replacement] of ADDRESS_ABBREVIATIONS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, ' ').trim();
}
