import { requestToPromise, runOfflineTransaction } from "./offline-db";
import {
  OFFLINE_ASSETS_STORE,
  OFFLINE_ASSET_BLOBS_STORE,
  OFFLINE_PROJECTS_STORE,
  OFFLINE_SYNC_STATE_STORE,
  type OfflineAsset,
  type OfflineAssetBlobRecord,
  type OfflineProject,
  type OfflineSyncState,
} from "./offline-schema";

type ConfirmedTransferStores = {
  [OFFLINE_PROJECTS_STORE]: IDBObjectStore;
  [OFFLINE_ASSETS_STORE]: IDBObjectStore;
  [OFFLINE_ASSET_BLOBS_STORE]: IDBObjectStore;
  [OFFLINE_SYNC_STATE_STORE]: IDBObjectStore;
};

export type OfflineConfirmedTransferSnapshot = {
  projectId: string;
  confirmedReady: boolean;
  project: OfflineProject | null;
  syncState: OfflineSyncState | null;
  assets: OfflineAsset[];
  assetBlobs: OfflineAssetBlobRecord[];
};

export function readOfflineConfirmedTransferSnapshot(
  projectId: string,
): Promise<OfflineConfirmedTransferSnapshot> {
  assertProjectId(projectId);
  return runOfflineTransaction(
    [
      OFFLINE_PROJECTS_STORE,
      OFFLINE_ASSETS_STORE,
      OFFLINE_ASSET_BLOBS_STORE,
      OFFLINE_SYNC_STATE_STORE,
    ],
    "readonly",
    async ({ stores }) => {
      const typedStores = stores as ConfirmedTransferStores;
      const [project, syncState, allAssets, allAssetBlobs] = await Promise.all([
        requestToPromise<OfflineProject | undefined>(
          typedStores[OFFLINE_PROJECTS_STORE].get(projectId),
        ),
        requestToPromise<OfflineSyncState | undefined>(
          typedStores[OFFLINE_SYNC_STATE_STORE].get(projectId),
        ),
        requestToPromise<OfflineAsset[]>(
          typedStores[OFFLINE_ASSETS_STORE].getAll(),
        ),
        requestToPromise<OfflineAssetBlobRecord[]>(
          typedStores[OFFLINE_ASSET_BLOBS_STORE].getAll(),
        ),
      ]);
      const assets = allAssets.filter((asset) => asset.projectId === projectId);
      const assetBlobs = allAssetBlobs.filter(
        (assetBlob) => assetBlob.projectId === projectId,
      );
      return {
        projectId,
        confirmedReady:
          project?.projectId === projectId &&
          syncState?.projectId === projectId &&
          syncState.status === "ready",
        project: project ?? null,
        syncState: syncState ?? null,
        assets,
        assetBlobs,
      };
    },
  );
}

function assertProjectId(projectId: string) {
  if (projectId.length === 0 || projectId !== projectId.trim()) {
    throw new TypeError("projectId is required.");
  }
}
