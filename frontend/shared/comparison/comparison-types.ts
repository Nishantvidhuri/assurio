/* ═══════════════════════════════════════════════════════════════════════════
 * Field Comparison Engine — shared types
 *
 * Powers the "Match" column in the verifier comparison table: classifies how
 * well a "Candidate said" value agrees with a "Data found" value, using a
 * different rule per field type (see comparison-engine.ts).
 * ═══════════════════════════════════════════════════════════════════════ */

/** Verdict for a single Candidate-said vs Data-found pair. */
export enum MatchStatus {
  /** Values agree (exact for identifiers/dates/gender, high similarity for fuzzy). */
  MATCH = 'MATCH',
  /** Fuzzy fields (name/address) that are close but not a confident match. */
  PARTIAL_MATCH = 'PARTIAL_MATCH',
  /** Values disagree. */
  MISMATCH = 'MISMATCH',
  /** One or both sides are missing — never treated as a mismatch. */
  NOT_PROVIDED = 'NOT_PROVIDED',
}

/** Selects which matching strategy the engine applies to a pair of values. */
export enum ComparisonFieldType {
  /** PAN, Aadhaar, passport no., DL no., EPIC, UAN, blood group — exact only. */
  IDENTIFIER = 'IDENTIFIER',
  /** Full name, father/care-of name — normalize then fuzzy similarity. */
  NAME = 'NAME',
  /** DOB, issue date — normalize formats to YYYY-MM-DD then exact. */
  DATE = 'DATE',
  /** Gender — normalize M/Male, F/Female then exact. */
  GENDER = 'GENDER',
  /** Postal address — normalize + expand abbreviations then fuzzy similarity. */
  ADDRESS = 'ADDRESS',
}

export interface MatchResult {
  status: MatchStatus;
  /**
   * 0–100 similarity score used internally for thresholding. `null` when a
   * score is not meaningful (NOT_PROVIDED, or year-only date matches). The
   * verifier UI renders a badge only and does not display this number, but it
   * is kept on the result for debugging, future tuning, and audit.
   */
  score: number | null;
}
