import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRIVE_VIDEO_MAX_BYTES,
  DRIVE_VIDEO_OFFLINE_MAX_BYTES,
  getDriveVideoStorageDisposition,
} from "./drive-video-policy";
import { buildDriveProjectAssetStorageFilename } from "./google-drive";
import {
  fetchAndValidatePickedPhoto,
  isPhotosDownloadedAssetMimeType,
  normalizePickedMediaItem,
  PhotosPickerSelectionError,
} from "./google-photos-picker";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function videoItem(input: {
  mimeType: string;
  filename?: string | null;
  sizeBytes?: number;
}) {
  return {
    id: "media-item-1",
    type: "VIDEO",
    mediaFile: {
      baseUrl: "https://photos.example/base",
      mimeType: input.mimeType,
      filename: input.filename,
      ...(typeof input.sizeBytes === "number"
        ? { sizeBytes: input.sizeBytes }
        : {}),
    },
  };
}

function photoItem(input: { mimeType: string; filename?: string | null }) {
  return {
    id: "media-item-photo",
    type: "PHOTO",
    mediaFile: {
      baseUrl: "https://photos.example/photo",
      mimeType: input.mimeType,
      filename: input.filename ?? "IMG_0001.JPG",
    },
  };
}

async function downloadPickedMedia(input: {
  mediaType: "PHOTO" | "VIDEO";
  expectedMimeType: string;
  contentType: string;
  body?: Blob;
  contentLength?: string;
}) {
  const body =
    input.body ??
    new Blob(["media-bytes"], {
      type: input.contentType,
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: {
            "Content-Type": input.contentType,
            ...(input.contentLength
              ? { "Content-Length": input.contentLength }
              : {}),
          },
        }),
    ),
  );

  return fetchAndValidatePickedPhoto({
    accessToken: "token",
    baseUrl: "https://photos.example/base",
    mediaType: input.mediaType,
    expectedMimeType: input.expectedMimeType,
    signal: new AbortController().signal,
  });
}

describe("Google Photos Picker video/quicktime import", () => {
  it("keeps selected video/mp4 on the Drive save path", () => {
    const item = normalizePickedMediaItem(
      videoItem({
        mimeType: "video/mp4",
        filename: "clip.mp4",
        sizeBytes: 1_024,
      }),
    );

    expect(item.type).toBe("VIDEO");
    expect(item.mediaFile.mimeType).toBe("video/mp4");
    expect(item.mediaFile.filename).toBe("clip.mp4");
    expect(item.diagnostics.join("\n")).toContain(
      "video/mp4 を素材追加対象として処理します。",
    );
  });

  it("accepts selected video/quicktime and keeps IMG_3770.MOV", () => {
    const item = normalizePickedMediaItem(
      videoItem({
        mimeType: "video/quicktime",
        filename: "IMG_3770.MOV",
        sizeBytes: 2_048,
      }),
    );

    expect(item.type).toBe("VIDEO");
    expect(item.mediaFile.mimeType).toBe("video/quicktime");
    expect(item.mediaFile.filename).toBe("IMG_3770.MOV");
    expect(
      buildDriveProjectAssetStorageFilename({
        assetId: "asset-id",
        mimeType: item.mediaFile.mimeType,
      }),
    ).toBe("asset-id.mov");
  });

  it("resolves MOV from an empty or octet-stream MIME using the filename", () => {
    expect(
      normalizePickedMediaItem(
        videoItem({
          mimeType: "application/octet-stream",
          filename: "IMG_3770.MOV",
        }),
      ).mediaFile.mimeType,
    ).toBe("video/quicktime");
    expect(
      normalizePickedMediaItem({
        id: "media-item-1",
        type: "VIDEO",
        mediaFile: {
          baseUrl: "https://photos.example/base",
          mimeType: "   ",
          filename: "IMG_3770.MOV",
        },
      }).mediaFile.mimeType,
    ).toBe("video/quicktime");
  });

  it("rejects conflicting MIME and extension instead of guessing", () => {
    expect(() =>
      normalizePickedMediaItem(
        videoItem({
          mimeType: "video/mp4",
          filename: "IMG_3770.MOV",
        }),
      ),
    ).toThrow(PhotosPickerSelectionError);

    expect(() =>
      normalizePickedMediaItem(
        videoItem({
          mimeType: "video/quicktime",
          filename: "clip.mp4",
        }),
      ),
    ).toThrow(PhotosPickerSelectionError);
  });

  it("still rejects unsupported video MIME types before Drive save", () => {
    expect(() =>
      normalizePickedMediaItem(
        videoItem({
          mimeType: "video/webm",
          filename: "clip.webm",
        }),
      ),
    ).toThrow(PhotosPickerSelectionError);
  });

  it("lets a Google Photos MOV over 50 MiB proceed as remoteOnly", () => {
    const item = normalizePickedMediaItem(
      videoItem({
        mimeType: "video/quicktime",
        filename: "IMG_3770.MOV",
        sizeBytes: DRIVE_VIDEO_OFFLINE_MAX_BYTES + 1,
      }),
    );

    expect(item.mediaFile.mimeType).toBe("video/quicktime");
    expect(
      getDriveVideoStorageDisposition({
        mimeType: item.mediaFile.mimeType,
        sizeBytes: item.mediaFile.sizeBytes,
      }),
    ).toBe("remoteOnly");
  });

  it("keeps a Google Photos MOV at 50 MiB offlineEligible", () => {
    const item = normalizePickedMediaItem(
      videoItem({
        mimeType: "video/quicktime",
        filename: "IMG_3770.MOV",
        sizeBytes: DRIVE_VIDEO_OFFLINE_MAX_BYTES,
      }),
    );

    expect(
      getDriveVideoStorageDisposition({
        mimeType: item.mediaFile.mimeType,
        sizeBytes: item.mediaFile.sizeBytes,
      }),
    ).toBe("offlineEligible");
  });

  it("rejects Google Photos video above the 5 GiB Drive limit", () => {
    expect(() =>
      normalizePickedMediaItem(
        videoItem({
          mimeType: "video/quicktime",
          filename: "IMG_3770.MOV",
          sizeBytes: DRIVE_VIDEO_MAX_BYTES + 1,
        }),
      ),
    ).toThrow(PhotosPickerSelectionError);
  });

  it("does not treat PHOTO items as videos", () => {
    const item = normalizePickedMediaItem(
      photoItem({ mimeType: "image/jpeg" }),
    );

    expect(item.type).toBe("PHOTO");
    expect(item.mediaFile.mimeType).toBe("image/jpeg");
    expect(() =>
      normalizePickedMediaItem(
        photoItem({ mimeType: "video/quicktime", filename: "IMG_3770.MOV" }),
      ),
    ).toThrow(PhotosPickerSelectionError);
  });
});

describe("Google Photos Picker downloaded media validation", () => {
  it("accepts downloaded video/mp4 when the picker MIME matches", async () => {
    const result = await downloadPickedMedia({
      mediaType: "VIDEO",
      expectedMimeType: "video/mp4",
      contentType: "video/mp4",
    });

    expect(result.downloadedContentType).toBe("video/mp4");
    expect(result.sizeLimitBytes).toBe(DRIVE_VIDEO_MAX_BYTES);
    expect(isPhotosDownloadedAssetMimeType(result.downloadedContentType)).toBe(
      true,
    );
  });

  it("accepts downloaded video/quicktime when the picker MIME matches", async () => {
    const result = await downloadPickedMedia({
      mediaType: "VIDEO",
      expectedMimeType: "video/quicktime",
      contentType: "video/quicktime",
    });

    expect(result.downloadedContentType).toBe("video/quicktime");
    expect(
      getDriveVideoStorageDisposition({
        mimeType: result.downloadedContentType,
        sizeBytes: result.downloadedSizeBytes,
      }),
    ).toBe("offlineEligible");
  });

  it("does not reject a video/quicktime Content-Length above 50 MiB within 5 GiB", async () => {
    const result = await downloadPickedMedia({
      mediaType: "VIDEO",
      expectedMimeType: "video/quicktime",
      contentType: "video/quicktime",
      contentLength: String(DRIVE_VIDEO_OFFLINE_MAX_BYTES + 1),
    });

    expect(result.downloadedContentType).toBe("video/quicktime");
  });

  it("rejects a video Content-Length above 5 GiB before Drive save", async () => {
    await expect(
      downloadPickedMedia({
        mediaType: "VIDEO",
        expectedMimeType: "video/quicktime",
        contentType: "video/quicktime",
        contentLength: String(DRIVE_VIDEO_MAX_BYTES + 1),
      }),
    ).rejects.toBeInstanceOf(PhotosPickerSelectionError);
  });

  it("rejects downloaded MIME that does not match the picked video MIME", async () => {
    await expect(
      downloadPickedMedia({
        mediaType: "VIDEO",
        expectedMimeType: "video/quicktime",
        contentType: "video/mp4",
      }),
    ).rejects.toBeInstanceOf(PhotosPickerSelectionError);
  });

  it("rejects unsupported downloaded video MIME", async () => {
    await expect(
      downloadPickedMedia({
        mediaType: "VIDEO",
        expectedMimeType: "video/webm",
        contentType: "video/webm",
      }),
    ).rejects.toBeInstanceOf(PhotosPickerSelectionError);
  });

  it("keeps PHOTO jpeg downloads working and rejects video bytes as PHOTO", async () => {
    const photo = await downloadPickedMedia({
      mediaType: "PHOTO",
      expectedMimeType: "image/jpeg",
      contentType: "image/jpeg",
    });

    expect(photo.downloadedContentType).toBe("image/jpeg");

    await expect(
      downloadPickedMedia({
        mediaType: "PHOTO",
        expectedMimeType: "image/jpeg",
        contentType: "video/quicktime",
      }),
    ).rejects.toBeInstanceOf(PhotosPickerSelectionError);
  });
});

describe("Google Photos Picker MOV manifest contract", () => {
  it("does not persist tokens or expose picker internals from the MOV import path", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./google-photos-picker.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("indexedDB");
    expect(source).not.toContain("document.cookie");
    expect(source).toContain("resolveLocalDriveVideoMimeType");
    expect(source).toContain("isSupportedDriveVideoMimeType");
    expect(source).toContain("DRIVE_VIDEO_MAX_BYTES");
  });

  it("maps a saved video/quicktime asset to a video slide with .mov storage", () => {
    const googleDrive = readFileSync(
      fileURLToPath(new URL("./google-drive.ts", import.meta.url)),
      "utf8",
    );
    const builderStart = googleDrive.indexOf(
      "function buildDriveProjectManifestSlide(",
    );
    const builder = googleDrive.slice(
      builderStart,
      googleDrive.indexOf("function parseDriveProjectManifestJson(", builderStart),
    );

    expect(builder).toContain(
      'isVideoMimeType(input.savedAsset.driveMimeType) ? "video" : "image"',
    );
    expect(builder).toContain("mimeType: input.savedAsset.driveMimeType");
    expect(builder).toContain(
      "assetName: input.source.filename ?? input.savedAsset.driveFilename",
    );
    expect(builder).toContain("sourceMimeType: input.source.sourceMimeType");
    expect(builder).toContain("fileSize: input.savedAsset.driveSizeBytes");
    expect(
      buildDriveProjectAssetStorageFilename({
        assetId: "asset-id",
        mimeType: "video/quicktime",
      }),
    ).toBe("asset-id.mov");
    expect(
      getDriveVideoStorageDisposition({
        mimeType: "video/quicktime",
        sizeBytes: DRIVE_VIDEO_OFFLINE_MAX_BYTES + 1,
      }),
    ).toBe("remoteOnly");
  });
});
