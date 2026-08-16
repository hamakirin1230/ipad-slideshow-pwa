import { describe, expect, it } from "vitest";
import { buildBatchCreateMediaItems, inspectBatchCreateResponse } from "./library-api";
import type { GooglePhotosExportPlanItem } from "./contract";

const items: GooglePhotosExportPlanItem[] = [
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
    description: "",
    fileName: "b.jpg",
  },
];

describe("google photos library api", () => {
  it("maps caption only and omits empty descriptions", () => {
    const body = buildBatchCreateMediaItems({
      items,
      uploadTokens: ["token-a", "token-b"],
    });
    expect(body[0]).toMatchObject({
      description: "朝",
      simpleMediaItem: { fileName: "a.jpg", uploadToken: "token-a" },
    });
    expect(body[1]).not.toHaveProperty("description");
    expect(JSON.stringify(body)).not.toContain("durationSeconds");
    expect(JSON.stringify(body)).not.toContain("file-a");
  });

  it("treats HTTP 207 or missing media items as partial success", () => {
    expect(
      inspectBatchCreateResponse({
        httpStatus: 207,
        body: {
          newMediaItemResults: [
            { mediaItem: { id: "media-1" }, status: { code: 0 } },
            { status: { code: 13, message: "failed" } },
          ],
        },
      }),
    ).toEqual({ ok: false, kind: "mediaCreatePartial" });
    expect(
      inspectBatchCreateResponse({
        httpStatus: 200,
        body: {
          newMediaItemResults: [
            { mediaItem: { id: "media-1" }, status: { code: 0 } },
            { mediaItem: { id: "media-2" }, status: { code: 0 } },
          ],
        },
      }),
    ).toEqual({ ok: true, mediaItemIds: ["media-1", "media-2"] });
  });
});
