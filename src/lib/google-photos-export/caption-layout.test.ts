import { describe, expect, it } from "vitest";
import {
  GOOGLE_PHOTOS_CAPTION_MAX_LINES,
  measureCaptionLayout,
  segmentCaptionText,
} from "./caption-layout";

function measureByGrapheme(text: string, fontSize: number) {
  return segmentCaptionText(text).length * fontSize * 0.8;
}

describe("google photos caption layout", () => {
  it("does not draw an overlay for an empty caption", () => {
    expect(
      measureCaptionLayout({
        text: "   ",
        imageWidth: 1200,
        imageHeight: 800,
        measureText: measureByGrapheme,
      }),
    ).toEqual({ overlay: false });
  });

  it("keeps a short Japanese caption on one line", () => {
    const layout = measureCaptionLayout({
      text: "朝の海",
      imageWidth: 1600,
      imageHeight: 1200,
      measureText: measureByGrapheme,
    });
    expect(layout.overlay).toBe(true);
    if (!layout.overlay) return;
    expect(layout.lines).toEqual(["朝の海"]);
    expect(layout.bandY + layout.bandHeight).toBe(1200);
    expect(layout.bandHeight).toBeLessThan(1200);
  });

  it("wraps a long Japanese caption onto at most two lines", () => {
    const caption = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよ";
    const layout = measureCaptionLayout({
      text: caption,
      imageWidth: 900,
      imageHeight: 600,
      measureText: measureByGrapheme,
    });
    expect(layout.overlay).toBe(true);
    if (!layout.overlay) return;
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.lines.length).toBeLessThanOrEqual(GOOGLE_PHOTOS_CAPTION_MAX_LINES);
    expect(layout.lines.join("")).toBe(caption);
  });

  it("wraps mixed ASCII and Japanese without depending on spaces", () => {
    const caption = "Hello海辺の記録ABC";
    const layout = measureCaptionLayout({
      text: caption,
      imageWidth: 420,
      imageHeight: 320,
      measureText: measureByGrapheme,
    });
    expect(layout.overlay).toBe(true);
    if (!layout.overlay) return;
    expect(layout.lines.length).toBeLessThanOrEqual(GOOGLE_PHOTOS_CAPTION_MAX_LINES);
    expect(layout.lines.join("")).toBe(caption);
  });

  it("does not split emoji graphemes", () => {
    const caption = "海辺👋記録";
    expect(segmentCaptionText(caption).join("")).toBe(caption);
    expect(segmentCaptionText("👨‍👩‍👧‍👦").some((part) => part.includes("👨"))).toBe(
      true,
    );
    const layout = measureCaptionLayout({
      text: caption,
      imageWidth: 1400,
      imageHeight: 900,
      measureText: measureByGrapheme,
    });
    expect(layout.overlay).toBe(true);
    if (!layout.overlay) return;
    expect(layout.lines.join("")).toContain("👋");
    expect(layout.lines.join("")).not.toMatch(/\uD83D$|\uDC4B$/);
  });

  it("shows an 80-character caption as completely as possible", () => {
    const caption = "あ".repeat(80);
    const layout = measureCaptionLayout({
      text: caption,
      imageWidth: 2000,
      imageHeight: 1400,
      measureText: measureByGrapheme,
    });
    expect(layout.overlay).toBe(true);
    if (!layout.overlay) return;
    expect(layout.lines.join("")).toBe(caption);
    expect(layout.lines.length).toBeLessThanOrEqual(GOOGLE_PHOTOS_CAPTION_MAX_LINES);
  });

  it("scales font size with image width", () => {
    const small = measureCaptionLayout({
      text: "記録",
      imageWidth: 640,
      imageHeight: 480,
      measureText: measureByGrapheme,
    });
    const large = measureCaptionLayout({
      text: "記録",
      imageWidth: 2400,
      imageHeight: 1800,
      measureText: measureByGrapheme,
    });
    expect(small.overlay && large.overlay).toBe(true);
    if (!small.overlay || !large.overlay) return;
    expect(large.fontSize).toBeGreaterThan(small.fontSize);
  });

  it("keeps text and overlay inside the image bounds", () => {
    const layout = measureCaptionLayout({
      text: "あ".repeat(80),
      imageWidth: 800,
      imageHeight: 500,
      measureText: measureByGrapheme,
    });
    expect(layout.overlay).toBe(true);
    if (!layout.overlay) return;
    expect(layout.bandY).toBeGreaterThanOrEqual(0);
    expect(layout.bandY + layout.bandHeight).toBeLessThanOrEqual(500);
    expect(layout.bandHeight).toBeLessThanOrEqual(500);
    for (const line of layout.lines) {
      expect(measureByGrapheme(line, layout.fontSize)).toBeLessThanOrEqual(800);
    }
    expect(Math.max(...layout.textY) + layout.lineHeight).toBeLessThanOrEqual(500);
  });
});
