import { parseProjectManifest, type ProjectManifest } from "../google-drive";
import {
  isPublicPublicationMimeType,
  validatePublicPublicationAssetDescriptor,
  type PublicPublicationAssetDescriptor,
  type PublicPublicationRevisionInput,
} from "./public-publication-contract";

const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_APP_ID = "ipad-slideshow-pwa";

type DriveMetadata = {
  id?: unknown;
  mimeType?: unknown;
  size?: unknown;
  modifiedTime?: unknown;
  md5Checksum?: unknown;
  trashed?: unknown;
  appProperties?: unknown;
};

export function readBearerAccessToken(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  return match?.[1] ?? null;
}

export async function verifyDriveProjectManifestAccess(input: {
  accessToken: string;
  manifestFileId: string;
  projectId: string;
  signal?: AbortSignal;
}) {
  const metadata = await readDriveMetadata(
    input.accessToken,
    input.manifestFileId,
    input.signal,
  );
  const appProperties = asStringRecord(metadata.appProperties);
  return (
    metadata.id === input.manifestFileId &&
    metadata.mimeType === "application/json" &&
    metadata.trashed !== true &&
    appProperties.app === DRIVE_APP_ID &&
    appProperties.role === "projectManifest" &&
    appProperties.projectId === input.projectId
  );
}

export async function verifyDriveAssetAccess(input: {
  accessToken: string;
  projectId: string;
  asset: PublicPublicationAssetDescriptor;
  signal?: AbortSignal;
}) {
  const metadata = await readDriveMetadata(
    input.accessToken,
    input.asset.driveFileId,
    input.signal,
  );
  const appProperties = asStringRecord(metadata.appProperties);
  const sizeBytes =
    typeof metadata.size === "string" && /^\d+$/.test(metadata.size)
      ? Number(metadata.size)
      : null;
  const checksum =
    typeof metadata.md5Checksum === "string" ? metadata.md5Checksum : null;
  return (
    metadata.id === input.asset.driveFileId &&
    metadata.mimeType === input.asset.mimeType &&
    sizeBytes === input.asset.sizeBytes &&
    metadata.modifiedTime === input.asset.modifiedTime &&
    checksum === input.asset.checksum &&
    metadata.trashed !== true &&
    appProperties.app === DRIVE_APP_ID &&
    appProperties.role === "asset" &&
    appProperties.projectId === input.projectId &&
    appProperties.assetId === input.asset.assetId
  );
}

export async function readFreshDrivePublication(input: {
  accessToken: string;
  manifestFileId: string;
  projectId: string;
  revisionId?: string;
  signal?: AbortSignal;
}): Promise<{
  manifest: ProjectManifest;
  sourceModifiedTime: string;
} | null> {
  const metadata = await readDriveMetadata(
    input.accessToken,
    input.manifestFileId,
    input.signal,
  );
  const appProperties = asStringRecord(metadata.appProperties);
  const sourceModifiedTime =
    typeof metadata.modifiedTime === "string" ? metadata.modifiedTime : "";
  if (
    metadata.id !== input.manifestFileId ||
    metadata.mimeType !== "application/json" ||
    metadata.trashed === true ||
    appProperties.app !== DRIVE_APP_ID ||
    appProperties.role !== "projectManifest" ||
    appProperties.projectId !== input.projectId ||
    !isIsoDateTime(sourceModifiedTime)
  ) {
    return null;
  }

  const response = await fetch(
    `${DRIVE_FILES_API}/${encodeURIComponent(input.manifestFileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${input.accessToken}` },
      cache: "no-store",
      credentials: "omit",
      signal: input.signal,
    },
  );
  if (!response.ok) return null;
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  const parsed = parseProjectManifest(body);
  if (
    !parsed.ok ||
    parsed.value.projectId !== input.projectId ||
    !parsed.value.publication ||
    (input.revisionId !== undefined &&
      parsed.value.publication.currentRevisionId !== input.revisionId)
  ) {
    return null;
  }
  return {
    manifest: parsed.value,
    sourceModifiedTime,
  };
}

export async function buildFreshPublicRevisionInput(input: {
  accessToken: string;
  manifestFileId: string;
  projectId: string;
  revisionId?: string;
  signal?: AbortSignal;
}): Promise<PublicPublicationRevisionInput | null> {
  const fresh = await readFreshDrivePublication(input);
  const publication = fresh?.manifest.publication;
  if (!fresh || !publication) return null;
  const manifest = fresh.manifest;

  const uniqueSlides = new Map<
    string,
    ProjectManifest["slides"][number]
  >();
  for (const slide of manifest.slides) {
    const previous = uniqueSlides.get(slide.assetId);
    if (previous && previous.assetFileId !== slide.assetFileId) return null;
    uniqueSlides.set(slide.assetId, slide);
  }

  const assets: PublicPublicationAssetDescriptor[] = [];
  for (const slide of uniqueSlides.values()) {
    const metadata = await readDriveMetadata(
      input.accessToken,
      slide.assetFileId,
      input.signal,
    );
    const descriptor = toVerifiedAssetDescriptor({
      metadata,
      projectId: input.projectId,
      assetId: slide.assetId,
      driveFileId: slide.assetFileId,
      expectedMimeType: slide.mimeType,
    });
    if (!descriptor) return null;
    assets.push(descriptor);
  }

  return {
    projectId: input.projectId,
    revisionId: publication.currentRevisionId,
    publishedAt: publication.publishedAt,
    sourceModifiedTime: fresh.sourceModifiedTime,
    manifest: {
      title: manifest.title,
      slides: manifest.slides.map((slide, order) => ({
        assetId: slide.assetId,
        caption: slide.caption,
        durationSeconds: slide.durationSeconds,
        order,
        mimeType: slide.mimeType,
      })),
    },
    assets,
  };
}

async function readDriveMetadata(
  accessToken: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<DriveMetadata> {
  const fields = [
    "id",
    "mimeType",
    "size",
    "modifiedTime",
    "md5Checksum",
    "trashed",
    "appProperties",
  ].join(",");
  const response = await fetch(
    `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      credentials: "omit",
      signal,
    },
  );
  if (!response.ok) {
    throw new Error("drive authorization failed");
  }
  return (await response.json()) as DriveMetadata;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function isIsoDateTime(value: string) {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function toVerifiedAssetDescriptor(input: {
  metadata: DriveMetadata;
  projectId: string;
  assetId: string;
  driveFileId: string;
  expectedMimeType: string;
}): PublicPublicationAssetDescriptor | null {
  const appProperties = asStringRecord(input.metadata.appProperties);
  const sizeBytes =
    typeof input.metadata.size === "string" && /^\d+$/.test(input.metadata.size)
      ? Number(input.metadata.size)
      : null;
  const mimeType =
    typeof input.metadata.mimeType === "string"
      ? input.metadata.mimeType
      : "";
  const modifiedTime =
    typeof input.metadata.modifiedTime === "string"
      ? input.metadata.modifiedTime
      : "";
  if (
    input.metadata.id !== input.driveFileId ||
    input.metadata.trashed === true ||
    mimeType !== input.expectedMimeType ||
    !isPublicPublicationMimeType(mimeType) ||
    sizeBytes === null ||
    appProperties.app !== DRIVE_APP_ID ||
    appProperties.role !== "asset" ||
    appProperties.projectId !== input.projectId ||
    appProperties.assetId !== input.assetId
  ) {
    return null;
  }
  const descriptor: PublicPublicationAssetDescriptor = {
    assetId: input.assetId,
    driveFileId: input.driveFileId,
    mimeType,
    sizeBytes,
    modifiedTime,
    checksum:
      typeof input.metadata.md5Checksum === "string"
        ? input.metadata.md5Checksum
        : "",
  };
  return validatePublicPublicationAssetDescriptor(descriptor)
    ? descriptor
    : null;
}
