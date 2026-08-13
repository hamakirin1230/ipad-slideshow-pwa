export const PUBLIC_PUBLICATION_SCHEMA_VERSION = 1;
export const PUBLIC_PUBLICATION_MAX_ASSET_SIZE_BYTES =
  5 * 1024 * 1024 * 1024;

export const PUBLIC_PUBLICATION_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
] as const;

export type PublicPublicationMimeType =
  (typeof PUBLIC_PUBLICATION_MIME_TYPES)[number];

export type PublicPublicationSlide = {
  order: number;
  caption: string;
  durationSeconds: number;
  mediaKind: "image" | "video";
  mimeType: PublicPublicationMimeType;
  assetUrl: string;
};

export type PublicPublicationManifest = {
  schemaVersion: typeof PUBLIC_PUBLICATION_SCHEMA_VERSION;
  title: string;
  slides: PublicPublicationSlide[];
};

export type PublicPublicationAssetDescriptor = {
  assetId: string;
  driveFileId: string;
  mimeType: PublicPublicationMimeType;
  sizeBytes: number;
  modifiedTime: string;
  checksum: string;
};

export type PublicPublicationRevisionInput = {
  projectId: string;
  revisionId: string;
  publishedAt: string;
  sourceModifiedTime?: string;
  manifest: {
    title: string;
    slides: Array<{
      assetId: string;
      caption: string;
      durationSeconds: number;
      order: number;
      mimeType: string;
    }>;
  };
  assets: PublicPublicationAssetDescriptor[];
};

export type PreparedPublicAsset = PublicPublicationAssetDescriptor & {
  pathname: string;
  url: string | null;
};

export function isValidPublicShareId(value: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function isPublicPublicationMimeType(
  value: string,
): value is PublicPublicationMimeType {
  return (PUBLIC_PUBLICATION_MIME_TYPES as readonly string[]).includes(value);
}

export function validatePublicPublicationAssetDescriptor(
  value: PublicPublicationAssetDescriptor,
) {
  return (
    value.assetId.trim().length > 0 &&
    value.driveFileId.trim().length > 0 &&
    isPublicPublicationMimeType(value.mimeType) &&
    Number.isSafeInteger(value.sizeBytes) &&
    value.sizeBytes > 0 &&
    value.sizeBytes <= PUBLIC_PUBLICATION_MAX_ASSET_SIZE_BYTES &&
    isIsoDateTime(value.modifiedTime) &&
    value.checksum.trim().length > 0
  );
}

export function buildPublicPublicationManifest(input: {
  revision: PublicPublicationRevisionInput;
  assetUrls: ReadonlyMap<string, string>;
}): PublicPublicationManifest {
  const assetById = new Map(
    input.revision.assets.map((asset) => [asset.assetId, asset]),
  );
  if (
    assetById.size !== input.revision.assets.length ||
    input.revision.assets.some(
      (asset) => !validatePublicPublicationAssetDescriptor(asset),
    )
  ) {
    throw new TypeError("public publication assets are invalid");
  }

  const slides = [...input.revision.manifest.slides]
    .sort((left, right) => left.order - right.order)
    .map((slide, index): PublicPublicationSlide => {
      const asset = assetById.get(slide.assetId);
      const assetUrl = input.assetUrls.get(slide.assetId);
      if (
        !asset ||
        !assetUrl ||
        asset.mimeType !== slide.mimeType ||
        !isHttpsUrl(assetUrl) ||
        !Number.isSafeInteger(slide.order) ||
        slide.order !== index ||
        !Number.isFinite(slide.durationSeconds) ||
        slide.durationSeconds < 1 ||
        slide.durationSeconds > 60
      ) {
        throw new TypeError("public publication slide is invalid");
      }
      return {
        order: slide.order,
        caption: slide.caption.trim(),
        durationSeconds: slide.durationSeconds,
        mediaKind: asset.mimeType.startsWith("video/") ? "video" : "image",
        mimeType: asset.mimeType,
        assetUrl,
      };
    });

  const manifest: PublicPublicationManifest = {
    schemaVersion: PUBLIC_PUBLICATION_SCHEMA_VERSION,
    title: input.revision.manifest.title.trim() || "名称未設定",
    slides,
  };
  if (!isIsoDateTime(input.revision.publishedAt)) {
    throw new TypeError("public publication timestamp is invalid");
  }
  return manifest;
}

export function parsePublicPublicationManifest(
  value: unknown,
): PublicPublicationManifest | null {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !== PUBLIC_PUBLICATION_SCHEMA_VERSION ||
    typeof value.title !== "string" ||
    value.title.trim().length === 0 ||
    !Array.isArray(value.slides)
  ) {
    return null;
  }

  const slides: PublicPublicationSlide[] = [];
  for (const [index, item] of value.slides.entries()) {
    if (
      !isRecord(item) ||
      item.order !== index ||
      typeof item.caption !== "string" ||
      typeof item.durationSeconds !== "number" ||
      item.durationSeconds < 1 ||
      item.durationSeconds > 60 ||
      (item.mediaKind !== "image" && item.mediaKind !== "video") ||
      typeof item.mimeType !== "string" ||
      !isPublicPublicationMimeType(item.mimeType) ||
      typeof item.assetUrl !== "string" ||
      !isHttpsUrl(item.assetUrl) ||
      (item.mediaKind === "video") !== item.mimeType.startsWith("video/")
    ) {
      return null;
    }
    slides.push({
      order: item.order,
      caption: item.caption,
      durationSeconds: item.durationSeconds,
      mediaKind: item.mediaKind,
      mimeType: item.mimeType,
      assetUrl: item.assetUrl,
    });
  }

  return {
    schemaVersion: PUBLIC_PUBLICATION_SCHEMA_VERSION,
    title: value.title,
    slides,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDateTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
