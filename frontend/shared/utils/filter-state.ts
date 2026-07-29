/**
 * Filter state utilities — shared across table modules.
 *
 * `isFilteredEmpty` decides which empty state to render in a table:
 *   - When the dataset is empty AND filters/search are active → show
 *     `EmptyFiltersState` (no results found, prompting the user to clear filters)
 *   - When the dataset is empty AND no filters/search are active → fall through
 *     to the module-specific "create your first item" empty state
 */

export interface FilterStateInput {
  /** Number of rows currently visible in the table */
  itemCount: number;
  /** Whether any filter (status, package, etc.) is active */
  hasActiveFilters?: boolean;
  /** Whether a search query is active */
  hasActiveSearch?: boolean;
}

/**
 * Returns `true` if the table should show the "no results found" empty state
 * (when filters/search are applied but produce zero rows).
 *
 * @example
 * ```ts
 * const showEmptyFiltersState = isFilteredEmpty({
 *   itemCount: candidates.length,
 *   hasActiveFilters: statusFilter.length > 0 || packageFilter.length > 0,
 *   hasActiveSearch: searchQuery.length > 0,
 * });
 * ```
 */
export function isFilteredEmpty({
  itemCount,
  hasActiveFilters = false,
  hasActiveSearch = false,
}: FilterStateInput): boolean {
  return itemCount === 0 && (hasActiveFilters || hasActiveSearch);
}
