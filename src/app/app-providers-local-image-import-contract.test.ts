import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const providers = readFileSync(
  fileURLToPath(new URL("./app-providers.tsx", import.meta.url)),
  "utf8",
);

function extractLocalImageImport() {
  const start = providers.indexOf("async function startLocalImageFileImport");
  const end = providers.indexOf(
    "async function fetchProjectSlidePreviewBlob",
    start,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return providers.slice(start, end);
}

function extractLocalVideoImport() {
  const start = providers.indexOf("async function startLocalVideoFileImport");
  const end = providers.indexOf(
    "async function startLocalImageFileImport",
    start,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return providers.slice(start, end);
}

function extractAssetImport() {
  const start = providers.indexOf("async function startAssetImport(");
  const end = providers.indexOf(
    "async function startLocalVideoFileImport",
    start,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return providers.slice(start, end);
}

describe("local image file import contract", () => {
  it("does not start Photos OAuth or a Photos Picker session", () => {
    const implementation = extractLocalImageImport();

    expect(implementation).not.toContain("requestAccessToken");
    expect(implementation).not.toContain("requestPhotosAccessToken");
    expect(implementation).not.toContain("createPhotosPickerSession");
    expect(implementation).not.toContain("pickerUri");
    expect(implementation).not.toContain("photosAccessToken");
    expect(implementation).not.toContain("currentAssetImportAccessTokenRef");
    expect(implementation).not.toContain("listPickedMediaItems");
    expect(implementation).not.toContain("fetchAndValidatePickedPhoto");
  });

  it("uses the existing Drive token ref instead of a Photos token", () => {
    const implementation = extractLocalImageImport();

    expect(implementation).toContain("const accessToken = accessTokenRef.current");
    expect(implementation).not.toContain("accessTokenRef.current =");
    expect(implementation).not.toContain("photosExportAccessTokenRef");
  });

  it("validates JPEG/PNG/WebP and blocks over-selection before Drive write", () => {
    const implementation = extractLocalImageImport();
    const overSelectIndex = implementation.indexOf(
      "selectedFiles.length > assetImportMaxBatchCount",
    );
    const validationIndex = implementation.indexOf("validateLocalImageFile(");
    const uploadIndex = implementation.indexOf("saveDriveProjectAsset({");

    expect(overSelectIndex).toBeGreaterThanOrEqual(0);
    expect(overSelectIndex).toBeLessThan(implementation.indexOf("setAssetImportInFlightState(true)"));
    expect(implementation).toContain("Drive保存は実行しません。");
    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(uploadIndex).toBeGreaterThan(validationIndex);
    expect(implementation.slice(validationIndex, uploadIndex)).toContain("continue;");
    expect(implementation).not.toContain("uploadType:");
    expect(implementation).not.toContain("retry");
  });

  it("reuses Drive asset save and manifest batch append with localFile PHOTO metadata", () => {
    const implementation = extractLocalImageImport();

    expect(implementation).toContain("saveDriveProjectAsset({");
    expect(implementation).toContain('source: "localFile"');
    expect(implementation).toContain('mediaType: "PHOTO"');
    expect(implementation).toContain("appendDriveProjectAssetsToManifest({");
    expect(implementation).not.toContain("deleteDriveProjectAsset");
    expect(implementation).not.toContain("deleteDriveProject");
    expect(implementation).not.toContain("sessions.delete");
  });

  it("rejects HEIC/HEIF before Drive write with a sanitized image MIME error", () => {
    const validateStart = providers.indexOf("function validateLocalImageFile(");
    const validateEnd = providers.indexOf(
      "function validateLocalVideoFile(",
      validateStart,
    );
    const validate = providers.slice(validateStart, validateEnd);
    const implementation = extractLocalImageImport();

    expect(validate).toContain("JPEG、PNG、またはWebPの写真のみ追加できます。");
    expect(validate).toContain("photo は10MB以下のみ追加できます。");
    expect(implementation.indexOf("validateLocalImageFile(")).toBeLessThan(
      implementation.indexOf("saveDriveProjectAsset({"),
    );
  });

  it("does not change the local video resumable upload path", () => {
    const implementation = extractLocalVideoImport();

    expect(implementation).toContain("validateLocalVideoFile(");
    expect(implementation).toContain("uploadType: DRIVE_VIDEO_UPLOAD_TYPE");
    expect(implementation).toContain('mediaType: "VIDEO"');
    expect(implementation).not.toContain("startLocalImageFileImport");
  });

  it("keeps Google Photos Picker on startAssetImport", () => {
    const implementation = extractAssetImport();

    expect(implementation).toContain("requestPhotosAccessToken");
    expect(implementation).toContain("createPhotosPickerSession");
    expect(implementation).toContain('mediaType: "PHOTO" | "VIDEO"');
    expect(implementation).toContain("fetchAndValidatePickedPhoto");
    expect(implementation).toContain("currentAssetImportAccessTokenRef.current = photosAccessToken");
    expect(implementation).not.toContain("localStorage");
    expect(implementation).not.toContain("sessionStorage");
  });
});
