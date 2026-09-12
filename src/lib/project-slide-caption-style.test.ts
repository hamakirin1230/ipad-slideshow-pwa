import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_SLIDE_CAPTION_STYLE as defaults,
  PROJECT_SLIDE_CAPTION_STYLE_OPTIONS as options,
  areProjectSlideCaptionStylesEqual,
  getEffectiveProjectSlideCaptionStyle,
  normalizeProjectSlideCaptionStyleForWrite,
  parseProjectSlideCaptionStyle,
  pickProjectSlideCaptionStyle,
} from "./project-slide-caption-style";

describe("album caption style domain", () => {
  it("resolves legacy absence and explicit defaults equally and omits default writes", () => {
    expect(getEffectiveProjectSlideCaptionStyle(undefined)).toEqual({ position: "bottom", shape: "rounded", size: "standard", colorPreset: "whiteOnBlack" });
    expect(areProjectSlideCaptionStylesEqual(undefined, defaults)).toBe(true);
    expect(normalizeProjectSlideCaptionStyleForWrite(defaults)).toBeUndefined();
    expect(normalizeProjectSlideCaptionStyleForWrite(undefined)).toBeUndefined();
    expect(pickProjectSlideCaptionStyle({})).toEqual({});
  });
  it("accepts and round-trips all 54 combinations", () => {
    let count = 0;
    for (const { value: position } of options.position)
      for (const { value: shape } of options.shape)
        for (const { value: size } of options.size)
          for (const { value: colorPreset } of options.colorPreset) {
            const style = { position, shape, size, colorPreset };
            expect(parseProjectSlideCaptionStyle(style)).toEqual({ ok: true, value: style });
            expect(getEffectiveProjectSlideCaptionStyle(normalizeProjectSlideCaptionStyleForWrite(style))).toEqual(style);
            count++;
          }
    expect(count).toBe(54);
  });
  it.each([null, undefined, [], "bottom", {}, { ...defaults, position: "left" }, { ...defaults, shape: "pill" }, { ...defaults, size: 12 }, { ...defaults, colorPreset: "red" }, { ...defaults, extra: true }])("rejects invalid style %# without defaulting", (value) => {
    expect(parseProjectSlideCaptionStyle(value).ok).toBe(false);
  });
  it("copies optional values without erasing explicit defaults needed for content hashes", () => {
    const picked = pickProjectSlideCaptionStyle({ captionStyle: defaults });
    expect(picked.captionStyle).toEqual(defaults);
    expect(picked.captionStyle).not.toBe(defaults);
    expect(() => getEffectiveProjectSlideCaptionStyle(null as never)).toThrow(TypeError);
  });
  it("keeps serialized UI keys stable when manifest field order changes", () => {
    const reordered = { colorPreset: defaults.colorPreset, size: defaults.size, shape: defaults.shape, position: defaults.position };
    expect(JSON.stringify(getEffectiveProjectSlideCaptionStyle(reordered))).toBe(JSON.stringify(getEffectiveProjectSlideCaptionStyle(defaults)));
  });
});
