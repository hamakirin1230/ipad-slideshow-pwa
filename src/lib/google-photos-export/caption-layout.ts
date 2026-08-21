export const GOOGLE_PHOTOS_CAPTION_MAX_LINES = 2;
export const GOOGLE_PHOTOS_CAPTION_ABSOLUTE_MIN_FONT_SIZE = 8;
export const GOOGLE_PHOTOS_CAPTION_MIN_FONT_SIZE_HEIGHT_RATIO = 0.018;
export const GOOGLE_PHOTOS_CAPTION_MAX_FONT_SIZE_HEIGHT_RATIO = 0.04;
export const GOOGLE_PHOTOS_CAPTION_BACKGROUND = "rgba(0, 0, 0, 0.62)";
export const GOOGLE_PHOTOS_CAPTION_TEXT_COLOR = "#ffffff";
export const GOOGLE_PHOTOS_CAPTION_LINE_HEIGHT = 1.3;
export const GOOGLE_PHOTOS_CAPTION_FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export type CaptionTextMeasurer = (text: string, fontSize: number) => number;

export type CaptionOverlayLayout = {
  fontSize: number;
  lines: string[];
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  bandHeight: number;
  bandY: number;
  textX: number;
  textY: number[];
};

export type CaptionLayout =
  | { kind: "none" }
  | ({ kind: "overlay" } & CaptionOverlayLayout)
  | { kind: "doesNotFit" };

export function measureCaptionLayout(input: {
  text: string;
  imageWidth: number;
  imageHeight: number;
  measureText: CaptionTextMeasurer;
}): CaptionLayout {
  const text = input.text.trim();
  if (!text) {
    return { kind: "none" };
  }
  if (
    !Number.isFinite(input.imageWidth) ||
    !Number.isFinite(input.imageHeight) ||
    input.imageWidth <= 0 ||
    input.imageHeight <= 0
  ) {
    return { kind: "doesNotFit" };
  }

  const paddingX = Math.max(8, Math.round(input.imageWidth * 0.04));
  const maxTextWidth = Math.max(1, input.imageWidth - paddingX * 2);
  const preferredMinFontSize = Math.max(
    GOOGLE_PHOTOS_CAPTION_ABSOLUTE_MIN_FONT_SIZE,
    Math.round(
      input.imageHeight * GOOGLE_PHOTOS_CAPTION_MIN_FONT_SIZE_HEIGHT_RATIO,
    ),
  );
  const maxFontSize = Math.max(
    preferredMinFontSize,
    Math.round(
      input.imageHeight * GOOGLE_PHOTOS_CAPTION_MAX_FONT_SIZE_HEIGHT_RATIO,
    ),
  );
  const units = segmentCaptionText(text);

  for (
    let fontSize = maxFontSize;
    fontSize >= GOOGLE_PHOTOS_CAPTION_ABSOLUTE_MIN_FONT_SIZE;
    fontSize -= 1
  ) {
    const layout = layoutCaptionAtFontSize({
      text,
      units,
      fontSize,
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
      paddingX,
      maxTextWidth,
      measureText: input.measureText,
    });
    if (layout) {
      return layout;
    }
  }

  return { kind: "doesNotFit" };
}

export function segmentCaptionText(text: string) {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    try {
      return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(
        (part) => part.segment,
      );
    } catch {
      // Fall through to Array.from for older runtimes.
    }
  }
  return Array.from(text);
}

export function googlePhotosCaptionFont(fontSize: number) {
  return `500 ${fontSize}px ${GOOGLE_PHOTOS_CAPTION_FONT_FAMILY}`;
}

function layoutCaptionAtFontSize(input: {
  text: string;
  units: string[];
  fontSize: number;
  imageWidth: number;
  imageHeight: number;
  paddingX: number;
  maxTextWidth: number;
  measureText: CaptionTextMeasurer;
}): CaptionLayout | null {
  const widthOf = (value: string) => input.measureText(value, input.fontSize);
  const wrapped = wrapCaptionLines(input.units, input.maxTextWidth, widthOf);
  if (!wrapped.fits || wrapped.lines.join("") !== input.text) {
    return null;
  }

  const lineHeight = input.fontSize * GOOGLE_PHOTOS_CAPTION_LINE_HEIGHT;
  const paddingY = Math.max(6, Math.round(input.fontSize * 0.45));
  const bandHeight = wrapped.lines.length * lineHeight + paddingY * 2;
  if (bandHeight > input.imageHeight) {
    return null;
  }

  const bandY = input.imageHeight - bandHeight;
  const textY = wrapped.lines.map(
    (_, index) => bandY + paddingY + index * lineHeight,
  );
  const widest = wrapped.lines.reduce(
    (max, line) => Math.max(max, widthOf(line)),
    0,
  );
  if (widest > input.imageWidth) {
    return null;
  }

  return {
    kind: "overlay",
    fontSize: input.fontSize,
    lines: wrapped.lines,
    lineHeight,
    paddingX: input.paddingX,
    paddingY,
    bandHeight,
    bandY,
    textX: input.imageWidth / 2,
    textY,
  };
}

function wrapCaptionLines(
  units: string[],
  maxWidth: number,
  widthOf: (value: string) => number,
) {
  const lines: string[] = [];
  let current = "";
  for (const unit of units) {
    const candidate = current + unit;
    if (current === "" || widthOf(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = unit;
    if (lines.length >= GOOGLE_PHOTOS_CAPTION_MAX_LINES) {
      return { lines, fits: false };
    }
  }
  if (current) {
    lines.push(current);
  }
  return {
    lines,
    fits: lines.length > 0 && lines.length <= GOOGLE_PHOTOS_CAPTION_MAX_LINES,
  };
}
