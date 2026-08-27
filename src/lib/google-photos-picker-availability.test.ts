import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getGooglePhotosPickerServerAvailability,
  shouldOfferGooglePhotosPicker,
} from "./google-photos-picker-availability";

const source = readFileSync(
  fileURLToPath(new URL("./google-photos-picker-availability.ts", import.meta.url)),
  "utf8",
);

const MACOS_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MACOS_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPADOS_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Safari/537.36";
const LINUX_CHROME =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

describe("shouldOfferGooglePhotosPicker", () => {
  it("offers Google Photos on macOS desktop browsers", () => {
    expect(
      shouldOfferGooglePhotosPicker({
        userAgent: MACOS_CHROME,
        maxTouchPoints: 0,
      }),
    ).toBe(true);
    expect(
      shouldOfferGooglePhotosPicker({
        userAgent: MACOS_SAFARI,
        maxTouchPoints: 1,
      }),
    ).toBe(true);
  });

  it("offers Google Photos on Windows desktop browsers, including touch laptops", () => {
    expect(
      shouldOfferGooglePhotosPicker({
        userAgent: WINDOWS_CHROME,
        maxTouchPoints: 0,
      }),
    ).toBe(true);
    expect(
      shouldOfferGooglePhotosPicker({
        userAgent: WINDOWS_EDGE,
        maxTouchPoints: 10,
      }),
    ).toBe(true);
  });

  it("hides Google Photos on iPhone, iPad, iPadOS desktop UA, and Android", () => {
    expect(
      shouldOfferGooglePhotosPicker({
        userAgent: IPHONE_SAFARI,
        maxTouchPoints: 5,
      }),
    ).toBe(false);
    expect(
      shouldOfferGooglePhotosPicker({
        userAgent: IPAD_SAFARI,
        maxTouchPoints: 5,
      }),
    ).toBe(false);
    expect(
      shouldOfferGooglePhotosPicker({
        userAgent: IPADOS_DESKTOP_UA,
        maxTouchPoints: 5,
      }),
    ).toBe(false);
    expect(
      shouldOfferGooglePhotosPicker({
        userAgent: ANDROID_CHROME,
        maxTouchPoints: 5,
      }),
    ).toBe(false);
  });

  it("does not treat Linux desktop as a Google Photos picker surface", () => {
    expect(
      shouldOfferGooglePhotosPicker({
        userAgent: LINUX_CHROME,
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });

  it("keeps the SSR snapshot hidden to avoid hydration mismatch", () => {
    expect(getGooglePhotosPickerServerAvailability()).toBe(false);
    expect(source).toContain("detectPwaInstallGuidePlatform");
    expect(source).toContain("export function readGooglePhotosPickerClientAvailability");
    expect(source).toContain("navigator.userAgent");
    expect(source).toContain("navigator.maxTouchPoints");
    expect(source).toContain("export function getGooglePhotosPickerServerAvailability");
    expect(source).toContain("return false;");
  });
});
