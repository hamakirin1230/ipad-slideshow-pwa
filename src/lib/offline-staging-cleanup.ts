import {
  requestToPromise,
  runOfflineTransaction,
} from "@/lib/offline-db";
import {
  OFFLINE_STAGING_ASSET_BLOBS_STORE,
  OFFLINE_STAGING_ASSETS_STORE,
  OFFLINE_STAGING_PROJECTS_STORE,
} from "@/lib/offline-schema";

export type ClearOfflineStagingResult = {
  deletedProjects: number;
  deletedAssets: number;
  deletedAssetBlobs: number;
};

type MaybeStagingRecord = {
  syncRunId?: unknown;
};

function deleteStagingRecordsBySyncRunId(
  store: IDBObjectStore,
  syncRunId: string,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let deleted = 0;
    const request = store.openCursor();

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to scan staging records."));
    };

    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        resolve(deleted);
        return;
      }

      const value = cursor.value as MaybeStagingRecord | null | undefined;

      if (value?.syncRunId !== syncRunId) {
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

export function clearOfflineStagingBySyncRunId(
  syncRunId: string,
): Promise<ClearOfflineStagingResult> {
  return runOfflineTransaction(
    [
      OFFLINE_STAGING_ASSET_BLOBS_STORE,
      OFFLINE_STAGING_ASSETS_STORE,
      OFFLINE_STAGING_PROJECTS_STORE,
    ],
    "readwrite",
    async ({ stores }) => {
      const deletedAssetBlobs = await deleteStagingRecordsBySyncRunId(
        stores[OFFLINE_STAGING_ASSET_BLOBS_STORE],
        syncRunId,
      );

      const deletedAssets = await deleteStagingRecordsBySyncRunId(
        stores[OFFLINE_STAGING_ASSETS_STORE],
        syncRunId,
      );

      const deletedProjects = await deleteStagingRecordsBySyncRunId(
        stores[OFFLINE_STAGING_PROJECTS_STORE],
        syncRunId,
      );

      return {
        deletedProjects,
        deletedAssets,
        deletedAssetBlobs,
      };
    },
  );
}
