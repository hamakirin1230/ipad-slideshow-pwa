import { DEFAULT_PROJECT_SLIDE_CAPTION_STYLE as defaults, type ProjectSlideCaptionStyle } from "../project-slide-caption-style";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildGooglePhotosRenderedExportFileName,
  canBrowserEncodeWebp,
  GOOGLE_PHOTOS_WEBP_PROBE_CANVAS_SIZE,
  isGooglePhotosRenderedImageWithinUploadLimit,
  planGooglePhotosImageRender,
  planGooglePhotosImageEditRender,
  renderGooglePhotosExportImage,
  resetGooglePhotosWebpEncodeSupportCache,
  resolveGooglePhotosExportOutputMime,
  resolveGooglePhotosRenderedImageMime,
} from "./image-renderer";
import { GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES } from "./contract";

afterEach(() => {
  resetGooglePhotosWebpEncodeSupportCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("google photos image render policy", () => {
  it("uses the rotated crop as the final canvas dimensions", () => {
    expect(
      planGooglePhotosImageEditRender({
        sourceWidth: 1200,
        sourceHeight: 800,
        imageEdit: {
          rotation: 90,
          crop: { x: 0.25, y: 0.1, width: 0.5, height: 0.75 },
        },
      }),
    ).toMatchObject({
      outputWidth: 400,
      outputHeight: 900,
      cropX: 200,
      cropY: 120,
      rotation: 90,
    });
  });

  it("rotates and crops before laying out the caption on the final canvas", () => {
    const source = readFileSync(
      new URL("./image-renderer.ts", import.meta.url),
      "utf8",
    );
    const canvasSize = source.indexOf("canvas.width = imageEditPlan.outputWidth");
    const save = source.indexOf("context.save()", canvasSize);
    const transform = source.indexOf("applyCanvasImageEditTransform", save);
    const drawImage = source.indexOf(
      "context.drawImage(decoded.source, 0, 0)",
      transform,
    );
    const restore = source.indexOf("context.restore()", drawImage);
    const caption = source.indexOf("const layout = measureCaptionLayout", restore);
    expect(canvasSize).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(canvasSize);
    expect(transform).toBeGreaterThan(save);
    expect(drawImage).toBeGreaterThan(transform);
    expect(restore).toBeGreaterThan(drawImage);
    expect(caption).toBeGreaterThan(restore);
  });

  it("restores the final canvas coordinate system before drawing the caption", async () => {
    const events: Array<{ name: string; transformed: boolean }> = [];
    const transformStack: boolean[] = [];
    let transformed = false;
    const context = {
      fillStyle: "",
      font: "",
      textAlign: "start",
      textBaseline: "alphabetic",
      save() {
        events.push({ name: "save", transformed });
        transformStack.push(transformed);
      },
      restore() {
        transformed = transformStack.pop() ?? false;
        events.push({ name: "restore", transformed });
      },
      translate() {
        transformed = true;
        events.push({ name: "translate", transformed });
      },
      rotate() {
        transformed = true;
        events.push({ name: "rotate", transformed });
      },
      drawImage() {
        events.push({ name: "drawImage", transformed });
      },
      measureText(text: string) {
        events.push({ name: "measureText", transformed });
        return { width: text.length * 10 };
      },
      beginPath() {},
      moveTo() {},
      lineTo() {},
      quadraticCurveTo() {},
      closePath() {},
      fill() { events.push({ name: "fill", transformed }); },
      fillRect() {
        events.push({ name: "fillRect", transformed });
      },
      fillText() {
        events.push({ name: "fillText", transformed });
      },
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob(callback: (blob: Blob | null) => void, type?: string) {
        callback(new Blob([new Uint8Array([1])], { type }));
      },
    };
    const close = vi.fn();

    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({
      width: 1200,
      height: 800,
      close,
    })));
    vi.stubGlobal("document", {
      createElement(tag: string) {
        expect(tag).toBe("canvas");
        return canvas;
      },
    });

    await expect(
      renderGooglePhotosExportImage({
        source: new Blob([new Uint8Array([1])], { type: "image/png" }),
        sourceMimeType: "image/png",
        caption: "朝の風景",
        imageEdit: {
          rotation: 90,
          crop: { x: 0.25, y: 0.1, width: 0.5, height: 0.75 },
        },
        fileName: "photo.png",
        slideIndex: 0,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ mimeType: "image/png" });

    const eventNames = events.map((event) => event.name);
    expect(eventNames.indexOf("save")).toBeLessThan(eventNames.indexOf("drawImage"));
    expect(eventNames.indexOf("drawImage")).toBeLessThan(eventNames.indexOf("restore"));
    expect(eventNames.indexOf("restore")).toBeLessThan(eventNames.indexOf("measureText"));
    expect(eventNames.indexOf("measureText")).toBeLessThan(eventNames.indexOf("fill"));
    expect(events.find((event) => event.name === "drawImage")?.transformed).toBe(true);
    expect(
      events
        .filter((event) =>
          ["restore", "measureText", "fill", "fillText"].includes(event.name),
        )
        .every((event) => event.transformed === false),
    ).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps JPEG sources as rendered JPEG", () => {
    expect(
      planGooglePhotosImageRender({
        sourceMimeType: "image/jpeg",
        caption: "朝",
        canEncodeWebp: false,
      }),
    ).toMatchObject({
      outputMimeType: "image/jpeg",
      drawOverlay: true,
      jpegQuality: 0.93,
    });
  });

  it("keeps PNG sources as rendered PNG", () => {
    expect(
      resolveGooglePhotosRenderedImageMime({
        sourceMimeType: "image/png",
        canEncodeWebp: true,
      }),
    ).toBe("image/png");
    expect(
      planGooglePhotosImageRender({
        sourceMimeType: "image/png",
        caption: "",
        canEncodeWebp: true,
      }).drawOverlay,
    ).toBe(false);
  });

  it("does not probe WebP when rendering JPEG", async () => {
    const detectWebpSupport = vi.fn(async () => true);
    await expect(
      resolveGooglePhotosExportOutputMime({
        sourceMimeType: "image/jpeg",
        detectWebpSupport,
      }),
    ).resolves.toBe("image/jpeg");
    expect(detectWebpSupport).not.toHaveBeenCalled();
  });

  it("does not probe WebP when rendering PNG", async () => {
    const detectWebpSupport = vi.fn(async () => true);
    await expect(
      resolveGooglePhotosExportOutputMime({
        sourceMimeType: "image/png",
        detectWebpSupport,
      }),
    ).resolves.toBe("image/png");
    expect(detectWebpSupport).not.toHaveBeenCalled();
  });

  it("renders WebP when the tiny probe reports support", async () => {
    const detectWebpSupport = vi.fn(async () => true);
    await expect(
      resolveGooglePhotosExportOutputMime({
        sourceMimeType: "image/webp",
        detectWebpSupport,
      }),
    ).resolves.toBe("image/webp");
    expect(detectWebpSupport).toHaveBeenCalledTimes(1);
    expect(
      buildGooglePhotosRenderedExportFileName({
        sourceFileName: "photo.webp",
        outputMimeType: "image/webp",
        slideIndex: 0,
      }),
    ).toBe("photo.webp");
  });

  it("falls back from WebP to PNG and updates the filename extension", async () => {
    const detectWebpSupport = vi.fn(async () => false);
    await expect(
      resolveGooglePhotosExportOutputMime({
        sourceMimeType: "image/webp",
        detectWebpSupport,
      }),
    ).resolves.toBe("image/png");
    expect(detectWebpSupport).toHaveBeenCalledTimes(1);
    expect(
      buildGooglePhotosRenderedExportFileName({
        sourceFileName: "photo.webp",
        outputMimeType: "image/png",
        slideIndex: 0,
      }),
    ).toBe("photo.png");
  });

  it("probes WebP with a tiny canvas toBlob instead of a full-size data URL", async () => {
    const probed: Array<{ width: number; height: number; type?: string }> = [];
    vi.stubGlobal("document", {
      createElement(tag: string) {
        expect(tag).toBe("canvas");
        const canvas = {
          width: 0,
          height: 0,
          toBlob(
            callback: (blob: Blob | null) => void,
            type?: string,
          ) {
            probed.push({ width: canvas.width, height: canvas.height, type });
            callback(new Blob([new Uint8Array([1])], { type: "image/webp" }));
          },
        };
        return canvas;
      },
    });

    await expect(canBrowserEncodeWebp()).resolves.toBe(true);
    await expect(canBrowserEncodeWebp()).resolves.toBe(true);
    expect(probed).toEqual([
      {
        width: GOOGLE_PHOTOS_WEBP_PROBE_CANVAS_SIZE,
        height: GOOGLE_PHOTOS_WEBP_PROBE_CANVAS_SIZE,
        type: "image/webp",
      },
    ]);
    expect(GOOGLE_PHOTOS_WEBP_PROBE_CANVAS_SIZE).toBeLessThanOrEqual(2);
  });

  it("does not put internal IDs into rendered file names", () => {
    expect(
      buildGooglePhotosRenderedExportFileName({
        sourceFileName: "secret-asset-id",
        outputMimeType: "image/jpeg",
        slideIndex: 3,
      }),
    ).toBe("slide-4.jpg");
  });

  it("applies the 200MiB rendered payload limit", () => {
    expect(
      isGooglePhotosRenderedImageWithinUploadLimit(
        GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES,
      ),
    ).toBe(true);
    expect(
      isGooglePhotosRenderedImageWithinUploadLimit(
        GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES + 1,
      ),
    ).toBe(false);
  });
});

function canvasHarness() {
  const draws: Array<{ kind: string; color: string; args: number[]; font: string; align: string }> = [];
  const context = {
    fillStyle: "", font: "", textAlign: "start", textBaseline: "alphabetic",
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(), closePath: vi.fn(),
    measureText(text: string) { return { width: text.length * Number.parseFloat(this.font.split(" ")[1]!) * 0.8 }; },
    fillRect(...args: number[]) { draws.push({ kind: "rect", color: this.fillStyle, args, font: this.font, align: this.textAlign }); },
    fill() { draws.push({ kind: "path", color: this.fillStyle, args: [], font: this.font, align: this.textAlign }); },
    fillText(_text: string, ...args: number[]) { draws.push({ kind: "text", color: this.fillStyle, args, font: this.font, align: this.textAlign }); },
  };
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1024, height: 576, close })));
  const canvas = { width: 0, height: 0, getContext: () => context,
    toBlob(callback: (blob: Blob | null) => void, type: string) { callback(new Blob(["image"], { type })); } };
  vi.stubGlobal("document", { createElement: () => canvas });
  const render = (captionStyle?: ProjectSlideCaptionStyle, caption = "記録", signal = new AbortController().signal) => renderGooglePhotosExportImage({
    source: new Blob(["image"], { type: "image/png" }), sourceMimeType: "image/png", caption,
    captionStyle, fileName: "photo.png", slideIndex: 0, signal,
  });
  return { context, draws, close, render };
}

describe("Canvas album caption styles", () => {
  it.each([
    { captionStyle: undefined, fontSize: 23, x: 452.6, y: 526.1, width: 118.8, height: 49.9, radius: 11.5, background: "rgba(0, 0, 0, 0.62)", color: "#ffffff" },
    { captionStyle: { ...defaults, position: "top", shape: "band", size: "large", colorPreset: "yellowOnBlack" }, fontSize: 30, x: 0, y: 0, width: 1024, height: 67, radius: 0, background: "rgba(0, 0, 0, 0.82)", color: "#fde047" },
    { captionStyle: { ...defaults, position: "center", size: "small", colorPreset: "blackOnWhite" }, fontSize: 17, x: 457.4, y: 268.95, width: 109.2, height: 38.1, radius: 8.5, background: "rgba(255, 255, 255, 0.94)", color: "#0f172a" },
  ] as const)("draws representative style %# with exact Canvas colors and geometry", async (example) => {
    const h = canvasHarness();
    await h.render(example.captionStyle);
    const [background, text] = h.draws;
    expect(background?.color).toBe(example.background);
    expect(text).toMatchObject({ kind: "text", color: example.color, font: expect.stringContaining(`${example.fontSize}px`), align: "center" });
    expect(text?.args[0]).toBe(512);
    expect(h.draws.filter((draw) => draw.kind === "text")).toHaveLength(1);
    if (example.radius === 0) {
      expect(background?.kind).toBe("rect");
      expect(background?.args).toEqual([0, 0, 1024, 67]);
      expect(h.context.beginPath).not.toHaveBeenCalled();
    } else {
      expect(background?.kind).toBe("path");
      const x = (1024 - example.width) / 2;
      expect(h.context.moveTo).toHaveBeenCalledWith(x + example.radius, expect.closeTo(example.y));
      expect(h.context.quadraticCurveTo).toHaveBeenCalledWith(expect.closeTo(x + example.width), expect.closeTo(example.y), expect.closeTo(x + example.width), expect.closeTo(example.y + example.radius));
      expect(h.context.quadraticCurveTo).toHaveBeenCalledTimes(4);
      expect(h.context.closePath).toHaveBeenCalledOnce();
    }
    expect(h.close).toHaveBeenCalledOnce();
  });
  it("does not draw caption background or text for whitespace", async () => {
    const h = canvasHarness(); await h.render(undefined, "  ");
    expect(h.draws).toEqual([]);
    expect(h.context.beginPath).not.toHaveBeenCalled();
  });
  it("keeps complete long captions within two draw calls", async () => {
    const h = canvasHarness(); await h.render(undefined, "あ".repeat(80));
    expect(h.draws.filter((draw) => draw.kind === "text")).toHaveLength(2);
  });
  it("retains AbortError and sanitized render failure with cleanup", async () => {
    const h = canvasHarness(); const controller = new AbortController(); controller.abort();
    await expect(h.render(undefined, "記録", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(h.context.drawImage).not.toHaveBeenCalled();
    await expect(h.render({} as never)).rejects.toMatchObject({ code: "imageRenderFailed" });
    expect(h.close).toHaveBeenCalledOnce();
  });
});
