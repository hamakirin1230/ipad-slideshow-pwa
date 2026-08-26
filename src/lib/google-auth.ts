export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
export const DRIVE_AND_PHOTOS_PICKER_SCOPES = [
  DRIVE_FILE_SCOPE,
  PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE,
].join(" ");
export const PHOTOS_LIBRARY_APPENDONLY_SCOPE =
  "https://www.googleapis.com/auth/photoslibrary.appendonly";

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

export type GoogleTokenError = {
  type?: "popup_failed_to_open" | "popup_closed" | "unknown";
};

export type PhotosPickerOauthPopupFailureCategory =
  | "popupFailedToOpen"
  | "popupClosed"
  | "unknownPopupFailure";

export type PhotosPickerOauthPopupFailureCopy = {
  category: PhotosPickerOauthPopupFailureCategory;
  message: string;
  diagnostic: string;
};

type GoogleTokenClientConfig = {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error?: GoogleTokenError) => void;
  prompt?: string;
  include_granted_scopes?: boolean;
};

type GoogleTokenClientOverrideConfig = {
  scope?: string;
  include_granted_scopes?: boolean;
  prompt?: string;
};

export type GoogleTokenClient = {
  requestAccessToken: (overrideConfig?: GoogleTokenClientOverrideConfig) => void;
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

export function hasGrantedDriveFileAndPhotosPickerScopes(
  tokenResponse: GoogleTokenResponse,
) {
  return (
    window.google?.accounts?.oauth2?.hasGrantedAllScopes(
      tokenResponse,
      DRIVE_FILE_SCOPE,
      PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE,
    ) ?? false
  );
}

export function hasGrantedPhotosLibraryAppendonlyScope(
  tokenResponse: GoogleTokenResponse,
) {
  return (
    window.google?.accounts?.oauth2?.hasGrantedAllScopes(
      tokenResponse,
      PHOTOS_LIBRARY_APPENDONLY_SCOPE,
    ) ?? false
  );
}

export function classifyPhotosPickerOauthPopupFailure(
  error?: Pick<GoogleTokenError, "type"> | null,
): PhotosPickerOauthPopupFailureCategory {
  if (error?.type === "popup_failed_to_open") {
    return "popupFailedToOpen";
  }

  if (error?.type === "popup_closed") {
    return "popupClosed";
  }

  return "unknownPopupFailure";
}

export function getPhotosPickerOauthPopupFailureCopy(
  error?: Pick<GoogleTokenError, "type"> | null,
): PhotosPickerOauthPopupFailureCopy {
  const category = classifyPhotosPickerOauthPopupFailure(error);

  if (category === "popupFailedToOpen") {
    return {
      category,
      message: "Google Photosの利用許可画面を開けませんでした。",
      diagnostic: "Google Photosの利用許可画面を開けませんでした。",
    };
  }

  if (category === "popupClosed") {
    return {
      category,
      message: "Google Photosの利用許可画面が完了前に閉じられました。",
      diagnostic: "Google Photosの利用許可画面が完了前に閉じられました。",
    };
  }

  return {
    category,
    message: "Google Photosの利用許可を完了できませんでした。",
    diagnostic: "Google Photosの利用許可を完了できませんでした。",
  };
}
