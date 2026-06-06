export const OFFLINE_DB_NAME = "ipad-slideshow-offline";
export const OFFLINE_DB_VERSION = 1;
export const OFFLINE_SCHEMA_VERSION = 1;

export const OFFLINE_PROJECTS_STORE = "offlineProjects";
export const OFFLINE_ASSETS_STORE = "offlineAssets";
export const OFFLINE_ASSET_BLOBS_STORE = "offlineAssetBlobs";
export const OFFLINE_SYNC_STATE_STORE = "offlineSyncState";

export const OFFLINE_STAGING_PROJECTS_STORE = "offlineStagingProjects";
export const OFFLINE_STAGING_ASSETS_STORE = "offlineStagingAssets";
export const OFFLINE_STAGING_ASSET_BLOBS_STORE = "offlineStagingAssetBlobs";

export type IsoDateTimeString = string;

export type OfflineSyncStatus = "syncing" | "ready" | "failed" | "corrupt";

export type OfflineBlobStatus = "ready" | "missing" | "failed" | "corrupt";

export type OfflineBlobVariant = "original" | "optimized";

export type OfflineProjectSlide = {
  slideId: string;
  assetId: string;
  caption: string;
  durationSeconds: number;
  order: number;
  createdAt?: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
};

export type OfflineProject = {
  schemaVersion: number;
  projectId: string;
  projectTitle?: string;
  slides: OfflineProjectSlide[];
  sourceManifestFileId: string;
  sourceUpdatedAt?: IsoDateTimeString;
  syncedAt: IsoDateTimeString;
};

export type OfflineAsset = {
  schemaVersion: number;

  assetId: string;
  projectId: string;

  sourceDriveFileId: string;
  sourceName?: string;
  sourceMimeType?: string;
  sourceSizeBytes?: number;
  sourceUpdatedAt?: IsoDateTimeString;
  sourceRevisionId?: string;
  sourceETag?: string;

  blobMimeType: string;
  blobSizeBytes: number;
  blobVariant: OfflineBlobVariant;
  checksum?: string;

  blobStatus: OfflineBlobStatus;

  syncedAt: IsoDateTimeString;
};

export type OfflineAssetBlobRecord = {
  schemaVersion: number;
  assetId: string;
  projectId: string;
  blob: Blob;
  blobMimeType: string;
  blobSizeBytes: number;
  blobVariant: OfflineBlobVariant;
  syncedAt: IsoDateTimeString;
};

export type OfflineSyncState = {
  schemaVersion: number;

  projectId: string;
  status: OfflineSyncStatus;

  syncRunId?: string;

  rootFolderId: string;
  workspaceFileId: string;
  indexFileId: string;
  manifestFileId: string;

  syncedAt?: IsoDateTimeString;
  sourceUpdatedAt?: IsoDateTimeString;

  slideCount: number;
  assetCount: number;

  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastFailedAt?: IsoDateTimeString;

  sourceRevisionId?: string;
  sourceETag?: string;
};

export type OfflineStagingProject = OfflineProject & {
  stagingId: string;
  syncRunId: string;
};

export type OfflineStagingAsset = OfflineAsset & {
  stagingId: string;
  syncRunId: string;
};

export type OfflineStagingAssetBlobRecord = OfflineAssetBlobRecord & {
  stagingId: string;
  syncRunId: string;
};
