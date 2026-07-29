export interface PanOcrExtracted {
  documentType: string;
  panNumber: string | null;
  panNumberConfidence: number | null;
  fullName: string | null;
  fullNameConfidence: number | null;
  fatherName: string | null;
  fatherNameConfidence: number | null;
  dob: string | null;
  dobConfidence: number | null;
  sourceClientId: string;
  ocrAt: string;
}

export type PanOcrResponse =
  | {
      status: 'success';
      cached: false;
      verificationId: string;
      extractedData: PanOcrExtracted;
    }
  | {
      status: 'success';
      cached: true;
      verificationId: string;
      extractedData: Record<string, unknown> | null;
    };
