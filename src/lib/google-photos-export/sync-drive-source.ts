import {
  readDriveFileMetadata,
  readDriveTextFile,
  type DriveFileCandidate,
  type DriveProjectSummary,
} from "../google-drive";
import {
  parseSafeSlideSnapshot,
  type SafeSlideSnapshot,
} from "../project-diff";
import {
  createSanitizedGooglePhotosExportError,
  GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH,
  type GooglePhotosExportPlanItem,
  type SanitizedGooglePhotosExportError,
} from "./contract";
import {
  prepareGooglePhotosExportSourceWithAdapter,
  type GooglePhotosExportPreflightDiagnostics,
  type GooglePhotosExportSourceAdapter,
} from "./drive-source";
import {
  resolveGooglePhotosExportOutputMime,
  type GooglePhotosRenderedImageMimeType,
} from "./image-renderer";
import {
  createGooglePhotosSyncRenderIdentity,
  createGooglePhotosSyncSourceFingerprint,
  GOOGLE_PHOTOS_SYNC_RENDERER_VERSION,
  type GooglePhotosSyncRenderIdentityResult,
} from "./render-key";
import type { GooglePhotosSyncDesiredItem } from "./sync-plan";

export type GooglePhotosSyncPreparedItem = GooglePhotosExportPlanItem & {
  sourceChecksum: string | null;
  sourceModifiedTime: string | null;
  outputMimeType: GooglePhotosRenderedImageMimeType;
  renderKey: string;
  reuseEligible: boolean;
  snapshot: SafeSlideSnapshot;
};

export type GooglePhotosSyncPreparedSource = {
  projectId: string;
  projectTitle: string;
  targetAlbumTitle: string;
  sourceSlideCount: number;
  skippedVideoCount: number;
  totalBytes: number;
  rendererVersion: number;
  items: GooglePhotosSyncPreparedItem[];
  desiredSlides: GooglePhotosSyncDesiredItem[];
  sourceFingerprint: string;
};

export type GooglePhotosSyncSourcePreparationFailureReason =
  | "sourceMetadataUnavailable"
  | "renderIdentityFailed"
  | "sourceFingerprintFailed"
  | "invalidTargetTitle";

export type PrepareGooglePhotosSyncSourceResult =
  | { ok: true; source: GooglePhotosSyncPreparedSource }
  | {
      ok: false;
      error: SanitizedGooglePhotosExportError;
      diagnostics?: GooglePhotosExportPreflightDiagnostics;
      reason?: GooglePhotosSyncSourcePreparationFailureReason;
    };

export type GooglePhotosSyncSourcePreparationHost = {
  resolveOutputMime?: (input: {
    sourceMimeType: string;
  }) => Promise<GooglePhotosRenderedImageMimeType>;
  createRenderIdentity?: typeof createGooglePhotosSyncRenderIdentity;
  createSourceFingerprint?: typeof createGooglePhotosSyncSourceFingerprint;
};

const defaultAdapter: GooglePhotosExportSourceAdapter = {
  readMetadata: readDriveFileMetadata,
  readText: readDriveTextFile,
};

export async function prepareGooglePhotosSyncSourceWithAdapter(
  input: {
    accessToken: string;
    selectedProjectId: string;
    workspaceId: string;
    projectsRootFolderId: string;
    project: DriveProjectSummary;
    signal: AbortSignal;
  },
  adapter: GooglePhotosExportSourceAdapter = defaultAdapter,
  host: GooglePhotosSyncSourcePreparationHost = {},
): Promise<PrepareGooglePhotosSyncSourceResult> {
  const metadataCache = new Map<string, DriveFileCandidate>();
  let manifestText: string | undefined;
  const cachedAdapter: GooglePhotosExportSourceAdapter = {
    async readMetadata(metadataInput) {
      const cached = metadataCache.get(metadataInput.fileId);
      if (cached) return cached;
      const metadata = await adapter.readMetadata(metadataInput);
      metadataCache.set(metadataInput.fileId, metadata);
      return metadata;
    },
    async readText(accessToken, fileId, signal) {
      const text = await adapter.readText(accessToken, fileId, signal);
      if (fileId === input.project.manifestFileId) manifestText = text;
      return text;
    },
  };

  const prepared = await prepareGooglePhotosExportSourceWithAdapter(
    input,
    cachedAdapter,
  );
  if (!prepared.ok) return prepared;
  const snapshots = parseGooglePhotosSyncSnapshotSources(manifestText);
  if (!snapshots) {
    return fail("sourceMetadataUnavailable", "drivePreflightFailed");
  }

  const targetAlbumTitle = prepared.plan.projectTitle;
  if (
    !isNonBlankTrimmedString(targetAlbumTitle) ||
    [...targetAlbumTitle].length > GOOGLE_PHOTOS_ALBUM_TITLE_MAX_LENGTH
  ) {
    return fail("invalidTargetTitle", "drivePreflightFailed");
  }

  const resolveOutputMime =
    host.resolveOutputMime ?? resolveGooglePhotosExportOutputMime;
  const createRenderIdentity =
    host.createRenderIdentity ?? createGooglePhotosSyncRenderIdentity;
  const items: GooglePhotosSyncPreparedItem[] = [];
  for (const item of prepared.plan.items) {
    const metadata = metadataCache.get(item.assetFileId);
    const source = parseSyncAssetMetadata(metadata, item);
    if (!source) {
      return fail("sourceMetadataUnavailable", "drivePreflightFailed");
    }

    let outputMimeType: GooglePhotosRenderedImageMimeType;
    try {
      outputMimeType = await resolveOutputMime({
        sourceMimeType: source.mimeType,
      });
    } catch {
      return fail("renderIdentityFailed", "imageRenderFailed");
    }
    let identity: GooglePhotosSyncRenderIdentityResult;
    try {
      identity = await createRenderIdentity({
        slideId: item.slideId,
        assetFileId: item.assetFileId,
        sourceChecksum: source.checksum,
        sourceModifiedTime: source.modifiedTime,
        sourceSizeBytes: source.sizeBytes,
        sourceMimeType: source.mimeType,
        imageEdit: item.imageEdit,
        caption: item.description,
        outputMimeType,
      });
    } catch {
      return fail("renderIdentityFailed", "imageRenderFailed");
    }
    if (!identity.ok) {
      return fail("renderIdentityFailed", "imageRenderFailed");
    }
    const snapshot = snapshots.get(item.slideId) ?? null;
    if (!snapshot) {
      return fail("sourceMetadataUnavailable", "drivePreflightFailed");
    }
    items.push({
      ...item,
      sourceChecksum: source.checksum,
      sourceModifiedTime: source.modifiedTime,
      outputMimeType,
      renderKey: identity.renderKey,
      reuseEligible: identity.reuseEligible,
      snapshot,
    });
  }

  const desiredSlides: GooglePhotosSyncDesiredItem[] = items.map((item) => ({
    slideId: item.slideId,
    renderKey: item.renderKey,
    reuseEligible: item.reuseEligible,
  }));
  const createSourceFingerprint =
    host.createSourceFingerprint ?? createGooglePhotosSyncSourceFingerprint;
  let fingerprint: Awaited<ReturnType<typeof createGooglePhotosSyncSourceFingerprint>>;
  try {
    fingerprint = await createSourceFingerprint({
      targetAlbumTitle,
      slides: desiredSlides,
    });
  } catch {
    return fail("sourceFingerprintFailed", "drivePreflightFailed");
  }
  if (!fingerprint.ok) {
    return fail("sourceFingerprintFailed", "drivePreflightFailed");
  }

  return {
    ok: true,
    source: {
      projectId: prepared.plan.projectId,
      projectTitle: prepared.plan.projectTitle,
      targetAlbumTitle,
      sourceSlideCount: prepared.plan.sourceSlideCount,
      skippedVideoCount: prepared.plan.skippedVideoCount,
      totalBytes: prepared.plan.totalBytes,
      rendererVersion: GOOGLE_PHOTOS_SYNC_RENDERER_VERSION,
      items,
      desiredSlides,
      sourceFingerprint: fingerprint.sourceFingerprint,
    },
  };
}

export function toGooglePhotosSyncSafeSnapshot(
  input: unknown,
): SafeSlideSnapshot | null {
  const parsed = parseSafeSlideSnapshot(input);
  return parsed.ok && parsed.value.mediaKind === "image" ? parsed.value : null;
}

function parseGooglePhotosSyncSnapshotSources(manifestText: string | undefined) {
  if (manifestText === undefined) return null;
  let body: unknown;
  try {
    body = JSON.parse(manifestText) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(body) || !Array.isArray(body.slides)) return null;

  const snapshots = new Map<string, SafeSlideSnapshot>();
  for (const slide of body.slides) {
    if (
      !isRecord(slide) ||
      typeof slide.slideId !== "string" ||
      snapshots.has(slide.slideId)
    ) {
      return null;
    }
    const mediaKind =
      slide.type === "video" ||
      (typeof slide.mimeType === "string" && slide.mimeType.startsWith("video/"))
        ? "video"
        : "image";
    if (mediaKind === "video") continue;
    const snapshot = toGooglePhotosSyncSafeSnapshot({
      mediaKind,
      displayName: slide.assetName,
      caption: slide.caption,
      durationMs:
        typeof slide.durationSeconds === "number"
          ? slide.durationSeconds * 1000
          : Number.NaN,
      ...(Object.prototype.hasOwnProperty.call(slide, "imageEdit")
        ? { imageEdit: slide.imageEdit }
        : {}),
    });
    if (!snapshot) return null;
    snapshots.set(slide.slideId, snapshot);
  }
  return snapshots;
}

function parseSyncAssetMetadata(
  metadata: DriveFileCandidate | undefined,
  item: GooglePhotosExportPlanItem,
): {
  checksum: string | null;
  modifiedTime: string | null;
  sizeBytes: number;
  mimeType: string;
} | null {
  if (
    !metadata ||
    metadata.id !== item.assetFileId ||
    metadata.mimeType !== item.mimeType ||
    metadata.sizeBytes !== item.sizeBytes
  ) {
    return null;
  }
  let checksum: string | null = null;
  if (metadata.checksum !== undefined) {
    if (!isNonBlankTrimmedString(metadata.checksum)) return null;
    checksum = metadata.checksum;
  }
  const modifiedTime = metadata.modifiedTime ?? null;
  if (modifiedTime !== null && !isValidDriveModifiedTime(modifiedTime)) {
    return null;
  }
  if (checksum === null && modifiedTime === null) return null;
  return {
    checksum,
    modifiedTime,
    sizeBytes: metadata.sizeBytes,
    mimeType: metadata.mimeType,
  };
}

function isValidDriveModifiedTime(value: string) {
  return (
    isNonBlankTrimmedString(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(
      value,
    ) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function fail(
  reason: GooglePhotosSyncSourcePreparationFailureReason,
  errorKind: SanitizedGooglePhotosExportError["kind"],
): PrepareGooglePhotosSyncSourceResult {
  return {
    ok: false,
    error: createSanitizedGooglePhotosExportError(errorKind),
    reason,
  };
}
