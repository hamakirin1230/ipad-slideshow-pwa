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
    expect(photoButton).toContain("onClick={openLocalImageFilePicker}");
    expect(photoButton).not.toContain("startAssetImport");
  });

  it("keeps Googleフォトから選ぶ on the existing Photos Picker entry", () => {
    expect(source).toContain("Googleフォトから選ぶ");
    expect(source).toContain("onClick={startAssetImport}");
    expect(source).toContain(
      "写真と動画はこの端末から選べます。Googleフォトから選ぶ場合は、Googleの利用許可画面が開きます。",
    );
  });

  it("does not change the local video file input path", () => {
    expect(source).toContain('accept="video/mp4,video/quicktime,.mov,.mp4"');
    expect(source).toContain("onClick={openLocalVideoFilePicker}");
    expect(source).toContain("startLocalVideoFileImport(files)");
    expect(source).toContain("動画を選ぶ");
  });
});
