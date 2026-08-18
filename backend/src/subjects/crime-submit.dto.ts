import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Operator-supplied crime-check payload. Bounds mirror KonnectNxt's own so a
 * bad field is rejected here with a field-level message, rather than spending
 * a submission to learn the same thing from the vendor.
 */
export class CrimeSubmitDto {
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(255, { message: 'Name must be at most 255 characters' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: "Father's name must be at most 255 characters" })
  fatherName?: string;

  // The vendor's pattern is DD-MM-YYYY; verify.service normalises either shape,
  // so accept the ISO the date input produces too.
  @IsOptional()
  @Matches(/^(\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2})$/, {
    message: 'Date of birth must be DD-MM-YYYY',
  })
  dob?: string;

  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Address must be at least 10 characters' })
  @MaxLength(255, { message: 'Address must be at most 255 characters' })
  address?: string;

  @IsOptional()
  @Matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, {
    message: 'PAN must be in format ABCDE1234F',
  })
  panNumber?: string;
}
