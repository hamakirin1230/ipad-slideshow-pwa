export const DRIVE_VIDEO_OFFLINE_MAX_BYTES = 50 * 1024 * 1024;
export const DRIVE_VIDEO_MAX_BYTES = 5 * 1024 * 1024 * 1024;

export const SUPPORTED_DRIVE_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
] as const;

export type SupportedDriveVideoMimeType =
  (typeof SUPPORTED_DRIVE_VIDEO_MIME_TYPES)[number];

export type DriveVideoStorageDisposition =
  | "offlineEligible"
  | "remoteOnly"
  | "unsupported";

export type LocalDriveVideoFileValidationCode =
  | "unsupportedMimeType"
  | "emptyFile"
  | "fileTooLarge";

export const DRIVE_VIDEO_UPLOAD_TYPE = "resumable" as const;

export function isSupportedDriveVideoMimeType(
  value: string,
): value is SupportedDriveVideoMimeType {
  return SUPPORTED_DRIVE_VIDEO_MIME_TYPES.some(
    (mimeType) => mimeType === value,
  );
}

export function resolveLocalDriveVideoMimeType(input: {
  name: string;
  type: string;
}): SupportedDriveVideoMimeType | null {
  const normalizedType = input.type.trim().toLowerCase();
  const extensionMimeType = getDriveVideoMimeTypeFromFileName(input.name);

  if (isSupportedDriveVideoMimeType(normalizedType)) {
    return extensionMimeType && extensionMimeType !== normalizedType
      ? null
      : normalizedType;
  }

  if (normalizedType === "" || normalizedType === "application/octet-stream") {
    return extensionMimeType;
  }

  return null;
}

export function getLocalDriveVideoFileValidationCodes(input: {
  size: number;
  mimeType: SupportedDriveVideoMimeType | null;
}): LocalDriveVideoFileValidationCode[] {
  const codes: LocalDriveVideoFileValidationCode[] = [];

  if (!input.mimeType) {
    codes.push("unsupportedMimeType");
  }

  if (input.size === 0) {
    codes.push("emptyFile");
  } else if (!isDriveVideoFileSizeWithinLimit(input.size)) {
    codes.push("fileTooLarge");
  }

  return codes;
}

export function isDriveVideoFileSizeWithinLimit(
  value: number | null | undefined,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= DRIVE_VIDEO_MAX_BYTES
  );
}

export function getDriveVideoStorageDisposition(input: {
  mimeType: string;
  sizeBytes: number | null | undefined;
}): DriveVideoStorageDisposition {
  if (
    !isSupportedDriveVideoMimeType(input.mimeType) ||
    !isDriveVideoFileSizeWithinLimit(input.sizeBytes)
  ) {
    return "unsupported";
  }

  return input.sizeBytes <= DRIVE_VIDEO_OFFLINE_MAX_BYTES
    ? "offlineEligible"
    : "remoteOnly";
}

function getDriveVideoMimeTypeFromFileName(
  fileName: string,
): SupportedDriveVideoMimeType | null {
  const normalizedName = fileName.trim().toLowerCase();

  if (normalizedName.endsWith(".mp4")) {
    return "video/mp4";
  }

  if (normalizedName.endsWith(".mov")) {
    return "video/quicktime";
  }

  return null;
}
