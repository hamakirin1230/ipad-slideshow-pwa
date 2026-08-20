import { describe, expect, it } from "vitest";
import {
  GOOGLE_PHOTOS_CAPTION_ABSOLUTE_MIN_FONT_SIZE,
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
    ).toEqual({ kind: "none" });
  });

  it("keeps a short Japanese caption on one line in full", () => {
    const caption = "朝の海";
    const layout = measureCaptionLayout({
      text: caption,
      imageWidth: 1600,
      imageHeight: 1200,
      measureText: measureByGrapheme,
    });
    expect(layout.kind).toBe("overlay");
    if (layout.kind !== "overlay") return;
    expect(layout.lines).toEqual([caption]);
    expect(layout.lines.join("")).toBe(caption);
    expect(layout.bandY + layout.bandHeight).toBe(1200);
    expect(layout.bandHeight).toBeLessThan(1200);
  });

  it("wraps a long Japanese caption onto at most two lines without dropping text", () => {
    const caption = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよ";
    const layout = measureCaptionLayout({
      text: caption,
      imageWidth: 900,
      imageHeight: 600,
      measureText: measureByGrapheme,
    });
    expect(layout.kind).toBe("overlay");
    if (layout.kind !== "overlay") return;
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
    expect(layout.kind).toBe("overlay");
    if (layout.kind !== "overlay") return;
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
    expect(layout.kind).toBe("overlay");
    if (layout.kind !== "overlay") return;
    expect(layout.lines.join("")).toBe(caption);
    expect(layout.lines.join("")).toContain("👋");
    expect(layout.lines.join("")).not.toMatch(/\uD83D$|\uDC4B$/);
  });

  it("preserves an 80-character Japanese caption in full on a normal image", () => {
    const caption = "あ".repeat(80);
    const layout = measureCaptionLayout({
      text: caption,
      imageWidth: 2000,
      imageHeight: 1400,
      measureText: measureByGrapheme,
    });
    expect(layout.kind).toBe("overlay");
    if (layout.kind !== "overlay") return;
    expect(layout.lines.join("")).toBe(caption);
    expect(layout.lines.length).toBeLessThanOrEqual(GOOGLE_PHOTOS_CAPTION_MAX_LINES);
    expect(layout.fontSize).toBeGreaterThanOrEqual(
      GOOGLE_PHOTOS_CAPTION_ABSOLUTE_MIN_FONT_SIZE,
    );
  });

  it("fails instead of returning the first two lines when the full caption cannot fit", () => {
    const caption = "あいうえおかきくけこ";
    const layout = measureCaptionLayout({
      text: caption,
      imageWidth: 80,
      imageHeight: 60,
      measureText: (text) => (text ? 10_000 : 0),
    });
    expect(layout).toEqual({ kind: "doesNotFit" });
  });

  it("fails when an 80-character caption cannot fit even at the absolute minimum font size", () => {
    const caption = "あ".repeat(80);
    const layout = measureCaptionLayout({
      text: caption,
      imageWidth: 120,
      imageHeight: 80,
      measureText: measureByGrapheme,
    });
    expect(layout).toEqual({ kind: "doesNotFit" });
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
    expect(small.kind === "overlay" && large.kind === "overlay").toBe(true);
    if (small.kind !== "overlay" || large.kind !== "overlay") return;
    expect(large.fontSize).toBeGreaterThan(small.fontSize);
  });

  it("keeps fitted text and overlay inside the image bounds", () => {
    const layout = measureCaptionLayout({
      text: "あ".repeat(80),
      imageWidth: 800,
      imageHeight: 500,
      measureText: measureByGrapheme,
    });
    expect(layout.kind).toBe("overlay");
    if (layout.kind !== "overlay") return;
    expect(layout.lines.join("")).toBe("あ".repeat(80));
    expect(layout.bandY).toBeGreaterThanOrEqual(0);
    expect(layout.bandY + layout.bandHeight).toBeLessThanOrEqual(500);
    expect(layout.bandHeight).toBeLessThanOrEqual(500);
    for (const line of layout.lines) {
      expect(measureByGrapheme(line, layout.fontSize)).toBeLessThanOrEqual(800);
    }
    expect(Math.max(...layout.textY) + layout.lineHeight).toBeLessThanOrEqual(500);
  });
});
