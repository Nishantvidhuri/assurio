import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Treat an empty string as "not supplied". @IsOptional only skips null and
 * undefined, so a blank field sent by a client would otherwise be validated
 * and rejected — a licence recall failed on "UAN must be 12 digits" because
 * the payload carried uan: ''.
 */
const Blank = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );

/**
 * Corrected inputs supplied when re-running a check ("Recall API").
 *
 * Every field is optional — an omitted one keeps whatever the record holds.
 * The service only applies the fields the chosen check actually uses, so a
 * value sent for an unrelated check is ignored rather than written.
 *
 * Formats are validated here so a typo comes back as a field error instead of
 * a wasted vendor call.
 */
export class RecheckOverridesDto {
  @IsOptional()
  @Blank()
  @Matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, {
    message: 'PAN must be in format ABCDE1234F',
  })
  panNumber?: string;

  @IsOptional()
  @Blank()
  @IsString()
  @MaxLength(32, { message: 'Voter ID looks too long' })
  voterId?: string;

  @IsOptional()
  @Blank()
  @IsString()
  @MaxLength(32, { message: 'Passport file number looks too long' })
  passportFileNo?: string;

  @IsOptional()
  @Blank()
  @IsString()
  @MaxLength(32, { message: 'Licence number looks too long' })
  drivingLicense?: string;

  @IsOptional()
  @Blank()
  @Matches(/^\d{12}$/, { message: 'UAN must be 12 digits' })
  uan?: string;

  // Stored as DD-MM-YYYY; each vendor call normalises it to whatever that
  // vendor expects.
  @IsOptional()
  @Blank()
  @Matches(/^\d{2}-\d{2}-\d{4}$/, {
    message: 'Date of birth must be DD-MM-YYYY',
  })
  dob?: string;
}
