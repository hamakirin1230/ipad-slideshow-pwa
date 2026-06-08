// src/lib/offline-staging-promotion.ts

import {
    requestToPromise,
    runOfflineTransaction,
  } from "@/lib/offline-db";
  import {
    OFFLINE_ASSETS_STORE,
    OFFLINE_ASSET_BLOBS_STORE,
    OFFLINE_PROJECTS_STORE,
    type OfflineAsset,
    type OfflineAssetBlobRecord,
    type OfflineProject,
    type OfflineStagingAsset,
    type OfflineStagingAssetBlobRecord,
    type OfflineStagingProject,
  } from "@/lib/offline-schema";
  import type { OfflineStagingValidationIntegrationResult } from "@/lib/offline-staging-validation-integration";
  
  type ValidOfflineStagingForPromotion = Extract<
    OfflineStagingValidationIntegrationResult,
    { ok: true }
  >;
  
  export type PromoteOfflineStagingResult = {
    promotedProjects: number;
    promotedAssets: number;
    promotedAssetBlobs: number;
  };
  
  function toOfflineProject(
    stagingProject: OfflineStagingProject,
  ): OfflineProject {
    return {
      schemaVersion: stagingProject.schemaVersion,
      projectId: stagingProject.projectId,
      projectTitle: stagingProject.projectTitle,
      slides: stagingProject.slides,
      sourceManifestFileId: stagingProject.sourceManifestFileId,
      sourceUpdatedAt: stagingProject.sourceUpdatedAt,
      syncedAt: stagingProject.syncedAt,
    };
  }
  
  function toOfflineAsset(stagingAsset: OfflineStagingAsset): OfflineAsset {
    return {
      schemaVersion: stagingAsset.schemaVersion,
      assetId: stagingAsset.assetId,
      projectId: stagingAsset.projectId,
      sourceDriveFileId: stagingAsset.sourceDriveFileId,
      sourceName: stagingAsset.sourceName,
      sourceMimeType: stagingAsset.sourceMimeType,
      sourceSizeBytes: stagingAsset.sourceSizeBytes,
      sourceUpdatedAt: stagingAsset.sourceUpdatedAt,
      sourceRevisionId: stagingAsset.sourceRevisionId,
      sourceETag: stagingAsset.sourceETag,
      blobMimeType: stagingAsset.blobMimeType,
      blobSizeBytes: stagingAsset.blobSizeBytes,
      blobVariant: stagingAsset.blobVariant,
      checksum: stagingAsset.checksum,
      blobStatus: stagingAsset.blobStatus,
      syncedAt: stagingAsset.syncedAt,
    };
  }
  
  function toOfflineAssetBlobRecord(
    stagingAssetBlobRecord: OfflineStagingAssetBlobRecord,
  ): OfflineAssetBlobRecord {
    return {
      schemaVersion: stagingAssetBlobRecord.schemaVersion,
      assetId: stagingAssetBlobRecord.assetId,
      projectId: stagingAssetBlobRecord.projectId,
      blob: stagingAssetBlobRecord.blob,
      blobMimeType: stagingAssetBlobRecord.blobMimeType,
      blobSizeBytes: stagingAssetBlobRecord.blobSizeBytes,
      blobVariant: stagingAssetBlobRecord.blobVariant,
      syncedAt: stagingAssetBlobRecord.syncedAt,
    };
  }
  
  export function promoteValidatedOfflineStagingToConfirmedStores(
    validatedStaging: ValidOfflineStagingForPromotion,
  ): Promise<PromoteOfflineStagingResult> {
    return runOfflineTransaction(
      [
        OFFLINE_ASSET_BLOBS_STORE,
        OFFLINE_ASSETS_STORE,
        OFFLINE_PROJECTS_STORE,
      ],
      "readwrite",
      async ({ stores }) => {
        let promotedAssetBlobs = 0;
        let promotedAssets = 0;
        let promotedProjects = 0;
  
        for (const stagingAssetBlobRecord of validatedStaging.records
          .assetBlobRecords) {
          await requestToPromise(
            stores[OFFLINE_ASSET_BLOBS_STORE].put(
              toOfflineAssetBlobRecord(stagingAssetBlobRecord),
            ),
          );
          promotedAssetBlobs += 1;
        }
  
        for (const stagingAsset of validatedStaging.records.assets) {
          await requestToPromise(
            stores[OFFLINE_ASSETS_STORE].put(toOfflineAsset(stagingAsset)),
          );
          promotedAssets += 1;
        }
  
        await requestToPromise(
          stores[OFFLINE_PROJECTS_STORE].put(
            toOfflineProject(validatedStaging.project),
          ),
        );
        promotedProjects += 1;
  
        return {
          promotedProjects,
          promotedAssets,
          promotedAssetBlobs,
        };
      },
    );
  }
  