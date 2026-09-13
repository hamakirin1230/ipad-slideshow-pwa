import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_SLIDE_CAPTION_STYLE as defaults, PROJECT_SLIDE_CAPTION_COLORS } from "@/lib/project-slide-caption-style";
import { PlayerCaption } from "./player-caption";
import { getPlayerCaptionStyle } from "./player-caption-style";

describe("Player album caption rendering", () => {
  it("preserves legacy appearance, clamp, blur and pointer transparency", () => {
    const result = getPlayerCaptionStyle({ isProductionMode: false });
    expect(result).toEqual(getPlayerCaptionStyle({ isProductionMode: false, captionStyle: defaults }));
    expect(result.overlayClassName).toContain("bottom-20 sm:bottom-24");
    expect(result.overlayClassName).toContain("pointer-events-none");
    expect(result.className).toContain("max-w-4xl rounded-xl");
    expect(result.className).toContain("text-base leading-7 sm:text-xl sm:leading-8");
    expect(result.style).toMatchObject({ color: "#ffffff", backgroundColor: "rgba(0, 0, 0, 0.62)", backdropFilter: "blur(4px)", WebkitLineClamp: 2, overflow: "hidden" });
  });
  it.each(["top", "center", "bottom"] as const)("places %s captions with production safe areas", (position) => {
    const result = getPlayerCaptionStyle({ isProductionMode: true, captionStyle: { ...defaults, position } });
    expect(result.overlayClassName).toContain(position === "center" ? "top-1/2 -translate-y-1/2" : `${position}-0`);
    if (position === "top") expect(result.overlayStyle.paddingTop).toContain("safe-area-inset-top");
    if (position === "bottom") expect(result.overlayStyle.paddingBottom).toContain("safe-area-inset-bottom");
  });
  it("keeps top captions below normal controls and insets the rectangular band", () => {
    const result = getPlayerCaptionStyle({ isProductionMode: false, captionStyle: { ...defaults, position: "top", shape: "band" } });
    expect(result.overlayClassName).toContain("top-40 sm:top-32");
    expect(result.overlayClassName).toContain("px-4 sm:px-8");
    expect(result.className).toContain("w-full rounded-none");
    expect(result.className).not.toContain("max-w-4xl");
  });
  it.each(["small", "standard", "large"] as const)("maps %s to responsive font classes", (size) => {
    const result = getPlayerCaptionStyle({ isProductionMode: false, captionStyle: { ...defaults, size } });
    expect(result.className).toContain({ small: "text-sm", standard: "text-base", large: "text-xl" }[size]);
  });
  it.each(["whiteOnBlack", "blackOnWhite", "yellowOnBlack"] as const)("uses shared %s colors", (colorPreset) => {
    expect(getPlayerCaptionStyle({ isProductionMode: false, captionStyle: { ...defaults, colorPreset } }).style).toMatchObject(PROJECT_SLIDE_CAPTION_COLORS[colorPreset]);
  });
  it.each(["", "   ", "\n"])("does not render an empty caption %#", (caption) => {
    expect(renderToStaticMarkup(<PlayerCaption caption={caption} isProductionMode={false} />)).toBe("");
  });
});

it("shares inset band and translucent white with the Admin preview", () => {
 const input = { isProductionMode: false, captionStyle: { ...defaults, shape: "band" as const, colorPreset: "blackOnWhite" as const } };
 for (const preview of [false, true]) {
  const result = getPlayerCaptionStyle({ ...input, preview });
  expect(result.overlayClassName).toContain("px-4 sm:px-8");
  expect(result.className).toContain("w-full rounded-none");
  expect(result.style).toMatchObject({ color: "#0f172a", backgroundColor: "rgba(255, 255, 255, 0.82)" });
 }
});
