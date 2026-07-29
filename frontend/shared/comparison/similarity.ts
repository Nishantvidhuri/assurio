import { distance } from 'fastest-levenshtein';

/* ═══════════════════════════════════════════════════════════════════════════
 * similarity — single underlying fuzzy primitive for the comparison engine.
 *
 * Wraps fastest-levenshtein's edit distance into a 0–100 score so every fuzzy
 * strategy (name, address) shares one scoring definition and one dependency.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Normalized Levenshtein similarity in the range 0–100.
 *
 * 100 = identical, 0 = maximally different (or one side empty). Inputs are
 * expected to be pre-normalized by the caller (uppercased, punctuation
 * stripped, etc.) so the distance reflects real character differences.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 100;
  if (a.length === 0 || b.length === 0) return 0;
  const maxLength = Math.max(a.length, b.length);
  return Math.round((1 - distance(a, b) / maxLength) * 100);
}
