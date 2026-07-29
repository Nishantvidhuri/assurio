export interface VoterOcrFrontExtracted {
  documentType: string;
  side: 'front';
  fullName: string | null;
  fullNameConfidence: number | null;
  epicNumber: string | null;
  epicNumberConfidence: number | null;
  careOf: string | null;
  careOfConfidence: number | null;
  gender: string | null;
  genderConfidence: number | null;
  dob: string | null;
  dobConfidence: number | null;
  dobIsYobOnly: boolean;
  age: string | null;
  ageConfidence: number | null;
  // SurePass returns this as `doc`; surfaced under a clearer key.
  dateOnCard: string | null;
  dateOnCardConfidence: number | null;
  sourceClientId: string;
  ocrAt: string;
}

export interface VoterOcrBackExtracted {
  documentType: string;
  side: 'back';
  address: string | null;
  addressConfidence: number | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressLocality: string | null;
  addressLandmark: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  area: string | null;
  areaConfidence: number | null;
  district: string | null;
  districtConfidence: number | null;
  state: string | null;
  stateConfidence: number | null;
  assemblyConstituency: string | null;
  assemblyConstituencyConfidence: number | null;
  parliamentaryConstituency: string | null;
  parliamentaryConstituencyConfidence: number | null;
  pollingStation: string | null;
  pollingStationConfidence: number | null;
  sourceClientId: string;
  ocrAt: string;
}

export type VoterOcrExtracted = VoterOcrFrontExtracted | VoterOcrBackExtracted;

export type VoterOcrResponse =
  | {
      status: 'success';
      cached: false;
      verificationId: string;
      extractedData: VoterOcrExtracted;
    }
  | {
      status: 'success';
      cached: true;
      verificationId: string;
      extractedData: Record<string, unknown> | null;
    };
