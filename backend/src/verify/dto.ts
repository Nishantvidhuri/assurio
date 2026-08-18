import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class PanCheckDto {
  @Matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, {
    message: 'Enter a valid 10-character PAN (e.g. EKRPR1234F)',
  })
  idNumber: string;
}

export class VoterIdCheckDto {
  @IsString()
  @MinLength(1)
  idNumber: string;
}

export class PassportCheckDto {
  @IsString()
  @MinLength(5, { message: 'Enter a valid passport file number' })
  fileNumber: string;

  @Matches(/^\d{2}-\d{2}-\d{4}$/, { message: 'DOB must be in DD-MM-YYYY format' })
  dob: string;
}

export class DrivingLicenseCheckDto {
  @IsString()
  @MinLength(1)
  idNumber: string;

  @Matches(/^\d{2}-\d{2}-\d{4}$/, { message: 'DOB must be in DD-MM-YYYY format' })
  dob: string;
}

export class EmploymentHistoryDto {
  @Matches(/^\d{12}$/, { message: 'UAN must be exactly 12 digits' })
  uan: string;
}

export class CrimeCheckDto {
  // Vendor bounds, enforced here so a rejection surfaces as a field error
  // rather than a 400 from KonnectNxt.
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(255, { message: 'Name must be at most 255 characters' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: "Father's name must be at most 255 characters" })
  fatherName?: string;

  @IsOptional()
  @Matches(/^\d{2}-\d{2}-\d{4}$/, { message: 'DOB must be in DD-MM-YYYY format' })
  dob?: string;

  // Court records are searched on the PERMANENT address, which crime-check
  // takes as one free-text line (not the structured shape the credit bureau
  // demands). The vendor's own bounds are 10-255 characters.
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

export class CreditCheckDto {
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  name: string;

  @IsOptional()
  @IsString()
  fatherName?: string;

  @IsOptional()
  @IsString()
  dob?: string;

  // The credit bureau keys its search on PAN, so it is required here.
  @Matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, {
    message: 'PAN must be in format ABCDE1234F',
  })
  panNumber: string;

  // KonnectNXT rejects credit submissions without a complete structured
  // address, so street/city/state/pincode are all required.
  @IsString()
  @MinLength(1, { message: 'Street is required' })
  street: string;

  @IsString()
  @MinLength(1, { message: 'City is required' })
  city: string;

  @IsString()
  @MinLength(1, { message: 'State is required' })
  state: string;

  @Matches(/^\d{6}$/, { message: 'Pincode must be 6 digits' })
  pincode: string;

  @IsOptional()
  @IsString()
  country?: string;
}
