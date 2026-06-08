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
import { validateOfflineStagingForSyncRun } from "@/lib/offline-staging-validation-integration";
import type { OfflineStagingValidationFailureReason } from "@/lib/offline-staging-validation";

export type PromoteOfflineStagingForSyncRunArgs = {
  syncRunId: string;
  readyAt: IsoDateTimeString;
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
    }
  | {
      ok: false;
      reason: "stale-sync-run";
    };

export async function promoteOfflineStagingForSyncRun(
  args: PromoteOfflineStagingForSyncRunArgs,
): Promise<PromoteOfflineStagingForSyncRunResult> {
  const validatedStaging = await validateOfflineStagingForSyncRun(args.syncRunId);

  if (!validatedStaging.ok) {
    return {
      ok: false,
      reason: "validation-failed",
      validationReason: validatedStaging.validation.reason,
    };
  }

  return runOfflineTransaction(
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
}
