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
  markOfflineStoreCorruptInTransaction,
  markOfflineSyncFailed,
  markOfflineSyncFailedInTransaction,
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
import { validateOfflineStagingForSyncRunInTransaction } from "@/lib/offline-staging-validation-integration";
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

function assertNonBlankInternalId(name: string, value: string): void {
  if (value.length === 0) {
    throw new Error(`${name} is required.`);
  }

  if (value !== value.trim()) {
    throw new Error(`${name} must not include leading or trailing whitespace.`);
  }
}

function assertValidPromoteOfflineStagingArgs(
  args: PromoteOfflineStagingForSyncRunArgs,
): void {
  assertNonBlankInternalId("projectId", args.projectId);
  assertNonBlankInternalId("syncRunId", args.syncRunId);
}

async function markValidationFailureSyncStateInTransaction(args: {
  stores: Record<string, IDBObjectStore>;
  projectId: string;
  syncRunId: string;
  failedAt: IsoDateTimeString;
  context: OfflineSyncStateContext;
  classification: OfflineStagingValidationFailureClassification;
}): Promise<OfflineSyncStateUpdateResult> {
  if (args.classification === "corrupt") {
    return markOfflineStoreCorruptInTransaction(args.stores, {
      projectId: args.projectId,
      syncRunId: args.syncRunId,
      context: args.context,
    });
  }

  return markOfflineSyncFailedInTransaction(args.stores, {
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
  assertValidPromoteOfflineStagingArgs(args);

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
        const validatedStaging =
          await validateOfflineStagingForSyncRunInTransaction(
            stores,
            args.syncRunId,
          );

        if (!validatedStaging.ok) {
          const validationClassification =
            classifyOfflineStagingValidationFailure(
              validatedStaging.validation.reason,
            );

          const syncStateUpdate =
            await markValidationFailureSyncStateInTransaction({
              stores,
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

        if (validatedStaging.project.projectId !== args.projectId) {
          throw new Error(
            "Validated staging projectId does not match the requested projectId.",
          );
        }

        const syncStateUpdate = await markOfflineSyncReadyInTransaction(stores, {
          projectId: args.projectId,
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
