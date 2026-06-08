import {
  OFFLINE_SCHEMA_VERSION,
  type OfflineStagingAsset,
  type OfflineStagingAssetBlobRecord,
  type OfflineStagingProject,
} from "@/lib/offline-schema";
import type { OfflineStagingRecordsForSyncRun } from "@/lib/offline-staging-read";

export type OfflineStagingValidationFailureReason =
  | "missing-project"
  | "multiple-projects"
  | "schema-version-mismatch"
  | "duplicate-asset"
  | "duplicate-asset-blob"
  | "missing-asset"
  | "unexpected-asset"
  | "missing-asset-blob"
  | "unexpected-asset-blob";

export type OfflineStagingValidationResult =
  | { ok: true }
  | { ok: false; reason: OfflineStagingValidationFailureReason };

type AssetIdRecord = {
  assetId: string;
};

function hasDuplicateAssetIds(records: readonly AssetIdRecord[]): boolean {
  const seenAssetIds = new Set<string>();

  for (const record of records) {
    if (seenAssetIds.has(record.assetId)) {
      return true;
    }

    seenAssetIds.add(record.assetId);
  }

  return false;
}

function hasSchemaVersionMismatch(
  project: OfflineStagingProject,
  assets: readonly OfflineStagingAsset[],
  assetBlobRecords: readonly OfflineStagingAssetBlobRecord[],
): boolean {
  return (
    project.schemaVersion !== OFFLINE_SCHEMA_VERSION ||
    assets.some((asset) => asset.schemaVersion !== OFFLINE_SCHEMA_VERSION) ||
    assetBlobRecords.some(
      (assetBlobRecord) =>
        assetBlobRecord.schemaVersion !== OFFLINE_SCHEMA_VERSION,
    )
  );
}

export function validateOfflineStagingRecordsForSyncRun(
  records: OfflineStagingRecordsForSyncRun,
): OfflineStagingValidationResult {
  const { projects, assets, assetBlobRecords } = records;

  if (projects.length === 0) {
    return { ok: false, reason: "missing-project" };
  }

  if (projects.length > 1) {
    return { ok: false, reason: "multiple-projects" };
  }

  const project = projects[0];

  if (!project) {
    return { ok: false, reason: "missing-project" };
  }

  if (hasSchemaVersionMismatch(project, assets, assetBlobRecords)) {
    return { ok: false, reason: "schema-version-mismatch" };
  }

  if (hasDuplicateAssetIds(assets)) {
    return { ok: false, reason: "duplicate-asset" };
  }

  if (hasDuplicateAssetIds(assetBlobRecords)) {
    return { ok: false, reason: "duplicate-asset-blob" };
  }

  const requiredAssetIds = new Set(
    project.slides.map((slide) => slide.assetId),
  );
  const assetIds = new Set(assets.map((asset) => asset.assetId));

  for (const requiredAssetId of requiredAssetIds) {
    if (!assetIds.has(requiredAssetId)) {
      return { ok: false, reason: "missing-asset" };
    }
  }

  for (const assetId of assetIds) {
    if (!requiredAssetIds.has(assetId)) {
      return { ok: false, reason: "unexpected-asset" };
    }
  }

  const assetBlobRecordAssetIds = new Set(
    assetBlobRecords.map((assetBlobRecord) => assetBlobRecord.assetId),
  );

  for (const assetId of assetIds) {
    if (!assetBlobRecordAssetIds.has(assetId)) {
      return { ok: false, reason: "missing-asset-blob" };
    }
  }

  for (const assetBlobRecordAssetId of assetBlobRecordAssetIds) {
    if (!assetIds.has(assetBlobRecordAssetId)) {
      return { ok: false, reason: "unexpected-asset-blob" };
    }
  }

  return { ok: true };
}
