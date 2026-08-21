import { describe, expect, it } from "vitest";
import {
  GOOGLE_PHOTOS_CAPTION_ABSOLUTE_MIN_FONT_SIZE,
  GOOGLE_PHOTOS_CAPTION_MAX_FONT_SIZE_HEIGHT_RATIO,
  GOOGLE_PHOTOS_CAPTION_MAX_LINES,
  measureCaptionLayout,
  segmentCaptionText,
} from "./caption-layout";

function measureByGrapheme(text: string, fontSize: number) {
  return segmentCaptionText(text).length * fontSize * 0.8;
}

function overlayLayout(
  imageWidth: number,
  imageHeight: number,
  text = "記録",
) {
  return measureCaptionLayout({
    text,
    imageWidth,
    imageHeight,
    measureText: measureByGrapheme,
  });
}

function containVisualFontSize(
  fontSize: number,
  imageWidth: number,
  imageHeight: number,
  viewWidth: number,
  viewHeight: number,
) {
  return fontSize * Math.min(viewWidth / imageWidth, viewHeight / imageHeight);
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
    const caption = "あ".repeat(80);
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

  it("uses the same short-caption font size for same-height images with different widths", () => {
    const square = overlayLayout(1200, 1200);
    const wide = overlayLayout(2400, 1200);
    expect(square.kind === "overlay" && wide.kind === "overlay").toBe(true);
    if (square.kind !== "overlay" || wide.kind !== "overlay") return;
    expect(square.fontSize).toBe(wide.fontSize);
    expect(square.fontSize).toBe(
      Math.round(1200 * GOOGLE_PHOTOS_CAPTION_MAX_FONT_SIZE_HEIGHT_RATIO),
    );
    expect(square.lines).toEqual(["記録"]);
    expect(wide.lines).toEqual(["記録"]);
  });

  it("scales short-caption font size with image height, not image width", () => {
    const small = overlayLayout(640, 480);
    const large = overlayLayout(2400, 1800);
    expect(small.kind === "overlay" && large.kind === "overlay").toBe(true);
    if (small.kind !== "overlay" || large.kind !== "overlay") return;
    expect(large.fontSize).toBeGreaterThan(small.fontSize);
    expect(small.fontSize).toBe(
      Math.round(480 * GOOGLE_PHOTOS_CAPTION_MAX_FONT_SIZE_HEIGHT_RATIO),
    );
    expect(large.fontSize).toBe(
      Math.round(1800 * GOOGLE_PHOTOS_CAPTION_MAX_FONT_SIZE_HEIGHT_RATIO),
    );
  });

  it("keeps portrait and landscape representative photos visually close under contain", () => {
    const portrait = overlayLayout(3024, 4032);
    const landscape = overlayLayout(4032, 3024);
    const landscape1600 = overlayLayout(1600, 1200);
    const small = overlayLayout(600, 400);
    expect(
      portrait.kind === "overlay" &&
        landscape.kind === "overlay" &&
        landscape1600.kind === "overlay" &&
        small.kind === "overlay",
    ).toBe(true);
    if (
      portrait.kind !== "overlay" ||
      landscape.kind !== "overlay" ||
      landscape1600.kind !== "overlay" ||
      small.kind !== "overlay"
    ) {
      return;
    }

    expect(portrait.fontSize).toBe(
      Math.round(4032 * GOOGLE_PHOTOS_CAPTION_MAX_FONT_SIZE_HEIGHT_RATIO),
    );
    expect(landscape.fontSize).toBe(
      Math.round(3024 * GOOGLE_PHOTOS_CAPTION_MAX_FONT_SIZE_HEIGHT_RATIO),
    );
    expect(landscape1600.fontSize).toBe(
      Math.round(1200 * GOOGLE_PHOTOS_CAPTION_MAX_FONT_SIZE_HEIGHT_RATIO),
    );
    expect(small.fontSize).toBe(
      Math.round(400 * GOOGLE_PHOTOS_CAPTION_MAX_FONT_SIZE_HEIGHT_RATIO),
    );
    expect(small.fontSize).toBeGreaterThanOrEqual(
      GOOGLE_PHOTOS_CAPTION_ABSOLUTE_MIN_FONT_SIZE,
    );

    const previousWidthBasedLandscape = Math.round(
      Math.min(4032 * 0.045, 3024 * 0.08),
    );
    expect(landscape.fontSize).toBeLessThan(previousWidthBasedLandscape);

    const viewWidth = 1024;
    const viewHeight = 768;
    const portraitVisual = containVisualFontSize(
      portrait.fontSize,
      3024,
      4032,
      viewWidth,
      viewHeight,
    );
    const landscapeVisual = containVisualFontSize(
      landscape.fontSize,
      4032,
      3024,
      viewWidth,
      viewHeight,
    );
    const previousLandscapeVisual = containVisualFontSize(
      previousWidthBasedLandscape,
      4032,
      3024,
      viewWidth,
      viewHeight,
    );
    const previousPortraitVisual = containVisualFontSize(
      Math.round(Math.min(3024 * 0.045, 4032 * 0.08)),
      3024,
      4032,
      viewWidth,
      viewHeight,
    );

    expect(Math.abs(portraitVisual - landscapeVisual)).toBeLessThan(
      0.05 * Math.min(portraitVisual, landscapeVisual),
    );
    expect(Math.abs(portraitVisual - landscapeVisual)).toBeLessThan(
      Math.abs(previousPortraitVisual - previousLandscapeVisual),
    );
  });

  it("shrinks a long caption only as far as needed to keep two full lines", () => {
    const caption = "あ".repeat(80);
    const short = overlayLayout(500, 800, "記録");
    const long = overlayLayout(500, 800, caption);
    expect(short.kind === "overlay" && long.kind === "overlay").toBe(true);
    if (short.kind !== "overlay" || long.kind !== "overlay") return;
    expect(short.fontSize).toBe(
      Math.round(800 * GOOGLE_PHOTOS_CAPTION_MAX_FONT_SIZE_HEIGHT_RATIO),
    );
    expect(long.fontSize).toBeLessThan(short.fontSize);
    expect(long.lines.length).toBe(GOOGLE_PHOTOS_CAPTION_MAX_LINES);
    expect(long.lines.join("")).toBe(caption);
    expect(long.fontSize).toBeGreaterThanOrEqual(
      GOOGLE_PHOTOS_CAPTION_ABSOLUTE_MIN_FONT_SIZE,
    );
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
