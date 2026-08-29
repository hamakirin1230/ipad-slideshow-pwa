import { describe, expect, it } from "vitest";
import {
  areProjectSlideImageEditsEqual,
  applyCanvasImageEditTransform,
  getCanvasImageEditRenderPlan,
  getEffectiveCrop,
  getPixelCropRect,
  getRotatedImageDimensions,
  getSvgImageRenderPlan,
  getSvgImageTransform,
  isProjectSlideImageForImageEdit,
  isProjectSlideVideoForImageEdit,
  normalizeProjectSlideImageEditForWrite,
  parseProjectSlideImageEdit,
  rotateCrop180,
  rotateCropClockwise,
  rotateCropCounterClockwise,
  rotateProjectSlideImageEditClockwise,
  rotateProjectSlideImageEditCounterClockwise,
} from "./project-slide-image-edit";

const SAMPLE_CROP = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };

describe("project slide image edit", () => {
  it("treats absent imageEdit as legacy identity", () => {
    expect(normalizeProjectSlideImageEditForWrite(undefined)).toBeUndefined();
    expect(getEffectiveCrop(undefined)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    expect(areProjectSlideImageEditsEqual(undefined, { rotation: 0 })).toBe(true);
  });

  it.each([0, 90, 180, 270] as const)("accepts rotation %s", (rotation) => {
    expect(parseProjectSlideImageEdit({ rotation })).toEqual({
      ok: true,
      value: { rotation },
    });
  });

  it("rejects unknown rotation", () => {
    expect(parseProjectSlideImageEdit({ rotation: 45 }).ok).toBe(false);
    expect(parseProjectSlideImageEdit({ rotation: "90" }).ok).toBe(false);
  });

  it("rejects invalid crop bounds", () => {
    expect(
      parseProjectSlideImageEdit({
        rotation: 0,
        crop: { x: -0.1, y: 0, width: 0.5, height: 0.5 },
      }).ok,
    ).toBe(false);
    expect(
      parseProjectSlideImageEdit({
        rotation: 0,
        crop: { x: 0.8, y: 0, width: 0.3, height: 0.5 },
      }).ok,
    ).toBe(false);
    expect(
      parseProjectSlideImageEdit({
        rotation: 0,
        crop: { x: 0, y: 0, width: 0, height: 0.5 },
      }).ok,
    ).toBe(false);
  });

  it("rejects NaN and Infinity crop values", () => {
    expect(
      parseProjectSlideImageEdit({
        rotation: 0,
        crop: { x: Number.NaN, y: 0, width: 0.5, height: 0.5 },
      }).ok,
    ).toBe(false);
    expect(
      parseProjectSlideImageEdit({
        rotation: 0,
        crop: { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 0.5 },
      }).ok,
    ).toBe(false);
  });

  it("accepts a structurally valid full crop without canonicalizing on parse", () => {
    const result = parseProjectSlideImageEdit({
      rotation: 90,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(result).toEqual({
      ok: true,
      value: { rotation: 90, crop: { x: 0, y: 0, width: 1, height: 1 } },
    });
  });

  it("omits no-op edits on write", () => {
    expect(
      normalizeProjectSlideImageEditForWrite({ rotation: 0 }),
    ).toBeUndefined();
    expect(
      normalizeProjectSlideImageEditForWrite({
        rotation: 0,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      }),
    ).toBeUndefined();
    expect(
      normalizeProjectSlideImageEditForWrite({
        rotation: 90,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      }),
    ).toEqual({ rotation: 90 });
    expect(
      normalizeProjectSlideImageEditForWrite({
        rotation: 90,
        crop: SAMPLE_CROP,
      }),
    ).toEqual({ rotation: 90, crop: SAMPLE_CROP });
  });

  it("classifies image vs video without relying on type alone", () => {
    expect(isProjectSlideImageForImageEdit({ type: "image" })).toBe(true);
    expect(isProjectSlideImageForImageEdit({ mimeType: "image/jpeg" })).toBe(
      true,
    );
    expect(isProjectSlideVideoForImageEdit({ type: "video" })).toBe(true);
    expect(isProjectSlideVideoForImageEdit({ mimeType: "video/mp4" })).toBe(
      true,
    );
    expect(
      isProjectSlideImageForImageEdit({
        type: "image",
        mimeType: "video/mp4",
      }),
    ).toBe(false);
    expect(
      isProjectSlideImageForImageEdit({
        type: "video",
        mimeType: "image/jpeg",
      }),
    ).toBe(false);
  });

  it("transforms crop clockwise, counterclockwise, and 180°", () => {
    expect(rotateCropClockwise(SAMPLE_CROP)).toEqual({
      x: 0.5,
      y: 0.1,
      width: 0.3,
      height: 0.4,
    });
    expect(rotateCropCounterClockwise(SAMPLE_CROP)).toEqual({
      x: 0.2,
      y: 0.5,
      width: 0.3,
      height: 0.4,
    });
    expect(rotateCrop180(SAMPLE_CROP)).toEqual({
      x: 0.5,
      y: 0.5,
      width: 0.4,
      height: 0.3,
    });
  });

  it("returns to the original crop after four right or left rotations", () => {
    let clockwise = SAMPLE_CROP;
    let counterclockwise = SAMPLE_CROP;
    for (let index = 0; index < 4; index += 1) {
      clockwise = rotateCropClockwise(clockwise);
      counterclockwise = rotateCropCounterClockwise(counterclockwise);
    }
    expect(clockwise).toEqual(SAMPLE_CROP);
    expect(counterclockwise).toEqual(SAMPLE_CROP);

    let edit = { rotation: 0 as const, crop: SAMPLE_CROP };
    for (let index = 0; index < 4; index += 1) {
      edit = rotateProjectSlideImageEditClockwise(edit);
    }
    expect(edit).toEqual({ rotation: 0, crop: SAMPLE_CROP });

    edit = { rotation: 0, crop: SAMPLE_CROP };
    for (let index = 0; index < 4; index += 1) {
      edit = rotateProjectSlideImageEditCounterClockwise(edit);
    }
    expect(edit).toEqual({ rotation: 0, crop: SAMPLE_CROP });
  });

  it("swaps source dimensions for 90 and 270", () => {
    expect(getRotatedImageDimensions(800, 600, 0)).toEqual({
      width: 800,
      height: 600,
    });
    expect(getRotatedImageDimensions(800, 600, 90)).toEqual({
      width: 600,
      height: 800,
    });
    expect(getRotatedImageDimensions(800, 600, 180)).toEqual({
      width: 800,
      height: 600,
    });
    expect(getRotatedImageDimensions(800, 600, 270)).toEqual({
      width: 600,
      height: 800,
    });
  });

  it("builds SVG and canvas plans from rotation enum and validated crop only", () => {
    const svg = getSvgImageRenderPlan({
      sourceWidth: 800,
      sourceHeight: 600,
      imageEdit: { rotation: 90, crop: SAMPLE_CROP },
    });
    expect(svg.transform).toBe(getSvgImageTransform(800, 600, 90));
    expect(svg.transform).toBe("translate(600 0) rotate(90)");
    expect(svg.viewBox).toBe("60 160 240 240");

    const canvas = getCanvasImageEditRenderPlan({
      sourceWidth: 800,
      sourceHeight: 600,
      imageEdit: { rotation: 90, crop: SAMPLE_CROP },
    });
    expect(canvas.outputWidth).toBe(240);
    expect(canvas.outputHeight).toBe(240);
    expect(canvas.rotationRadians).toBe(Math.PI / 2);

    const ops: string[] = [];
    applyCanvasImageEditTransform(
      {
        translate: (x, y) => ops.push(`translate:${x},${y}`),
        rotate: (angle) => ops.push(`rotate:${angle}`),
      },
      canvas,
    );
    expect(ops[0]).toBe("translate:-60,-160");
    expect(ops).toContain("rotate:1.5707963267948966");
  });

  it("uses crop pixel rect in rotated coordinates", () => {
    expect(
      getPixelCropRect({
        sourceWidth: 1000,
        sourceHeight: 500,
        imageEdit: { rotation: 0, crop: SAMPLE_CROP },
      }),
    ).toEqual({ x: 100, y: 100, width: 400, height: 150 });
  });
});
