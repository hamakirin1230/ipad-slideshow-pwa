// src/lib/offline-staging-promotion-orchestration.ts

import { runOfflineTransaction } from "@/lib/offline-db";
import {
  OFFLINE_ASSETS_STORE,
  OFFLINE_ASSET_BLOBS_STORE,
  OFFLINE_PROJECTS_STORE,
  OFFLINE_STAGING_ASSETS_STORE,
  OFFLINE_STAGING_ASSET_BLOBS_STORE,
  OFFLINE_STAGING_PROJECTS_STORE,
  OFFLINE_SYNC_STATE_STORE,
  type IsoDateTimeString,
} from "@/lib/offline-schema";
import {
  markOfflineStoreCorrupt,
  markOfflineSyncFailed,
  markOfflineSyncReadyInTransaction,
  type OfflineSyncStateContext,
  type OfflineSyncStateUpdateResult,
} from "@/lib/offline-sync-state";
import {
  clearOfflineStagingBySyncRunIdInTransaction,
  type ClearOfflineStagingResult,
} from "@/lib/offline-staging-cleanup";
import {
  promoteValidatedOfflineStagingToConfirmedStoresInTransaction,
  type PromoteOfflineStagingResult,
} from "@/lib/offline-staging-promotion";
import {
  classifyOfflineStagingValidationFailure,
  type OfflineStagingValidationFailureClassification,
} from "@/lib/offline-staging-validation-failure-classification";
import { validateOfflineStagingForSyncRun } from "@/lib/offline-staging-validation-integration";
import type { OfflineStagingValidationFailureReason } from "@/lib/offline-staging-validation";

export type PromoteOfflineStagingForSyncRunArgs = {
  projectId: string;
  syncRunId: string;
  readyAt: IsoDateTimeString;
  failedAt: IsoDateTimeString;
  context: OfflineSyncStateContext;
};

export type PromoteOfflineStagingForSyncRunResult =
  | {
      ok: true;
      promotion: PromoteOfflineStagingResult;
      cleanup: ClearOfflineStagingResult;
      syncStateUpdate: Extract<OfflineSyncStateUpdateResult, { updated: true }>;
    }
  | {
      ok: false;
      reason: "validation-failed";
      validationReason: OfflineStagingValidationFailureReason;
      validationClassification: OfflineStagingValidationFailureClassification;
      syncStateUpdate: Extract<OfflineSyncStateUpdateResult, { updated: true }>;
    }
  | {
      ok: false;
      reason: "stale-sync-run";
    }
  | {
      ok: false;
      reason: "promotion-or-cleanup-failed";
      syncStateUpdate: Extract<OfflineSyncStateUpdateResult, { updated: true }>;
    };

async function markValidationFailureSyncState(args: {
  projectId: string;
  syncRunId: string;
  failedAt: IsoDateTimeString;
  context: OfflineSyncStateContext;
  classification: OfflineStagingValidationFailureClassification;
}): Promise<OfflineSyncStateUpdateResult> {
  if (args.classification === "corrupt") {
    return markOfflineStoreCorrupt({
      projectId: args.projectId,
      syncRunId: args.syncRunId,
      context: args.context,
    });
  }

  return markOfflineSyncFailed({
    projectId: args.projectId,
    syncRunId: args.syncRunId,
    failedAt: args.failedAt,
    context: args.context,
  });
}

async function markPromotionOrCleanupFailureSyncState(args: {
  projectId: string;
  syncRunId: string;
  failedAt: IsoDateTimeString;
  context: OfflineSyncStateContext;
}): Promise<OfflineSyncStateUpdateResult> {
  return markOfflineSyncFailed({
    projectId: args.projectId,
    syncRunId: args.syncRunId,
    failedAt: args.failedAt,
    context: args.context,
  });
}

export async function promoteOfflineStagingForSyncRun(
  args: PromoteOfflineStagingForSyncRunArgs,
): Promise<PromoteOfflineStagingForSyncRunResult> {
  const validatedStaging = await validateOfflineStagingForSyncRun(args.syncRunId);

  if (!validatedStaging.ok) {
    const validationClassification = classifyOfflineStagingValidationFailure(
      validatedStaging.validation.reason,
    );

    const syncStateUpdate = await markValidationFailureSyncState({
      projectId: args.projectId,
      syncRunId: args.syncRunId,
      failedAt: args.failedAt,
      context: args.context,
      classification: validationClassification,
    });

    if (!syncStateUpdate.updated) {
      return {
        ok: false,
        reason: "stale-sync-run",
      };
    }

    return {
      ok: false,
      reason: "validation-failed",
      validationReason: validatedStaging.validation.reason,
      validationClassification,
      syncStateUpdate,
    };
  }

  try {
    return await runOfflineTransaction(
      [
        OFFLINE_SYNC_STATE_STORE,
        OFFLINE_ASSET_BLOBS_STORE,
        OFFLINE_ASSETS_STORE,
        OFFLINE_PROJECTS_STORE,
        OFFLINE_STAGING_ASSET_BLOBS_STORE,
        OFFLINE_STAGING_ASSETS_STORE,
        OFFLINE_STAGING_PROJECTS_STORE,
      ],
      "readwrite",
      async ({ stores }) => {
        const syncStateUpdate = await markOfflineSyncReadyInTransaction(stores, {
          projectId: validatedStaging.project.projectId,
          syncRunId: args.syncRunId,
          readyAt: args.readyAt,
          context: args.context,
        });

        if (!syncStateUpdate.updated) {
          return {
            ok: false,
            reason: "stale-sync-run",
          };
        }

        const promotion =
          await promoteValidatedOfflineStagingToConfirmedStoresInTransaction(
            stores,
            validatedStaging,
          );

        const cleanup = await clearOfflineStagingBySyncRunIdInTransaction(
          stores,
          args.syncRunId,
        );

        return {
          ok: true,
          promotion,
          cleanup,
          syncStateUpdate,
        };
      },
    );
  } catch {
    const syncStateUpdate = await markPromotionOrCleanupFailureSyncState({
      projectId: args.projectId,
      syncRunId: args.syncRunId,
      failedAt: args.failedAt,
      context: args.context,
    });

    if (!syncStateUpdate.updated) {
      return {
        ok: false,
        reason: "stale-sync-run",
      };
    }

    return {
      ok: false,
      reason: "promotion-or-cleanup-failed",
      syncStateUpdate,
    };
  }
}
