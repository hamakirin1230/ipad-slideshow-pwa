import { describe, expect, it, vi } from "vitest";
import { executeGooglePhotosExportWithAdapter } from "./workflow";
import type { GooglePhotosExportPlan, GooglePhotosExportRuntime } from "./contract";
import type { GooglePhotosExportWriteAdapter } from "./workflow";

const plan: GooglePhotosExportPlan = {
  projectId: "project-secret",
  projectTitle: "夏の記録",
  albumTitle: "夏の記録 - 2026-08-16 11:05",
  totalBytes: 20,
  items: [
    {
      slideIndex: 0,
      slideId: "slide-a",
      assetFileId: "file-a",
      mediaKind: "image",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      description: "朝",
      fileName: "a.jpg",
    },
    {
      slideIndex: 1,
      slideId: "slide-b",
      assetFileId: "file-a",
      mediaKind: "image",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      description: "夜",
      fileName: "a.jpg",
    },
  ],
};

describe("google photos export workflow", () => {
  it("creates media items then an album and adds IDs in slide order", async () => {
    const adapter = createAdapter();
    const result = await executeGooglePhotosExportWithAdapter(
      {
        driveAccessToken: "drive-token",
        photosAccessToken: "photos-token",
        runtime: runtime(),
        now: new Date("2026-08-16T02:05:00.000Z"),
        signal: new AbortController().signal,
        onProgress: () => undefined,
        onRuntime: () => undefined,
      },
      adapter,
    );

    expect(result).toEqual({
      ok: true,
      result: {
        albumTitle: plan.albumTitle,
        mediaItemCount: 2,
        completedAt: "2026-08-16T02:05:00.000Z",
        productUrl: "https://photos.google.com/lr/album/safe",
      },
    });
    expect(adapter.library.createAlbum).toHaveBeenCalledTimes(1);
    expect(adapter.library.batchAddMediaItems).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaItemIds: ["media-1", "media-2"],
      }),
    );
    expect(JSON.stringify(result)).not.toContain("drive-token");
    expect(JSON.stringify(result)).not.toContain("file-a");
  });

  it("does not create an album after partial media creation", async () => {
    const adapter = createAdapter();
    adapter.library.batchCreateMediaItems = vi.fn(async () => ({
      ok: false as const,
      kind: "mediaCreatePartial" as const,
    }));
    const result = await executeGooglePhotosExportWithAdapter(
      {
        driveAccessToken: "drive-token",
        photosAccessToken: "photos-token",
        runtime: runtime(),
        signal: new AbortController().signal,
        onProgress: () => undefined,
        onRuntime: () => undefined,
      },
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "mediaCreatePartial" },
    });
    expect(adapter.library.createAlbum).not.toHaveBeenCalled();
    expect(adapter.library.batchAddMediaItems).not.toHaveBeenCalled();
  });

  it("keeps album-add failure as a failure without retrying", async () => {
    const adapter = createAdapter();
    adapter.library.batchAddMediaItems = vi.fn(async () => false);
    const result = await executeGooglePhotosExportWithAdapter(
      {
        driveAccessToken: "drive-token",
        photosAccessToken: "photos-token",
        runtime: runtime(),
        signal: new AbortController().signal,
        onProgress: () => undefined,
        onRuntime: () => undefined,
      },
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "albumAddFailed" },
    });
    expect(adapter.library.batchAddMediaItems).toHaveBeenCalledTimes(1);
    expect(adapter.library.createAlbum).toHaveBeenCalledTimes(1);
  });
});

function runtime(): GooglePhotosExportRuntime {
  return {
    plan,
    uploadTokens: [],
    currentUpload: null,
  };
}

function createAdapter(): GooglePhotosExportWriteAdapter {
  return {
    openDriveAssetStream: vi.fn(async () => new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    })),
    resumable: {
      startSession: vi.fn(async () => "https://photos.example/session"),
      uploadChunk: vi.fn(async (input) => (input.finalize ? "upload-token" : null)),
    },
    library: {
      batchCreateMediaItems: vi.fn(async () => ({
        ok: true as const,
        mediaItemIds: ["media-1", "media-2"],
      })),
      createAlbum: vi.fn(async () => ({
        ok: true as const,
        albumId: "album-secret",
        productUrl: "https://photos.google.com/lr/album/safe",
      })),
      batchAddMediaItems: vi.fn(async () => true),
    },
  };
}
