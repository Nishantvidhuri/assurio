import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { VendorName } from '../../../../../generated/prisma/client';

const SORTABLE_FIELDS = [
  'createdAt',
  'durationMs',
  'httpStatusCode',
  'vendor',
] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

export const HTTP_CLASS_VALUES = ['2xx', '3xx', '4xx', '5xx'] as const;
export type HttpClass = (typeof HTTP_CLASS_VALUES)[number];

export const CALL_OUTCOME_VALUES = ['success', 'failed'] as const;
export type CallOutcome = (typeof CALL_OUTCOME_VALUES)[number];

// Splits a query param that may arrive as a CSV string or repeated values
// into a trimmed string[] (same shape used across the internal list DTOs).
const csv = ({ value }: { value: unknown }): string[] | undefined => {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry).split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return undefined;
};

/**
 * Filters + pagination for the global vendor API call log (over
 * VendorApiCallAudit). Mirrors the offset-pagination + CSV-multi-select
 * conventions used by the other internal list endpoints.
 */
export class ListVendorCallsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  // Free text over requestId / endpoint / candidate case reference.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(csv)
  @IsEnum(VendorName, { each: true })
  vendor?: VendorName[];

  @IsOptional()
  @Transform(csv)
  @IsString({ each: true })
  method?: string[];

  // Curated endpoint tokens (see ENDPOINT_FILTER_OPTIONS on the client). Each
  // value may bundle several endpoints as a `|`-separated token list. A token
  // ending in `*` is a path-prefix match (dynamic-tail endpoints like
  // /digilocker/status/<id>, or a whole group like /ocr/*); otherwise it's an
  // exact-path match, tolerant of a trailing slash and any query string.
  @IsOptional()
  @Transform(csv)
  @IsString({ each: true })
  endpoint?: string[];

  // Capability codes (e.g. PAN_PAN) — resolved to verification types and
  // matched against the linked VendorVerification.
  @IsOptional()
  @Transform(csv)
  @IsString({ each: true })
  capability?: string[];

  @IsOptional()
  @Transform(csv)
  @IsIn(HTTP_CLASS_VALUES, { each: true })
  httpClass?: HttpClass[];

  @IsOptional()
  @IsIn(CALL_OUTCOME_VALUES)
  outcome?: CallOutcome;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sortBy?: SortableField = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
