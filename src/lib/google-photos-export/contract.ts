import { DRIVE_VIDEO_MAX_BYTES } from "../drive-video-policy";

export const GOOGLE_PHOTOS_EXPORT_MAX_SLIDE_COUNT = 50;
export const GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH = 500;
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

  return true;
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
  const base = sanitizeFileNamePart(input.assetName);
  if (base && hasMatchingExtension(base, extension)) {
    return base;
  }
  return `slide-${input.slideIndex + 1}.${extension}`;
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
