import { describe, expect, it } from "vitest";
import { PICKED_PHOTO_SIZE_LIMIT_BYTES } from "./google-photos-picker";
import {
  getLocalDriveImageFileValidationCodes,
  isSupportedDriveImageMimeType,
  resolveLocalImageFileMimeType,
} from "./drive-image-policy";

describe("Drive image policy", () => {
  it.each(["image/jpeg", "image/png", "image/webp"] as const)(
    "accepts %s",
    (mimeType) => {
      expect(isSupportedDriveImageMimeType(mimeType)).toBe(true);
      expect(
        resolveLocalImageFileMimeType({
          name: "photo.heic",
          type: mimeType,
        }),
      ).toBe(mimeType);
      expect(
        getLocalDriveImageFileValidationCodes({
          size: 1024,
          mimeType,
        }),
      ).toEqual([]);
    },
  );

  it.each(["image/heic", "image/heif", "image/heic-sequence", "image/gif"])(
    "rejects %s before Drive write",
    (mimeType) => {
      expect(isSupportedDriveImageMimeType(mimeType)).toBe(false);
      expect(
        resolveLocalImageFileMimeType({
          name: "photo.jpg",
          type: mimeType,
        }),
      ).toBeNull();
      expect(
        getLocalDriveImageFileValidationCodes({
          size: 1024,
          mimeType: null,
        }),
      ).toContain("unsupportedMimeType");
    },
  );

  it.each([
    ["photo.jpg", "image/jpeg"],
    ["photo.jpeg", "image/jpeg"],
    ["photo.png", "image/png"],
    ["photo.webp", "image/webp"],
  ] as const)(
    "fills an empty MIME from the %s extension as %s",
    (name, expected) => {
      expect(resolveLocalImageFileMimeType({ name, type: "" })).toBe(expected);
    },
  );

  it("does not guess HEIC/HEIF or override an unsupported MIME", () => {
    expect(
      resolveLocalImageFileMimeType({
        name: "IMG_0001.heic",
        type: "",
      }),
    ).toBeNull();
    expect(
      resolveLocalImageFileMimeType({
        name: "photo.jpg",
        type: "image/heic",
      }),
    ).toBeNull();
    expect(
      resolveLocalImageFileMimeType({
        name: "photo.heic",
        type: "image/jpeg",
      }),
    ).toBe("image/jpeg");
    expect(
      resolveLocalImageFileMimeType({
        name: "photo.jpg",
        type: "application/octet-stream",
      }),
    ).toBeNull();
  });

  it("reuses the existing Photos Picker photo size limit", () => {
    expect(PICKED_PHOTO_SIZE_LIMIT_BYTES).toBe(10 * 1024 * 1024);
    expect(
      getLocalDriveImageFileValidationCodes({
        size: PICKED_PHOTO_SIZE_LIMIT_BYTES,
        mimeType: "image/jpeg",
      }),
    ).toEqual([]);
    expect(
      getLocalDriveImageFileValidationCodes({
        size: PICKED_PHOTO_SIZE_LIMIT_BYTES + 1,
        mimeType: "image/jpeg",
      }),
    ).toEqual(["fileTooLarge"]);
  });

  it("rejects a zero-byte file", () => {
    expect(
      getLocalDriveImageFileValidationCodes({
        size: 0,
        mimeType: "image/png",
      }),
    ).toEqual(["emptyFile"]);
  });
});
