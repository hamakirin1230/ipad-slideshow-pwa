import { createHmac } from "node:crypto";
import type {
  PublicPublicationAssetDescriptor,
  PublicPublicationMimeType,
} from "./public-publication-contract";

const SECRET_MIN_LENGTH = 32;

export function derivePublicShareId(projectId: string, secret: string) {
  return deriveOpaqueId(secret, `share:${projectId}`);
}

export function derivePublicRevisionId(input: {
  projectId: string;
  revisionId: string;
  secret: string;
}) {
  return deriveOpaqueId(
    input.secret,
    `revision:${input.projectId}:${input.revisionId}`,
  );
}

export function derivePublicAssetId(input: {
  projectId: string;
  asset: PublicPublicationAssetDescriptor;
  secret: string;
}) {
  const fingerprint = [
    input.projectId,
    input.asset.assetId,
    input.asset.driveFileId,
    input.asset.mimeType,
    input.asset.sizeBytes,
    input.asset.modifiedTime,
    input.asset.checksum ?? "no-checksum",
  ].join(":");
  return deriveOpaqueId(input.secret, `asset:${fingerprint}`);
}

export function getPublicAssetPathname(input: {
  projectId: string;
  asset: PublicPublicationAssetDescriptor;
  secret: string;
}) {
  const shareId = derivePublicShareId(input.projectId, input.secret);
  const assetId = derivePublicAssetId(input);
  return `shares/${shareId}/assets/${assetId}.${extensionForMimeType(input.asset.mimeType)}`;
}

export function getPublicRevisionManifestPathname(input: {
  projectId: string;
  revisionId: string;
  secret: string;
}) {
  const shareId = derivePublicShareId(input.projectId, input.secret);
  const publicRevisionId = derivePublicRevisionId(input);
  return `shares/${shareId}/revisions/${publicRevisionId}/manifest.json`;
}

export function getPublicActivationPrefix(shareId: string) {
  return `shares/${shareId}/activations/`;
}

export function getPublicActivationPathname(input: {
  shareId: string;
  sourceModifiedTime: string;
  publicationTimestamp: string;
  nonce: string;
}) {
  return `${getPublicActivationPrefix(input.shareId)}${toSortableTimestamp(input.sourceModifiedTime)}-${toSortableTimestamp(input.publicationTimestamp)}-${input.nonce}.json`;
}

export function comparePublicActivationOrder(
  left: {
    sourceModifiedTime?: string;
    publicationTimestamp: string;
    pathname: string;
  },
  right: {
    sourceModifiedTime?: string;
    publicationTimestamp: string;
    pathname: string;
  },
) {
  const leftKey = left.sourceModifiedTime ?? left.publicationTimestamp;
  const rightKey = right.sourceModifiedTime ?? right.publicationTimestamp;
  const timeCompare = rightKey.localeCompare(leftKey);
  return timeCompare !== 0
    ? timeCompare
    : right.pathname.localeCompare(left.pathname);
}

function toSortableTimestamp(value: string) {
  return value.replace(/[-:.]/g, "");
}

export function requirePublicShareSecret() {
  const secret = process.env.PUBLIC_SHARE_SECRET ?? "";
  if (secret.length < SECRET_MIN_LENGTH) {
    throw new Error("public publication is not configured");
  }
  return secret;
}

function deriveOpaqueId(secret: string, value: string) {
  if (secret.length < SECRET_MIN_LENGTH || value.trim().length === 0) {
    throw new TypeError("opaque public identity input is invalid");
  }
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function extensionForMimeType(mimeType: PublicPublicationMimeType) {
  const extensions: Record<PublicPublicationMimeType, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
  };
  return extensions[mimeType];
}
