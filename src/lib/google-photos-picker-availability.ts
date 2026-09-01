import { detectPwaInstallGuidePlatform } from "@/lib/pwa-install-browser";

export type GooglePhotosPickerAvailabilityInput = {
  userAgent: string;
  maxTouchPoints: number;
};

export function shouldOfferGooglePhotosPicker(
  input: GooglePhotosPickerAvailabilityInput,
): boolean {
  const platform = detectPwaInstallGuidePlatform(input.userAgent);

  if (platform === "android" || platform === "ios") {
    return true;
  }

  // iPadOS 13+ can report a Macintosh desktop UA while remaining a touch tablet.
  if (input.userAgent.includes("Macintosh") && input.maxTouchPoints > 1) {
    return true;
  }

  if (isWindowsDesktopUserAgent(input.userAgent)) {
    return true;
  }

  return isMacOsDesktopUserAgent(input.userAgent);
}

export function subscribeGooglePhotosPickerAvailability(): () => void {
  return () => {};
}

export function readGooglePhotosPickerClientAvailability(): boolean {
  return shouldOfferGooglePhotosPicker({
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
