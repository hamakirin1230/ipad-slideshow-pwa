import {
  buildGooglePhotosExportFileName,
  GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES,
  type GooglePhotosExportMimeType,
} from "./contract";
import {
  googlePhotosCaptionFont,
  GOOGLE_PHOTOS_CAPTION_BACKGROUND,
  GOOGLE_PHOTOS_CAPTION_TEXT_COLOR,
  measureCaptionLayout,
} from "./caption-layout";

export const GOOGLE_PHOTOS_JPEG_QUALITY = 0.93;

export type GooglePhotosRenderedImageMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export type GooglePhotosRenderedImage = {
  blob: Blob;
  mimeType: GooglePhotosRenderedImageMimeType;
  fileName: string;
};

export type GooglePhotosImageRenderInput = {
  source: Blob;
  sourceMimeType: GooglePhotosExportMimeType;
  caption: string;
  fileName: string;
  slideIndex: number;
  signal: AbortSignal;
};

export class GooglePhotosImageRenderError extends Error {
  readonly code = "imageRenderFailed" as const;

  constructor() {
    super("image-render-failed");
    this.name = "GooglePhotosImageRenderError";
  }
}

export function isGooglePhotosExportImageMimeType(
  value: string,
): value is GooglePhotosRenderedImageMimeType {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

export function resolveGooglePhotosRenderedImageMime(input: {
  sourceMimeType: string;
  canEncodeWebp: boolean;
}): GooglePhotosRenderedImageMimeType {
  if (input.sourceMimeType === "image/jpeg") {
    return "image/jpeg";
  }
  if (input.sourceMimeType === "image/png") {
    return "image/png";
  }
  if (input.sourceMimeType === "image/webp") {
    return input.canEncodeWebp ? "image/webp" : "image/png";
  }
  throw new GooglePhotosImageRenderError();
}

export function planGooglePhotosImageRender(input: {
  sourceMimeType: string;
  caption: string;
  canEncodeWebp: boolean;
}) {
  const outputMimeType = resolveGooglePhotosRenderedImageMime(input);
  return {
    outputMimeType,
    drawOverlay: input.caption.trim().length > 0,
    jpegQuality:
      outputMimeType === "image/jpeg" ? GOOGLE_PHOTOS_JPEG_QUALITY : undefined,
  };
}

export function buildGooglePhotosRenderedExportFileName(input: {
  sourceFileName: string;
  outputMimeType: GooglePhotosRenderedImageMimeType;
  slideIndex: number;
}) {
  const extension = extensionForRenderedMime(input.outputMimeType);
  return buildGooglePhotosExportFileName({
    slideIndex: input.slideIndex,
    assetName: replaceFileNameExtension(input.sourceFileName, extension),
    mimeType: input.outputMimeType,
  });
}

export function isGooglePhotosRenderedImageWithinUploadLimit(sizeBytes: number) {
  return (
    Number.isSafeInteger(sizeBytes) &&
    sizeBytes > 0 &&
    sizeBytes <= GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES
  );
}

export async function renderGooglePhotosExportImage(
  input: GooglePhotosImageRenderInput,
): Promise<GooglePhotosRenderedImage> {
  if (input.signal.aborted) {
    throw new DOMException("aborted", "AbortError");
  }
  if (!isGooglePhotosExportImageMimeType(input.sourceMimeType)) {
    throw new GooglePhotosImageRenderError();
  }

  const decoded = await decodeExportImage(input.source, input.signal);
  const canvas = document.createElement("canvas");
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const context = canvas.getContext("2d");
  if (!context) {
    releaseDecodedImage(decoded);
    releaseCanvas(canvas);
    throw new GooglePhotosImageRenderError();
  }

  try {
    context.drawImage(decoded.source, 0, 0);
    const layout = measureCaptionLayout({
      text: input.caption,
      imageWidth: canvas.width,
      imageHeight: canvas.height,
      measureText: (text, fontSize) => {
        context.font = googlePhotosCaptionFont(fontSize);
        return context.measureText(text).width;
      },
    });
    if (layout.overlay) {
      context.fillStyle = GOOGLE_PHOTOS_CAPTION_BACKGROUND;
      context.fillRect(0, layout.bandY, canvas.width, layout.bandHeight);
      context.fillStyle = GOOGLE_PHOTOS_CAPTION_TEXT_COLOR;
      context.font = googlePhotosCaptionFont(layout.fontSize);
      context.textAlign = "center";
      context.textBaseline = "top";
      layout.lines.forEach((line, index) => {
        const textY = layout.textY[index];
        if (textY === undefined) return;
        context.fillText(line, layout.textX, textY);
      });
    }

    const outputMimeType = resolveGooglePhotosRenderedImageMime({
      sourceMimeType: input.sourceMimeType,
      canEncodeWebp: canvasCanEncodeWebp(canvas),
    });
    const blob = await canvasToExportBlob(canvas, outputMimeType);
    return {
      blob,
      mimeType: outputMimeType,
      fileName: buildGooglePhotosRenderedExportFileName({
        sourceFileName: input.fileName,
        outputMimeType,
        slideIndex: input.slideIndex,
      }),
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new GooglePhotosImageRenderError();
  } finally {
    releaseDecodedImage(decoded);
    releaseCanvas(canvas);
  }
}

type DecodedExportImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

async function decodeExportImage(
  source: Blob,
  signal: AbortSignal,
): Promise<DecodedExportImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createOrientedImageBitmap(source);
      if (signal.aborted) {
        bitmap.close();
        throw new DOMException("aborted", "AbortError");
      }
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
    }
  }

  return decodeWithHtmlImage(source, signal);
}

async function createOrientedImageBitmap(source: Blob) {
  try {
    return await createImageBitmap(source, {
      imageOrientation: "from-image",
    } as ImageBitmapOptions);
  } catch {
    return createImageBitmap(source);
  }
}

async function decodeWithHtmlImage(source: Blob, signal: AbortSignal) {
  const objectUrl = URL.createObjectURL(source);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        cleanup();
        reject(new DOMException("aborted", "AbortError"));
      };
      const cleanup = () => {
        image.removeEventListener("load", onLoad);
        image.removeEventListener("error", onError);
        signal.removeEventListener("abort", onAbort);
      };
      const onLoad = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new GooglePhotosImageRenderError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      image.addEventListener("load", onLoad, { once: true });
      image.addEventListener("error", onError, { once: true });
      image.src = objectUrl;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => {
        image.src = "";
      },
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasCanEncodeWebp(canvas: HTMLCanvasElement) {
  try {
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

function canvasToExportBlob(
  canvas: HTMLCanvasElement,
  mimeType: GooglePhotosRenderedImageMimeType,
) {
  const quality =
    mimeType === "image/jpeg" ? GOOGLE_PHOTOS_JPEG_QUALITY : undefined;
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new GooglePhotosImageRenderError());
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

function releaseDecodedImage(decoded: DecodedExportImage) {
  try {
    decoded.close();
  } catch {
    // Best-effort release only.
  }
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 1;
  canvas.height = 1;
}

function replaceFileNameExtension(fileName: string, extension: string) {
  if (/\.[^.]+$/.test(fileName)) {
    return fileName.replace(/\.[^.]+$/, `.${extension}`);
  }
  return fileName;
}

function extensionForRenderedMime(mimeType: GooglePhotosRenderedImageMimeType) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
