import { describe, expect, it } from "vitest";
import {
  countProjectMedia,
  formatProjectMediaCounts,
} from "./project-media-counts";

describe("project media counts", () => {
  it("counts image and video slides from explicit types", () => {
    expect(
      countProjectMedia([
        { type: "image", mimeType: "image/jpeg" },
        { type: "image", mimeType: "image/png" },
        { type: "video", mimeType: "video/mp4" },
      ]),
    ).toEqual({ photoCount: 2, videoCount: 1, otherCount: 0 });
  });

  it("falls back to MIME only when type is missing", () => {
    expect(
      countProjectMedia([
        { mimeType: "image/webp" },
        { mimeType: "video/quicktime" },
      ]),
    ).toEqual({ photoCount: 1, videoCount: 1, otherCount: 0 });
  });

  it("does not count unknown slides as photos", () => {
    expect(
      countProjectMedia([
        { type: "image", mimeType: "image/jpeg" },
        { mimeType: "application/octet-stream" },
        { mimeType: "text/plain" },
      ]),
    ).toEqual({ photoCount: 1, videoCount: 0, otherCount: 2 });
  });

  it("keeps unknown details unavailable instead of zero", () => {
    expect(countProjectMedia(null)).toBeNull();
    expect(formatProjectMediaCounts(null)).toBe("写真 — ・ 動画 —");
    expect(
      formatProjectMediaCounts({
        photoCount: 7,
        videoCount: 0,
        otherCount: 0,
      }),
    ).toBe("写真 7 ・ 動画 0");
    expect(
      formatProjectMediaCounts({
        photoCount: 18,
        videoCount: 2,
        otherCount: 1,
      }),
    ).toBe("写真 18 ・ 動画 2 ・ その他 1");
  });
});
