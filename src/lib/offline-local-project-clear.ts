import {
  requestToPromise,
  runOfflineTransaction,
} from "@/lib/offline-db";
import {
  OFFLINE_ASSETS_STORE,
  OFFLINE_ASSET_BLOBS_STORE,
  OFFLINE_PROJECTS_STORE,
  OFFLINE_STAGING_ASSETS_STORE,
  OFFLINE_STAGING_ASSET_BLOBS_STORE,
  OFFLINE_STAGING_PROJECTS_STORE,
  OFFLINE_SYNC_STATE_STORE,
} from "@/lib/offline-schema";

const PROJECT_SCOPED_LOCAL_OFFLINE_DATA_STORES = [
  OFFLINE_PROJECTS_STORE,
  OFFLINE_ASSETS_STORE,
  OFFLINE_ASSET_BLOBS_STORE,
  OFFLINE_SYNC_STATE_STORE,
  OFFLINE_STAGING_PROJECTS_STORE,
  OFFLINE_STAGING_ASSETS_STORE,
  OFFLINE_STAGING_ASSET_BLOBS_STORE,
] as const;

type MaybeProjectScopedRecord = {
  projectId?: unknown;
};

export type ClearLocalOfflineProjectDataResult = {
  clearedAt: string;
  projectId: string;
  deletedProjects: number;
  deletedAssets: number;
  deletedAssetBlobs: number;
  deletedSyncStates: number;
  deletedStagingProjects: number;
  deletedStagingAssets: number;
  deletedStagingAssetBlobs: number;
};

export async function clearLocalOfflineProjectData(
  projectId: string,
): Promise<ClearLocalOfflineProjectDataResult> {
  return runOfflineTransaction(
    [...PROJECT_SCOPED_LOCAL_OFFLINE_DATA_STORES],
    "readwrite",
    async ({ stores }) => {
      const [
        deletedProjects,
        deletedAssets,
        deletedAssetBlobs,
        deletedSyncStates,
        deletedStagingProjects,
        deletedStagingAssets,
        deletedStagingAssetBlobs,
      ] = await Promise.all([
        deleteProjectScopedRecords(stores[OFFLINE_PROJECTS_STORE], projectId),
        deleteProjectScopedRecords(stores[OFFLINE_ASSETS_STORE], projectId),
        deleteProjectScopedRecords(stores[OFFLINE_ASSET_BLOBS_STORE], projectId),
        deleteProjectScopedRecords(stores[OFFLINE_SYNC_STATE_STORE], projectId),
        deleteProjectScopedRecords(
          stores[OFFLINE_STAGING_PROJECTS_STORE],
          projectId,
        ),
        deleteProjectScopedRecords(
          stores[OFFLINE_STAGING_ASSETS_STORE],
          projectId,
        ),
        deleteProjectScopedRecords(
          stores[OFFLINE_STAGING_ASSET_BLOBS_STORE],
          projectId,
        ),
      ]);

      return {
        clearedAt: new Date().toISOString(),
        projectId,
        deletedProjects,
        deletedAssets,
        deletedAssetBlobs,
        deletedSyncStates,
        deletedStagingProjects,
        deletedStagingAssets,
        deletedStagingAssetBlobs,
      };
    },
  );
}

function deleteProjectScopedRecords(
  store: IDBObjectStore,
  projectId: string,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let deleted = 0;
    const request = store.openCursor();

    request.onerror = () => {
      reject(
        request.error ??
          new Error("Failed to scan project-scoped local offline records."),
      );
    };

    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        resolve(deleted);
        return;
      }

      const value = cursor.value as MaybeProjectScopedRecord | null | undefined;

      if (value?.projectId !== projectId) {
        cursor.continue();
        return;
      }

      void requestToPromise(cursor.delete())
        .then(() => {
          deleted += 1;
          cursor.continue();
        })
        .catch((error: unknown) => {
          reject(error);
        });
    };
  });
}
