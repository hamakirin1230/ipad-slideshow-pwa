import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLocalDriveVideoMimeType } from "./drive-video-policy";
import {
  PHOTOS_PICKER_PHOTO_ONLY_MESSAGE,
  fetchAndValidatePickedPhoto,
  isPhotosDownloadedAssetMimeType,
  normalizePickedMediaItem,
  PhotosPickerSelectionError,
} from "./google-photos-picker";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function videoItem(input: { mimeType: string; filename?: string | null }) {
  return {
    id: "media-item-1",
    type: "VIDEO",
    mediaFile: {
      baseUrl: "https://photos.example/base",
      mimeType: input.mimeType,
      filename: input.filename,
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

function expectPhotosPickerVideoRejected(error: unknown) {
  expect(error).toBeInstanceOf(PhotosPickerSelectionError);
  if (!(error instanceof PhotosPickerSelectionError)) {
    return;
  }

  expect(error.status).toBe("invalid");
  expect(error.message).toBe(PHOTOS_PICKER_PHOTO_ONLY_MESSAGE);
  expect(error.diagnostics).toContain(PHOTOS_PICKER_PHOTO_ONLY_MESSAGE);
  expect(error.diagnostics).toContain("Drive保存: 未実行");
  expect(error.diagnostics).toContain("manifest反映: 未実行");
  expect(error.diagnostics.join("\n")).not.toContain("photos.example");
  expect(error.diagnostics.join("\n")).not.toContain("token");
  expect(error.diagnostics.join("\n")).not.toContain("pickerUri");
  expect(error.diagnostics.join("\n")).not.toContain("projectId");
  expect(error.diagnostics.join("\n")).not.toMatch(/\bsession\b/i);
}

function stubPhotoDownload(contentType: string) {
  const fetchMock = vi.fn(
    async () =>
      new Response(new Blob(["photo-bytes"], { type: contentType }), {
        status: 200,
        headers: {
          "Content-Type": contentType,
        },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Google Photos Picker photo-only import", () => {
  it.each([
    ["image/jpeg", "IMG_0001.JPG"],
    ["image/png", "IMG_0001.PNG"],
    ["image/webp", "IMG_0001.webp"],
  ] as const)("accepts selected PHOTO %s", (mimeType, filename) => {
    const item = normalizePickedMediaItem(photoItem({ mimeType, filename }));

    expect(item.type).toBe("PHOTO");
    expect(item.mediaFile.mimeType).toBe(mimeType);
    expect(item.mediaFile.filename).toBe(filename);
    expect(isPhotosDownloadedAssetMimeType(item.mediaFile.mimeType)).toBe(true);
  });

  it.each(["video/mp4", "video/quicktime"] as const)(
    "rejects selected VIDEO %s before download",
    (mimeType) => {
      try {
        normalizePickedMediaItem(
          videoItem({
            mimeType,
            filename:
              mimeType === "video/quicktime" ? "IMG_3770.MOV" : "clip.mp4",
          }),
        );
        throw new Error("expected VIDEO rejection");
      } catch (error) {
        expectPhotosPickerVideoRejected(error);
      }
    },
  );

  it("does not treat PHOTO items as videos", () => {
    const item = normalizePickedMediaItem(photoItem({ mimeType: "image/jpeg" }));

    expect(item.type).toBe("PHOTO");
    expect(item.mediaFile.mimeType).toBe("image/jpeg");
    expect(() =>
      normalizePickedMediaItem(
        photoItem({ mimeType: "video/quicktime", filename: "IMG_3770.MOV" }),
      ),
    ).toThrow(PhotosPickerSelectionError);
  });

  it("keeps local video MIME/extension mismatch rejection unchanged", () => {
    expect(
      resolveLocalDriveVideoMimeType({
        name: "IMG_3770.MOV",
        type: "video/mp4",
      }),
    ).toBeNull();
    expect(
      resolveLocalDriveVideoMimeType({
        name: "clip.mp4",
        type: "video/quicktime",
      }),
    ).toBeNull();
    expect(
      resolveLocalDriveVideoMimeType({
        name: "clip.mp4",
        type: "video/mp4",
      }),
    ).toBe("video/mp4");
    expect(
      resolveLocalDriveVideoMimeType({
        name: "IMG_3770.MOV",
        type: "video/quicktime",
      }),
    ).toBe("video/quicktime");
  });
});

describe("Google Photos Picker downloaded media validation", () => {
  it.each(["image/jpeg", "image/png", "image/webp"] as const)(
    "accepts downloaded PHOTO %s",
    async (contentType) => {
      const fetchMock = stubPhotoDownload(contentType);
      const result = await fetchAndValidatePickedPhoto({
        accessToken: "token",
        baseUrl: "https://photos.example/base",
        mediaType: "PHOTO",
        expectedMimeType: contentType,
        signal: new AbortController().signal,
      });

      expect(result.downloadedContentType).toBe(contentType);
      expect(isPhotosDownloadedAssetMimeType(result.downloadedContentType)).toBe(
        true,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("=w2732-h2732");
    },
  );

  it.each(["video/mp4", "video/quicktime"] as const)(
    "rejects VIDEO %s before fetch and Drive save",
    async (contentType) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      try {
        await fetchAndValidatePickedPhoto({
          accessToken: "token",
          baseUrl: "https://photos.example/base",
          mediaType: "VIDEO",
          expectedMimeType: contentType,
          signal: new AbortController().signal,
        });
        throw new Error("expected VIDEO rejection");
      } catch (error) {
        expectPhotosPickerVideoRejected(error);
      }

      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("rejects video bytes downloaded as PHOTO", async () => {
    stubPhotoDownload("video/quicktime");

    await expect(
      fetchAndValidatePickedPhoto({
        accessToken: "token",
        baseUrl: "https://photos.example/base",
        mediaType: "PHOTO",
        expectedMimeType: "image/jpeg",
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(PhotosPickerSelectionError);
  });
});

describe("Google Photos Picker photo-only security contract", () => {
  it("does not persist tokens or keep Photos-only video helpers", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./google-photos-picker.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("indexedDB");
    expect(source).not.toContain("document.cookie");
    expect(source).not.toContain("resolveLocalDriveVideoMimeType");
    expect(source).not.toContain("isSupportedDriveVideoMimeType");
    expect(source).not.toContain("DRIVE_VIDEO_MAX_BYTES");
    expect(source).not.toContain("PICKED_VIDEO_DOWNLOAD_SUFFIX");
    expect(source).not.toContain("resolvePickedVideoMimeType");
    expect(source).toContain("PHOTOS_PICKER_PHOTO_ONLY_MESSAGE");
  });
});
