export const PROJECT_SLIDE_IMAGE_ROTATIONS = [0, 90, 180, 270] as const;

export type ProjectSlideImageRotation =
  (typeof PROJECT_SLIDE_IMAGE_ROTATIONS)[number];

export type ProjectSlideImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ProjectSlideImageEdit = {
  rotation: ProjectSlideImageRotation;
  crop?: ProjectSlideImageCrop;
};

export const PROJECT_SLIDE_IMAGE_FULL_CROP: ProjectSlideImageCrop = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

export const PROJECT_SLIDE_IMAGE_EDIT_MIN_CROP_FRACTION = 0.05;

export type ProjectSlideImageEditParseResult =
  | { ok: true; value: ProjectSlideImageEdit }
  | { ok: false; errors: string[] };

export type RotatedImageDimensions = {
  width: number;
  height: number;
};

export type PixelCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SvgImageRenderPlan = {
  viewBox: string;
  imageWidth: number;
  imageHeight: number;
  transform: string;
};

export type CanvasImageEditRenderPlan = {
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  cropX: number;
  cropY: number;
  rotation: ProjectSlideImageRotation;
  rotationRadians: number;
};

const ROTATION_SET = new Set<number>(PROJECT_SLIDE_IMAGE_ROTATIONS);
const CROP_ARITHMETIC_PRECISION = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function stableCropNumber(value: number) {
  return Number(value.toFixed(CROP_ARITHMETIC_PRECISION));
}

export function isProjectSlideImageRotation(
  value: unknown,
): value is ProjectSlideImageRotation {
  return typeof value === "number" && ROTATION_SET.has(value);
}

export function isProjectSlideVideoForImageEdit(slide: {
  type?: "image" | "video";
  mimeType?: string;
}) {
  if (slide.type === "video") {
    return true;
  }

  return (slide.mimeType?.toLowerCase() ?? "").startsWith("video/");
}

export function isProjectSlideImageForImageEdit(slide: {
  type?: "image" | "video";
  mimeType?: string;
}) {
  if (isProjectSlideVideoForImageEdit(slide)) {
    return false;
  }

  if (slide.type === "image") {
    return true;
  }

  return (slide.mimeType?.toLowerCase() ?? "").startsWith("image/");
}

export function isFullProjectSlideImageCrop(crop: ProjectSlideImageCrop) {
  return (
    crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1
  );
}

export function getEffectiveCrop(
  edit: ProjectSlideImageEdit | undefined,
): ProjectSlideImageCrop {
  return edit?.crop ?? PROJECT_SLIDE_IMAGE_FULL_CROP;
}

export function getRotatedImageDimensions(
  sourceWidth: number,
  sourceHeight: number,
  rotation: ProjectSlideImageRotation,
): RotatedImageDimensions {
  if (rotation === 90 || rotation === 270) {
    return { width: sourceHeight, height: sourceWidth };
  }

  return { width: sourceWidth, height: sourceHeight };
}

export function parseProjectSlideImageCrop(
  input: unknown,
  label = "imageEdit.crop",
): { ok: true; value: ProjectSlideImageCrop } | { ok: false; errors: string[] } {
  if (!isRecord(input)) {
    return { ok: false, errors: [`${label} はJSON objectである必要があります。`] };
  }

  const { x, y, width, height } = input;
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height)
  ) {
    return {
      ok: false,
      errors: [`${label} の x / y / width / height は有限の数値である必要があります。`],
    };
  }

  if (
    x < 0 ||
    x >= 1 ||
    y < 0 ||
    y >= 1 ||
    width <= 0 ||
    width > 1 ||
    height <= 0 ||
    height > 1
  ) {
    return {
      ok: false,
      errors: [`${label} の範囲が不正です。`],
    };
  }

  if (x + width > 1 || y + height > 1) {
    return {
      ok: false,
      errors: [`${label} が画像範囲を超えています。`],
    };
  }

  return { ok: true, value: { x, y, width, height } };
}

export function parseProjectSlideImageEdit(
  input: unknown,
): ProjectSlideImageEditParseResult {
  if (!isRecord(input)) {
    return { ok: false, errors: ["imageEdit はJSON objectである必要があります。"] };
  }

  if (!isProjectSlideImageRotation(input.rotation)) {
    return {
      ok: false,
      errors: ["imageEdit.rotation は 0 / 90 / 180 / 270 のいずれかである必要があります。"],
    };
  }

  if (!Object.prototype.hasOwnProperty.call(input, "crop")) {
    return { ok: true, value: { rotation: input.rotation } };
  }

  const cropResult = parseProjectSlideImageCrop(input.crop);
  if (!cropResult.ok) {
    return cropResult;
  }

  return {
    ok: true,
    value: {
      rotation: input.rotation,
      crop: cropResult.value,
    },
  };
}

export function normalizeProjectSlideImageEditForWrite(
  edit: ProjectSlideImageEdit | undefined,
): ProjectSlideImageEdit | undefined {
  if (!edit) {
    return undefined;
  }

  const crop =
    edit.crop && !isFullProjectSlideImageCrop(edit.crop) ? edit.crop : undefined;

  if (edit.rotation === 0 && crop === undefined) {
    return undefined;
  }

  return crop ? { rotation: edit.rotation, crop } : { rotation: edit.rotation };
}

export function pickProjectSlideImageEdit(input: {
  imageEdit?: ProjectSlideImageEdit;
}): { imageEdit?: ProjectSlideImageEdit } {
  return input.imageEdit !== undefined ? { imageEdit: input.imageEdit } : {};
}

export function areProjectSlideImageEditsEqual(
  left: ProjectSlideImageEdit | undefined,
  right: ProjectSlideImageEdit | undefined,
) {
  const normalizedLeft = normalizeProjectSlideImageEditForWrite(left);
  const normalizedRight = normalizeProjectSlideImageEditForWrite(right);

  if (normalizedLeft === undefined || normalizedRight === undefined) {
    return normalizedLeft === normalizedRight;
  }

  if (normalizedLeft.rotation !== normalizedRight.rotation) {
    return false;
  }

  const leftCrop = normalizedLeft.crop;
  const rightCrop = normalizedRight.crop;
  if (leftCrop === undefined || rightCrop === undefined) {
    return leftCrop === rightCrop;
  }

  return (
    leftCrop.x === rightCrop.x &&
    leftCrop.y === rightCrop.y &&
    leftCrop.width === rightCrop.width &&
    leftCrop.height === rightCrop.height
  );
}

export function rotateCropClockwise(
  crop: ProjectSlideImageCrop,
): ProjectSlideImageCrop {
  return {
    x: stableCropNumber(1 - crop.y - crop.height),
    y: crop.x,
    width: crop.height,
    height: crop.width,
  };
}

export function rotateCropCounterClockwise(
  crop: ProjectSlideImageCrop,
): ProjectSlideImageCrop {
  return {
    x: crop.y,
    y: stableCropNumber(1 - crop.x - crop.width),
    width: crop.height,
    height: crop.width,
  };
}

export function rotateCrop180(crop: ProjectSlideImageCrop): ProjectSlideImageCrop {
  return {
    x: stableCropNumber(1 - crop.x - crop.width),
    y: stableCropNumber(1 - crop.y - crop.height),
    width: crop.width,
    height: crop.height,
  };
}

export function rotateProjectSlideImageEditClockwise(
  edit: ProjectSlideImageEdit,
): ProjectSlideImageEdit {
  const nextRotation = ((edit.rotation + 90) % 360) as ProjectSlideImageRotation;
  return {
    rotation: nextRotation,
    ...(edit.crop ? { crop: rotateCropClockwise(edit.crop) } : {}),
  };
}

export function rotateProjectSlideImageEditCounterClockwise(
  edit: ProjectSlideImageEdit,
): ProjectSlideImageEdit {
  const nextRotation = ((edit.rotation + 270) % 360) as ProjectSlideImageRotation;
  return {
    rotation: nextRotation,
    ...(edit.crop ? { crop: rotateCropCounterClockwise(edit.crop) } : {}),
  };
}

export function getPixelCropRect(input: {
  sourceWidth: number;
  sourceHeight: number;
  imageEdit?: ProjectSlideImageEdit;
}): PixelCropRect {
  const rotation = input.imageEdit?.rotation ?? 0;
  const crop = getEffectiveCrop(input.imageEdit);
  const rotated = getRotatedImageDimensions(
    input.sourceWidth,
    input.sourceHeight,
    rotation,
  );

  return {
    x: crop.x * rotated.width,
    y: crop.y * rotated.height,
    width: crop.width * rotated.width,
    height: crop.height * rotated.height,
  };
}

export function getSvgImageTransform(
  sourceWidth: number,
  sourceHeight: number,
  rotation: ProjectSlideImageRotation,
) {
  if (rotation === 90) {
    return `translate(${sourceHeight} 0) rotate(90)`;
  }
  if (rotation === 180) {
    return `translate(${sourceWidth} ${sourceHeight}) rotate(180)`;
  }
  if (rotation === 270) {
    return `translate(0 ${sourceWidth}) rotate(270)`;
  }
  return "";
}

export function getSvgImageRenderPlan(input: {
  sourceWidth: number;
  sourceHeight: number;
  imageEdit?: ProjectSlideImageEdit;
}): SvgImageRenderPlan {
  const rotation = input.imageEdit?.rotation ?? 0;
  const pixel = getPixelCropRect(input);

  return {
    viewBox: `${pixel.x} ${pixel.y} ${pixel.width} ${pixel.height}`,
    imageWidth: input.sourceWidth,
    imageHeight: input.sourceHeight,
    transform: getSvgImageTransform(
      input.sourceWidth,
      input.sourceHeight,
      rotation,
    ),
  };
}

export function getCanvasImageEditRenderPlan(input: {
  sourceWidth: number;
  sourceHeight: number;
  imageEdit?: ProjectSlideImageEdit;
}): CanvasImageEditRenderPlan {
  const rotation = input.imageEdit?.rotation ?? 0;
  const pixel = getPixelCropRect(input);
  const outputWidth = Math.max(1, Math.round(pixel.width));
  const outputHeight = Math.max(1, Math.round(pixel.height));

  return {
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    outputWidth,
    outputHeight,
    cropX: pixel.x,
    cropY: pixel.y,
    rotation,
    rotationRadians: (rotation * Math.PI) / 180,
  };
}

export function applyCanvasImageEditTransform(
  context: {
    translate: (x: number, y: number) => void;
    rotate: (angle: number) => void;
  },
  plan: CanvasImageEditRenderPlan,
) {
  context.translate(-plan.cropX, -plan.cropY);
  if (plan.rotation === 90) {
    context.translate(plan.sourceHeight, 0);
    context.rotate(Math.PI / 2);
    return;
  }
  if (plan.rotation === 180) {
    context.translate(plan.sourceWidth, plan.sourceHeight);
    context.rotate(Math.PI);
    return;
  }
  if (plan.rotation === 270) {
    context.translate(0, plan.sourceWidth);
    context.rotate((3 * Math.PI) / 2);
  }
}

export function clampCropToRotatedImage(
  crop: ProjectSlideImageCrop,
  minFraction = PROJECT_SLIDE_IMAGE_EDIT_MIN_CROP_FRACTION,
): ProjectSlideImageCrop {
  const minSize = Math.min(1, Math.max(minFraction, Number.EPSILON));
  const width = Math.min(1, Math.max(minSize, crop.width));
  const height = Math.min(1, Math.max(minSize, crop.height));
  const x = Math.min(1 - width, Math.max(0, crop.x));
  const y = Math.min(1 - height, Math.max(0, crop.y));
  return { x, y, width, height };
}
