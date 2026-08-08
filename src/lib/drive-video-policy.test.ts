import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DRIVE_VIDEO_MAX_BYTES,
  DRIVE_VIDEO_OFFLINE_MAX_BYTES,
  DRIVE_VIDEO_UPLOAD_TYPE,
  getEffectiveDriveVideoUnsupportedReason,
  getDriveVideoStorageDisposition,
  getLocalDriveVideoFileValidationCodes,
  isDriveVideoFileSizeWithinLimit,
  isSupportedDriveVideoMimeType,
  resolveLocalDriveVideoMimeType,
} from "./drive-video-policy";

describe("Drive video policy", () => {
  it("keeps the 50 MiB offline cap and defines the 5 GiB playback cap", () => {
    expect(DRIVE_VIDEO_OFFLINE_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(DRIVE_VIDEO_MAX_BYTES).toBe(5 * 1024 * 1024 * 1024);
    expect(Number.isSafeInteger(DRIVE_VIDEO_MAX_BYTES)).toBe(true);
  });

  it.each(["video/mp4", "video/quicktime"])(
    "supports %s for playback",
    (mimeType) => {
      expect(isSupportedDriveVideoMimeType(mimeType)).toBe(true);
    },
  );

  it("keeps other video MIME types unsupported", () => {
    expect(isSupportedDriveVideoMimeType("video/webm")).toBe(false);
  });

  it("ignores only the obsolete QuickTime unsupportedVideoMimeType marker", () => {
    expect(
      getEffectiveDriveVideoUnsupportedReason({
        mimeType: "video/quicktime",
        unsupportedReason: "unsupportedVideoMimeType",
      }),
    ).toBeUndefined();
    expect(
      getEffectiveDriveVideoUnsupportedReason({
        mimeType: "video/webm",
        unsupportedReason: "unsupportedVideoMimeType",
      }),
    ).toBe("unsupportedVideoMimeType");
  });

  it.each(["unsupportedMimeType", "videoPlaybackNotImplemented"] as const)(
    "keeps QuickTime %s markers effective",
    (unsupportedReason) => {
      expect(
        getEffectiveDriveVideoUnsupportedReason({
          mimeType: "video/quicktime",
          unsupportedReason,
        }),
      ).toBe(unsupportedReason);
    },
  );

  it.each([
    ["movie.mp4", "video/mp4", "video/mp4"],
    ["movie.mov", "video/quicktime", "video/quicktime"],
    ["movie.MOV", "", "video/quicktime"],
    ["movie.MP4", "", "video/mp4"],
    ["movie.mov", "application/octet-stream", "video/quicktime"],
    ["movie.mp4", "application/octet-stream", "video/mp4"],
  ] as const)(
    "resolves %s with %s as %s",
    (name, type, expected) => {
      expect(resolveLocalDriveVideoMimeType({ name, type })).toBe(expected);
    },
  );

  it.each([
    ["movie.mov", "video/mp4"],
    ["movie.mp4", "video/quicktime"],
  ] as const)("rejects conflicting MIME and extension for %s", (name, type) => {
    expect(resolveLocalDriveVideoMimeType({ name, type })).toBeNull();
  });

  it.each([
    ["video/mp4", "movie.mp4"],
    ["video/quicktime", "movie.mov"],
  ] as const)("accepts exactly 5 GiB %s local files", (type, name) => {
    const mimeType = resolveLocalDriveVideoMimeType({ name, type });
    expect(
      getLocalDriveVideoFileValidationCodes({
        size: DRIVE_VIDEO_MAX_BYTES,
        mimeType,
      }),
    ).toEqual([]);
    expect(isDriveVideoFileSizeWithinLimit(DRIVE_VIDEO_MAX_BYTES)).toBe(true);
  });

  it("rejects 5 GiB plus one byte before upload", () => {
    expect(
      getLocalDriveVideoFileValidationCodes({
        size: DRIVE_VIDEO_MAX_BYTES + 1,
        mimeType: "video/quicktime",
      }),
    ).toEqual(["fileTooLarge"]);
  });

  it("runs local validation before starting the Drive resumable upload", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../app/app-providers.tsx", import.meta.url)),
      "utf8",
    );
    const start = source.indexOf("async function startLocalVideoFileImport");
    const end = source.indexOf("async function startOfflineSync", start);
    const implementation = source.slice(start, end);
    const validationIndex = implementation.indexOf("validateLocalVideoFile(");
    const uploadIndex = implementation.indexOf("saveDriveProjectAsset({");

    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(uploadIndex).toBeGreaterThan(validationIndex);
    expect(implementation.slice(validationIndex, uploadIndex)).toContain(
      "continue;",
    );
    expect(implementation).toContain("uploadType: DRIVE_VIDEO_UPLOAD_TYPE");
  });

  it("rejects a zero-byte file", () => {
    expect(
      getLocalDriveVideoFileValidationCodes({
        size: 0,
        mimeType: "video/mp4",
      }),
    ).toEqual(["emptyFile"]);
  });

  it.each(["video/mp4", "video/quicktime"] as const)(
    "uses resumable upload for %s",
    () => {
      expect(DRIVE_VIDEO_UPLOAD_TYPE).toBe("resumable");
    },
  );

  it.each(["video/mp4", "video/quicktime"] as const)(
    "classifies %s by the shared offline and playback caps",
    (mimeType) => {
      expect(
        getDriveVideoStorageDisposition({
          mimeType,
          sizeBytes: DRIVE_VIDEO_OFFLINE_MAX_BYTES,
        }),
      ).toBe("offlineEligible");
      expect(
        getDriveVideoStorageDisposition({
          mimeType,
          sizeBytes: DRIVE_VIDEO_OFFLINE_MAX_BYTES + 1,
        }),
      ).toBe("remoteOnly");
      expect(
        getDriveVideoStorageDisposition({
          mimeType,
          sizeBytes: DRIVE_VIDEO_MAX_BYTES,
        }),
      ).toBe("remoteOnly");
      expect(
        getDriveVideoStorageDisposition({
          mimeType,
          sizeBytes: DRIVE_VIDEO_MAX_BYTES + 1,
        }),
      ).toBe("unsupported");
    },
  );

  it("returns only sanitized codes for rejected local input", () => {
    const serialized = JSON.stringify({
      mimeType: resolveLocalDriveVideoMimeType({
        name: "/private/path/secret.mov",
        type: "video/mp4",
      }),
      codes: getLocalDriveVideoFileValidationCodes({
        size: DRIVE_VIDEO_MAX_BYTES + 1,
        mimeType: null,
      }),
    });

    expect(serialized).not.toContain("/private/path");
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).toContain("unsupportedMimeType");
    expect(serialized).toContain("fileTooLarge");
  });
});
