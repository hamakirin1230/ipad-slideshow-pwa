import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGooglePhotosRenderedExportFileName,
  canBrowserEncodeWebp,
  GOOGLE_PHOTOS_WEBP_PROBE_CANVAS_SIZE,
  isGooglePhotosRenderedImageWithinUploadLimit,
  planGooglePhotosImageRender,
  resetGooglePhotosWebpEncodeSupportCache,
  resolveGooglePhotosExportOutputMime,
  resolveGooglePhotosRenderedImageMime,
} from "./image-renderer";
import { GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES } from "./contract";

afterEach(() => {
  resetGooglePhotosWebpEncodeSupportCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("google photos image render policy", () => {
  it("keeps JPEG sources as rendered JPEG", () => {
    expect(
      planGooglePhotosImageRender({
        sourceMimeType: "image/jpeg",
        caption: "朝",
        canEncodeWebp: false,
      }),
    ).toMatchObject({
      outputMimeType: "image/jpeg",
      drawOverlay: true,
      jpegQuality: 0.93,
    });
  });

  it("keeps PNG sources as rendered PNG", () => {
    expect(
      resolveGooglePhotosRenderedImageMime({
        sourceMimeType: "image/png",
        canEncodeWebp: true,
      }),
    ).toBe("image/png");
    expect(
      planGooglePhotosImageRender({
        sourceMimeType: "image/png",
        caption: "",
        canEncodeWebp: true,
      }).drawOverlay,
    ).toBe(false);
  });

  it("does not probe WebP when rendering JPEG", async () => {
    const detectWebpSupport = vi.fn(async () => true);
    await expect(
      resolveGooglePhotosExportOutputMime({
        sourceMimeType: "image/jpeg",
        detectWebpSupport,
      }),
    ).resolves.toBe("image/jpeg");
    expect(detectWebpSupport).not.toHaveBeenCalled();
  });

  it("does not probe WebP when rendering PNG", async () => {
    const detectWebpSupport = vi.fn(async () => true);
    await expect(
      resolveGooglePhotosExportOutputMime({
        sourceMimeType: "image/png",
        detectWebpSupport,
      }),
    ).resolves.toBe("image/png");
    expect(detectWebpSupport).not.toHaveBeenCalled();
  });

  it("renders WebP when the tiny probe reports support", async () => {
    const detectWebpSupport = vi.fn(async () => true);
    await expect(
      resolveGooglePhotosExportOutputMime({
        sourceMimeType: "image/webp",
        detectWebpSupport,
      }),
    ).resolves.toBe("image/webp");
    expect(detectWebpSupport).toHaveBeenCalledTimes(1);
    expect(
      buildGooglePhotosRenderedExportFileName({
        sourceFileName: "photo.webp",
        outputMimeType: "image/webp",
        slideIndex: 0,
      }),
    ).toBe("photo.webp");
  });

  it("falls back from WebP to PNG and updates the filename extension", async () => {
    const detectWebpSupport = vi.fn(async () => false);
    await expect(
      resolveGooglePhotosExportOutputMime({
        sourceMimeType: "image/webp",
        detectWebpSupport,
      }),
    ).resolves.toBe("image/png");
    expect(detectWebpSupport).toHaveBeenCalledTimes(1);
    expect(
      buildGooglePhotosRenderedExportFileName({
        sourceFileName: "photo.webp",
        outputMimeType: "image/png",
        slideIndex: 0,
      }),
    ).toBe("photo.png");
  });

  it("probes WebP with a tiny canvas toBlob instead of a full-size data URL", async () => {
    const probed: Array<{ width: number; height: number; type?: string }> = [];
    vi.stubGlobal("document", {
      createElement(tag: string) {
        expect(tag).toBe("canvas");
        const canvas = {
          width: 0,
          height: 0,
          toBlob(
            callback: (blob: Blob | null) => void,
            type?: string,
          ) {
            probed.push({ width: canvas.width, height: canvas.height, type });
            callback(new Blob([new Uint8Array([1])], { type: "image/webp" }));
          },
        };
        return canvas;
      },
    });

    await expect(canBrowserEncodeWebp()).resolves.toBe(true);
    await expect(canBrowserEncodeWebp()).resolves.toBe(true);
    expect(probed).toEqual([
      {
        width: GOOGLE_PHOTOS_WEBP_PROBE_CANVAS_SIZE,
        height: GOOGLE_PHOTOS_WEBP_PROBE_CANVAS_SIZE,
        type: "image/webp",
      },
    ]);
    expect(GOOGLE_PHOTOS_WEBP_PROBE_CANVAS_SIZE).toBeLessThanOrEqual(2);
  });

  it("does not put internal IDs into rendered file names", () => {
    expect(
      buildGooglePhotosRenderedExportFileName({
        sourceFileName: "secret-asset-id",
        outputMimeType: "image/jpeg",
        slideIndex: 3,
      }),
    ).toBe("slide-4.jpg");
  });

  it("applies the 200MiB rendered payload limit", () => {
    expect(
      isGooglePhotosRenderedImageWithinUploadLimit(
        GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES,
      ),
    ).toBe(true);
    expect(
      isGooglePhotosRenderedImageWithinUploadLimit(
        GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES + 1,
      ),
    ).toBe(false);
  });
});
