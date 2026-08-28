import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const providers = readFileSync(
  new URL("../app/app-providers.tsx", import.meta.url),
  "utf8",
);
const photosPicker = readFileSync(
  new URL("./google-photos-picker.ts", import.meta.url),
  "utf8",
);
const photosPickerTest = readFileSync(
  new URL("./google-photos-picker.test.ts", import.meta.url),
  "utf8",
);
const uniqueness = readFileSync(
  new URL("./project-title-uniqueness.ts", import.meta.url),
  "utf8",
);

function extractFunction(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\n  function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("photos picker 60-minute session wiring", () => {
  it("restores Photos OAuth into a dedicated ref without Drive status or GIS popup", () => {
    const restoreEffectStart = providers.indexOf(
      "void controller.restoreOnPageLoad();",
    );
    const restoreEffect = providers.slice(
      restoreEffectStart,
      providers.indexOf("}, []);", restoreEffectStart),
    );
    expect(restoreEffect).toContain("photosController?.restoreOnPageLoad()");
    expect(restoreEffect).not.toContain("requestAccessToken");
    expect(restoreEffect).not.toContain("setGoogleStatus");
    expect(restoreEffect).not.toContain("setDriveFileGranted");

    const photosOnRestoredStart = providers.indexOf(
      "createGooglePhotosPickerSessionClientController({",
    );
    const photosOnRestored = providers.slice(
      photosOnRestoredStart,
      providers.indexOf("const [driveStatus, setDriveStatus]", photosOnRestoredStart),
    );
    expect(photosOnRestored).toContain(
      "photosPickerAccessTokenRef.current = accessToken",
    );
    expect(photosOnRestored).not.toContain("setGoogleStatus");
    expect(photosOnRestored).not.toContain("accessTokenRef.current = accessToken");
    expect(photosOnRestored).not.toContain("queueDriveWorkspaceAutoCheck");
  });

  it("reuses a valid Photos session and always creates a new Picker selection", () => {
    const requestPhotos = extractFunction(providers, "requestPhotosAccessToken");
    expect(requestPhotos).toContain("photosPickerAccessTokenRef.current");
    expect(
      requestPhotos.indexOf("photosPickerAccessTokenRef.current"),
    ).toBeLessThan(requestPhotos.indexOf("requestAccessToken({"));
    expect(requestPhotos).toContain('prompt: "consent"');
    expect(requestPhotos).toContain("scope: DRIVE_AND_PHOTOS_PICKER_SCOPES");
    expect(requestPhotos).not.toContain("persistAfterManualConnect");
    expect(requestPhotos).not.toContain("/api/google-session/");

    const startImport = extractFunction(providers, "startAssetImport");
    expect(startImport).toContain("createPhotosPickerSession(");
    expect(startImport.indexOf("requestPhotosAccessToken")).toBeLessThan(
      startImport.indexOf("createPhotosPickerSession("),
    );
    expect(startImport).toContain("PHOTOS_PICKER_PHOTO_ONLY_MESSAGE");
    expect(startImport).not.toContain("sizeLimitBytes: DRIVE_VIDEO_MAX_BYTES");
  });

  it("persists Photos OAuth to the Photos session and invalidates on 401 without retry", () => {
    const photosResponse = extractFunction(providers, "handlePhotosTokenResponse");
    expect(photosResponse).toContain("persistAfterPhotosPickerConnect");
    expect(photosResponse).not.toContain("persistAfterManualConnect");
    expect(photosResponse).not.toContain("/api/google-session/");
    expect(photosResponse).not.toContain("requestAccessToken");

    const startImport = extractFunction(providers, "startAssetImport");
    expect(startImport).toContain("invalidatePhotosPickerSession()");
    expect(startImport).not.toContain("requestAccessToken({");
    const invalidate = extractFunction(providers, "invalidatePhotosPickerSession");
    expect(invalidate).toContain("photosPickerAccessTokenRef.current = null");
    expect(invalidate).toContain("deleteAfterLocalDisconnect()");
    expect(invalidate).not.toContain("accessTokenRef.current = null");
    expect(invalidate).not.toContain("googleSessionControllerRef");
    expect(invalidate).not.toContain("requestAccessToken");
  });

  it("does not mutually delete Drive and Photos sessions", () => {
    const disconnectStart = providers.indexOf("function disconnectGoogle(");
    const disconnect = providers.slice(
      disconnectStart,
      providers.indexOf("async function startAssetImport(", disconnectStart),
    );
    expect(disconnect).toContain("googleSessionControllerRef.current?.deleteAfterLocalDisconnect()");
    expect(disconnect).not.toContain("photosPickerSessionControllerRef");
    expect(disconnect).not.toContain("invalidatePhotosPickerSession");
    expect(disconnect).not.toContain("photosPickerAccessTokenRef.current = null");

    const driveAuthFailure = extractFunction(
      providers,
      "resetGoogleAfterDriveAuthFailure",
    );
    expect(driveAuthFailure).not.toContain("photosPickerSessionControllerRef");
    expect(driveAuthFailure).not.toContain("invalidatePhotosPickerSession");
  });

  it("does not put Photos tokens in client storage, context, or Drive session records", () => {
    expect(providers).not.toContain("localStorage");
    expect(providers).not.toContain("sessionStorage");
    expect(providers).not.toContain("document.cookie");
    expect(providers).not.toContain("setAccessToken");
    expect(providers).toContain("photosPickerAccessTokenRef");
    expect(providers).toContain(
      'from "@/lib/google-photos-picker-session/browser-session"',
    );
    expect(uniqueness).toContain("trim()");
    expect(uniqueness).toContain("toLowerCase()");
    expect(photosPicker).toContain("https://photospicker.googleapis.com/v1");
    expect(photosPicker).toContain("/sessions");
    expect(photosPickerTest).toContain("accepts selected PHOTO");
  });
});
