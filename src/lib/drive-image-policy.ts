import { PICKED_PHOTO_SIZE_LIMIT_BYTES } from "./google-photos-picker";

export const SUPPORTED_DRIVE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type SupportedDriveImageMimeType =
  (typeof SUPPORTED_DRIVE_IMAGE_MIME_TYPES)[number];

export type LocalDriveImageFileValidationCode =
  | "unsupportedMimeType"
  | "emptyFile"
  | "fileTooLarge";

export function isSupportedDriveImageMimeType(
  value: string,
): value is SupportedDriveImageMimeType {
  return SUPPORTED_DRIVE_IMAGE_MIME_TYPES.some(
    (mimeType) => mimeType === value,
  );
}

export function resolveLocalImageFileMimeType(input: {
  name: string;
  type: string;
}): SupportedDriveImageMimeType | null {
  const normalizedType = input.type.trim().toLowerCase().split(";")[0]?.trim() ?? "";

  if (isSupportedDriveImageMimeType(normalizedType)) {
    return normalizedType;
  }

  if (normalizedType !== "") {
    return null;
  }

  return getDriveImageMimeTypeFromFileName(input.name);
}

function getDriveImageMimeTypeFromFileName(
  fileName: string,
): SupportedDriveImageMimeType | null {
  const normalizedName = fileName.trim().toLowerCase();

  if (normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (normalizedName.endsWith(".png")) {
    return "image/png";
  }

  if (normalizedName.endsWith(".webp")) {
    return "image/webp";
  }

  return null;
}

export function getLocalDriveImageFileValidationCodes(input: {
  size: number;
  mimeType: SupportedDriveImageMimeType | null;
}): LocalDriveImageFileValidationCode[] {
  const codes: LocalDriveImageFileValidationCode[] = [];

  if (!input.mimeType) {
    codes.push("unsupportedMimeType");
  }

  if (input.size === 0) {
    codes.push("emptyFile");
  } else if (input.size > PICKED_PHOTO_SIZE_LIMIT_BYTES) {
    codes.push("fileTooLarge");
  }

  return codes;
}
