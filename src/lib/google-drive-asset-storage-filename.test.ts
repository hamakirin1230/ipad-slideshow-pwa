import { describe, expect, it } from "vitest";
import { buildDriveProjectAssetStorageFilename } from "./google-drive";

describe("buildDriveProjectAssetStorageFilename", () => {
  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["video/mp4", "mp4"],
    ["video/quicktime", "mov"],
  ])("uses the canonical extension for %s", (mimeType, extension) => {
    expect(
      buildDriveProjectAssetStorageFilename({
        assetId: "asset-id",
        mimeType,
      }),
    ).toBe(`asset-id.${extension}`);
  });

  it("returns null for an unsupported legacy MIME instead of throwing", () => {
    expect(
      buildDriveProjectAssetStorageFilename({
        assetId: "asset-id",
        mimeType: "image/gif",
      }),
    ).toBeNull();
  });
});
