export interface PassportOcrFrontExtracted {
  documentType: string;
  side: 'front';
  countryCode: string | null;
  countryCodeConfidence: number | null;
  givenName: string | null;
  givenNameConfidence: number | null;
  surname: string | null;
  surnameConfidence: number | null;
  gender: string | null;
  genderConfidence: number | null;
  dob: string | null;
  dobConfidence: number | null;
  dateOfIssue: string | null;
  dateOfIssueConfidence: number | null;
  dateOfExpiry: string | null;
  dateOfExpiryConfidence: number | null;
  nationality: string | null;
  nationalityConfidence: number | null;
  passportNumber: string | null;
  passportNumberConfidence: number | null;
  placeOfBirth: string | null;
  placeOfBirthConfidence: number | null;
  placeOfIssue: string | null;
  placeOfIssueConfidence: number | null;
  typeOfPassport: string | null;
  typeOfPassportConfidence: number | null;
  mrzLine1: string | null;
  mrzLine1Confidence: number | null;
  mrzLine2: string | null;
  mrzLine2Confidence: number | null;
  passportValidity: string | null;
  sourceClientId: string;
  ocrAt: string;
}

export interface PassportOcrBackExtracted {
  documentType: string;
  side: 'back';
  fileNumber: string | null;
  fileNumberConfidence: number | null;
  address: string | null;
  addressConfidence: number | null;
  pin: string | null;
  pinConfidence: number | null;
  fatherName: string | null;
  fatherNameConfidence: number | null;
  motherName: string | null;
  motherNameConfidence: number | null;
  spouseName: string | null;
  spouseNameConfidence: number | null;
  oldPassportNumber: string | null;
  oldPassportNumberConfidence: number | null;
  oldDateOfIssue: string | null;
  oldDateOfIssueConfidence: number | null;
  oldPlaceOfIssue: string | null;
  oldPlaceOfIssueConfidence: number | null;
  sourceClientId: string;
  ocrAt: string;
}

export type PassportOcrExtracted =
  | PassportOcrFrontExtracted
  | PassportOcrBackExtracted;

export type PassportOcrResponse =
  | {
      status: 'success';
      cached: false;
      verificationId: string;
      extractedData: PassportOcrExtracted;
    }
  | {
      status: 'success';
      cached: true;
      verificationId: string;
      extractedData: Record<string, unknown> | null;
    };
