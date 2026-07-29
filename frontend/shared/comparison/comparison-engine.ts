/* ═══════════════════════════════════════════════════════════════════════════
 * comparisonEngine — field-type-aware Candidate-said vs Data-found matcher.
 *
 *   comparisonEngine.compare(fieldType, candidateValue, vendorValue)
 *     => { status, score }
 *
 * One strategy per field type (see ComparisonFieldType). Identifiers, dates
 * and gender are binary (MATCH / MISMATCH); names and addresses are fuzzy and
 * can also be PARTIAL_MATCH. A missing value on either side is always
 * NOT_PROVIDED — never a mismatch. All scoring runs through a single
 * underlying library (fastest-levenshtein, via similarity()).
 * ═══════════════════════════════════════════════════════════════════════ */

import {
  ComparisonFieldType,
  MatchStatus,
  type MatchResult,
} from './comparison-types';
import { similarity } from './similarity';
import {
  compareMaskedIdentifier,
  isBlank,
  isMaskedIdentifier,
  isYearOnly,
  nameTokens,
  normalizeDate,
  normalizeGender,
  normalizeIdentifier,
} from './normalizers';
import { parseAddress, type AddressComponents } from './address-parser';

/* Thresholds kept here as named constants so they can be tuned in one place
 * without touching strategy logic or call sites. */
export const NAME_MATCH_THRESHOLD = 95;
export const NAME_PARTIAL_THRESHOLD = 80;
export const ADDRESS_MATCH_THRESHOLD = 85;
export const ADDRESS_PARTIAL_THRESHOLD = 65;

const NOT_PROVIDED: MatchResult = {
  status: MatchStatus.NOT_PROVIDED,
  score: null,
};

function exact(equal: boolean): MatchResult {
  return equal
    ? { status: MatchStatus.MATCH, score: 100 }
    : { status: MatchStatus.MISMATCH, score: 0 };
}

// Order-insensitive 0–100 token score, shared by the name and address
// strategies (both are word lists where order is not meaningful). Returns the
// better of:
//   • token Dice — exact word overlap, ignoring order;
//   • character similarity on alphabetically-sorted tokens — tolerates typos.
// Reordered tokens ("S2 GANESHPURI" vs "GANESHPURI S2") therefore score 100.
function bestTokenScore(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 100;
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const shared = [...setA].filter((t) => setB.has(t)).length;
  const tokenDice = Math.round((2 * shared * 100) / (setA.size + setB.size));
  const charScore = similarity(
    [...tokensA].sort().join(' '),
    [...tokensB].sort().join(' '),
  );
  return Math.max(tokenDice, charScore);
}

// Distinguishing unit identifiers within an address: any token carrying a
// digit (floor / flat / door / house / plot / sector numbers, pincodes) plus
// lone-letter block / wing / plot codes ("C block" vs "D block"). A different
// value here means a different premises even when every surrounding word
// matches, so a full MATCH requires these to agree. Tokens are already
// uppercased by normalizeAddress.
function unitTokens(tokens: string[]): Set<string> {
  return new Set(tokens.filter((t) => /\d/.test(t) || /^[A-Z]$/.test(t)));
}

function compareIdentifier(candidate: string, vendor: string): MatchResult {
  // Masked identifiers (e.g. Aadhaar verify returns XXXXXXXX1234 against a
  // full 12-digit OCR value) compare on their last 4 digits only.
  if (isMaskedIdentifier(candidate) || isMaskedIdentifier(vendor)) {
    return exact(compareMaskedIdentifier(candidate, vendor));
  }
  return exact(normalizeIdentifier(candidate) === normalizeIdentifier(vendor));
}

function compareName(candidate: string, vendor: string): MatchResult {
  const tokensA = nameTokens(candidate);
  const tokensB = nameTokens(vendor);
  if (tokensA.length === 0 || tokensB.length === 0) return NOT_PROVIDED;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const shared = [...setA].filter((t) => setB.has(t)).length;
  const tokenDice = Math.round((2 * shared * 100) / (setA.size + setB.size));

  // Token containment is a categorical signal that overrides the raw score:
  //   • Identical token sets (any order) → MATCH. "Jay Verma" == "VERMA JAY".
  //   • One name's tokens fully contained in the other → PARTIAL, regardless
  //     of score. "Jay" ⊂ "Jay Verma" and "Sukesh Verma" ⊂ "Sukesh Kumar
  //     Verma" are shorter/extended forms of the same name, not mismatches —
  //     so they must not fall under the 80% mismatch cutoff.
  const aSubset = shared === setA.size;
  const bSubset = shared === setB.size;
  if (aSubset && bSubset) return { status: MatchStatus.MATCH, score: 100 };
  if (aSubset || bSubset) {
    return { status: MatchStatus.PARTIAL_MATCH, score: tokenDice };
  }

  // No containment → order-insensitive token score (also catches single-letter
  // typos like "Jay" vs "Jai") and threshold.
  const score = bestTokenScore(tokensA, tokensB);

  if (score >= NAME_MATCH_THRESHOLD) {
    return { status: MatchStatus.MATCH, score };
  }
  if (score >= NAME_PARTIAL_THRESHOLD) {
    return { status: MatchStatus.PARTIAL_MATCH, score };
  }
  return { status: MatchStatus.MISMATCH, score };
}

function compareDate(candidate: string, vendor: string): MatchResult {
  const a = normalizeDate(candidate);
  const b = normalizeDate(vendor);
  // Unparseable / sentinel on either side → treat as not provided.
  if (a === null || b === null) return NOT_PROVIDED;

  // When one side is year-only, the best we can do is compare years.
  if (isYearOnly(a) || isYearOnly(b)) {
    const matched = a.slice(0, 4) === b.slice(0, 4);
    return matched
      ? { status: MatchStatus.MATCH, score: null }
      : { status: MatchStatus.MISMATCH, score: 0 };
  }

  return exact(a === b);
}

function compareGender(candidate: string, vendor: string): MatchResult {
  return exact(normalizeGender(candidate) === normalizeGender(vendor));
}

// Flatten parsed components back into a canonical token list: residual text +
// each qualifier as (name, normalized value) + pincode + state. Scoring on
// this (rather than the residual alone) is robust to asymmetric parsing — a
// typo'd keyword ("bluk") stays a token and fuzzy-matches its canonical form
// ("block") — and normalizes ordinals so "6th Sector" == "Sector 6".
function canonicalAddressTokens(c: AddressComponents): string[] {
  const tokens = [...c.rest];
  for (const [name, value] of c.qualifiers) tokens.push(name, value);
  if (c.pincode) tokens.push(c.pincode);
  if (c.state) tokens.push(c.state);
  return tokens;
}

function compareAddress(candidate: string, vendor: string): MatchResult {
  const a = parseAddress(candidate);
  const b = parseAddress(vendor);

  const tokensA = canonicalAddressTokens(a);
  const tokensB = canonicalAddressTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return NOT_PROVIDED;

  // Order-insensitive token similarity over the canonical forms.
  const score = bestTokenScore(tokensA, tokensB);

  // Conflicts in distinguishing fields mean a different premises even when the
  // surrounding words match, so they are a hard MISMATCH (not just a partial)
  // — a different unit is a different address for BGV. Only genuine conflicts
  // count; a field present on one side only is missing info, not a
  // contradiction:
  //   • state present on both and different;
  //   • a shared unit qualifier (floor/flat/block/wing/sector/…) with a
  //     different value — incl. word forms like "Ground" vs "First" floor;
  //   • both sides carry unit tokens (numbers / lone-letter codes) that differ
  //     — catches a different door/pincode or a "C block" vs "D block".
  const stateConflict =
    a.state !== null && b.state !== null && a.state !== b.state;
  let qualifierConflict = false;
  for (const [key, value] of a.qualifiers) {
    const other = b.qualifiers.get(key);
    if (other !== undefined && other !== value) qualifierConflict = true;
  }
  // Unit tokens (numbers / lone-letter codes), split into two cases:
  //   • substitution — each side has a unit token the other lacks (C↔D,
  //     560102↔560103): a real contradiction → hard MISMATCH;
  //   • one-sided — a unit token on one side only (a stray leading "A", or one
  //     side carrying an extra pincode): missing info, not a contradiction, so
  //     it caps the result at PARTIAL rather than allowing a full MATCH.
  const unitsA = unitTokens(tokensA);
  const unitsB = unitTokens(tokensB);
  const aHasExtraUnit = [...unitsA].some((t) => !unitsB.has(t));
  const bHasExtraUnit = [...unitsB].some((t) => !unitsA.has(t));
  const unitSubstitution = aHasExtraUnit && bHasExtraUnit;
  const unitOneSided = aHasExtraUnit !== bHasExtraUnit;

  const conflict = stateConflict || qualifierConflict || unitSubstitution;

  if (conflict || score < ADDRESS_PARTIAL_THRESHOLD) {
    return { status: MatchStatus.MISMATCH, score };
  }
  if (unitOneSided || score < ADDRESS_MATCH_THRESHOLD) {
    return { status: MatchStatus.PARTIAL_MATCH, score };
  }
  return { status: MatchStatus.MATCH, score };
}

export const comparisonEngine = {
  compare(
    fieldType: ComparisonFieldType,
    candidateValue: string | null | undefined,
    vendorValue: string | null | undefined,
  ): MatchResult {
    // Missing on either side is never a mismatch.
    if (isBlank(candidateValue) || isBlank(vendorValue)) return NOT_PROVIDED;

    const candidate = (candidateValue as string).trim();
    const vendor = (vendorValue as string).trim();

    switch (fieldType) {
      case ComparisonFieldType.IDENTIFIER:
        return compareIdentifier(candidate, vendor);
      case ComparisonFieldType.NAME:
        return compareName(candidate, vendor);
      case ComparisonFieldType.DATE:
        return compareDate(candidate, vendor);
      case ComparisonFieldType.GENDER:
        return compareGender(candidate, vendor);
      case ComparisonFieldType.ADDRESS:
        return compareAddress(candidate, vendor);
      default:
        return NOT_PROVIDED;
    }
  },
};
