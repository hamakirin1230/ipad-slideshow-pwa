import { describe, expect, it, vi } from "vitest";
import {
  GOOGLE_PHOTOS_EXPORT_ERROR_MESSAGES,
  GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES,
  type GooglePhotosExportPlan,
  type GooglePhotosExportProgress,
  type GooglePhotosExportRuntime,
} from "./contract";
import { measureCaptionLayout } from "./caption-layout";
import { GooglePhotosImageRenderError } from "./image-renderer";
import { GooglePhotosUploadRequestError } from "./resumable-upload";
import {
  executeGooglePhotosExportWithAdapter,
  type GooglePhotosExportWriteAdapter,
  type GooglePhotosRenderedImageHolder,
} from "./workflow";

const plan: GooglePhotosExportPlan = {
  projectId: "project-secret",
  projectTitle: "夏の記録",
  albumTitle: "夏の記録 - 2026-08-16 11:05",
  totalBytes: 20,
  sourceSlideCount: 2,
  skippedVideoCount: 0,
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
      assetFileId: "file-b",
      mediaKind: "image",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      description: "夜",
      fileName: "b.jpg",
    },
  ],
};

describe("google photos export workflow", () => {
  it("renders images, starts the session with rendered size/MIME, and keeps captions as descriptions", async () => {
    const adapter = createAdapter();
    const result = await executeGooglePhotosExportWithAdapter(
      executeInput(),
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
    expect(adapter.renderImage).toHaveBeenCalledTimes(2);
    expect(adapter.renderImage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        caption: "朝",
        sourceMimeType: "image/jpeg",
        source: expect.any(Blob),
      }),
    );
    const firstRender = vi.mocked(adapter.renderImage).mock.calls[0]?.[0];
    expect(firstRender?.source).toBeInstanceOf(Blob);
    expect(firstRender?.source.size).toBe(3);
    expect(adapter.resumable.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "image/jpeg",
        sizeBytes: 8,
        fileName: "a.jpg",
      }),
    );
    expect(adapter.library.batchCreateMediaItems).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({ description: "朝", fileName: "a.jpg" }),
          expect.objectContaining({ description: "夜", fileName: "b.jpg" }),
        ],
      }),
    );
    expect(adapter.library.createAlbum).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("drive-token");
    expect(JSON.stringify(result)).not.toContain("file-a");
  });

  it("still renders empty-caption images without overlay text being required by the adapter caption", async () => {
    const adapter = createAdapter();
    const emptyPlan = {
      ...plan,
      items: [{ ...plan.items[0]!, description: "" }],
      totalBytes: 10,
    };
    adapter.library.batchCreateMediaItems = vi.fn(async () => ({
      ok: true as const,
      mediaItemIds: ["media-1"],
    }));

    const result = await executeGooglePhotosExportWithAdapter(
      executeInput({ plan: emptyPlan }),
      adapter,
    );

    expect(result.ok).toBe(true);
    expect(adapter.renderImage).toHaveBeenCalledWith(
      expect.objectContaining({ caption: "" }),
    );
    expect(adapter.library.batchCreateMediaItems).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ description: "" })],
      }),
    );
  });

  it("does not start Photos upload when an internal plan contains MP4", async () => {
    const adapter = createAdapter();
    const videoPlan = {
      ...plan,
      items: [
        {
          slideIndex: 0,
          slideId: "slide-v",
          assetFileId: "file-v",
          mediaKind: "video" as const,
          mimeType: "video/mp4" as const,
          sizeBytes: 20,
          description: "動画テロップ",
          fileName: "clip.mp4",
        },
      ],
      totalBytes: 20,
      sourceSlideCount: 1,
      skippedVideoCount: 0,
    };

    const result = await executeGooglePhotosExportWithAdapter(
      executeInput({ plan: videoPlan as GooglePhotosExportPlan }),
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unsupportedMedia" },
    });
    expect(adapter.renderImage).not.toHaveBeenCalled();
    expect(adapter.openDriveAssetStream).not.toHaveBeenCalled();
    expect(adapter.resumable.startSession).not.toHaveBeenCalled();
    expect(adapter.library.batchCreateMediaItems).not.toHaveBeenCalled();
    expect(adapter.library.createAlbum).not.toHaveBeenCalled();
  });

  it("does not start Photos upload when an internal plan contains MOV", async () => {
    const adapter = createAdapter();
    const videoPlan = {
      ...plan,
      items: [
        {
          slideIndex: 0,
          slideId: "slide-v",
          assetFileId: "file-v",
          mediaKind: "video" as const,
          mimeType: "video/quicktime" as const,
          sizeBytes: 20,
          description: "",
          fileName: "clip.mov",
        },
      ],
      totalBytes: 20,
      sourceSlideCount: 1,
      skippedVideoCount: 0,
    };

    const result = await executeGooglePhotosExportWithAdapter(
      executeInput({ plan: videoPlan as GooglePhotosExportPlan }),
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unsupportedMedia" },
    });
    expect(adapter.openDriveAssetStream).not.toHaveBeenCalled();
    expect(adapter.resumable.startSession).not.toHaveBeenCalled();
    expect(adapter.library.createAlbum).not.toHaveBeenCalled();
  });

  it("does not create an album when the export plan has no photos", async () => {
    const adapter = createAdapter();
    const emptyPlan = {
      ...plan,
      items: [],
      totalBytes: 0,
      sourceSlideCount: 1,
      skippedVideoCount: 1,
    };

    const result = await executeGooglePhotosExportWithAdapter(
      executeInput({ plan: emptyPlan }),
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "noExportablePhotos",
        message: GOOGLE_PHOTOS_EXPORT_ERROR_MESSAGES.noExportablePhotos,
      },
    });
    expect(adapter.library.createAlbum).not.toHaveBeenCalled();
    expect(adapter.resumable.startSession).not.toHaveBeenCalled();
  });

  it("does not start a Photos image session after a render failure", async () => {
    const adapter = createAdapter();
    adapter.renderImage = vi.fn(async () => {
      throw new GooglePhotosImageRenderError();
    });

    const result = await executeGooglePhotosExportWithAdapter(
      executeInput(),
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "imageRenderFailed" },
      canResume: false,
    });
    expect(adapter.resumable.startSession).not.toHaveBeenCalled();
    expect(adapter.library.batchCreateMediaItems).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(
      GOOGLE_PHOTOS_EXPORT_ERROR_MESSAGES.imageRenderFailed,
    );
    expect(JSON.stringify(result)).not.toContain("file-a");
    expect(JSON.stringify(result)).not.toContain("https://");
    expect(JSON.stringify(result)).not.toContain("image-render-failed");
  });

  it("does not start a Photos image session after a caption layout failure", async () => {
    const adapter = createAdapter();
    const caption = "あ".repeat(80);
    adapter.renderImage = vi.fn(async ({ caption: text }) => {
      const layout = measureCaptionLayout({
        text,
        imageWidth: 40,
        imageHeight: 20,
        measureText: (value) => (value ? 10_000 : 0),
      });
      expect(layout.kind).toBe("doesNotFit");
      throw new GooglePhotosImageRenderError();
    });
    adapter.library.batchCreateMediaItems = vi.fn(async () => ({
      ok: true as const,
      mediaItemIds: ["media-1"],
    }));

    const result = await executeGooglePhotosExportWithAdapter(
      executeInput({
        plan: {
          ...plan,
          items: [{ ...plan.items[0]!, description: caption }],
          totalBytes: 10,
        },
      }),
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "imageRenderFailed" },
      canResume: false,
    });
    expect(adapter.resumable.startSession).not.toHaveBeenCalled();
    expect(adapter.library.batchCreateMediaItems).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(
      GOOGLE_PHOTOS_EXPORT_ERROR_MESSAGES.imageRenderFailed,
    );
    expect(JSON.stringify(result)).not.toContain("file-a");
    expect(JSON.stringify(result)).not.toContain("image-render-failed");
    expect(JSON.stringify(result)).not.toContain(caption);
  });

  it("blocks a rendered image larger than 200MiB before startSession", async () => {
    const adapter = createAdapter();
    adapter.renderImage = vi.fn(async ({ fileName }) => {
      const blob = new Blob([new Uint8Array(1)], { type: "image/jpeg" });
      Object.defineProperty(blob, "size", {
        value: GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES + 1,
      });
      return { blob, mimeType: "image/jpeg" as const, fileName };
    });

    const result = await executeGooglePhotosExportWithAdapter(
      executeInput(),
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unsupportedMedia" },
    });
    expect(adapter.resumable.startSession).not.toHaveBeenCalled();
  });

  it("releases the rendered image blob after a successful upload", async () => {
    const adapter = createAdapter();
    const renderedImageRef: { current: GooglePhotosRenderedImageHolder | null } =
      { current: null };

    const result = await executeGooglePhotosExportWithAdapter(
      { ...executeInput(), renderedImageRef },
      adapter,
    );

    expect(result.ok).toBe(true);
    expect(renderedImageRef.current).toBeNull();
  });

  it("does not create an album after partial media creation", async () => {
    const adapter = createAdapter();
    adapter.library.batchCreateMediaItems = vi.fn(async () => ({
      ok: false as const,
      kind: "mediaCreatePartial" as const,
    }));
    const result = await executeGooglePhotosExportWithAdapter(
      executeInput(),
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "mediaCreatePartial" },
      canResume: false,
    });
    expect(adapter.library.createAlbum).not.toHaveBeenCalled();
    expect(adapter.library.batchAddMediaItems).not.toHaveBeenCalled();
  });

  it("keeps album-add failure as a failure without retrying", async () => {
    const adapter = createAdapter();
    adapter.library.batchAddMediaItems = vi.fn(async () => false);
    const result = await executeGooglePhotosExportWithAdapter(
      executeInput(),
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "albumAddFailed" },
    });
    expect(adapter.library.batchAddMediaItems).toHaveBeenCalledTimes(1);
    expect(adapter.library.createAlbum).toHaveBeenCalledTimes(1);
  });

  it("queries the session after interruption and does not retry the write", async () => {
    const adapter = createAdapter();
    const renderedImageRef: { current: GooglePhotosRenderedImageHolder | null } =
      { current: null };
    const runtimes: GooglePhotosExportRuntime[] = [];
    adapter.resumable.uploadChunk = vi.fn(async () => {
      throw new Error("network");
    });
    adapter.resumable.querySession = vi.fn(async () => ({
      ok: true as const,
      status: "active" as const,
      offset: 6,
    }));

    const result = await executeGooglePhotosExportWithAdapter(
      {
        ...executeInput(),
        renderedImageRef,
        onRuntime: (next) => runtimes.push(structuredClone(next)),
      },
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "uploadFailed" },
      canResume: true,
    });
    expect(adapter.resumable.uploadChunk).toHaveBeenCalledTimes(1);
    expect(adapter.resumable.startSession).toHaveBeenCalledTimes(1);
    expect(adapter.resumable.querySession).toHaveBeenCalledTimes(1);
    expect(runtimes.at(-1)?.currentUpload?.offset).toBe(6);
    expect(adapter.library.batchCreateMediaItems).not.toHaveBeenCalled();
    expect(renderedImageRef.current?.sizeBytes).toBe(8);
    expect(JSON.stringify(result)).not.toContain("existing-session");
    expect(JSON.stringify(result)).not.toContain("network");
  });

  it("returns a watchdog timeout as a sanitized manual-resume failure", async () => {
    const adapter = createAdapter();
    adapter.resumable.uploadChunk = vi.fn(async () => {
      throw new GooglePhotosUploadRequestError("timeout");
    });
    adapter.resumable.querySession = vi.fn(async () => ({ ok: false }));

    const result = await executeGooglePhotosExportWithAdapter(
      executeInput(),
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "uploadFailed",
        message:
          "Googleフォトへの通信が途中で止まりました。完了済みの写真はそのままにして、続きから再開できます。",
      },
      canResume: true,
    });
    expect(adapter.resumable.uploadChunk).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("photos-upload-request-failed");
    expect(JSON.stringify(result)).not.toContain("photos.example");
  });

  it("re-renders the current image when a retained upload session has no matching blob", async () => {
    const adapter = createAdapter();
    adapter.resumable.querySession = vi.fn(async () => ({
      ok: true as const,
      status: "active" as const,
      offset: 4,
    }));

    const withoutBlob = await executeGooglePhotosExportWithAdapter(
      {
        ...executeInput(),
        runtime: {
          ...runtime(),
          currentUpload: imageUploadState(999),
        },
      },
      adapter,
    );
    expect(withoutBlob.ok).toBe(true);
    expect(adapter.resumable.querySession).not.toHaveBeenCalled();
    expect(adapter.resumable.startSession).toHaveBeenCalledTimes(2);
    expect(adapter.renderImage).toHaveBeenCalledTimes(2);

    vi.clearAllMocks();

    const renderedImageRef = {
      current: retainedImage(jpegBlob(8)),
    };
    adapter.resumable.uploadChunk = vi.fn(async () => {
      throw new Error("network");
    });
    const withBlob = await executeGooglePhotosExportWithAdapter(
      {
        ...executeInput(),
        runtime: {
          ...runtime(),
          currentUpload: imageUploadState(999),
        },
        renderedImageRef,
      },
      adapter,
    );
    expect(withBlob.canResume).toBe(true);
    expect(adapter.openDriveAssetStream).not.toHaveBeenCalled();
    expect(adapter.resumable.startSession).not.toHaveBeenCalled();
    expect(adapter.renderImage).not.toHaveBeenCalled();
  });

  it("uses the queried offset from a retained rendered image on manual resume", async () => {
    const adapter = createAdapter();
    adapter.resumable.querySession = vi.fn(async () => ({
      ok: true as const,
      status: "active" as const,
      offset: 5,
    }));
    const renderedImageRef = {
      current: retainedImage(jpegBlob(8)),
    };

    const result = await executeGooglePhotosExportWithAdapter(
      {
        ...executeInput(),
        runtime: {
          ...runtime(),
          currentUpload: imageUploadState(999),
        },
        renderedImageRef,
      },
      adapter,
    );

    expect(result.ok).toBe(true);
    expect(adapter.resumable.startSession).toHaveBeenCalledTimes(1);
    expect(adapter.resumable.startSession).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: "b.jpg" }),
    );
    expect(adapter.renderImage).toHaveBeenCalledTimes(1);
    expect(adapter.resumable.querySession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionUrl: "https://photos.example/existing-session",
      }),
    );
    expect(renderedImageRef.current).toBeNull();
  });

  it("keeps eight completed uploads when slide nine startSession fails and resumes at index eight", async () => {
    const fourteenPlan = makeImagePlan(14);
    const adapter = createAdapterForPlan(fourteenPlan);
    const completedTokens = Array.from({ length: 8 }, (_, index) =>
      `completed-${index}`,
    );
    const completedNames = fourteenPlan.items
      .slice(0, 8)
      .map((item) => item.fileName);
    const renderedImageRef: {
      current: GooglePhotosRenderedImageHolder | null;
    } = { current: null };
    const runtimes: GooglePhotosExportRuntime[] = [];
    const progress: GooglePhotosExportProgress[] = [];
    vi.mocked(adapter.resumable.startSession)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({
        sessionUrl: "https://photos.example/new-session",
        chunkGranularity: 256 * 1024,
      });

    const failed = await executeGooglePhotosExportWithAdapter(
      {
        ...executeInput({
          plan: fourteenPlan,
          uploadTokens: completedTokens,
          uploadedFileNames: completedNames,
        }),
        renderedImageRef,
        onProgress: (next) => progress.push(next),
        onRuntime: (next) => runtimes.push(structuredClone(next)),
      },
      adapter,
    );

    expect(failed).toMatchObject({
      ok: false,
      error: { kind: "uploadFailed" },
      canResume: true,
    });
    expect(runtimes.at(-1)?.uploadTokens).toEqual(completedTokens);
    expect(renderedImageRef.current?.slideIndex).toBe(8);
    expect(progress).toContainEqual({
      currentSlide: 9,
      completedSlides: 8,
      phase: expect.any(String),
      totalSlides: 14,
      mediaKind: "image",
      uploadedBytes: expect.any(Number),
      fileBytes: expect.any(Number),
    });

    const resumed = await executeGooglePhotosExportWithAdapter(
      {
        ...executeInput(runtimes.at(-1)),
        renderedImageRef,
      },
      adapter,
    );

    expect(resumed.ok).toBe(true);
    expect(adapter.openDriveAssetStream).toHaveBeenCalledTimes(6);
    expect(adapter.renderImage).toHaveBeenCalledTimes(6);
    expect(
      vi.mocked(adapter.renderImage).mock.calls.map(([input]) => input.slideIndex),
    ).toEqual([8, 9, 10, 11, 12, 13]);
    expect(adapter.library.batchCreateMediaItems).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ uploadToken: "completed-0" }),
          expect.objectContaining({ uploadToken: "completed-7" }),
        ]),
      }),
    );
  });

  it("starts only the current slide from offset zero when session query fails", async () => {
    const fourteenPlan = makeImagePlan(14);
    const adapter = createAdapterForPlan(fourteenPlan);
    const completedTokens = Array.from({ length: 8 }, (_, index) =>
      `completed-${index}`,
    );
    const completedNames = fourteenPlan.items
      .slice(0, 8)
      .map((item) => item.fileName);
    const renderedImageRef = {
      current: retainedImageForIndex(8, jpegBlob(8)),
    };
    const runtimes: GooglePhotosExportRuntime[] = [];
    vi.mocked(adapter.resumable.querySession)
      .mockResolvedValueOnce({ ok: true, status: "active", offset: 4 })
      .mockResolvedValue({ ok: false });
    vi.mocked(adapter.resumable.uploadChunk)
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementation(async (input) =>
        input.finalize ? `token-${input.offset}` : null,
      );

    const failed = await executeGooglePhotosExportWithAdapter(
      {
        ...executeInput({
          plan: fourteenPlan,
          uploadTokens: completedTokens,
          uploadedFileNames: completedNames,
          currentUpload: imageUploadStateForIndex(8, 4),
        }),
        renderedImageRef,
        onRuntime: (next) => runtimes.push(structuredClone(next)),
      },
      adapter,
    );

    expect(failed).toMatchObject({ ok: false, canResume: true });
    expect(runtimes.at(-1)?.uploadTokens).toEqual(completedTokens);
    expect(runtimes.at(-1)?.currentUpload).toBeNull();

    const resumed = await executeGooglePhotosExportWithAdapter(
      {
        ...executeInput(runtimes.at(-1)),
        renderedImageRef,
      },
      adapter,
    );

    expect(resumed.ok).toBe(true);
    expect(adapter.resumable.startSession).toHaveBeenCalledTimes(6);
    expect(adapter.resumable.uploadChunk).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ offset: 0 }),
    );
    expect(adapter.openDriveAssetStream).toHaveBeenCalledTimes(5);
  });

  it("allows manual resume from slide one after its startSession fails", async () => {
    const adapter = createAdapter();
    const renderedImageRef: {
      current: GooglePhotosRenderedImageHolder | null;
    } = { current: null };
    const runtimes: GooglePhotosExportRuntime[] = [];
    vi.mocked(adapter.resumable.startSession).mockRejectedValueOnce(
      new Error("network"),
    );

    const failed = await executeGooglePhotosExportWithAdapter(
      {
        ...executeInput(),
        renderedImageRef,
        onRuntime: (next) => runtimes.push(structuredClone(next)),
      },
      adapter,
    );
    expect(failed).toMatchObject({ ok: false, canResume: true });
    expect(runtimes.at(-1)?.uploadTokens).toEqual([]);

    const resumed = await executeGooglePhotosExportWithAdapter(
      {
        ...executeInput(runtimes.at(-1)),
        renderedImageRef,
      },
      adapter,
    );
    expect(resumed.ok).toBe(true);
    expect(adapter.openDriveAssetStream).toHaveBeenCalledTimes(2);
    expect(adapter.renderImage).toHaveBeenCalledTimes(2);
  });

  it("keeps user abort non-resumable and does not query the session", async () => {
    const adapter = createAdapter();
    adapter.resumable.uploadChunk = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    });

    const result = await executeGooglePhotosExportWithAdapter(
      executeInput(),
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "aborted" },
      canResume: false,
    });
    expect(adapter.resumable.querySession).not.toHaveBeenCalled();
    expect(adapter.resumable.uploadChunk).toHaveBeenCalledTimes(1);
  });

  it("does not resume a video upload and stops before Photos write", async () => {
    const adapter = createAdapter();
    const videoPlan = {
      ...plan,
      items: [
        {
          slideIndex: 0,
          slideId: "slide-v",
          assetFileId: "file-v",
          mediaKind: "video" as const,
          mimeType: "video/mp4" as const,
          sizeBytes: 20,
          description: "動画テロップ",
          fileName: "clip.mp4",
        },
      ],
      totalBytes: 20,
      sourceSlideCount: 1,
      skippedVideoCount: 0,
    };

    const result = await executeGooglePhotosExportWithAdapter(
      executeInput({
        plan: videoPlan as GooglePhotosExportPlan,
        currentUpload: {
          slideIndex: 0,
          sessionUrl: "https://photos.example/existing-session",
          chunkGranularity: 256 * 1024,
          offset: 999,
          payloadMimeType: "video/mp4",
          payloadSizeBytes: 20,
          payloadFileName: "clip.mp4",
        },
      }),
      adapter,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unsupportedMedia" },
    });
    expect(adapter.renderImage).not.toHaveBeenCalled();
    expect(adapter.resumable.startSession).not.toHaveBeenCalled();
    expect(adapter.resumable.querySession).not.toHaveBeenCalled();
    expect(adapter.openDriveAssetStream).not.toHaveBeenCalled();
  });
});

function executeInput(
  runtimeOverride: Partial<GooglePhotosExportRuntime> = {},
) {
  return {
    driveAccessToken: "drive-token",
    photosAccessToken: "photos-token",
    runtime: runtime(runtimeOverride),
    now: new Date("2026-08-16T02:05:00.000Z"),
    signal: new AbortController().signal,
    onProgress: () => undefined,
    onRuntime: () => undefined,
  };
}

function runtime(
  override: Partial<GooglePhotosExportRuntime> = {},
): GooglePhotosExportRuntime {
  return {
    plan,
    uploadTokens: [],
    uploadedFileNames: [],
    currentUpload: null,
    ...override,
  };
}

function imageUploadState(offset: number) {
  return {
    slideIndex: 0,
    sessionUrl: "https://photos.example/existing-session",
    chunkGranularity: 256 * 1024,
    offset,
    payloadMimeType: "image/jpeg",
    payloadSizeBytes: 8,
    payloadFileName: "a.jpg",
  };
}

function jpegBlob(size: number) {
  return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
}

function retainedImage(blob: Blob): GooglePhotosRenderedImageHolder {
  return {
    slideIndex: 0,
    blob,
    mimeType: "image/jpeg",
    sizeBytes: blob.size,
    fileName: "a.jpg",
  };
}

function retainedImageForIndex(
  index: number,
  blob: Blob,
): GooglePhotosRenderedImageHolder {
  return {
    slideIndex: index,
    blob,
    mimeType: "image/jpeg",
    sizeBytes: blob.size,
    fileName: `slide-${index + 1}.jpg`,
  };
}

function imageUploadStateForIndex(index: number, offset: number) {
  return {
    slideIndex: index,
    sessionUrl: "https://photos.example/existing-session",
    chunkGranularity: 256 * 1024,
    offset,
    payloadMimeType: "image/jpeg",
    payloadSizeBytes: 8,
    payloadFileName: `slide-${index + 1}.jpg`,
  };
}

function makeImagePlan(count: number): GooglePhotosExportPlan {
  return {
    ...plan,
    totalBytes: count * 10,
    sourceSlideCount: count,
    items: Array.from({ length: count }, (_, index) => ({
      slideIndex: index,
      slideId: `slide-${index + 1}`,
      assetFileId: `file-${index + 1}`,
      mediaKind: "image" as const,
      mimeType: "image/jpeg" as const,
      sizeBytes: 10,
      description: `写真 ${index + 1}`,
      fileName: `slide-${index + 1}.jpg`,
    })),
  };
}

function createAdapterForPlan(
  exportPlan: GooglePhotosExportPlan,
): GooglePhotosExportWriteAdapter {
  const adapter = createAdapter();
  adapter.library.batchCreateMediaItems = vi.fn(async () => ({
    ok: true as const,
    mediaItemIds: exportPlan.items.map((_, index) => `media-${index + 1}`),
  }));
  return adapter;
}

function createAdapter(): GooglePhotosExportWriteAdapter {
  return {
    openDriveAssetStream: vi.fn(async () => new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    })),
    renderImage: vi.fn(async ({ fileName }) => ({
      blob: jpegBlob(8),
      mimeType: "image/jpeg" as const,
      fileName,
    })),
    resumable: {
      startSession: vi.fn(async () => ({
        sessionUrl: "https://photos.example/session",
        chunkGranularity: 256 * 1024,
      })),
      uploadChunk: vi.fn(async (input) => (input.finalize ? "upload-token" : null)),
      querySession: vi.fn(async () => ({ ok: false as const })),
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
