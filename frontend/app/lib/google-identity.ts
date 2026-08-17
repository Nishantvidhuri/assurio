'use client';

/**
 * Google Identity Services — popup authorization-code flow for our own
 * "Continue with Google" button.
 *
 * The popup returns a one-time authorization code; we hand it to
 * POST /auth/google, where the server (holding the client secret) exchanges
 * and verifies it. No Google tokens are ever handled in the browser.
 */

interface CodeClient {
  requestCode: () => void;
}

interface CodeResponse {
  code?: string;
  error?: string;
  error_description?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode: 'popup';
            callback: (response: CodeResponse) => void;
            error_callback?: (error: { type?: string }) => void;
          }) => CodeClient;
        };
      };
    };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisLoading: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gisLoading = null;
        reject(new Error('Could not load Google sign-in. Check your connection.'));
      };
      document.head.appendChild(script);
    });
  }
  return gisLoading;
}

/**
 * Open the Google sign-in popup and resolve with a one-time authorization
 * code. Rejects with a user-showable message on dismissal or failure.
 */
export async function requestGoogleAuthCode(): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('Google sign-in is not configured.');
  }
  await loadGis();
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Could not load Google sign-in. Please try again.');
  }

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: clientId,
      // openid+email+profile — just enough to identify the account.
      scope: 'openid email profile',
      ux_mode: 'popup',
      callback: (response) => {
        if (response.code) resolve(response.code);
        else
          reject(
            new Error(
              response.error_description || 'Google sign-in was cancelled.',
            ),
          );
      },
      error_callback: () =>
        reject(new Error('Google sign-in was cancelled.')),
    });
    client.requestCode();
  });
}
