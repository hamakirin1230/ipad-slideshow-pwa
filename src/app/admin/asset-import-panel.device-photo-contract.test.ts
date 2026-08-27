import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./asset-import-panel.tsx", import.meta.url)),
  "utf8",
);

describe("AssetImportPanel device photo picker", () => {
  it("adds a hidden local photo file input limited to JPEG, PNG, and WebP", () => {
    expect(source).toContain("localImageInputRef");
    expect(source).toContain('type="file"');
    expect(source).toContain(
      'accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"',
    );
    expect(source).toContain("handleLocalImageFileChange");
    expect(source).not.toContain("capture=");
  });

  it("keeps the photo file input multiple and resets the value after pick", () => {
    const photoHandlerStart = source.indexOf(
      "function handleLocalImageFileChange",
    );
    const photoHandlerEnd = source.indexOf(
      "function openLocalVideoFilePicker",
      photoHandlerStart,
    );
    const photoHandler = source.slice(photoHandlerStart, photoHandlerEnd);
    const photoInputStart = source.indexOf("ref={localImageInputRef}");
    const photoInput = source.slice(
      photoInputStart,
      source.indexOf("/>", photoInputStart),
    );

    expect(photoInput).toContain("multiple");
    expect(photoHandler).toContain("startLocalImageFileImport(files)");
    expect(photoHandler).toContain('event.currentTarget.value = ""');
  });

  it("opens the local photo picker from 写真を選ぶ and does not start Photos OAuth there", () => {
    const photoButtonStart = source.indexOf("onClick={openLocalImageFilePicker}");
    const photoButton = source.slice(
      photoButtonStart - 280,
      source.indexOf("</Button>", photoButtonStart),
    );

    expect(source).toContain("openLocalImageFilePicker");
    expect(source).toContain("onClick={openLocalImageFilePicker}");
    expect(source).toContain("getStartAssetImportButtonLabel(assetImportStatus)");
    expect(source).toContain('return "写真を選ぶ"');
    expect(photoButton).toContain("onClick={openLocalImageFilePicker}");
    expect(photoButton).not.toContain("startAssetImport");
  });

  it("keeps local photo and video buttons on every device", () => {
    expect(source).toContain("onClick={openLocalImageFilePicker}");
    expect(source).toContain("onClick={openLocalVideoFilePicker}");
    expect(source).toContain('return "写真を選ぶ"');
    expect(source).toContain("動画を選ぶ");
    expect(source.indexOf("onClick={openLocalImageFilePicker}")).toBeLessThan(
      source.indexOf("{offerGooglePhotosPicker ? ("),
    );
    expect(source.indexOf("onClick={openLocalVideoFilePicker}")).toBeLessThan(
      source.indexOf("{offerGooglePhotosPicker ? ("),
    );
  });

  it("offers Googleフォトから写真を選ぶ only after a hydration-safe client snapshot", () => {
    expect(source).toContain("useSyncExternalStore(");
    expect(source).toContain("subscribeGooglePhotosPickerAvailability");
    expect(source).toContain("readGooglePhotosPickerClientAvailability");
    expect(source).toContain("getGooglePhotosPickerServerAvailability");
    expect(source).not.toContain("navigator");
    expect(source).not.toContain("userAgent");
    expect(source).toContain("{offerGooglePhotosPicker ? (");
    expect(source).toContain("onClick={startAssetImport}");
    expect(source).toContain("Googleフォトから写真を選ぶ");
    expect(source).not.toContain(">Googleフォトから選ぶ<");
    expect(source).toContain("Googleフォトから追加できるのは写真のみです。");
    expect(source).toContain("動画は「動画を選ぶ」から追加してください。");
    expect(source).toContain(
      "macOS/Windowsでは、動画をローカルまたはGoogle Drive等から選べます。",
    );
    expect(source).toContain(
      "Googleフォトから写真を選ぶ場合は、Googleの利用許可画面が開きます。",
    );
    expect(source).toContain("写真と動画はこの端末から選べます。");
  });

  it("hides the Google Photos button unless the desktop snapshot is true", () => {
    const photosButtonStart = source.indexOf("{offerGooglePhotosPicker ? (");
    const photosButton = source.slice(
      photosButtonStart,
      source.indexOf("</Button>", photosButtonStart),
    );

    expect(photosButtonStart).toBeGreaterThan(source.indexOf("動画を選ぶ"));
    expect(photosButton).toContain("onClick={startAssetImport}");
    expect(photosButton).toContain("Googleフォトから写真を選ぶ");
    expect(source).toContain("getGooglePhotosPickerServerAvailability");
  });

  it("does not persist tokens or expose picker internals from the import panel", () => {
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("indexedDB");
    expect(source).not.toContain("document.cookie");
    expect(source).not.toContain("pickerUri");
    expect(source).not.toContain("access_token");
    expect(source).not.toContain("accessToken");
    expect(source).not.toContain("photosAccessToken");
    expect(source).not.toContain("sessionId");
  });

  it("does not change the local video file input path", () => {
    expect(source).toContain('accept="video/mp4,video/quicktime,.mov,.mp4"');
    expect(source).toContain("onClick={openLocalVideoFilePicker}");
    expect(source).toContain("startLocalVideoFileImport(files)");
    expect(source).toContain("動画を選ぶ");
  });
});
