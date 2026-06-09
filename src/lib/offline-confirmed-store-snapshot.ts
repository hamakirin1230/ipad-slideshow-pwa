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

type OfflineConfirmedSnapshotStores = {
  [OFFLINE_PROJECTS_STORE]: IDBObjectStore;
  [OFFLINE_ASSETS_STORE]: IDBObjectStore;
  [OFFLINE_ASSET_BLOBS_STORE]: IDBObjectStore;
  [OFFLINE_SYNC_STATE_STORE]: IDBObjectStore;
};

export type OfflineConfirmedProjectSummary = {
  projectId: string;
  projectTitle?: string;
  slideCount: number;
  sourceManifestFileId: string;
  sourceUpdatedAt?: string;
  syncedAt: string;
};

export type OfflineConfirmedAssetSummary = {
  assetId: string;
  projectId: string;
  sourceDriveFileId: string;
  sourceName?: string;
  sourceMimeType?: string;
  sourceSizeBytes?: number;
  blobMimeType: string;
  blobSizeBytes: number;
  blobVariant: string;
  blobStatus: string;
  syncedAt: string;
};

export type OfflineConfirmedAssetBlobSummary = {
  assetId: string;
  projectId: string;
  blobMimeType: string;
  blobSizeBytes: number;
  blobVariant: string;
  syncedAt: string;
};

export type OfflineConfirmedSyncStateSummary = {
  projectId: string;
  status: string;
  syncRunId?: string;
  manifestFileId: string;
  slideCount: number;
  assetCount: number;
  syncedAt?: string;
  sourceUpdatedAt?: string;
  lastErrorCode?: string;
  lastFailedAt?: string;
};

export type OfflineConfirmedStoreSnapshot = {
  checkedAt: string;
  projectCount: number;
  assetCount: number;
  assetBlobCount: number;
  syncStateCount: number;
  projects: OfflineConfirmedProjectSummary[];
  assets: OfflineConfirmedAssetSummary[];
  assetBlobs: OfflineConfirmedAssetBlobSummary[];
  syncStates: OfflineConfirmedSyncStateSummary[];
  diagnostics: string[];
};

export async function readOfflineConfirmedStoreSnapshot(): Promise<OfflineConfirmedStoreSnapshot> {
  return runOfflineTransaction(
    [
      OFFLINE_PROJECTS_STORE,
      OFFLINE_ASSETS_STORE,
      OFFLINE_ASSET_BLOBS_STORE,
      OFFLINE_SYNC_STATE_STORE,
    ],
    "readonly",
    async ({ stores }) => {
      const typedStores = stores as OfflineConfirmedSnapshotStores;

      const [projects, assets, assetBlobs, syncStates] = await Promise.all([
        getAllRecords<OfflineProject>(typedStores[OFFLINE_PROJECTS_STORE]),
        getAllRecords<OfflineAsset>(typedStores[OFFLINE_ASSETS_STORE]),
        getAllRecords<OfflineAssetBlobRecord>(
          typedStores[OFFLINE_ASSET_BLOBS_STORE],
        ),
        getAllRecords<OfflineSyncState>(typedStores[OFFLINE_SYNC_STATE_STORE]),
      ]);

      const projectSummaries = projects.map(toProjectSummary);
      const assetSummaries = assets.map(toAssetSummary);
      const assetBlobSummaries = assetBlobs.map(toAssetBlobSummary);
      const syncStateSummaries = syncStates.map(toSyncStateSummary);

      return {
        checkedAt: new Date().toISOString(),
        projectCount: projectSummaries.length,
        assetCount: assetSummaries.length,
        assetBlobCount: assetBlobSummaries.length,
        syncStateCount: syncStateSummaries.length,
        projects: projectSummaries,
        assets: assetSummaries,
        assetBlobs: assetBlobSummaries,
        syncStates: syncStateSummaries,
        diagnostics: buildConfirmedStoreDiagnostics({
          projects: projectSummaries,
          assets: assetSummaries,
          assetBlobs: assetBlobSummaries,
          syncStates: syncStateSummaries,
        }),
      };
    },
  );
}

async function getAllRecords<T>(store: IDBObjectStore): Promise<T[]> {
  return requestToPromise<T[]>(store.getAll());
}

function toProjectSummary(
  project: OfflineProject,
): OfflineConfirmedProjectSummary {
  return {
    projectId: project.projectId,
    projectTitle: project.projectTitle,
    slideCount: project.slides.length,
    sourceManifestFileId: project.sourceManifestFileId,
    sourceUpdatedAt: project.sourceUpdatedAt,
    syncedAt: project.syncedAt,
  };
}

function toAssetSummary(asset: OfflineAsset): OfflineConfirmedAssetSummary {
  return {
    assetId: asset.assetId,
    projectId: asset.projectId,
    sourceDriveFileId: asset.sourceDriveFileId,
    sourceName: asset.sourceName,
    sourceMimeType: asset.sourceMimeType,
    sourceSizeBytes: asset.sourceSizeBytes,
    blobMimeType: asset.blobMimeType,
    blobSizeBytes: asset.blobSizeBytes,
    blobVariant: asset.blobVariant,
    blobStatus: asset.blobStatus,
    syncedAt: asset.syncedAt,
  };
}

function toAssetBlobSummary(
  assetBlob: OfflineAssetBlobRecord,
): OfflineConfirmedAssetBlobSummary {
  return {
    assetId: assetBlob.assetId,
    projectId: assetBlob.projectId,
    blobMimeType: assetBlob.blobMimeType,
    blobSizeBytes: assetBlob.blobSizeBytes,
    blobVariant: assetBlob.blobVariant,
    syncedAt: assetBlob.syncedAt,
  };
}

function toSyncStateSummary(
  syncState: OfflineSyncState,
): OfflineConfirmedSyncStateSummary {
  return {
    projectId: syncState.projectId,
    status: syncState.status,
    syncRunId: syncState.syncRunId,
    manifestFileId: syncState.manifestFileId,
    slideCount: syncState.slideCount,
    assetCount: syncState.assetCount,
    syncedAt: syncState.syncedAt,
    sourceUpdatedAt: syncState.sourceUpdatedAt,
    lastErrorCode: syncState.lastErrorCode,
    lastFailedAt: syncState.lastFailedAt,
  };
}

function buildConfirmedStoreDiagnostics(input: {
  projects: OfflineConfirmedProjectSummary[];
  assets: OfflineConfirmedAssetSummary[];
  assetBlobs: OfflineConfirmedAssetBlobSummary[];
  syncStates: OfflineConfirmedSyncStateSummary[];
}): string[] {
  const diagnostics: string[] = [];

  if (input.projects.length === 0) {
    diagnostics.push("confirmed project はまだ保存されていません。");
  }

  if (input.syncStates.length === 0) {
    diagnostics.push("offline sync state はまだ保存されていません。");
  }

  for (const project of input.projects) {
    const projectAssets = input.assets.filter(
      (asset) => asset.projectId === project.projectId,
    );
    const projectAssetBlobs = input.assetBlobs.filter(
      (assetBlob) => assetBlob.projectId === project.projectId,
    );
    const projectSyncState = input.syncStates.find(
      (syncState) => syncState.projectId === project.projectId,
    );

    if (projectAssets.length !== project.slideCount) {
      diagnostics.push(
        `project ${project.projectId}: slideCount と asset count が一致しません。 slides=${project.slideCount}, assets=${projectAssets.length}`,
      );
    }

    if (projectAssetBlobs.length !== projectAssets.length) {
      diagnostics.push(
        `project ${project.projectId}: asset count と asset blob count が一致しません。 assets=${projectAssets.length}, blobs=${projectAssetBlobs.length}`,
      );
    }

    if (!projectSyncState) {
      diagnostics.push(
        `project ${project.projectId}: offline sync state が見つかりません。`,
      );
      continue;
    }

    if (projectSyncState.status !== "ready") {
      diagnostics.push(
        `project ${project.projectId}: sync state は ready ではありません。 status=${projectSyncState.status}`,
      );
    }

    if (projectSyncState.slideCount !== project.slideCount) {
      diagnostics.push(
        `project ${project.projectId}: project slideCount と sync state slideCount が一致しません。`,
      );
    }

    if (projectSyncState.assetCount !== projectAssets.length) {
      diagnostics.push(
        `project ${project.projectId}: asset count と sync state assetCount が一致しません。`,
      );
    }
  }

  if (diagnostics.length === 0) {
    diagnostics.push("confirmed offline store の件数整合を確認しました。");
  }

  return diagnostics;
}
