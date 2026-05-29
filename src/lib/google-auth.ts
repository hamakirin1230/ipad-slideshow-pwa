export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function getGoogleClientId() {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
}

export function hasGoogleClientId() {
  return getGoogleClientId().length > 0;
}