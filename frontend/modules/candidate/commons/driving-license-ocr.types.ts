export interface DrivingLicenseOcrExtracted {
  documentType: string | null;
  licenseNumber: string | null;
  licenseNumberConfidence: number | null;
  dob: string | null;
  dobConfidence: number | null;
  dobIsYobOnly: boolean;
  sourceClientId: string;
  ocrAt: string;
}

export type DrivingLicenseOcrResponse =
  | {
      status: 'success';
      cached: false;
      verificationId: string;
      extractedData: DrivingLicenseOcrExtracted;
    }
  | {
      status: 'success';
      cached: true;
      verificationId: string;
      extractedData: Record<string, unknown> | null;
    };
