import { describe, expect, it } from "vitest";
import {
  buildGooglePhotosRenderedExportFileName,
  isGooglePhotosRenderedImageWithinUploadLimit,
  planGooglePhotosImageRender,
  resolveGooglePhotosRenderedImageMime,
} from "./image-renderer";
import { GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES } from "./contract";

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

  it("renders WebP when the browser can encode it", () => {
    expect(
      resolveGooglePhotosRenderedImageMime({
        sourceMimeType: "image/webp",
        canEncodeWebp: true,
      }),
    ).toBe("image/webp");
    expect(
      buildGooglePhotosRenderedExportFileName({
        sourceFileName: "photo.webp",
        outputMimeType: "image/webp",
        slideIndex: 0,
      }),
    ).toBe("photo.webp");
  });

  it("falls back from WebP to PNG and updates the filename extension", () => {
    expect(
      resolveGooglePhotosRenderedImageMime({
        sourceMimeType: "image/webp",
        canEncodeWebp: false,
      }),
    ).toBe("image/png");
    expect(
      buildGooglePhotosRenderedExportFileName({
        sourceFileName: "photo.webp",
        outputMimeType: "image/png",
        slideIndex: 0,
      }),
    ).toBe("photo.png");
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
