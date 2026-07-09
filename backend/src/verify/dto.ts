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

  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Address must be at least 10 characters' })
  address?: string;

  @IsOptional()
  @Matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, {
    message: 'PAN must be in format ABCDE1234F',
  })
  panNumber?: string;
}
