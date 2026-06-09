// src/lib/offline-staging-write.ts

import {
  requestToPromise,
  runOfflineTransaction,
} from "@/lib/offline-db";
import {
  OFFLINE_SCHEMA_VERSION,
  OFFLINE_STAGING_ASSETS_STORE,
  OFFLINE_STAGING_ASSET_BLOBS_STORE,
  OFFLINE_STAGING_PROJECTS_STORE,
  type OfflineAsset,
  type OfflineAssetBlobRecord,
  type OfflineProject,
  type OfflineStagingAsset,
  type OfflineStagingAssetBlobRecord,
  type OfflineStagingProject,
} from "@/lib/offline-schema";

export type OfflineStagingWriteStores = Record<string, IDBObjectStore>;

export type OfflineStagingAssetPairInput = {
  asset: OfflineAsset;
  assetBlobRecord: OfflineAssetBlobRecord;
};

export type PutOfflineStagingAssetPairArgs = {
  syncRunId: string;
  assetPair: OfflineStagingAssetPairInput;
};

export type PutOfflineStagingProjectArgs = {
  syncRunId: string;
  project: OfflineProject;
};

export type WriteCompleteOfflineStagingSnapshotArgs = {
  syncRunId: string;
  project: OfflineProject;
  assetPairs: OfflineStagingAssetPairInput[];

  /**
   * true の場合、同じ projectId の既存 staging records を先に削除する。
   *
   * 推奨値は true。
   * 前回の中断・失敗で project record 未書き込みの partial staging が残っていても、
   * 新しい syncRun の前に掃除できる。
   */
  clearExistingProjectStaging?: boolean;
};

export type ClearOfflineStagingByProjectIdResult = {
  deletedProjects: number;
  deletedAssets: number;
  deletedAssetBlobs: number;
};

export type PutOfflineStagingAssetPairResult = {
  writtenAssets: number;
  writtenAssetBlobs: number;
};

export type PutOfflineStagingProjectResult = {
  writtenProjects: number;
};

export type WriteCompleteOfflineStagingSnapshotResult = {
  projectId: string;
  syncRunId: string;
  cleanup: ClearOfflineStagingByProjectIdResult;
  writtenProjects: number;
  writtenAssets: number;
  writtenAssetBlobs: number;
};

export class OfflineStagingWritePreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineStagingWritePreconditionError";
  }
}

type StagingRecordKind = "project" | "asset" | "assetBlob";

type MaybeProjectRecord = {
  projectId?: unknown;
};

function assertNonBlankInternalId(name: string, value: string): void {
  if (value.length === 0) {
    throw new OfflineStagingWritePreconditionError(`${name} is required.`);
  }

  if (value !== value.trim()) {
    throw new OfflineStagingWritePreconditionError(
      `${name} must not include leading or trailing whitespace.`,
    );
  }
}

function assertSchemaVersion(name: string, value: number): void {
  if (value !== OFFLINE_SCHEMA_VERSION) {
    throw new OfflineStagingWritePreconditionError(
      `${name}.schemaVersion must be ${OFFLINE_SCHEMA_VERSION}.`,
    );
  }
}

function assertBlobRecordHasUsableBlob(
  assetBlobRecord: OfflineAssetBlobRecord,
): void {
  if (!(assetBlobRecord.blob instanceof Blob)) {
    throw new OfflineStagingWritePreconditionError(
      "assetBlobRecord.blob must be a Blob.",
    );
  }

  if (assetBlobRecord.blob.size <= 0) {
    throw new OfflineStagingWritePreconditionError(
      "assetBlobRecord.blob must not be empty.",
    );
  }

  if (assetBlobRecord.blob.size !== assetBlobRecord.blobSizeBytes) {
    throw new OfflineStagingWritePreconditionError(
      "assetBlobRecord.blobSizeBytes must match assetBlobRecord.blob.size.",
    );
  }
}

function assertAssetPairMatches(
  assetPair: OfflineStagingAssetPairInput,
): void {
  const { asset, assetBlobRecord } = assetPair;

  assertNonBlankInternalId("asset.assetId", asset.assetId);
  assertNonBlankInternalId("asset.projectId", asset.projectId);
  assertNonBlankInternalId(
    "assetBlobRecord.assetId",
    assetBlobRecord.assetId,
  );
  assertNonBlankInternalId(
    "assetBlobRecord.projectId",
    assetBlobRecord.projectId,
  );

  assertSchemaVersion("asset", asset.schemaVersion);
  assertSchemaVersion("assetBlobRecord", assetBlobRecord.schemaVersion);

  if (asset.assetId !== assetBlobRecord.assetId) {
    throw new OfflineStagingWritePreconditionError(
      "asset.assetId must match assetBlobRecord.assetId.",
    );
  }

  if (asset.projectId !== assetBlobRecord.projectId) {
    throw new OfflineStagingWritePreconditionError(
      "asset.projectId must match assetBlobRecord.projectId.",
    );
  }

  if (asset.blobStatus !== "ready") {
    throw new OfflineStagingWritePreconditionError(
      'asset.blobStatus must be "ready" when writing a complete staging asset pair.',
    );
  }

  if (asset.blobMimeType !== assetBlobRecord.blobMimeType) {
    throw new OfflineStagingWritePreconditionError(
      "asset.blobMimeType must match assetBlobRecord.blobMimeType.",
    );
  }

  if (asset.blobSizeBytes !== assetBlobRecord.blobSizeBytes) {
    throw new OfflineStagingWritePreconditionError(
      "asset.blobSizeBytes must match assetBlobRecord.blobSizeBytes.",
    );
  }

  if (asset.blobVariant !== assetBlobRecord.blobVariant) {
    throw new OfflineStagingWritePreconditionError(
      "asset.blobVariant must match assetBlobRecord.blobVariant.",
    );
  }

  assertBlobRecordHasUsableBlob(assetBlobRecord);
}

function assertProjectMatchesAssetPairs(input: {
  project: OfflineProject;
  assetPairs: OfflineStagingAssetPairInput[];
}): void {
  const { project, assetPairs } = input;

  assertNonBlankInternalId("project.projectId", project.projectId);
  assertSchemaVersion("project", project.schemaVersion);

  const requiredAssetIds = new Set(
    project.slides.map((slide) => slide.assetId),
  );
  const writtenAssetIds = new Set<string>();

  for (const assetPair of assetPairs) {
    assertAssetPairMatches(assetPair);

    const { asset } = assetPair;

    if (asset.projectId !== project.projectId) {
      throw new OfflineStagingWritePreconditionError(
        "asset.projectId must match project.projectId.",
      );
    }

    if (writtenAssetIds.has(asset.assetId)) {
      throw new OfflineStagingWritePreconditionError(
        "assetPairs must not include duplicate assetId values.",
      );
    }

    writtenAssetIds.add(asset.assetId);
  }

  for (const requiredAssetId of requiredAssetIds) {
    if (!writtenAssetIds.has(requiredAssetId)) {
      throw new OfflineStagingWritePreconditionError(
        "assetPairs must include every assetId referenced by project.slides.",
      );
    }
  }

  for (const writtenAssetId of writtenAssetIds) {
    if (!requiredAssetIds.has(writtenAssetId)) {
      throw new OfflineStagingWritePreconditionError(
        "assetPairs must not include assets that are not referenced by project.slides.",
      );
    }
  }
}

function buildStagingId(input: {
  syncRunId: string;
  kind: StagingRecordKind;
  recordId: string;
}): string {
  return `${input.syncRunId}:${input.kind}:${input.recordId}`;
}

function toOfflineStagingProject(input: {
  syncRunId: string;
  project: OfflineProject;
}): OfflineStagingProject {
  return {
    ...input.project,
    stagingId: buildStagingId({
      syncRunId: input.syncRunId,
      kind: "project",
      recordId: input.project.projectId,
    }),
    syncRunId: input.syncRunId,
  };
}

function toOfflineStagingAsset(input: {
  syncRunId: string;
  asset: OfflineAsset;
}): OfflineStagingAsset {
  return {
    ...input.asset,
    stagingId: buildStagingId({
      syncRunId: input.syncRunId,
      kind: "asset",
      recordId: input.asset.assetId,
    }),
    syncRunId: input.syncRunId,
  };
}

function toOfflineStagingAssetBlobRecord(input: {
  syncRunId: string;
  assetBlobRecord: OfflineAssetBlobRecord;
}): OfflineStagingAssetBlobRecord {
  return {
    ...input.assetBlobRecord,
    stagingId: buildStagingId({
      syncRunId: input.syncRunId,
      kind: "assetBlob",
      recordId: input.assetBlobRecord.assetId,
    }),
    syncRunId: input.syncRunId,
  };
}

function deleteStagingRecordsByProjectId(
  store: IDBObjectStore,
  projectId: string,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let deleted = 0;
    const request = store.openCursor();

    request.onerror = () => {
      reject(
        request.error ??
          new Error("Failed to scan staging records by projectId."),
      );
    };

    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        resolve(deleted);
        return;
      }

      const value = cursor.value as MaybeProjectRecord | null | undefined;

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

export async function clearOfflineStagingByProjectIdInTransaction(
  stores: OfflineStagingWriteStores,
  projectId: string,
): Promise<ClearOfflineStagingByProjectIdResult> {
  assertNonBlankInternalId("projectId", projectId);

  const deletedAssetBlobs = await deleteStagingRecordsByProjectId(
    stores[OFFLINE_STAGING_ASSET_BLOBS_STORE],
    projectId,
  );

  const deletedAssets = await deleteStagingRecordsByProjectId(
    stores[OFFLINE_STAGING_ASSETS_STORE],
    projectId,
  );

  const deletedProjects = await deleteStagingRecordsByProjectId(
    stores[OFFLINE_STAGING_PROJECTS_STORE],
    projectId,
  );

  return {
    deletedProjects,
    deletedAssets,
    deletedAssetBlobs,
  };
}

export function clearOfflineStagingByProjectId(
  projectId: string,
): Promise<ClearOfflineStagingByProjectIdResult> {
  assertNonBlankInternalId("projectId", projectId);

  return runOfflineTransaction(
    [
      OFFLINE_STAGING_ASSET_BLOBS_STORE,
      OFFLINE_STAGING_ASSETS_STORE,
      OFFLINE_STAGING_PROJECTS_STORE,
    ],
    "readwrite",
    async ({ stores }) =>
      clearOfflineStagingByProjectIdInTransaction(stores, projectId),
  );
}

export async function putOfflineStagingAssetPairInTransaction(
  stores: OfflineStagingWriteStores,
  args: PutOfflineStagingAssetPairArgs,
): Promise<PutOfflineStagingAssetPairResult> {
  assertNonBlankInternalId("syncRunId", args.syncRunId);
  assertAssetPairMatches(args.assetPair);

  const stagingAsset = toOfflineStagingAsset({
    syncRunId: args.syncRunId,
    asset: args.assetPair.asset,
  });

  const stagingAssetBlobRecord = toOfflineStagingAssetBlobRecord({
    syncRunId: args.syncRunId,
    assetBlobRecord: args.assetPair.assetBlobRecord,
  });

  await requestToPromise(
    stores[OFFLINE_STAGING_ASSET_BLOBS_STORE].put(stagingAssetBlobRecord),
  );

  await requestToPromise(
    stores[OFFLINE_STAGING_ASSETS_STORE].put(stagingAsset),
  );

  return {
    writtenAssets: 1,
    writtenAssetBlobs: 1,
  };
}

export function putOfflineStagingAssetPair(
  args: PutOfflineStagingAssetPairArgs,
): Promise<PutOfflineStagingAssetPairResult> {
  assertNonBlankInternalId("syncRunId", args.syncRunId);
  assertAssetPairMatches(args.assetPair);

  return runOfflineTransaction(
    [OFFLINE_STAGING_ASSET_BLOBS_STORE, OFFLINE_STAGING_ASSETS_STORE],
    "readwrite",
    async ({ stores }) =>
      putOfflineStagingAssetPairInTransaction(stores, args),
  );
}

export async function putOfflineStagingProjectInTransaction(
  stores: OfflineStagingWriteStores,
  args: PutOfflineStagingProjectArgs,
): Promise<PutOfflineStagingProjectResult> {
  assertNonBlankInternalId("syncRunId", args.syncRunId);
  assertNonBlankInternalId("project.projectId", args.project.projectId);
  assertSchemaVersion("project", args.project.schemaVersion);

  const stagingProject = toOfflineStagingProject({
    syncRunId: args.syncRunId,
    project: args.project,
  });

  await requestToPromise(
    stores[OFFLINE_STAGING_PROJECTS_STORE].put(stagingProject),
  );

  return {
    writtenProjects: 1,
  };
}

export function putOfflineStagingProject(
  args: PutOfflineStagingProjectArgs,
): Promise<PutOfflineStagingProjectResult> {
  assertNonBlankInternalId("syncRunId", args.syncRunId);
  assertNonBlankInternalId("project.projectId", args.project.projectId);
  assertSchemaVersion("project", args.project.schemaVersion);

  return runOfflineTransaction(
    [OFFLINE_STAGING_PROJECTS_STORE],
    "readwrite",
    async ({ stores }) =>
      putOfflineStagingProjectInTransaction(stores, args),
  );
}

/**
 * Drive fetch 済みの complete snapshot を staging stores へ書く。
 *
 * 重要:
 * - Drive API は呼ばない。
 * - promotion は呼ばない。
 * - asset pair は短い transaction で逐次 put する。
 * - project は最後に put する。
 *
 * これにより、asset 取得途中で失敗しても project record が存在しないため、
 * `promoteOfflineStagingForSyncRun(args)` 側の validation では complete snapshot として扱われない。
 */
export async function writeCompleteOfflineStagingSnapshot(
  args: WriteCompleteOfflineStagingSnapshotArgs,
): Promise<WriteCompleteOfflineStagingSnapshotResult> {
  assertNonBlankInternalId("syncRunId", args.syncRunId);
  assertProjectMatchesAssetPairs({
    project: args.project,
    assetPairs: args.assetPairs,
  });

  const shouldClearExistingProjectStaging =
    args.clearExistingProjectStaging ?? true;

  const cleanup = shouldClearExistingProjectStaging
    ? await clearOfflineStagingByProjectId(args.project.projectId)
    : {
        deletedProjects: 0,
        deletedAssets: 0,
        deletedAssetBlobs: 0,
      };

  let writtenAssets = 0;
  let writtenAssetBlobs = 0;

  for (const assetPair of args.assetPairs) {
    const result = await putOfflineStagingAssetPair({
      syncRunId: args.syncRunId,
      assetPair,
    });

    writtenAssets += result.writtenAssets;
    writtenAssetBlobs += result.writtenAssetBlobs;
  }

  const projectResult = await putOfflineStagingProject({
    syncRunId: args.syncRunId,
    project: args.project,
  });

  return {
    projectId: args.project.projectId,
    syncRunId: args.syncRunId,
    cleanup,
    writtenProjects: projectResult.writtenProjects,
    writtenAssets,
    writtenAssetBlobs,
  };
}
