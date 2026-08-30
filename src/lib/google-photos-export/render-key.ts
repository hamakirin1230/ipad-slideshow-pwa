import {
  normalizeProjectSlideImageEditForWrite,
  parseProjectSlideImageEdit,
  type ProjectSlideImageEdit,
} from "../project-slide-image-edit";
import {
  GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH,
  isGooglePhotosExportMimeType,
  type GooglePhotosExportMimeType,
} from "./contract";

export const GOOGLE_PHOTOS_SYNC_RENDERER_VERSION = 1;
export const GOOGLE_PHOTOS_SYNC_FINGERPRINT_VERSION = 1;

const RENDER_KEY_PREFIX = "sha256:";
const RENDER_KEY_MATERIAL_PREFIX =
  "ipad-slideshow-pwa:google-photos-sync-render:";
const SOURCE_FINGERPRINT_MATERIAL_PREFIX =
  "ipad-slideshow-pwa:google-photos-sync-source:";

export type GooglePhotosSyncRenderInput = {
  slideId: string;
  assetFileId: string;
  sourceChecksum: string | null;
  sourceModifiedTime?: string | null;
  sourceSizeBytes: number;
  sourceMimeType: string;
  imageEdit?: ProjectSlideImageEdit;
  caption: string;
  outputMimeType: GooglePhotosExportMimeType;
};

export type GooglePhotosSyncRenderIdentityResult =
  | { ok: true; renderKey: string; reuseEligible: boolean }
  | { ok: false; reason: "invalidInput" | "digestUnavailable" };

export type GooglePhotosSyncFingerprintInput = {
  targetAlbumTitle: string;
  slides: Array<{
    slideId: string;
    renderKey: string;
    reuseEligible: boolean;
  }>;
};

export type GooglePhotosSyncFingerprintResult =
  | { ok: true; sourceFingerprint: string }
  | { ok: false; reason: "invalidInput" | "digestUnavailable" };

export type GooglePhotosSyncDigestHost = {
  rendererVersion?: number;
  fingerprintVersion?: number;
  digest?: (data: BufferSource) => Promise<ArrayBuffer>;
};

export async function createGooglePhotosSyncRenderIdentity(
  input: GooglePhotosSyncRenderInput,
  host: GooglePhotosSyncDigestHost = {},
): Promise<GooglePhotosSyncRenderIdentityResult> {
  const rendererVersion =
    host.rendererVersion ?? GOOGLE_PHOTOS_SYNC_RENDERER_VERSION;
  const canonical = canonicalizeRenderInput(input, rendererVersion);
  if (!canonical) return { ok: false, reason: "invalidInput" };
  try {
    return {
      ok: true,
      renderKey: await digestCanonicalValue(
        RENDER_KEY_MATERIAL_PREFIX,
        canonical.value,
        host.digest,
      ),
      reuseEligible: canonical.reuseEligible,
    };
  } catch {
    return { ok: false, reason: "digestUnavailable" };
  }
}

export async function createGooglePhotosSyncSourceFingerprint(
  input: GooglePhotosSyncFingerprintInput,
  host: GooglePhotosSyncDigestHost = {},
): Promise<GooglePhotosSyncFingerprintResult> {
  const fingerprintVersion =
    host.fingerprintVersion ?? GOOGLE_PHOTOS_SYNC_FINGERPRINT_VERSION;
  if (
    !isPositiveSafeInteger(fingerprintVersion) ||
    !isNonBlankTrimmedString(input.targetAlbumTitle) ||
    [...input.targetAlbumTitle].length > GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH ||
    !Array.isArray(input.slides)
  ) {
    return { ok: false, reason: "invalidInput" };
  }
  const slideIds = new Set<string>();
  const slides: GooglePhotosSyncFingerprintInput["slides"] = [];
  for (const slide of input.slides) {
    if (
      !isRecord(slide) ||
      !isNonBlankTrimmedString(slide.slideId) ||
      !isDigestKey(slide.renderKey) ||
      typeof slide.reuseEligible !== "boolean" ||
      slideIds.has(slide.slideId)
    ) {
      return { ok: false, reason: "invalidInput" };
    }
    slideIds.add(slide.slideId);
    slides.push({
      slideId: slide.slideId,
      renderKey: slide.renderKey,
      reuseEligible: slide.reuseEligible,
    });
  }
  try {
    return {
      ok: true,
      sourceFingerprint: await digestCanonicalValue(
        SOURCE_FINGERPRINT_MATERIAL_PREFIX,
        {
          fingerprintVersion,
          targetAlbumTitle: input.targetAlbumTitle,
          slides,
        },
        host.digest,
      ),
    };
  } catch {
    return { ok: false, reason: "digestUnavailable" };
  }
}

function canonicalizeRenderInput(
  input: GooglePhotosSyncRenderInput,
  rendererVersion: number,
): {
  value: {
    rendererVersion: number;
    slideId: string;
    source: {
      assetFileId: string;
      checksum: string | null;
      modifiedTime: string | null;
      sizeBytes: number;
      mimeType: string;
    };
    imageEdit: ProjectSlideImageEdit | null;
    caption: string;
    outputMimeType: GooglePhotosExportMimeType;
  };
  reuseEligible: boolean;
} | null {
  if (
    !isPositiveSafeInteger(rendererVersion) ||
    !isNonBlankTrimmedString(input.slideId) ||
    !isNonBlankTrimmedString(input.assetFileId) ||
    !isPositiveSafeInteger(input.sourceSizeBytes) ||
    !isNonBlankTrimmedString(input.sourceMimeType) ||
    typeof input.caption !== "string" ||
    !isGooglePhotosExportMimeType(input.outputMimeType)
  ) {
    return null;
  }
  if (
    input.sourceChecksum !== null &&
    !isNonBlankTrimmedString(input.sourceChecksum)
  ) {
    return null;
  }
  const modifiedTime = input.sourceModifiedTime ?? null;
  if (modifiedTime !== null && !isNonBlankTrimmedString(modifiedTime)) {
    return null;
  }
  let imageEdit: ProjectSlideImageEdit | undefined;
  if (input.imageEdit !== undefined) {
    const parsed = parseProjectSlideImageEdit(input.imageEdit);
    if (!parsed.ok) return null;
    imageEdit = normalizeProjectSlideImageEditForWrite(parsed.value);
  }
  return {
    value: {
      rendererVersion,
      slideId: input.slideId,
      source: {
        assetFileId: input.assetFileId,
        checksum: input.sourceChecksum,
        modifiedTime: input.sourceChecksum === null ? modifiedTime : null,
        sizeBytes: input.sourceSizeBytes,
        mimeType: input.sourceMimeType,
      },
      imageEdit: imageEdit ?? null,
      caption: input.caption.trim(),
      outputMimeType: input.outputMimeType,
    },
    reuseEligible: input.sourceChecksum !== null,
  };
}

async function digestCanonicalValue(
  prefix: string,
  value: unknown,
  digestOverride?: (data: BufferSource) => Promise<ArrayBuffer>,
) {
  const digest =
    digestOverride ??
    ((data: BufferSource) => crypto.subtle.digest("SHA-256", data));
  const bytes = new TextEncoder().encode(`${prefix}${JSON.stringify(value)}`);
  const result = await digest(bytes);
  const hex = Array.from(new Uint8Array(result), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (hex.length !== 64) throw new TypeError("Unexpected digest length.");
  return `${RENDER_KEY_PREFIX}${hex}`;
}

function isDigestKey(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonBlankTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
