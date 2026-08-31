import type {
  OfflineAsset,
  OfflineAssetBlobRecord,
  OfflineBlobVariant,
} from "./offline-schema";

export type OfflineDesiredAssetTransfer = {
  projectId: string;
  assetId: string;
  sourceDriveFileId: string;
  sourceMimeType: string;
  sourceSizeBytes?: number;
  sourceUpdatedAt?: string;
  sourceRevisionId?: string;
  checksum?: string;
  blobVariant: OfflineBlobVariant;
  requiresBlob: boolean;
};

export type OfflineAssetTransferPlan =
  | {
      ok: true;
      reuse: Array<{
        desired: OfflineDesiredAssetTransfer;
        confirmedAsset: OfflineAsset;
        confirmedBlob: OfflineAssetBlobRecord;
      }>;
      download: OfflineDesiredAssetTransfer[];
      remoteOnly: OfflineDesiredAssetTransfer[];
      obsolete: OfflineAsset[];
    }
  | {
      ok: false;
      reason: "invalidDesiredIdentity" | "ambiguousConfirmedIdentity";
    };

export function planOfflineAssetTransfers(input: {
  projectId: string;
  desiredAssets: OfflineDesiredAssetTransfer[];
  confirmedAssets: OfflineAsset[];
  confirmedBlobs: OfflineAssetBlobRecord[];
  confirmedReady: boolean;
}): OfflineAssetTransferPlan {
  if (!isNonBlankTrimmedString(input.projectId)) {
    return { ok: false, reason: "invalidDesiredIdentity" };
  }

  const desiredById = new Map<string, OfflineDesiredAssetTransfer>();
  for (const desired of input.desiredAssets) {
    if (
      !desiredAssetIsValid(desired, input.projectId) ||
      desiredById.has(desired.assetId)
    ) {
      return { ok: false, reason: "invalidDesiredIdentity" };
    }
    desiredById.set(desired.assetId, desired);
  }

  const confirmedById = indexConfirmedRecords(
    input.confirmedAssets,
    input.projectId,
  );
  const blobsById = indexConfirmedRecords(
    input.confirmedBlobs,
    input.projectId,
  );
  if (!confirmedById || !blobsById) {
    return { ok: false, reason: "ambiguousConfirmedIdentity" };
  }

  const reuse: Extract<OfflineAssetTransferPlan, { ok: true }>["reuse"] = [];
  const download: OfflineDesiredAssetTransfer[] = [];
  const remoteOnly: OfflineDesiredAssetTransfer[] = [];

  for (const desired of input.desiredAssets) {
    if (!desired.requiresBlob) {
      remoteOnly.push(desired);
      continue;
    }
    const confirmedAsset = confirmedById.get(desired.assetId);
    const confirmedBlob = blobsById.get(desired.assetId);
    if (
      input.confirmedReady &&
      confirmedAsset &&
      confirmedBlob &&
      canReuseConfirmedBlob(desired, confirmedAsset, confirmedBlob)
    ) {
      reuse.push({ desired, confirmedAsset, confirmedBlob });
    } else {
      download.push(desired);
    }
  }

  const obsolete = input.confirmedAssets.filter(
    (asset) => !desiredById.has(asset.assetId),
  );
  return { ok: true, reuse, download, remoteOnly, obsolete };
}

function canReuseConfirmedBlob(
  desired: OfflineDesiredAssetTransfer,
  asset: OfflineAsset,
  blobRecord: OfflineAssetBlobRecord,
) {
  if (
    asset.projectId !== desired.projectId ||
    blobRecord.projectId !== desired.projectId ||
    asset.assetId !== desired.assetId ||
    blobRecord.assetId !== desired.assetId ||
    asset.sourceDriveFileId !== desired.sourceDriveFileId ||
    asset.sourceMimeType !== desired.sourceMimeType ||
    asset.sourceSizeBytes !== desired.sourceSizeBytes ||
    asset.blobStatus !== "ready" ||
    asset.blobVariant !== desired.blobVariant ||
    blobRecord.blobVariant !== desired.blobVariant ||
    asset.blobMimeType !== desired.sourceMimeType ||
    blobRecord.blobMimeType !== desired.sourceMimeType ||
    asset.blobSizeBytes !== desired.sourceSizeBytes ||
    blobRecord.blobSizeBytes !== desired.sourceSizeBytes ||
    asset.blobSizeBytes !== blobRecord.blobSizeBytes ||
    asset.syncedAt !== blobRecord.syncedAt ||
    asset.sourceETag !== undefined ||
    !(blobRecord.blob instanceof Blob) ||
    blobRecord.blob.size !== blobRecord.blobSizeBytes ||
    normalizeMimeType(blobRecord.blob.type) !==
      normalizeMimeType(desired.sourceMimeType)
  ) {
    return false;
  }

  if (desired.checksum !== undefined) {
    return asset.checksum === desired.checksum;
  }
  if (asset.checksum !== undefined) {
    return false;
  }
  if (desired.sourceRevisionId !== undefined) {
    return asset.sourceRevisionId === desired.sourceRevisionId;
  }
  if (asset.sourceRevisionId !== undefined) {
    return false;
  }
  return (
    desired.sourceUpdatedAt !== undefined &&
    asset.sourceUpdatedAt === desired.sourceUpdatedAt
  );
}

function desiredAssetIsValid(
  desired: OfflineDesiredAssetTransfer,
  expectedProjectId: string,
) {
  return (
    desired.projectId === expectedProjectId &&
    isNonBlankTrimmedString(desired.assetId) &&
    isNonBlankTrimmedString(desired.sourceDriveFileId) &&
    isNonBlankTrimmedString(desired.sourceMimeType) &&
    (!desired.requiresBlob ||
      (Number.isSafeInteger(desired.sourceSizeBytes) &&
        (desired.sourceSizeBytes ?? 0) > 0)) &&
    optionalStringIsValid(desired.sourceUpdatedAt) &&
    optionalStringIsValid(desired.sourceRevisionId) &&
    optionalStringIsValid(desired.checksum)
  );
}

function indexConfirmedRecords<T extends { assetId: string; projectId: string }>(
  records: T[],
  projectId: string,
) {
  const result = new Map<string, T>();
  for (const record of records) {
    if (
      record.projectId !== projectId ||
      !isNonBlankTrimmedString(record.assetId) ||
      result.has(record.assetId)
    ) {
      return null;
    }
    result.set(record.assetId, record);
  }
  return result;
}

function optionalStringIsValid(value: string | undefined) {
  return value === undefined || isNonBlankTrimmedString(value);
}

function isNonBlankTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}
