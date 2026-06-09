// src/lib/drive-offline-staging-orchestration.ts

import {
  DriveOfflineStagingSnapshotError,
  fetchDriveOfflineStagingSnapshot,
  type DriveOfflineStagingSnapshot,
} from "@/lib/drive-offline-staging-snapshot";
import type {
  DriveProjectSummary,
  DriveWorkspaceReadyContext,
} from "@/lib/google-drive";
import {
  type IsoDateTimeString,
} from "@/lib/offline-schema";
import {
  markOfflineSyncFailed,
  markOfflineSyncing,
  type OfflineSyncStateContext,
  type OfflineSyncStateUpdateResult,
} from "@/lib/offline-sync-state";
import {
  promoteOfflineStagingForSyncRun,
  type PromoteOfflineStagingForSyncRunResult,
} from "@/lib/offline-staging-promotion-orchestration";
import {
  OfflineStagingWritePreconditionError,
  writeCompleteOfflineStagingSnapshot,
  type WriteCompleteOfflineStagingSnapshotResult,
} from "@/lib/offline-staging-write";

export type DriveOfflineStagingPromotionOrchestrationArgs = {
  accessToken: string;
  readyContext: DriveWorkspaceReadyContext;
  project: DriveProjectSummary;
  signal: AbortSignal;

  /**
   * 通常は省略し、helper 内で crypto.randomUUID() を使う。
   * テストや手動検証で deterministic にしたい場合だけ指定する。
   */
  syncRunId?: string;

  /**
   * 通常は省略し、helper 内で new Date().toISOString() を使う。
   * テストや手動検証で deterministic にしたい場合だけ指定する。
   */
  syncedAt?: IsoDateTimeString;
};

export type DriveOfflineStagingPromotionOrchestrationResult =
  | {
      ok: true;
      syncRunId: string;
      snapshot: DriveOfflineStagingSnapshot;
      stagingWrite: WriteCompleteOfflineStagingSnapshotResult;
      promotion: Extract<PromoteOfflineStagingForSyncRunResult, { ok: true }>;
    }
  | {
      ok: false;
      syncRunId: string;
      reason: "stale-sync-run";
    }
  | {
      ok: false;
      syncRunId: string;
      reason: "drive-fetch-or-staging-write-failed";
      diagnostics: string[];
      syncStateUpdate: Extract<OfflineSyncStateUpdateResult, { updated: true }>;
    }
  | {
      ok: false;
      syncRunId: string;
      reason: "promotion-failed";
      promotion: Exclude<
        PromoteOfflineStagingForSyncRunResult,
        { ok: true } | { reason: "stale-sync-run" }
      >;
    };

export class DriveOfflineStagingPromotionOrchestrationPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveOfflineStagingPromotionOrchestrationPreconditionError";
  }
}

export async function runDriveOfflineStagingPromotionOrchestration(
  args: DriveOfflineStagingPromotionOrchestrationArgs,
): Promise<DriveOfflineStagingPromotionOrchestrationResult> {
  assertValidOrchestrationArgs(args);

  const syncRunId = args.syncRunId ?? crypto.randomUUID();
  const syncedAt = args.syncedAt ?? getCurrentIsoDateTimeString();

  assertNonBlankInternalId("syncRunId", syncRunId);
  assertNonBlankInternalId("syncedAt", syncedAt);

  let failureContext = buildPreFetchOfflineSyncStateContext({
    readyContext: args.readyContext,
    project: args.project,
  });

  await markOfflineSyncing({
    projectId: args.project.projectId,
    syncRunId,
    context: failureContext,
  });

  try {
    const snapshot = await fetchDriveOfflineStagingSnapshot({
      accessToken: args.accessToken,
      readyContext: args.readyContext,
      project: args.project,
      syncedAt,
      signal: args.signal,
    });

    const context = buildReadyOfflineSyncStateContext({
      readyContext: args.readyContext,
      project: args.project,
      snapshot,
    });

    failureContext = context;

    const stagingWrite = await writeCompleteOfflineStagingSnapshot({
      syncRunId,
      project: snapshot.project,
      assetPairs: snapshot.assetPairs,
      clearExistingProjectStaging: true,
    });

    const promotion = await promoteOfflineStagingForSyncRun({
      projectId: args.project.projectId,
      syncRunId,
      readyAt: syncedAt,
      failedAt: getCurrentIsoDateTimeString(),
      context,
    });

    if (!promotion.ok) {
      if (promotion.reason === "stale-sync-run") {
        return {
          ok: false,
          syncRunId,
          reason: "stale-sync-run",
        };
      }

      return {
        ok: false,
        syncRunId,
        reason: "promotion-failed",
        promotion,
      };
    }

    return {
      ok: true,
      syncRunId,
      snapshot,
      stagingWrite,
      promotion,
    };
  } catch (error) {
    const syncStateUpdate = await markOfflineSyncFailed({
      projectId: args.project.projectId,
      syncRunId,
      failedAt: getCurrentIsoDateTimeString(),
      context: failureContext,
    });

    if (!syncStateUpdate.updated) {
      return {
        ok: false,
        syncRunId,
        reason: "stale-sync-run",
      };
    }

    return {
      ok: false,
      syncRunId,
      reason: "drive-fetch-or-staging-write-failed",
      diagnostics: buildDriveOfflineStagingFailureDiagnostics(error),
      syncStateUpdate,
    };
  }
}

function assertValidOrchestrationArgs(
  args: DriveOfflineStagingPromotionOrchestrationArgs,
): void {
  assertNonBlankInternalId("accessToken", args.accessToken);
  assertNonBlankInternalId(
    "readyContext.workspaceId",
    args.readyContext.workspaceId,
  );
  assertNonBlankInternalId(
    "readyContext.workspaceRootFolderId",
    args.readyContext.workspaceRootFolderId,
  );
  assertNonBlankInternalId(
    "readyContext.workspaceJsonFileId",
    args.readyContext.workspaceJsonFileId,
  );
  assertNonBlankInternalId(
    "readyContext.indexJsonFileId",
    args.readyContext.indexJsonFileId,
  );
  assertNonBlankInternalId(
    "readyContext.projectsRootFolderId",
    args.readyContext.projectsRootFolderId,
  );
  assertNonBlankInternalId("project.projectId", args.project.projectId);
  assertNonBlankInternalId(
    "project.manifestFileId",
    args.project.manifestFileId,
  );
  assertNonBlankInternalId(
    "project.assetsFolderId",
    args.project.assetsFolderId,
  );

  if (args.signal.aborted) {
    throw new DriveOfflineStagingPromotionOrchestrationPreconditionError(
      "signal must not already be aborted.",
    );
  }

  if (args.syncRunId !== undefined) {
    assertNonBlankInternalId("syncRunId", args.syncRunId);
  }

  if (args.syncedAt !== undefined) {
    assertNonBlankInternalId("syncedAt", args.syncedAt);
  }
}

function assertNonBlankInternalId(name: string, value: string): void {
  if (value.length === 0) {
    throw new DriveOfflineStagingPromotionOrchestrationPreconditionError(
      `${name} is required.`,
    );
  }

  if (value !== value.trim()) {
    throw new DriveOfflineStagingPromotionOrchestrationPreconditionError(
      `${name} must not include leading or trailing whitespace.`,
    );
  }
}

function buildPreFetchOfflineSyncStateContext(input: {
  readyContext: DriveWorkspaceReadyContext;
  project: DriveProjectSummary;
}): OfflineSyncStateContext {
  return {
    rootFolderId: input.readyContext.workspaceRootFolderId,
    workspaceFileId: input.readyContext.workspaceJsonFileId,
    indexFileId: input.readyContext.indexJsonFileId,
    manifestFileId: input.project.manifestFileId,
    slideCount: 0,
    assetCount: 0,
    sourceUpdatedAt: input.project.updatedAt,
  };
}

function buildReadyOfflineSyncStateContext(input: {
  readyContext: DriveWorkspaceReadyContext;
  project: DriveProjectSummary;
  snapshot: DriveOfflineStagingSnapshot;
}): OfflineSyncStateContext {
  return {
    rootFolderId: input.readyContext.workspaceRootFolderId,
    workspaceFileId: input.readyContext.workspaceJsonFileId,
    indexFileId: input.readyContext.indexJsonFileId,
    manifestFileId: input.project.manifestFileId,
    slideCount: input.snapshot.details.slideCount,
    assetCount: input.snapshot.details.assetCount,
    sourceUpdatedAt: input.snapshot.project.sourceUpdatedAt,
  };
}

function buildDriveOfflineStagingFailureDiagnostics(error: unknown): string[] {
  if (error instanceof DriveOfflineStagingSnapshotError) {
    return [
      ...error.diagnostics,
      "Drive offline staging snapshot 取得または変換に失敗しました。",
      "promotion は未実行です。",
    ];
  }

  if (error instanceof OfflineStagingWritePreconditionError) {
    return [
      "offline staging write の前提条件検証に失敗しました。",
      error.message,
      "promotion は未実行です。",
    ];
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return [
      "Drive offline staging orchestration がAbortされました。",
      "promotion は未実行です。",
    ];
  }

  return [
    "Drive offline staging orchestration 中に予期しないエラーが発生しました。",
    "promotion が実行されたかどうかは result reason を確認してください。",
  ];
}

function getCurrentIsoDateTimeString(): IsoDateTimeString {
  return new Date().toISOString();
}
