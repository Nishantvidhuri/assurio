import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/**
 * Vendor Settings modal payload. All fields optional — only the ones present
 * are updated. `lowBalanceThreshold` accepts null to clear the threshold.
 */
export class UpdateVendorSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  lowBalanceThreshold?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(120_000)
  requestTimeoutMs?: number;

  @IsOptional()
  @IsBoolean()
  syncReportedBalance?: boolean;
}
