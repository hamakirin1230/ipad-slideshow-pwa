import {
  requestToPromise,
  runOfflineTransaction,
} from "@/lib/offline-db";
import {
  OFFLINE_ASSETS_STORE,
  OFFLINE_ASSET_BLOBS_STORE,
  OFFLINE_PROJECTS_STORE,
  OFFLINE_SYNC_STATE_STORE,
  type OfflineAsset,
  type OfflineAssetBlobRecord,
  type OfflineProject,
  type OfflineSyncState,
} from "@/lib/offline-schema";

export function getOfflineProject(
  projectId: string,
): Promise<OfflineProject | null> {
  return runOfflineTransaction(
    [OFFLINE_PROJECTS_STORE],
    "readonly",
    async ({ stores }) => {
      const result = await requestToPromise<OfflineProject | undefined>(
        stores[OFFLINE_PROJECTS_STORE].get(projectId),
      );

      return result ?? null;
    },
  );
}

export function getOfflineAsset(
  assetId: string,
): Promise<OfflineAsset | null> {
  return runOfflineTransaction(
    [OFFLINE_ASSETS_STORE],
    "readonly",
    async ({ stores }) => {
      const result = await requestToPromise<OfflineAsset | undefined>(
        stores[OFFLINE_ASSETS_STORE].get(assetId),
      );

      return result ?? null;
    },
  );
}

export function getOfflineAssetBlobRecord(
  assetId: string,
): Promise<OfflineAssetBlobRecord | null> {
  return runOfflineTransaction(
    [OFFLINE_ASSET_BLOBS_STORE],
    "readonly",
    async ({ stores }) => {
      const result = await requestToPromise<OfflineAssetBlobRecord | undefined>(
        stores[OFFLINE_ASSET_BLOBS_STORE].get(assetId),
      );

      return result ?? null;
    },
  );
}

export function getOfflineSyncState(
  projectId: string,
): Promise<OfflineSyncState | null> {
  return runOfflineTransaction(
    [OFFLINE_SYNC_STATE_STORE],
    "readonly",
    async ({ stores }) => {
      const result = await requestToPromise<OfflineSyncState | undefined>(
        stores[OFFLINE_SYNC_STATE_STORE].get(projectId),
      );

      return result ?? null;
    },
  );
}

export function putOfflineProject(project: OfflineProject): Promise<void> {
  return runOfflineTransaction(
    [OFFLINE_PROJECTS_STORE],
    "readwrite",
    async ({ stores }) => {
      await requestToPromise(stores[OFFLINE_PROJECTS_STORE].put(project));
    },
  );
}

export function putOfflineAsset(asset: OfflineAsset): Promise<void> {
  return runOfflineTransaction(
    [OFFLINE_ASSETS_STORE],
    "readwrite",
    async ({ stores }) => {
      await requestToPromise(stores[OFFLINE_ASSETS_STORE].put(asset));
    },
  );
}

export function putOfflineAssetBlobRecord(
  blobRecord: OfflineAssetBlobRecord,
): Promise<void> {
  return runOfflineTransaction(
    [OFFLINE_ASSET_BLOBS_STORE],
    "readwrite",
    async ({ stores }) => {
      await requestToPromise(
        stores[OFFLINE_ASSET_BLOBS_STORE].put(blobRecord),
      );
    },
  );
}

export function putOfflineSyncState(
  syncState: OfflineSyncState,
): Promise<void> {
  return runOfflineTransaction(
    [OFFLINE_SYNC_STATE_STORE],
    "readwrite",
    async ({ stores }) => {
      await requestToPromise(stores[OFFLINE_SYNC_STATE_STORE].put(syncState));
    },
  );
}
