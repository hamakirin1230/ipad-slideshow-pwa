export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export type GoogleConnectionStatus =
  | "scriptLoading"
  | "notConnected"
  | "missingClientId"
  | "connecting"
  | "connected"
  | "scopeMissing"
  | "error";

export type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
};

type GoogleTokenClientConfig = {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: () => void;
  prompt?: string;
  include_granted_scopes?: boolean;
};

export type GoogleTokenClient = {
  requestAccessToken: () => void;
};

type GoogleOAuth2 = {
  initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
  hasGrantedAllScopes: (
    tokenResponse: GoogleTokenResponse,
    ...scopes: string[]
  ) => boolean;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleOAuth2;
      };
    };
  }
}

export function getGoogleClientId() {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
}

export function hasGoogleClientId() {
  return getGoogleClientId().length > 0;
}

export function hasGrantedDriveFileScope(tokenResponse: GoogleTokenResponse) {
  return (
    window.google?.accounts?.oauth2?.hasGrantedAllScopes(
      tokenResponse,
      DRIVE_FILE_SCOPE,
    ) ?? false
  );
}