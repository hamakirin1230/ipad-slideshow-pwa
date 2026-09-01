import {
  parseProjectManifest,
  readDriveFileMetadata,
  readDriveTextFile,
  type DriveFileCandidate,
  type DriveProjectSummary,
  type DriveSlideSummary,
  type DriveWorkspaceReadyContext,
} from "./google-drive";
import {
  getEffectiveDriveVideoUnsupportedReason,
  getDriveVideoStorageDisposition,
  isSupportedDriveVideoMimeType,
} from "./drive-video-policy";
import type { OfflineDesiredAssetTransfer } from "./offline-asset-transfer-plan";
import { getProjectManifestContentCanonicalHash } from "./publish-history/project-publish-revision";
import type { ProjectSlideImageEdit } from "./project-slide-image-edit";
import type {
  ProjectSlideTransition,
  ProjectSlideTransitionStrength,
} from "./project-slide-transition";

export type OfflineSaveReviewSourceSlide = {
  slideId: string;
  assetId: string;
  sourceDriveFileId: string;
  displayName: string;
  mediaKind: "image" | "video";
  caption: string;
  durationMs: number;
  imageEdit?: ProjectSlideImageEdit;
  transfer: OfflineDesiredAssetTransfer;
};

export type OfflineSaveReviewSource = {
  projectId: string;
  projectTitle: string;
  transition?: ProjectSlideTransition;
  transitionStrength?: ProjectSlideTransitionStrength;
  slides: OfflineSaveReviewSourceSlide[];
};

export type DriveOfflineSaveReviewSourceAdapters = {
  readMetadata: typeof readDriveFileMetadata;
  readText: typeof readDriveTextFile;
};

const defaultAdapters: DriveOfflineSaveReviewSourceAdapters = {
  readMetadata: readDriveFileMetadata,
  readText: readDriveTextFile,
};

export class DriveOfflineSaveReviewSourceError extends Error {
  constructor() {
    super("Drive offline save review source is unavailable.");
    this.name = "DriveOfflineSaveReviewSourceError";
  }
}

export async function readDriveOfflineSaveReviewSource(
  input: {
    accessToken: string;
    readyContext: DriveWorkspaceReadyContext;
    project: DriveProjectSummary;
    signal: AbortSignal;
  },
  adapters: DriveOfflineSaveReviewSourceAdapters = defaultAdapters,
): Promise<OfflineSaveReviewSource> {
  assertInput(input);
  const initial = await readConsistentManifest(input, adapters);
  const slides: OfflineSaveReviewSourceSlide[] = [];

  for (const slide of initial.manifest.slides) {
    const metadata = await adapters.readMetadata({
      accessToken: input.accessToken,
      fileId: slide.assetFileId,
      signal: input.signal,
    });
    validateAssetMetadata(input, slide, metadata);
    const prepared = toReviewSourceSlide(input.project.projectId, slide, metadata);
    if (prepared) slides.push(prepared);
  }

  const final = await readConsistentManifest(input, adapters);
  if (
    initial.modifiedTime !== final.modifiedTime ||
    initial.canonicalHash !== final.canonicalHash
  ) {
    throw new DriveOfflineSaveReviewSourceError();
  }

  return {
    projectId: input.project.projectId,
    projectTitle: initial.manifest.title,
    ...(initial.manifest.transition !== undefined
      ? { transition: initial.manifest.transition }
      : {}),
    ...(initial.manifest.transitionStrength !== undefined
      ? { transitionStrength: initial.manifest.transitionStrength }
      : {}),
    slides,
  };
}

async function readConsistentManifest(
  input: {
    accessToken: string;
    readyContext: DriveWorkspaceReadyContext;
    project: DriveProjectSummary;
    signal: AbortSignal;
  },
  adapters: DriveOfflineSaveReviewSourceAdapters,
) {
  const before = await adapters.readMetadata({
    accessToken: input.accessToken,
    fileId: input.project.manifestFileId,
    signal: input.signal,
  });
  validateManifestMetadata(input, before);
  const text = await adapters.readText(
    input.accessToken,
    input.project.manifestFileId,
    input.signal,
  );
  const after = await adapters.readMetadata({
    accessToken: input.accessToken,
    fileId: input.project.manifestFileId,
    signal: input.signal,
  });
  validateManifestMetadata(input, after);
  if (before.modifiedTime !== after.modifiedTime) {
    throw new DriveOfflineSaveReviewSourceError();
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new DriveOfflineSaveReviewSourceError();
  }
  const parsed = parseProjectManifest(raw);
  if (
    !parsed.ok ||
    parsed.value.workspaceId !== input.readyContext.workspaceId ||
    parsed.value.projectId !== input.project.projectId
  ) {
    throw new DriveOfflineSaveReviewSourceError();
  }
  return {
    manifest: parsed.value,
    modifiedTime: after.modifiedTime,
    canonicalHash: getProjectManifestContentCanonicalHash(parsed.value),
  };
}

function validateManifestMetadata(
  input: {
    readyContext: DriveWorkspaceReadyContext;
    project: DriveProjectSummary;
  },
  metadata: DriveFileCandidate,
) {
  if (
    metadata.id !== input.project.manifestFileId ||
    metadata.name !== "manifest.json" ||
    metadata.mimeType !== "application/json" ||
    !metadata.modifiedTime ||
    metadata.parents?.length !== 1 ||
    metadata.parents[0] !== input.project.projectFolderId ||
    metadata.appProperties.app !== "ipad-slideshow-pwa" ||
    metadata.appProperties.role !== "projectManifest" ||
    metadata.appProperties.schemaVersion !== "1" ||
    metadata.appProperties.workspaceId !== input.readyContext.workspaceId ||
    metadata.appProperties.projectId !== input.project.projectId
  ) {
    throw new DriveOfflineSaveReviewSourceError();
  }
}

function validateAssetMetadata(
  input: {
    readyContext: DriveWorkspaceReadyContext;
    project: DriveProjectSummary;
  },
  slide: DriveSlideSummary,
  metadata: DriveFileCandidate,
) {
  if (
    metadata.id !== slide.assetFileId ||
    metadata.mimeType !== slide.mimeType ||
    !metadata.parents?.includes(input.project.assetsFolderId) ||
    metadata.appProperties.app !== "ipad-slideshow-pwa" ||
    metadata.appProperties.role !== "asset" ||
    metadata.appProperties.schemaVersion !== "1" ||
    metadata.appProperties.workspaceId !== input.readyContext.workspaceId ||
    metadata.appProperties.projectId !== input.project.projectId ||
    metadata.appProperties.assetId !== slide.assetId
  ) {
    throw new DriveOfflineSaveReviewSourceError();
  }
}

function toReviewSourceSlide(
  projectId: string,
  slide: DriveSlideSummary,
  metadata: DriveFileCandidate,
): OfflineSaveReviewSourceSlide | null {
  const mediaKind = getMediaKind(slide);
  if (!mediaKind) return null;
  const requiresBlob = getRequiresBlob(slide, metadata);
  if (requiresBlob && (!metadata.sizeBytes || metadata.sizeBytes <= 0)) {
    throw new DriveOfflineSaveReviewSourceError();
  }
  return {
    slideId: slide.slideId,
    assetId: slide.assetId,
    sourceDriveFileId: slide.assetFileId,
    displayName: slide.assetName,
    mediaKind,
    caption: slide.caption,
    durationMs: slide.durationSeconds * 1000,
    ...(slide.imageEdit ? { imageEdit: slide.imageEdit } : {}),
    transfer: {
      projectId,
      assetId: slide.assetId,
      sourceDriveFileId: slide.assetFileId,
      sourceMimeType: metadata.mimeType,
      sourceSizeBytes: metadata.sizeBytes,
      sourceUpdatedAt: metadata.modifiedTime,
      sourceRevisionId: metadata.revisionId,
      checksum: metadata.checksum,
      blobVariant: "original",
      requiresBlob,
    },
  };
}

function getRequiresBlob(
  slide: DriveSlideSummary,
  metadata: DriveFileCandidate,
) {
  if (getMediaKind(slide) === "image") return true;
  if (
    getEffectiveDriveVideoUnsupportedReason({
      mimeType: slide.mimeType,
      unsupportedReason: slide.unsupportedReason,
    })
  ) {
    return false;
  }
  if (
    !isSupportedDriveVideoMimeType(slide.mimeType) ||
    typeof metadata.sizeBytes !== "number"
  ) {
    return false;
  }
  return (
    getDriveVideoStorageDisposition({
      mimeType: slide.mimeType,
      sizeBytes: metadata.sizeBytes,
    }) === "offlineEligible"
  );
}

function getMediaKind(slide: DriveSlideSummary) {
  if (
    slide.mimeType === "image/jpeg" ||
    slide.mimeType === "image/png" ||
    slide.mimeType === "image/webp"
  ) {
    return "image" as const;
  }
  if (slide.type === "video" || slide.mimeType.startsWith("video/")) {
    return "video" as const;
  }
  return null;
}

function assertInput(input: {
  accessToken: string;
  readyContext: DriveWorkspaceReadyContext;
  project: DriveProjectSummary;
}) {
  if (
    !input.accessToken ||
    !input.readyContext.workspaceId ||
    !input.project.projectId ||
    !input.project.manifestFileId ||
    !input.project.assetsFolderId
  ) {
    throw new DriveOfflineSaveReviewSourceError();
  }
}
