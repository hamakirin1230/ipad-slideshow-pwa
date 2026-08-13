import {
  parseProjectPublishRevision,
  type ProjectPublishRevision,
} from "../publish-history/project-publish-revision";
import { isValidProjectPublishRevisionId } from "../publish-history/project-publish-revision-id";
import {
  isPublicPublicationMimeType,
  validatePublicPublicationAssetDescriptor,
  type PublicPublicationAssetDescriptor,
  type PublicPublicationRevisionInput,
} from "./public-publication-contract";

export type PublicPublicationInternalRequest = {
  manifestFileId: string;
  revision: PublicPublicationRevisionInput;
};

export type PublicUploadPayload = {
  manifestFileId: string;
  projectId: string;
  revisionId: string;
  asset: PublicPublicationAssetDescriptor;
};

export function parsePublicPublicationInternalRequest(
  value: unknown,
): PublicPublicationInternalRequest | null {
  if (!isRecord(value) || typeof value.manifestFileId !== "string") return null;
  const revision = toPublicPublicationRevisionInput(value.revision);
  if (!revision || value.manifestFileId.trim().length === 0) return null;
  return {
    manifestFileId: value.manifestFileId,
    revision,
  };
}

export function toPublicPublicationRevisionInput(
  value: unknown,
): PublicPublicationRevisionInput | null {
  const parsed = parseProjectPublishRevision(value);
  if (!parsed.ok) return null;
  const revision: ProjectPublishRevision = parsed.value;
  const typedAssets: PublicPublicationAssetDescriptor[] = [];
  for (const asset of revision.assets) {
    if (
      !isPublicPublicationMimeType(asset.mimeType) ||
      asset.sizeBytes === null ||
      asset.modifiedTime === null ||
      asset.checksum === null
    ) {
      return null;
    }
    const descriptor: PublicPublicationAssetDescriptor = {
      assetId: asset.assetId,
      driveFileId: asset.driveFileId,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      modifiedTime: asset.modifiedTime,
      checksum: asset.checksum,
    };
    if (!validatePublicPublicationAssetDescriptor(descriptor)) return null;
    typedAssets.push(descriptor);
  }
  return {
    projectId: revision.projectId,
    revisionId: revision.revisionId,
    publishedAt: revision.publishedAt,
    manifest: {
      title: revision.manifest.title,
      slides: revision.manifest.slides.map((slide, order) => ({
        assetId: slide.assetId,
        caption: slide.caption,
        durationSeconds: slide.durationSeconds,
        order,
        mimeType: slide.mimeType,
      })),
    },
    assets: typedAssets,
  };
}

export function parsePublicUploadPayload(
  value: string | null,
): PublicUploadPayload | null {
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.asset)) return null;
  const asset = parsed.asset as PublicPublicationAssetDescriptor;
  if (
    typeof parsed.manifestFileId !== "string" ||
    parsed.manifestFileId.trim().length === 0 ||
    typeof parsed.projectId !== "string" ||
    parsed.projectId.trim().length === 0 ||
    typeof parsed.revisionId !== "string" ||
    !isValidProjectPublishRevisionId(parsed.revisionId) ||
    !validatePublicPublicationAssetDescriptor(asset)
  ) {
    return null;
  }
  return {
    manifestFileId: parsed.manifestFileId,
    projectId: parsed.projectId,
    revisionId: parsed.revisionId,
    asset,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
