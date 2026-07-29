/**
 * Field Comparison Engine — public surface.
 *
 * Usage:
 *   import { comparisonEngine, ComparisonFieldType } from '@/shared/comparison';
 *   const result = comparisonEngine.compare(ComparisonFieldType.NAME, a, b);
 */
export {
  MatchStatus,
  ComparisonFieldType,
  type MatchResult,
} from './comparison-types';
export {
  comparisonEngine,
  NAME_MATCH_THRESHOLD,
  NAME_PARTIAL_THRESHOLD,
  ADDRESS_MATCH_THRESHOLD,
  ADDRESS_PARTIAL_THRESHOLD,
} from './comparison-engine';
export { similarity } from './similarity';
export {
  isBlank,
  normalizeIdentifier,
  normalizeName,
  normalizeDate,
  normalizeGender,
  normalizeAddress,
} from './normalizers';
export { parseAddress, type AddressComponents } from './address-parser';
