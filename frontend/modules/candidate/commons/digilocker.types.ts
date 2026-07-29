export interface DigiLockerInitializeFreshResponse {
  completed: false;
  cached: false;
  clientId: string;
  url: string;
  expiresAt: string;
  verificationId: string;
}

export interface DigiLockerInitializeCachedResponse {
  completed: true;
  cached: true;
  verificationId: string;
  extractedData: Record<string, unknown> | null;
}

export type DigiLockerInitializeResponse =
  | DigiLockerInitializeFreshResponse
  | DigiLockerInitializeCachedResponse;

export type DigiLockerStatusResponse =
  | { completed: false }
  | {
      completed: true;
      cached: true;
      verificationId: string;
      extractedData: Record<string, unknown> | null;
    }
  | { completed: true; cached: false; processing: true }
  | {
      completed: true;
      cached: false;
      failed: true;
      verificationId: string;
      errorMessage: string;
    };
