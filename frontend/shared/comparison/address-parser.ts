/* ═══════════════════════════════════════════════════════════════════════════
 * address-parser — lightweight structured parser for Indian addresses.
 *
 * Free-form addresses are messy, but a few parts are reliably detectable and
 * carry most of the "is this the same place" signal:
 *   • pincode   — a 6-digit code
 *   • state     — matched against a gazetteer of Indian states / UTs + aliases
 *   • qualifiers — keyword-anchored unit identifiers (floor / flat / door /
 *                  house / block / wing / tower / sector / phase / plot …)
 *   • rest      — everything else (building / street / locality / city), left
 *                 as free text for fuzzy comparison by the caller
 *
 * This is intentionally rule-based, not ML: it extracts the high-confidence
 * structured fields and leaves the genuinely fuzzy remainder to fuzzy matching.
 * Pure TS (only depends on normalizeAddress) so it stays portable/server-safe.
 * ═══════════════════════════════════════════════════════════════════════ */

import { normalizeAddress } from './normalizers';

export interface AddressComponents {
  /** 6-digit pincode, or null if none found. */
  pincode: string | null;
  /** Canonical 2-letter state code (e.g. KA), or null. */
  state: string | null;
  /** Unit identifiers keyed by canonical name → normalized value (e.g. FLOOR→1, BLOCK→C). */
  qualifiers: Map<string, string>;
  /** Residual building/street/locality/city tokens for fuzzy comparison. */
  rest: string[];
}

// State / UT full names → canonical 2-letter code.
const STATES: Record<string, string> = {
  'ANDHRA PRADESH': 'AP',
  'ARUNACHAL PRADESH': 'AR',
  ASSAM: 'AS',
  BIHAR: 'BR',
  CHHATTISGARH: 'CG',
  GOA: 'GA',
  GUJARAT: 'GJ',
  HARYANA: 'HR',
  'HIMACHAL PRADESH': 'HP',
  JHARKHAND: 'JH',
  KARNATAKA: 'KA',
  KERALA: 'KL',
  'MADHYA PRADESH': 'MP',
  MAHARASHTRA: 'MH',
  MANIPUR: 'MN',
  MEGHALAYA: 'ML',
  MIZORAM: 'MZ',
  NAGALAND: 'NL',
  ODISHA: 'OD',
  PUNJAB: 'PB',
  RAJASTHAN: 'RJ',
  SIKKIM: 'SK',
  'TAMIL NADU': 'TN',
  TELANGANA: 'TS',
  TRIPURA: 'TR',
  'UTTAR PRADESH': 'UP',
  UTTARAKHAND: 'UK',
  'WEST BENGAL': 'WB',
  DELHI: 'DL',
  'JAMMU AND KASHMIR': 'JK',
  LADAKH: 'LA',
  PUDUCHERRY: 'PY',
  CHANDIGARH: 'CH',
};

// Common one/two-token aliases → canonical code (matched after full names).
const STATE_ALIAS: Record<string, string> = {
  UP: 'UP',
  MP: 'MP',
  AP: 'AP',
  TN: 'TN',
  HP: 'HP',
  HR: 'HR',
  MH: 'MH',
  WB: 'WB',
  JK: 'JK',
  UK: 'UK',
  TS: 'TS',
  RJ: 'RJ',
  PB: 'PB',
  KA: 'KA',
  KL: 'KL',
  GJ: 'GJ',
  BR: 'BR',
  OD: 'OD',
  ORISSA: 'OD',
  'NEW DELHI': 'DL',
};

// Longest-first so multi-word states match before any substring.
const STATE_PHRASES = Object.keys(STATES).sort((a, b) => b.length - a.length);

// Word floors → canonical value (G = ground, B = basement, LG = lower ground).
const FLOOR_WORDS: Record<string, string> = {
  GROUND: 'G',
  GRND: 'G',
  BASEMENT: 'B',
  LOWER: 'LG',
  FIRST: '1',
  SECOND: '2',
  THIRD: '3',
  FOURTH: '4',
  FIFTH: '5',
  SIXTH: '6',
  SEVENTH: '7',
  EIGHTH: '8',
  NINTH: '9',
  TENTH: '10',
  ELEVENTH: '11',
  TWELFTH: '12',
};

// Address keywords (post-abbreviation forms from normalizeAddress: FLOOR→FLR,
// SECTOR→SEC, HOUSE→HNO) → canonical qualifier name.
const KEYWORDS: Record<string, string> = {
  FLR: 'FLOOR',
  FLAT: 'FLAT',
  DOOR: 'DOOR',
  HNO: 'HOUSE',
  BLOCK: 'BLOCK',
  BLK: 'BLOCK',
  WING: 'WING',
  TOWER: 'TOWER',
  TWR: 'TOWER',
  SEC: 'SECTOR',
  PHASE: 'PHASE',
  PLOT: 'PLOT',
  SHOP: 'SHOP',
  ROOM: 'ROOM',
  GALA: 'GALA',
  UNIT: 'UNIT',
  NO: 'NUMBER',
};

// A token that can serve as a qualifier value: a number (12, 12A, 1ST), a
// letter-prefixed code (A1), a lone block letter (C), or a floor word.
function isValue(token: string): boolean {
  return (
    /^\d+(ST|ND|RD|TH)?$/.test(token) ||
    /^[A-Z]\d+$/.test(token) ||
    /^\d+[A-Z]$/.test(token) ||
    /^[A-Z]$/.test(token) ||
    token in FLOOR_WORDS
  );
}

// Canonicalize a qualifier value: word floors → code, and strip ordinal
// suffixes so "Sector 6" and "6th Sector" agree.
function normValue(canon: string, value: string): string {
  if (canon === 'FLOOR' && value in FLOOR_WORDS) return FLOOR_WORDS[value];
  const ordinal = value.match(/^(\d+)(ST|ND|RD|TH)$/);
  return ordinal ? ordinal[1] : value;
}

/** Parse a free-form address into structured components. */
export function parseAddress(raw: string): AddressComponents {
  let s = normalizeAddress(raw);

  // Pincode.
  let pincode: string | null = null;
  const pin = s.match(/\b(\d{6})\b/);
  if (pin && pin.index !== undefined) {
    pincode = pin[1];
    s = `${s.slice(0, pin.index)} ${s.slice(pin.index + pin[0].length)}`;
  }

  // State (full names first, longest match).
  let state: string | null = null;
  for (const phrase of STATE_PHRASES) {
    const re = new RegExp(`\\b${phrase}\\b`);
    if (re.test(s)) {
      state = STATES[phrase];
      s = s.replace(re, ' ');
      break;
    }
  }

  const tokens = s.split(/\s+/).filter(Boolean);

  // State aliases (token-level), only if no full name matched.
  if (!state) {
    for (let i = 0; i < tokens.length; i++) {
      const two = `${tokens[i]} ${tokens[i + 1] ?? ''}`.trim();
      if (STATE_ALIAS[two]) {
        state = STATE_ALIAS[two];
        tokens.splice(i, 2);
        break;
      }
      if (STATE_ALIAS[tokens[i]]) {
        state = STATE_ALIAS[tokens[i]];
        tokens.splice(i, 1);
        break;
      }
    }
  }

  // Keyword-anchored qualifiers (value after the keyword, else before it).
  const consumed = new Array<boolean>(tokens.length).fill(false);
  const qualifiers = new Map<string, string>();
  for (let i = 0; i < tokens.length; i++) {
    if (consumed[i]) continue;
    const canon = KEYWORDS[tokens[i]];
    if (!canon) continue;

    // Value after, skipping a connector ("NO" / "#") — e.g. "Flat No 12".
    let j = i + 1;
    while (j < tokens.length && (tokens[j] === 'NO' || tokens[j] === '#')) j++;
    if (
      j < tokens.length &&
      !consumed[j] &&
      isValue(tokens[j]) &&
      !KEYWORDS[tokens[j]]
    ) {
      qualifiers.set(canon, normValue(canon, tokens[j]));
      for (let k = i; k <= j; k++) consumed[k] = true;
      continue;
    }

    // Value before — e.g. "1st Floor", "C Block".
    if (
      i > 0 &&
      !consumed[i - 1] &&
      isValue(tokens[i - 1]) &&
      !KEYWORDS[tokens[i - 1]]
    ) {
      qualifiers.set(canon, normValue(canon, tokens[i - 1]));
      consumed[i] = true;
      consumed[i - 1] = true;
      continue;
    }

    consumed[i] = true; // lone keyword with no value
  }

  const rest = tokens.filter((_, i) => !consumed[i]);
  return { pincode, state, qualifiers, rest };
}
