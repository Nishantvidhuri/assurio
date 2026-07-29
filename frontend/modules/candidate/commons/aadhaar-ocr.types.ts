export interface AadhaarOcrFrontExtracted {
  documentType: string;
  side: 'front';
  fullName: string | null;
  fullNameConfidence: number | null;
  gender: string | null;
  genderConfidence: number | null;
  motherName: string | null;
  motherNameConfidence: number | null;
  fatherName: string | null;
  fatherNameConfidence: number | null;
  dob: string | null;
  dobConfidence: number | null;
  dobIsYobOnly: boolean;
  aadhaarNumber: string | null;
  aadhaarNumberConfidence: number | null;
  aadhaarIsMasked: boolean;
  uniquenessId: string | null;
  sourceClientId: string;
  ocrAt: string;
}

export interface AadhaarOcrBackExtracted {
  documentType: string;
  side: 'back';
  address: string | null;
  addressConfidence: number | null;
  addressFirstLine: string | null;
  addressSecondLine: string | null;
  addressLocality: string | null;
  addressLandmark: string | null;
  addressHouseNumber: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressCountry: string | null;
  addressZip: string | null;
  zip: string | null;
  zipConfidence: number | null;
  careOf: string | null;
  careOfConfidence: number | null;
  careOfRelation: string | null;
  aadhaarNumber: string | null;
  aadhaarNumberConfidence: number | null;
  aadhaarIsMasked: boolean;
  sourceClientId: string;
  ocrAt: string;
}

export type AadhaarOcrExtracted =
  | AadhaarOcrFrontExtracted
  | AadhaarOcrBackExtracted;

export type AadhaarOcrResponse =
  | {
      status: 'success';
      cached: false;
      verificationId: string;
      extractedData: AadhaarOcrExtracted;
    }
  | {
      status: 'success';
      cached: true;
      verificationId: string;
      extractedData: Record<string, unknown> | null;
    };
