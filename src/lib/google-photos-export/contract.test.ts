import { describe, expect, it } from "vitest";
import {
  assertGooglePhotosExportPlanIsImageOnly,
  buildGooglePhotosAlbumTitle,
  buildGooglePhotosExportFileName,
  buildGooglePhotosExportReview,
  DRIVE_PROJECT_EXPORTABLE_MIME_TYPES,
  GOOGLE_PHOTOS_EXPORT_ERROR_MESSAGES,
  GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES,
  GOOGLE_PHOTOS_EXPORT_MIME_TYPES,
  GOOGLE_PHOTOS_EXPORT_SKIPPED_VIDEO_MIME_TYPES,
  GOOGLE_PHOTOS_LIBRARY_UPLOADABLE_MIME_TYPES,
  googlePhotosExportSourceMatchesPreparedPlan,
  isGooglePhotosExportFileSizeAllowed,
  isGooglePhotosExportMimeType,
  isGooglePhotosExportSkippedVideoMimeType,
  toGooglePhotosDescription,
  type GooglePhotosExportPlan,
  type GooglePhotosExportPlanItem,
} from "./contract";

describe("google photos export contract", () => {
  it("exports image MIME types only while Drive projects can still contain videos", () => {
    expect(GOOGLE_PHOTOS_EXPORT_MIME_TYPES).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    expect(GOOGLE_PHOTOS_EXPORT_SKIPPED_VIDEO_MIME_TYPES).toEqual([
      "video/mp4",
      "video/quicktime",
    ]);
    expect(DRIVE_PROJECT_EXPORTABLE_MIME_TYPES).toEqual([
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
    expect(isGooglePhotosExportMimeType("video/mp4")).toBe(false);
    expect(isGooglePhotosExportSkippedVideoMimeType("video/mp4")).toBe(true);
    expect(isGooglePhotosExportSkippedVideoMimeType("video/quicktime")).toBe(
      true,
    );
    expect(isGooglePhotosExportSkippedVideoMimeType("image/jpeg")).toBe(false);
  });

  it("maps caption only and never exports durationSeconds", () => {
    expect(toGooglePhotosDescription("  海辺  ")).toBe("海辺");
    expect(toGooglePhotosDescription("   ")).toBe("");
    const plan = buildPlan();
    expect(plan.items[0]).not.toHaveProperty("durationSeconds");
    expect(plan.items[0]?.description).toBe("朝");
    expect(plan.items[1]?.description).toBe("");
  });

  it("counts export photos and skipped videos without treating videos as export items", () => {
    const plan = buildPlan();
    const review = buildGooglePhotosExportReview(plan);
    expect(review.sourceSlideCount).toBe(4);
    expect(review.exportPhotoCount).toBe(2);
    expect(review.photoCount).toBe(2);
    expect(review.skippedVideoCount).toBe(2);
    expect(review.totalBytes).toBe(2000);
    expect(review.includesDuplicateSlides).toBe(false);
    expect(review.albumTitle).not.toContain(plan.projectId);
    expect(plan.items.every((item) => item.mediaKind === "image")).toBe(true);
  });

  it("applies the 200MiB image size limit and does not size-check videos on the Photos export path", () => {
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
    expect(
      isGooglePhotosExportFileSizeAllowed({
        mimeType: "video/mp4",
        sizeBytes: 20,
      }),
    ).toBe(false);
    expect(
      isGooglePhotosExportFileSizeAllowed({
        mimeType: "video/quicktime",
        sizeBytes: 20,
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
        mimeType: "image/png",
      }),
    ).toBe("slide-3.png");
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

  it("compares export source semantics without using albumTitle", () => {
    const prepared = buildPlan();
    const fresh = {
      ...prepared,
      albumTitle: "別の確認時刻のアルバム名",
    };
    expect(googlePhotosExportSourceMatchesPreparedPlan(prepared, fresh)).toBe(
      true,
    );
    expect(
      googlePhotosExportSourceMatchesPreparedPlan(prepared, {
        ...fresh,
        items: prepared.items.map((item, index) =>
          index === 0 ? { ...item, description: "夕方" } : item,
        ),
      }),
    ).toBe(false);
    expect(
      googlePhotosExportSourceMatchesPreparedPlan(prepared, {
        ...fresh,
        items: [prepared.items[1]!, prepared.items[0]!].map(
          (item, slideIndex) => ({ ...item, slideIndex }),
        ),
      }),
    ).toBe(false);
    expect(
      googlePhotosExportSourceMatchesPreparedPlan(prepared, {
        ...fresh,
        items: prepared.items.map((item, index) =>
          index === 0 ? { ...item, assetFileId: "asset-file-changed" } : item,
        ),
      }),
    ).toBe(false);
    expect(
      googlePhotosExportSourceMatchesPreparedPlan(prepared, {
        ...fresh,
        skippedVideoCount: prepared.skippedVideoCount + 1,
      }),
    ).toBe(false);
    expect(
      googlePhotosExportSourceMatchesPreparedPlan(prepared, {
        ...fresh,
        sourceSlideCount: prepared.sourceSlideCount + 1,
      }),
    ).toBe(false);
  });

  it("rejects empty or video-contaminated internal export plans", () => {
    expect(assertGooglePhotosExportPlanIsImageOnly(buildPlan())).toBeNull();
    expect(
      assertGooglePhotosExportPlanIsImageOnly({
        ...buildPlan(),
        items: [],
        totalBytes: 0,
      }),
    ).toMatchObject({
      kind: "noExportablePhotos",
      message: GOOGLE_PHOTOS_EXPORT_ERROR_MESSAGES.noExportablePhotos,
    });
    expect(
      assertGooglePhotosExportPlanIsImageOnly({
        ...buildPlan(),
        items: [
          {
            slideIndex: 1,
            slideId: "slide-v",
            assetFileId: "asset-file-v",
            mediaKind: "video",
            mimeType: "video/mp4",
            sizeBytes: 1000,
            description: "",
            fileName: "clip.mp4",
          } as GooglePhotosExportPlanItem,
        ],
      }),
    ).toMatchObject({ kind: "unsupportedMedia" });
  });
});

function buildPlan(): GooglePhotosExportPlan {
  return {
    projectId: "project-secret",
    projectTitle: "夏の記録",
    albumTitle: "夏の記録 - 2026-08-16 11:05",
    totalBytes: 2000,
    sourceSlideCount: 4,
    skippedVideoCount: 2,
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
        slideIndex: 2,
        slideId: "slide-b",
        assetFileId: "asset-file-b",
        mediaKind: "image",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
        description: toGooglePhotosDescription(""),
        fileName: "dusk.jpg",
      },
    ],
  };
}
