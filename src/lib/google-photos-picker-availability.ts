import { detectPwaInstallGuidePlatform } from "@/lib/pwa-install-browser";

export type GooglePhotosPickerAvailabilityInput = {
  userAgent: string;
  maxTouchPoints: number;
};

export type GooglePhotosPickerPlatform =
  | "ios"
  | "android"
  | "macos"
  | "windows"
  | "unsupported";

export function shouldOfferGooglePhotosPicker(
  input: GooglePhotosPickerAvailabilityInput,
): boolean {
  return getGooglePhotosPickerPlatform(input) !== "unsupported";
}

export function shouldReuseGooglePhotosPickerOAuthToken(
  platform: GooglePhotosPickerPlatform,
): boolean {
  return platform === "macos" || platform === "windows";
}

export function getGooglePhotosPickerPlatform(
  input: GooglePhotosPickerAvailabilityInput,
): GooglePhotosPickerPlatform {
  const platform = detectPwaInstallGuidePlatform(input.userAgent);

  if (platform === "android") {
    return "android";
  }

  if (platform === "ios") {
    return "ios";
  }

  // iPadOS 13+ can report a Macintosh desktop UA while remaining a touch tablet.
  if (input.userAgent.includes("Macintosh") && input.maxTouchPoints > 1) {
    return "ios";
  }

  if (isWindowsDesktopUserAgent(input.userAgent)) {
    return "windows";
  }

  if (isMacOsDesktopUserAgent(input.userAgent)) {
    return "macos";
  }

  return "unsupported";
}

export function subscribeGooglePhotosPickerAvailability(): () => void {
  return () => {};
}

export function readGooglePhotosPickerClientAvailability(): boolean {
  return readGooglePhotosPickerClientPlatform() !== "unsupported";
}

export function readGooglePhotosPickerClientPlatform(): GooglePhotosPickerPlatform {
  return getGooglePhotosPickerPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });
}

export function getGooglePhotosPickerServerAvailability(): boolean {
  return false;
}

function isWindowsDesktopUserAgent(userAgent: string): boolean {
  return userAgent.includes("Windows") && !userAgent.includes("Windows Phone");
}

function isMacOsDesktopUserAgent(userAgent: string): boolean {
  return userAgent.includes("Macintosh") || userAgent.includes("Mac OS X");
}
