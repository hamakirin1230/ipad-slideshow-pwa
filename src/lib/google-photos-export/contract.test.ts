import { describe, expect, it } from "vitest";
import { DRIVE_VIDEO_MAX_BYTES } from "../drive-video-policy";
import {
  buildGooglePhotosAlbumTitle,
  buildGooglePhotosExportFileName,
  buildGooglePhotosExportReview,
  DRIVE_PROJECT_EXPORTABLE_MIME_TYPES,
  GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES,
  GOOGLE_PHOTOS_EXPORT_MIME_TYPES,
  GOOGLE_PHOTOS_EXPORT_VIDEO_MAX_BYTES,
  GOOGLE_PHOTOS_LIBRARY_UPLOADABLE_MIME_TYPES,
  isGooglePhotosExportFileSizeAllowed,
  isGooglePhotosExportMimeType,
  toGooglePhotosDescription,
  type GooglePhotosExportPlan,
} from "./contract";

describe("google photos export contract", () => {
  it("exports the intersection of Drive project MIME types and Photos uploadables", () => {
    expect(GOOGLE_PHOTOS_EXPORT_MIME_TYPES).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
    ]);
    expect(GOOGLE_PHOTOS_LIBRARY_UPLOADABLE_MIME_TYPES).toContain("image/heic");
    expect(DRIVE_PROJECT_EXPORTABLE_MIME_TYPES).not.toContain("image/heic");
    expect(isGooglePhotosExportMimeType("image/heic")).toBe(false);
    expect(isGooglePhotosExportMimeType("image/jpeg")).toBe(true);
  });

  it("maps caption only and never exports durationSeconds", () => {
    expect(toGooglePhotosDescription("  海辺  ")).toBe("海辺");
    expect(toGooglePhotosDescription("   ")).toBe("");
    const plan = buildPlan();
    expect(plan.items[0]).not.toHaveProperty("durationSeconds");
    expect(plan.items[0]?.description).toBe("朝");
    expect(plan.items[1]?.description).toBe("");
  });

  it("counts unique slides without advertising duplicate export semantics", () => {
    const plan = buildPlan();
    const review = buildGooglePhotosExportReview(plan);
    expect(review.slideCount).toBe(3);
    expect(review.photoCount).toBe(2);
    expect(review.videoCount).toBe(1);
    expect(review.totalBytes).toBe(3000);
    expect(review.includesDuplicateSlides).toBe(false);
    expect(review.albumTitle).not.toContain(plan.projectId);
  });

  it("blocks videos larger than the existing 5GiB app limit and photos larger than 200MiB", () => {
    expect(GOOGLE_PHOTOS_EXPORT_VIDEO_MAX_BYTES).toBe(DRIVE_VIDEO_MAX_BYTES);
    expect(
      isGooglePhotosExportFileSizeAllowed({
        mimeType: "video/mp4",
        sizeBytes: DRIVE_VIDEO_MAX_BYTES,
      }),
    ).toBe(true);
    expect(
      isGooglePhotosExportFileSizeAllowed({
        mimeType: "video/mp4",
        sizeBytes: DRIVE_VIDEO_MAX_BYTES + 1,
      }),
    ).toBe(false);
    expect(
      isGooglePhotosExportFileSizeAllowed({
        mimeType: "image/jpeg",
        sizeBytes: GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES,
      }),
    ).toBe(true);
    expect(
      isGooglePhotosExportFileSizeAllowed({
        mimeType: "image/jpeg",
        sizeBytes: GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES + 1,
      }),
    ).toBe(false);
  });

  it("builds a local-time album title without internal IDs", () => {
    const title = buildGooglePhotosAlbumTitle({
      projectTitle: "夏の記録",
      now: new Date(2026, 7, 16, 11, 5),
    });
    expect(title).toBe("夏の記録 - 2026-08-16 11:05");
    expect(title).not.toMatch(/revision|projectId|hash/i);
  });

  it("does not put asset IDs into the export file name when a safe name exists", () => {
    expect(
      buildGooglePhotosExportFileName({
        slideIndex: 0,
        assetName: "beach.jpg",
        mimeType: "image/jpeg",
      }),
    ).toBe("beach.jpg");
    expect(
      buildGooglePhotosExportFileName({
        slideIndex: 2,
        assetName: "secret-asset-id",
        mimeType: "video/mp4",
      }),
    ).toBe("slide-3.mp4");
  });

  it("keeps file names at or under 255 characters and preserves the extension", () => {
    const fitting = `${"a".repeat(251)}.jpg`;
    expect(fitting).toHaveLength(255);
    expect(
      buildGooglePhotosExportFileName({
        slideIndex: 0,
        assetName: fitting,
        mimeType: "image/jpeg",
      }),
    ).toBe(fitting);

    const truncated = buildGooglePhotosExportFileName({
      slideIndex: 0,
      assetName: `${"あ".repeat(300)}.jpg`,
      mimeType: "image/jpeg",
    });
    expect(truncated.endsWith(".jpg")).toBe(true);
    expect([...truncated].length).toBe(255);
    expect(truncated.startsWith("あ")).toBe(true);
    expect(truncated).not.toMatch(/asset|fileId|checksum/i);
  });
});

function buildPlan(): GooglePhotosExportPlan {
  return {
    projectId: "project-secret",
    projectTitle: "夏の記録",
    albumTitle: "夏の記録 - 2026-08-16 11:05",
    totalBytes: 3000,
    items: [
      {
        slideIndex: 0,
        slideId: "slide-a",
        assetFileId: "asset-file-a",
        mediaKind: "image",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
        description: toGooglePhotosDescription("朝"),
        fileName: "beach.jpg",
      },
      {
        slideIndex: 1,
        slideId: "slide-b",
        assetFileId: "asset-file-b",
        mediaKind: "image",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
        description: toGooglePhotosDescription(""),
        fileName: "dusk.jpg",
      },
      {
        slideIndex: 2,
        slideId: "slide-c",
        assetFileId: "asset-file-c",
        mediaKind: "video",
        mimeType: "video/mp4",
        sizeBytes: 1000,
        description: "",
        fileName: "clip.mp4",
      },
    ],
  };
}
