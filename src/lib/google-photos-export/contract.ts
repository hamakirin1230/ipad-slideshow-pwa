import { DRIVE_VIDEO_MAX_BYTES } from "../drive-video-policy";

export const GOOGLE_PHOTOS_EXPORT_MAX_SLIDE_COUNT = 50;
export const GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH = 500;
export const GOOGLE_PHOTOS_EXPORT_FILENAME_MAX_LENGTH = 255;
export const GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES = 200 * 1024 * 1024;
export const GOOGLE_PHOTOS_EXPORT_VIDEO_MAX_BYTES = DRIVE_VIDEO_MAX_BYTES;

export const GOOGLE_PHOTOS_LIBRARY_UPLOADABLE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "video/mp4",
  "video/quicktime",
] as const;

export const DRIVE_PROJECT_EXPORTABLE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
] as const;

export const GOOGLE_PHOTOS_EXPORT_MIME_TYPES =
  DRIVE_PROJECT_EXPORTABLE_MIME_TYPES;

export type GooglePhotosExportMimeType =
  (typeof GOOGLE_PHOTOS_EXPORT_MIME_TYPES)[number];

export type GooglePhotosExportMediaKind = "image" | "video";

export type GooglePhotosExportErrorKind =
  | "authorizationRequired"
  | "authorizationDenied"
  | "drivePreflightFailed"
  | "unsupportedMedia"
  | "duplicateSlidesUnsupported"
  | "sourceChanged"
  | "imageRenderFailed"
  | "uploadFailed"
  | "mediaCreatePartial"
  | "albumCreateFailed"
  | "albumAddFailed"
  | "aborted";

export type SanitizedGooglePhotosExportError = {
  kind: GooglePhotosExportErrorKind;
  message: string;
};

export type GooglePhotosExportItem = {
  slideIndex: number;
  mediaKind: GooglePhotosExportMediaKind;
  mimeType: GooglePhotosExportMimeType;
  sizeBytes: number;
  description: string;
  fileName: string;
};

export type GooglePhotosExportPlanItem = GooglePhotosExportItem & {
  slideId: string;
  assetFileId: string;
};

export type GooglePhotosExportPlan = {
  projectId: string;
  projectTitle: string;
  albumTitle: string;
  totalBytes: number;
  items: GooglePhotosExportPlanItem[];
};

export type GooglePhotosExportReview = {
  projectTitle: string;
  slideCount: number;
  photoCount: number;
  videoCount: number;
  totalBytes: number;
  includesDuplicateSlides: boolean;
  albumTitle: string;
};

export type GooglePhotosExportProgress = {
  phase:
    | "renderingImage"
    | "uploading"
    | "creatingMedia"
    | "creatingAlbum"
    | "addingToAlbum";
  currentSlide: number;
  totalSlides: number;
  mediaKind: GooglePhotosExportMediaKind;
  uploadedBytes: number;
  fileBytes: number;
};

export type SanitizedGooglePhotosExportSuccess = {
  albumTitle: string;
  mediaItemCount: number;
  completedAt: string;
  productUrl: string | null;
};

export type GooglePhotosExportRuntime = {
  plan: GooglePhotosExportPlan;
  uploadTokens: string[];
  uploadedFileNames: string[];
  currentUpload: {
    slideIndex: number;
    sessionUrl: string;
    chunkGranularity: number;
    offset: number;
    payloadMimeType: string;
    payloadSizeBytes: number;
    payloadFileName: string;
  } | null;
};

export function isGooglePhotosLibraryUploadableMimeType(value: string) {
  return (GOOGLE_PHOTOS_LIBRARY_UPLOADABLE_MIME_TYPES as readonly string[]).includes(
    value,
  );
}

export function isGooglePhotosExportMimeType(
  value: string,
): value is GooglePhotosExportMimeType {
  return (GOOGLE_PHOTOS_EXPORT_MIME_TYPES as readonly string[]).includes(value);
}

export function getGooglePhotosExportMediaKind(
  mimeType: GooglePhotosExportMimeType,
): GooglePhotosExportMediaKind {
  return mimeType.startsWith("video/") ? "video" : "image";
}

export function toGooglePhotosDescription(caption: string) {
  return caption.trim();
}

export function isGooglePhotosExportFileSizeAllowed(input: {
  mimeType: string;
  sizeBytes: number | null | undefined;
}) {
  if (
    typeof input.sizeBytes !== "number" ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes <= 0
  ) {
    return false;
  }

  if (input.mimeType.startsWith("video/")) {
    return input.sizeBytes <= GOOGLE_PHOTOS_EXPORT_VIDEO_MAX_BYTES;
  }

  return input.sizeBytes <= GOOGLE_PHOTOS_EXPORT_IMAGE_MAX_BYTES;
}

export function buildGooglePhotosAlbumTitle(input: {
  projectTitle: string;
  now?: Date;
}) {
  const title = sanitizeAlbumTitlePart(input.projectTitle) || "名称未設定";
  const stamp = formatLocalAlbumTimestamp(input.now ?? new Date());
  return truncateAlbumTitle(`${title} - ${stamp}`);
}

export function buildGooglePhotosExportFileName(input: {
  slideIndex: number;
  assetName: string;
  mimeType: GooglePhotosExportMimeType;
}) {
  const extension = getExportExtension(input.mimeType);
  const fallback = `slide-${input.slideIndex + 1}.${extension}`;
  const base = sanitizeFileNamePart(input.assetName);
  const candidate =
    base && hasMatchingExtension(base, extension) ? base : fallback;
  return fitExportFileName(candidate, extension, fallback);
}

export function googlePhotosExportSourceMatchesPreparedPlan(
  prepared: GooglePhotosExportPlan,
  fresh: GooglePhotosExportPlan,
) {
  if (prepared.projectId !== fresh.projectId) {
    return false;
  }
  if (prepared.projectTitle !== fresh.projectTitle) {
    return false;
  }
  if (prepared.items.length !== fresh.items.length) {
    return false;
  }

  return prepared.items.every((item, index) => {
    const other = fresh.items[index];
    return (
      other !== undefined &&
      item.slideIndex === other.slideIndex &&
      item.slideId === other.slideId &&
      item.assetFileId === other.assetFileId &&
      item.mediaKind === other.mediaKind &&
      item.mimeType === other.mimeType &&
      item.sizeBytes === other.sizeBytes &&
      item.description === other.description &&
      item.fileName === other.fileName
    );
  });
}

export function buildGooglePhotosExportReview(
  plan: GooglePhotosExportPlan,
): GooglePhotosExportReview {
  const assetKeys = plan.items.map(
    (item) => `${item.assetFileId}:${item.mimeType}`,
  );
  return {
    projectTitle: plan.projectTitle,
    slideCount: plan.items.length,
    photoCount: plan.items.filter((item) => item.mediaKind === "image").length,
    videoCount: plan.items.filter((item) => item.mediaKind === "video").length,
    totalBytes: plan.totalBytes,
    includesDuplicateSlides: new Set(assetKeys).size < assetKeys.length,
    albumTitle: plan.albumTitle,
  };
}

export function createSanitizedGooglePhotosExportError(
  kind: GooglePhotosExportErrorKind,
  message?: string,
): SanitizedGooglePhotosExportError {
  return {
    kind,
    message: message ?? GOOGLE_PHOTOS_EXPORT_ERROR_MESSAGES[kind],
  };
}

export function formatGooglePhotosExportBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const GOOGLE_PHOTOS_EXPORT_ERROR_MESSAGES: Record<
  GooglePhotosExportErrorKind,
  string
> = {
  authorizationRequired: "Googleフォトへの書き出し許可が必要です。",
  authorizationDenied: "Googleフォトへの書き出し許可がキャンセルされました。",
  drivePreflightFailed:
    "書き出し元の作品を確認できませんでした。作品の状態を再確認してください。",
  unsupportedMedia:
    "Googleフォトへ書き出せない形式のスライドがあるため、書き出しを開始しません。",
  duplicateSlidesUnsupported:
    "同じ写真または動画を複数のスライドで使用しているため、現在のGoogleフォト書き出しでは順番を正確に再現できません。重複しているスライドを整理してから、もう一度お試しください。",
  sourceChanged:
    "書き出し前の確認後に作品が変更されました。最新の内容を確認するため、もう一度『書き出し前に確認』を実行してください。",
  imageRenderFailed:
    "Googleフォト用の画像を作成できませんでした。元の作品は変更されていません。画像を確認してから、もう一度お試しください。",
  uploadFailed: "Googleフォトへのアップロードに失敗しました。",
  mediaCreatePartial:
    "一部のスライドをGoogleフォトへ追加できませんでした。新しいアルバムは作成していません。",
  albumCreateFailed: "Googleフォトのアルバムを作成できませんでした。",
  albumAddFailed:
    "アルバムへの追加に失敗しました。Googleフォトに写真や動画が残っている場合があります。",
  aborted: "Googleフォトへの書き出しを中止しました。",
};

function sanitizeAlbumTitlePart(value: string) {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateAlbumTitle(value: string) {
  const chars = [...value];
  if (chars.length <= GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH) {
    return value;
  }
  return chars.slice(0, GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH).join("");
}

function formatLocalAlbumTimestamp(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function getExportExtension(mimeType: GooglePhotosExportMimeType) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
  }
}

function sanitizeFileNamePart(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function hasMatchingExtension(fileName: string, extension: string) {
  return fileName.toLowerCase().endsWith(`.${extension}`);
}

function fitExportFileName(
  fileName: string,
  extension: string,
  fallback: string,
) {
  if (characterLength(fileName) <= GOOGLE_PHOTOS_EXPORT_FILENAME_MAX_LENGTH) {
    return fileName;
  }

  const suffix = `.${extension}`;
  const maxBaseLength =
    GOOGLE_PHOTOS_EXPORT_FILENAME_MAX_LENGTH - characterLength(suffix);
  if (maxBaseLength < 1) {
    return truncateCharacters(fallback, GOOGLE_PHOTOS_EXPORT_FILENAME_MAX_LENGTH);
  }

  const unsuffixed = hasMatchingExtension(fileName, extension)
    ? fileName.slice(0, fileName.length - suffix.length)
    : fileName;
  const truncatedBase = truncateCharacters(unsuffixed, maxBaseLength).replace(
    /[. ]+$/g,
    "",
  );
  if (!truncatedBase) {
    return characterLength(fallback) <= GOOGLE_PHOTOS_EXPORT_FILENAME_MAX_LENGTH
      ? fallback
      : truncateCharacters(fallback, GOOGLE_PHOTOS_EXPORT_FILENAME_MAX_LENGTH);
  }
  return `${truncatedBase}${suffix}`;
}

function characterLength(value: string) {
  return [...value].length;
}

function truncateCharacters(value: string, maxLength: number) {
  const chars = [...value];
  if (chars.length <= maxLength) {
    return value;
  }
  return chars.slice(0, maxLength).join("");
}
