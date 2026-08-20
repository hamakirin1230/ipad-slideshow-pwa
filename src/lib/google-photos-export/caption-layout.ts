export const GOOGLE_PHOTOS_CAPTION_MAX_LINES = 2;
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
  | { overlay: false }
  | ({ overlay: true } & CaptionOverlayLayout);

export function measureCaptionLayout(input: {
  text: string;
  imageWidth: number;
  imageHeight: number;
  measureText: CaptionTextMeasurer;
}): CaptionLayout {
  const text = input.text.trim();
  if (
    !text ||
    !Number.isFinite(input.imageWidth) ||
    !Number.isFinite(input.imageHeight) ||
    input.imageWidth <= 0 ||
    input.imageHeight <= 0
  ) {
    return { overlay: false };
  }

  const paddingX = Math.max(8, Math.round(input.imageWidth * 0.04));
  const maxTextWidth = Math.max(1, input.imageWidth - paddingX * 2);
  const minFontSize = Math.max(10, Math.round(input.imageWidth * 0.018));
  const maxFontSize = Math.max(
    minFontSize,
    Math.round(Math.min(input.imageWidth * 0.045, input.imageHeight * 0.08)),
  );
  const units = segmentCaptionText(text);

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const layout = layoutCaptionAtFontSize({
      units,
      fontSize,
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
      paddingX,
      maxTextWidth,
      measureText: input.measureText,
      allowOverflow: false,
    });
    if (layout) {
      return layout;
    }
  }

  const fallback = layoutCaptionAtFontSize({
    units,
    fontSize: minFontSize,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    paddingX,
    maxTextWidth,
    measureText: input.measureText,
    allowOverflow: true,
  });
  return fallback ?? { overlay: false };
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
  units: string[];
  fontSize: number;
  imageWidth: number;
  imageHeight: number;
  paddingX: number;
  maxTextWidth: number;
  measureText: CaptionTextMeasurer;
  allowOverflow: boolean;
}): CaptionLayout | null {
  const widthOf = (value: string) => input.measureText(value, input.fontSize);
  const wrapped = input.allowOverflow
    ? packCaptionLines(input.units, input.maxTextWidth, widthOf)
    : wrapCaptionLines(input.units, input.maxTextWidth, widthOf);
  if (!input.allowOverflow && !wrapped.fits) {
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
    overlay: true,
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

function packCaptionLines(
  units: string[],
  maxWidth: number,
  widthOf: (value: string) => number,
) {
  const lines: string[] = [];
  let index = 0;
  while (lines.length < GOOGLE_PHOTOS_CAPTION_MAX_LINES && index < units.length) {
    let current = "";
    while (index < units.length) {
      const candidate = current + units[index];
      if (current !== "" && widthOf(candidate) > maxWidth) {
        break;
      }
      current = candidate;
      index += 1;
      if (current !== "" && widthOf(current) >= maxWidth) {
        break;
      }
    }
    if (!current && index < units.length) {
      current = units[index] ?? "";
      index += 1;
    }
    if (current) {
      lines.push(current);
    } else {
      break;
    }
  }
  return {
    lines,
    fits: index >= units.length && lines.length <= GOOGLE_PHOTOS_CAPTION_MAX_LINES,
  };
}
