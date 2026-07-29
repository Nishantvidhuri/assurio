/**
 * Shared helpers for searchable option lists (country / state / city
 * pickers, etc.): rank options against a query and split labels so the
 * matching substring can be emphasised.
 */

/** Escape a string so it can be safely embedded inside a `RegExp`. */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface RankedOption<T> {
  option: T;
  /** True when this option's label matched the query. */
  matches: boolean;
}

/**
 * Reorder `options` against a search `query`: options whose label contains
 * the query (case-insensitive substring) come first in their original
 * order, followed by the non-matching options (also in original order) so
 * the full list stays browsable. An empty query returns every option
 * unchanged with `matches: false`.
 */
export function rankOptionsByQuery<T>(
  options: readonly T[],
  query: string,
  getLabel: (option: T) => string,
): RankedOption<T>[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return options.map((option) => ({ option, matches: false }));
  }

  const regex = new RegExp(escapeRegExp(trimmed), 'i');
  const matched: RankedOption<T>[] = [];
  const rest: RankedOption<T>[] = [];

  for (const option of options) {
    const isMatch = regex.test(getLabel(option));
    (isMatch ? matched : rest).push({ option, matches: isMatch });
  }

  return [...matched, ...rest];
}

export interface LabelSegment {
  text: string;
  /** True for the segments that matched the query (render these bold). */
  highlight: boolean;
}

/**
 * Split `label` into segments around every case-insensitive occurrence of
 * `query`, so callers can render the matching parts emphasised. An empty
 * query yields a single non-highlighted segment.
 */
export function highlightMatch(label: string, query: string): LabelSegment[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [{ text: label, highlight: false }];
  }

  const regex = new RegExp(`(${escapeRegExp(trimmed)})`, 'ig');
  const segments: LabelSegment[] = [];
  let lastIndex = 0;

  for (const match of label.matchAll(regex)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ text: label.slice(lastIndex, start), highlight: false });
    }
    segments.push({ text: match[0], highlight: true });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < label.length) {
    segments.push({ text: label.slice(lastIndex), highlight: false });
  }

  return segments;
}
