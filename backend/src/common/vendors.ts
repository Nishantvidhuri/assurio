// Central source of truth for vendor HTTP endpoints. Tokens live in env;
// everything else (base URL, endpoint paths, version) is part of the
// integration contract and lives in code so a new check is a one-constant
// addition with no env shuffling.
//
// If you ever need to point a vendor at a different host (e.g. a local mock),
// add an optional *_BASE_URL_OVERRIDE env var in the corresponding client.

export const SUREPASS = {
  baseUrl: 'https://kyc-api.surepass.app/api/v1',
  endpoints: {
    digilockerInitialize: '/digilocker/initialize',
    digilockerStatus: (clientId: string) =>
      `/digilocker/status/${encodeURIComponent(clientId)}`,
    // Must be called after status reports completed:true and BEFORE the
    // download endpoints. SurePass uses this to enumerate / prepare the
    // candidate's documents server-side; calling download-document before
    // list-documents returns 404 "File ID not found".
    digilockerListDocuments: (clientId: string) =>
      `/digilocker/list-documents/${encodeURIComponent(clientId)}`,
    // Structured Aadhaar data (name, dob, address, masked aadhaar, etc.)
    digilockerAadhaar: (clientId: string) =>
      `/digilocker/download-aadhaar/${encodeURIComponent(clientId)}`,
    // Returns a short-lived presigned URL for the raw Aadhaar PDF.
    digilockerAadhaarPdf: (clientId: string) =>
      `/digilocker/download-document/${encodeURIComponent(clientId)}/aadhaar`,
    ocrAadhaar: '/ocr/aadhaar',
    // SurePass /ocr/voter currently returns HTTP 500 (contact_support).
    // Scaffolded so the OCR pipeline lights up once upstream is fixed.
    ocrVoter: '/ocr/voter',
    ocrPan: '/ocr/pan',
    ocrPassport: '/ocr/passport',
    // Driving licence OCR is the odd one out: it accepts BOTH images in
    // a single multipart request (`front` + `back` fields) and returns
    // one combined payload, so we only call it once both sides have
    // been uploaded.
    ocrLicense: '/ocr/license',
    pan: '/pan/pan',
    voterId: '/voter-id/voter-id',
    passport: '/passport/passport/passport-details',
    drivingLicense: '/driving-license/driving-license',
    // SurePass's EPFO-driven employment-history endpoint. Keyed on the
    // candidate's 12-digit UAN, returns the EPFO record of every past
    // employer with joining / exit dates. The `-uan-v2` suffix is the
    // current canonical path (the older `/employment/employment-history`
    // shape returned 404).
    employmentHistory: '/income/employment-history-uan-v2',
  },
} as const;

export const KONNECT_NXT = {
  baseUrl: 'https://bgv.konnectnxt.com/api/v2',
  endpoints: {
    crimeCheck: '/verification/crime-check/',
  },
  // v2 BGV endpoints live under /api (NOT /api/v2). One submit endpoint serves
  // all BGV checks (criminal / credit-report / AML); one download endpoint
  // returns the report for a given case_id. Ported from Recriauth.
  bgvBaseUrl: 'https://bgv.konnectnxt.com/api',
  bgvEndpoints: {
    submit: '/async/v2/bgv-submit/',
    download: '/verification/bgv/download',
  },
} as const;
