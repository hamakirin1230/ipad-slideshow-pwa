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
  type OfflineProjectSlide,
  type OfflineSyncState,
} from "@/lib/offline-schema";

const DEFAULT_SLIDE_DURATION_SECONDS = 5;
const MIN_SLIDE_DURATION_SECONDS = 1;
const MAX_SLIDE_DURATION_SECONDS = 60;

type OfflinePlaybackSnapshotStores = {
  [OFFLINE_PROJECTS_STORE]: IDBObjectStore;
  [OFFLINE_ASSETS_STORE]: IDBObjectStore;
  [OFFLINE_ASSET_BLOBS_STORE]: IDBObjectStore;
  [OFFLINE_SYNC_STATE_STORE]: IDBObjectStore;
};

export type OfflinePlaybackSlide = {
  slideId: string;
  assetId: string;
  order: number;
  caption: string;
  durationSeconds: number;
  assetName?: string;
  sourceDriveFileId: string;
  blob: Blob;
  blobMimeType: string;
  blobSizeBytes: number;
};

export type OfflinePlaybackProjectOption = {
  projectId: string;
  projectTitle?: string;
  slideCount: number;
  assetCount: number;
  assetBlobCount: number;
  syncedAt?: string;
  sourceUpdatedAt?: string;
  syncRunId?: string;
};

export type OfflinePlaybackSnapshot =
  | {
      status: "empty";
      checkedAt: string;
      diagnostics: string[];
    }
  | {
      status: "invalid";
      checkedAt: string;
      availableProjects?: OfflinePlaybackProjectOption[];
      diagnostics: string[];
    }
  | {
      status: "projectSelectionRequired";
      checkedAt: string;
      selectedProjectId?: string;
      availableProjects: OfflinePlaybackProjectOption[];
      diagnostics: string[];
    }
  | {
      status: "ready";
      checkedAt: string;
      projectId: string;
      projectTitle?: string;
      syncedAt: string;
      sourceUpdatedAt?: string;
      slideCount: number;
      assetCount: number;
      slides: OfflinePlaybackSlide[];
      availableProjects: OfflinePlaybackProjectOption[];
      diagnostics: string[];
    };

export type ReadOfflinePlaybackSnapshotOptions = {
  projectId?: string | null;
};

export async function readOfflinePlaybackSnapshot(
  options: ReadOfflinePlaybackSnapshotOptions = {},
): Promise<OfflinePlaybackSnapshot> {
  return runOfflineTransaction(
    [
      OFFLINE_PROJECTS_STORE,
      OFFLINE_ASSETS_STORE,
      OFFLINE_ASSET_BLOBS_STORE,
      OFFLINE_SYNC_STATE_STORE,
    ],
    "readonly",
    async ({ stores }) => {
      const typedStores = stores as OfflinePlaybackSnapshotStores;

      const [projects, assets, assetBlobs, syncStates] = await Promise.all([
        getAllRecords<OfflineProject>(typedStores[OFFLINE_PROJECTS_STORE]),
        getAllRecords<OfflineAsset>(typedStores[OFFLINE_ASSETS_STORE]),
        getAllRecords<OfflineAssetBlobRecord>(
          typedStores[OFFLINE_ASSET_BLOBS_STORE],
        ),
        getAllRecords<OfflineSyncState>(typedStores[OFFLINE_SYNC_STATE_STORE]),
      ]);

      return buildOfflinePlaybackSnapshot({
        checkedAt: new Date().toISOString(),
        selectedProjectId: normalizeOptionalProjectId(options.projectId),
        projects,
        assets,
        assetBlobs,
        syncStates,
      });
    },
  );
}

async function getAllRecords<T>(store: IDBObjectStore): Promise<T[]> {
  return requestToPromise<T[]>(store.getAll());
}

function buildOfflinePlaybackSnapshot(input: {
  checkedAt: string;
  selectedProjectId: string | null;
  projects: OfflineProject[];
  assets: OfflineAsset[];
  assetBlobs: OfflineAssetBlobRecord[];
  syncStates: OfflineSyncState[];
}): OfflinePlaybackSnapshot {
  const readySyncStates = input.syncStates.filter(
    (syncState) => syncState.status === "ready",
  );

  if (readySyncStates.length === 0) {
    return {
      status: "empty",
      checkedAt: input.checkedAt,
      diagnostics: [
        "ready な offline sync state が見つかりません。",
        "管理画面で offline sync を実行してください。",
      ],
    };
  }

  const availableProjects = buildPlaybackProjectOptions({
    projects: input.projects,
    assets: input.assets,
    assetBlobs: input.assetBlobs,
    readySyncStates,
  });

  if (availableProjects.length === 0) {
    return {
      status: "invalid",
      checkedAt: input.checkedAt,
      diagnostics: [
        "ready な offline sync state に対応する confirmed project が見つかりません。",
      ],
    };
  }

  if (!input.selectedProjectId && availableProjects.length >= 2) {
    return {
      status: "projectSelectionRequired",
      checkedAt: input.checkedAt,
      availableProjects,
      diagnostics: [
        "ready な offline playback project が2件以上見つかりました。",
        "再生する project を選択してください。",
      ],
    };
  }

  const syncState =
    input.selectedProjectId === null
      ? readySyncStates[0]
      : readySyncStates.find(
          (candidate) => candidate.projectId === input.selectedProjectId,
        );

  if (!syncState) {
    return {
      status: "projectSelectionRequired",
      checkedAt: input.checkedAt,
      selectedProjectId: input.selectedProjectId ?? undefined,
      availableProjects,
      diagnostics: [
        `選択中の projectId ${input.selectedProjectId} は、この端末の ready project ではありません。`,
        "再生する project を選択し直してください。",
      ],
    };
  }

  const project = input.projects.find(
    (candidate) => candidate.projectId === syncState.projectId,
  );

  if (!project) {
    return {
      status: "invalid",
      checkedAt: input.checkedAt,
      availableProjects,
      diagnostics: [
        `projectId ${syncState.projectId} の confirmed project が見つかりません。`,
      ],
    };
  }

  const projectAssets = input.assets.filter(
    (asset) => asset.projectId === project.projectId,
  );
  const projectAssetBlobs = input.assetBlobs.filter(
    (assetBlob) => assetBlob.projectId === project.projectId,
  );

  const validationDiagnostics = validatePlaybackRecords({
    project,
    assets: projectAssets,
    assetBlobs: projectAssetBlobs,
    syncState,
  });

  if (validationDiagnostics.length > 0) {
    return {
      status: "invalid",
      checkedAt: input.checkedAt,
      availableProjects,
      diagnostics: validationDiagnostics,
    };
  }

  const assetsById = new Map(projectAssets.map((asset) => [asset.assetId, asset]));
  const assetBlobsById = new Map(
    projectAssetBlobs.map((assetBlob) => [assetBlob.assetId, assetBlob]),
  );

  const slides = [...project.slides]
    .sort(compareOfflineProjectSlides)
    .map((slide) => {
      const asset = assetsById.get(slide.assetId);
      const assetBlob = assetBlobsById.get(slide.assetId);

      if (!asset || !assetBlob) {
        throw new Error(
          `Validated offline playback record was missing asset or blob for ${slide.assetId}.`,
        );
      }

      return toOfflinePlaybackSlide({
        slide,
        asset,
        assetBlob,
      });
    });

  return {
    status: "ready",
    checkedAt: input.checkedAt,
    projectId: project.projectId,
    projectTitle: project.projectTitle,
    syncedAt: project.syncedAt,
    sourceUpdatedAt: project.sourceUpdatedAt,
    slideCount: slides.length,
    assetCount: projectAssets.length,
    slides,
    availableProjects,
    diagnostics: [
      "offline playback snapshot を confirmed store から構築しました。",
      `slides: ${slides.length}`,
      `assets: ${projectAssets.length}`,
      `assetBlobs: ${projectAssetBlobs.length}`,
    ],
  };
}

function buildPlaybackProjectOptions(input: {
  projects: OfflineProject[];
  assets: OfflineAsset[];
  assetBlobs: OfflineAssetBlobRecord[];
  readySyncStates: OfflineSyncState[];
}): OfflinePlaybackProjectOption[] {
  const options: OfflinePlaybackProjectOption[] = [];

  for (const syncState of input.readySyncStates) {
    const project = input.projects.find(
      (candidate) => candidate.projectId === syncState.projectId,
    );

    if (!project) {
      continue;
    }

    options.push({
      projectId: project.projectId,
      projectTitle: project.projectTitle,
      slideCount: project.slides.length,
      assetCount: input.assets.filter(
        (asset) => asset.projectId === project.projectId,
      ).length,
      assetBlobCount: input.assetBlobs.filter(
        (assetBlob) => assetBlob.projectId === project.projectId,
      ).length,
      syncedAt: syncState.syncedAt ?? project.syncedAt,
      sourceUpdatedAt: syncState.sourceUpdatedAt ?? project.sourceUpdatedAt,
      syncRunId: syncState.syncRunId,
    });
  }

  return options.sort(comparePlaybackProjectOptions);
}

function comparePlaybackProjectOptions(
  left: OfflinePlaybackProjectOption,
  right: OfflinePlaybackProjectOption,
) {
  const leftSyncedAt = left.syncedAt ?? "";
  const rightSyncedAt = right.syncedAt ?? "";

  if (leftSyncedAt !== rightSyncedAt) {
    return rightSyncedAt.localeCompare(leftSyncedAt);
  }

  return left.projectId.localeCompare(right.projectId);
}

function validatePlaybackRecords(input: {
  project: OfflineProject;
  assets: OfflineAsset[];
  assetBlobs: OfflineAssetBlobRecord[];
  syncState: OfflineSyncState;
}): string[] {
  const diagnostics: string[] = [];

  if (input.project.projectId !== input.syncState.projectId) {
    diagnostics.push("projectId と sync state projectId が一致しません。");
  }

  if (input.syncState.status !== "ready") {
    diagnostics.push(`sync state が ready ではありません: ${input.syncState.status}`);
  }

  if (input.project.slides.length !== input.syncState.slideCount) {
    diagnostics.push(
      `project slides と sync state slideCount が一致しません。 slides=${input.project.slides.length}, syncState=${input.syncState.slideCount}`,
    );
  }

  if (input.assets.length !== input.syncState.assetCount) {
    diagnostics.push(
      `assets と sync state assetCount が一致しません。 assets=${input.assets.length}, syncState=${input.syncState.assetCount}`,
    );
  }

  const slideAssetIds = new Set(input.project.slides.map((slide) => slide.assetId));
  const assetIds = new Set(input.assets.map((asset) => asset.assetId));
  const assetBlobIds = new Set(input.assetBlobs.map((assetBlob) => assetBlob.assetId));

  if (slideAssetIds.size !== input.project.slides.length) {
    diagnostics.push("project slides に duplicate assetId があります。");
  }

  if (assetIds.size !== input.assets.length) {
    diagnostics.push("confirmed assets に duplicate assetId があります。");
  }

  if (assetBlobIds.size !== input.assetBlobs.length) {
    diagnostics.push("confirmed asset blobs に duplicate assetId があります。");
  }

  for (const slide of input.project.slides) {
    if (!assetIds.has(slide.assetId)) {
      diagnostics.push(`slide ${slide.slideId}: asset が見つかりません。`);
    }

    if (!assetBlobIds.has(slide.assetId)) {
      diagnostics.push(`slide ${slide.slideId}: asset blob が見つかりません。`);
    }
  }

  for (const asset of input.assets) {
    if (!slideAssetIds.has(asset.assetId)) {
      diagnostics.push(`asset ${asset.assetId}: slide から参照されていません。`);
    }

    if (asset.projectId !== input.project.projectId) {
      diagnostics.push(`asset ${asset.assetId}: projectId が一致しません。`);
    }

    if (asset.blobStatus !== "ready") {
      diagnostics.push(
        `asset ${asset.assetId}: blobStatus が ready ではありません。 status=${asset.blobStatus}`,
      );
    }

    if (!assetBlobIds.has(asset.assetId)) {
      diagnostics.push(`asset ${asset.assetId}: asset blob が見つかりません。`);
    }
  }

  for (const assetBlob of input.assetBlobs) {
    if (!assetIds.has(assetBlob.assetId)) {
      diagnostics.push(
        `asset blob ${assetBlob.assetId}: 対応する asset が見つかりません。`,
      );
    }

    if (assetBlob.projectId !== input.project.projectId) {
      diagnostics.push(`asset blob ${assetBlob.assetId}: projectId が一致しません。`);
    }

    const asset = input.assets.find(
      (candidate) => candidate.assetId === assetBlob.assetId,
    );

    if (!asset) {
      continue;
    }

    if (asset.blobMimeType !== assetBlob.blobMimeType) {
      diagnostics.push(
        `asset ${asset.assetId}: asset と blob の MIME type が一致しません。`,
      );
    }

    if (asset.blobSizeBytes !== assetBlob.blobSizeBytes) {
      diagnostics.push(
        `asset ${asset.assetId}: asset と blob の size が一致しません。`,
      );
    }

    if (asset.blobVariant !== assetBlob.blobVariant) {
      diagnostics.push(
        `asset ${asset.assetId}: asset と blob の variant が一致しません。`,
      );
    }

    if (assetBlob.blob.size !== assetBlob.blobSizeBytes) {
      diagnostics.push(
        `asset blob ${assetBlob.assetId}: Blob.size と blobSizeBytes が一致しません。`,
      );
    }
  }

  return diagnostics;
}

function compareOfflineProjectSlides(
  left: OfflineProjectSlide,
  right: OfflineProjectSlide,
): number {
  if (left.order !== right.order) {
    return left.order - right.order;
  }

  return left.slideId.localeCompare(right.slideId);
}

function normalizeOptionalProjectId(projectId: string | null | undefined) {
  if (typeof projectId !== "string") {
    return null;
  }

  const trimmedProjectId = projectId.trim();
  return trimmedProjectId.length === 0 ? null : trimmedProjectId;
}

function toOfflinePlaybackSlide(input: {
  slide: OfflineProjectSlide;
  asset: OfflineAsset;
  assetBlob: OfflineAssetBlobRecord;
}): OfflinePlaybackSlide {
  return {
    slideId: input.slide.slideId,
    assetId: input.slide.assetId,
    order: input.slide.order,
    caption: input.slide.caption,
    durationSeconds: normalizeDurationSeconds(input.slide.durationSeconds),
    assetName: input.asset.sourceName,
    sourceDriveFileId: input.asset.sourceDriveFileId,
    blob: input.assetBlob.blob,
    blobMimeType: input.assetBlob.blobMimeType,
    blobSizeBytes: input.assetBlob.blobSizeBytes,
  };
}

function normalizeDurationSeconds(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < MIN_SLIDE_DURATION_SECONDS ||
    value > MAX_SLIDE_DURATION_SECONDS
  ) {
    return DEFAULT_SLIDE_DURATION_SECONDS;
  }

  return value;
}
