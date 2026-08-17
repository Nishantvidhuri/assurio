import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

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
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  name: string;

  @IsOptional()
  @IsString()
  fatherName?: string;

  @IsOptional()
  @Matches(/^\d{2}-\d{2}-\d{4}$/, { message: 'DOB must be in DD-MM-YYYY format' })
  dob?: string;

  // Court records are searched on the PERMANENT address. The v2 BGV submit
  // takes it structured; unlike the credit bureau, KonnectNxt tolerates partial
  // fields here, so only street is mandatory.
  @IsString()
  @MinLength(1, { message: 'Street is required' })
  street: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

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
