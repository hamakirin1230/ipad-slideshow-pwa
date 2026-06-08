// src/lib/offline-staging-read.ts

import { runOfflineTransaction } from "@/lib/offline-db";
import {
  OFFLINE_STAGING_ASSETS_STORE,
  OFFLINE_STAGING_ASSET_BLOBS_STORE,
  OFFLINE_STAGING_PROJECTS_STORE,
  type OfflineStagingAsset,
  type OfflineStagingAssetBlobRecord,
  type OfflineStagingProject,
} from "@/lib/offline-schema";

export type OfflineStagingRecordsForSyncRun = {
  projects: OfflineStagingProject[];
  assets: OfflineStagingAsset[];
  assetBlobRecords: OfflineStagingAssetBlobRecord[];
};

export type OfflineStagingReadStores = Record<string, IDBObjectStore>;

type MaybeStagingRecord = {
  syncRunId?: unknown;
};

function collectStagingRecordsBySyncRunId<T extends MaybeStagingRecord>(
  store: IDBObjectStore,
  syncRunId: string,
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    const records: T[] = [];
    const request = store.openCursor();

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to scan staging records."));
    };

    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        resolve(records);
        return;
      }

      const value = cursor.value as MaybeStagingRecord | null | undefined;

      if (value?.syncRunId === syncRunId) {
        records.push(cursor.value as T);
      }

      cursor.continue();
    };
  });
}

export async function getOfflineStagingRecordsBySyncRunIdInTransaction(
  stores: OfflineStagingReadStores,
  syncRunId: string,
): Promise<OfflineStagingRecordsForSyncRun> {
  const projects = await collectStagingRecordsBySyncRunId<OfflineStagingProject>(
    stores[OFFLINE_STAGING_PROJECTS_STORE],
    syncRunId,
  );

  const assets = await collectStagingRecordsBySyncRunId<OfflineStagingAsset>(
    stores[OFFLINE_STAGING_ASSETS_STORE],
    syncRunId,
  );

  const assetBlobRecords =
    await collectStagingRecordsBySyncRunId<OfflineStagingAssetBlobRecord>(
      stores[OFFLINE_STAGING_ASSET_BLOBS_STORE],
      syncRunId,
    );

  return {
    projects,
    assets,
    assetBlobRecords,
  };
}

export function getOfflineStagingRecordsBySyncRunId(
  syncRunId: string,
): Promise<OfflineStagingRecordsForSyncRun> {
  return runOfflineTransaction(
    [
      OFFLINE_STAGING_PROJECTS_STORE,
      OFFLINE_STAGING_ASSETS_STORE,
      OFFLINE_STAGING_ASSET_BLOBS_STORE,
    ],
    "readonly",
    async ({ stores }) =>
      getOfflineStagingRecordsBySyncRunIdInTransaction(stores, syncRunId),
  );
}
