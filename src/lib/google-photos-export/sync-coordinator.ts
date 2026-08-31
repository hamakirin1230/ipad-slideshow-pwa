import type { DriveProjectSummary } from "../google-drive";
import {
  finalizeGooglePhotosSameAlbumSync,
  type GooglePhotosSyncFinalizeProgress,
  type GooglePhotosSyncFinalizeResult,
} from "./sync-finalize";
import {
  createGooglePhotosSyncMediaItemsAfterAlbumBound,
  type GooglePhotosSyncMediaProgress,
  type GooglePhotosSyncMediaResult,
  type GooglePhotosSyncMediaRuntime,
} from "./sync-media";
import {
  reconcileGooglePhotosSyncMembership,
  type GooglePhotosSyncMembershipProgress,
  type GooglePhotosSyncMembershipResult,
} from "./sync-membership";
import {
  prepareGooglePhotosSyncReconciliation,
  type GooglePhotosSyncReconciliationResult,
} from "./sync-reconciliation";
import {
  startGooglePhotosSyncAfterFreshReconciliation,
  type GooglePhotosSyncStartResult,
} from "./sync-start";

export type GooglePhotosSameAlbumSyncCoordinatorStage =
  | "reconciliation"
  | "start"
  | "media"
  | "membership"
  | "finalize";

type ReconciliationReason = Exclude<
  GooglePhotosSyncReconciliationResult["status"],
  "initialSyncRequired" | "noChanges" | "ready"
>;
type StartReason = Exclude<
  GooglePhotosSyncStartResult["status"],
  "checkpointed" | "noChanges"
>;
type MediaReason = Exclude<GooglePhotosSyncMediaResult["status"], "mediaPrepared">;
type MembershipReason = Exclude<
  GooglePhotosSyncMembershipResult["status"],
  "membershipPrepared"
>;
type FinalizeReason = Exclude<GooglePhotosSyncFinalizeResult["status"], "completed">;

export type GooglePhotosSameAlbumSyncCoordinatorReason =
  | ReconciliationReason
  | StartReason
  | MediaReason
  | MembershipReason
  | FinalizeReason
  | "creatingAlbumRecoveryRequired"
  | "invalidState"
  | "operationStartFailed";

export type GooglePhotosSameAlbumSyncCoordinatorResult =
  | { status: "completed" }
  | { status: "noChanges" }
  | {
      status: "blocked" | "interrupted";
      stage: GooglePhotosSameAlbumSyncCoordinatorStage;
      reason: GooglePhotosSameAlbumSyncCoordinatorReason;
    }
  | {
      status: "recoveryRequired";
      stage: Exclude<GooglePhotosSameAlbumSyncCoordinatorStage, "reconciliation">;
      reason: GooglePhotosSameAlbumSyncCoordinatorReason;
    };

export type GooglePhotosSameAlbumSyncCoordinatorProgress = {
  stage: "preparing" | "starting" | "media" | "membership" | "finalizing";
  completedCount?: number;
  totalCount?: number;
};

export type GooglePhotosSameAlbumSyncCoordinatorInput = {
  driveAccessToken: string;
  photosAccessToken: string;
  selectedProjectId: string;
  workspaceId: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
  signal: AbortSignal;
  mediaRuntime?: GooglePhotosSyncMediaRuntime;
  onMediaRuntime?: (runtime: GooglePhotosSyncMediaRuntime) => void;
  onProgress?: (progress: GooglePhotosSameAlbumSyncCoordinatorProgress) => void;
};

export type GooglePhotosSameAlbumSyncCoordinatorAdapters = {
  prepareReconciliation: typeof prepareGooglePhotosSyncReconciliation;
  startSync: typeof startGooglePhotosSyncAfterFreshReconciliation;
  syncMedia: typeof createGooglePhotosSyncMediaItemsAfterAlbumBound;
  syncMembership: typeof reconcileGooglePhotosSyncMembership;
  finalizeSync: typeof finalizeGooglePhotosSameAlbumSync;
  createOperationId: () => string;
  now: () => Date;
};

const defaultAdapters: GooglePhotosSameAlbumSyncCoordinatorAdapters = {
  prepareReconciliation: prepareGooglePhotosSyncReconciliation,
  startSync: startGooglePhotosSyncAfterFreshReconciliation,
  syncMedia: createGooglePhotosSyncMediaItemsAfterAlbumBound,
  syncMembership: reconcileGooglePhotosSyncMembership,
  finalizeSync: finalizeGooglePhotosSameAlbumSync,
  createOperationId: () => globalThis.crypto.randomUUID(),
  now: () => new Date(),
};

export async function runGooglePhotosSameAlbumSync(
  input: GooglePhotosSameAlbumSyncCoordinatorInput,
  adapters: GooglePhotosSameAlbumSyncCoordinatorAdapters = defaultAdapters,
): Promise<GooglePhotosSameAlbumSyncCoordinatorResult> {
  input.signal.throwIfAborted();
  input.onProgress?.({ stage: "preparing" });
  const reconciliation = await adapters.prepareReconciliation(commonInput(input));
  input.signal.throwIfAborted();

  switch (reconciliation.status) {
    case "noChanges":
      return { status: "noChanges" };

    case "initialSyncRequired":
    case "ready": {
      const operation = createOperation(adapters);
      if (!operation) {
        return blocked("start", "operationStartFailed");
      }
      input.onProgress?.({ stage: "starting" });
      const started = await adapters.startSync({
        ...commonInput(input),
        operationId: operation.operationId,
        startedAt: operation.startedAt,
      });
      input.signal.throwIfAborted();
      return continueAfterStart(input, adapters, operation.operationId, started);
    }

    case "continuationRequired": {
      const pending = reconciliation.binding.pending;
      if (!pending) return blocked("reconciliation", "invalidState");
      return continueFromPendingPhase(
        input,
        adapters,
        pending.operationId,
        pending.phase,
      );
    }

    case "continuationSourceChanged":
      return interrupted("reconciliation", "sourceChanged");

    case "sourcePreparationFailed":
    case "bindingDuplicate":
    case "bindingInvalid":
    case "bindingInaccessible":
    case "targetMissing":
    case "targetNotWritable":
    case "photosReadFailed":
    case "photosInvalidResponse":
    case "paginationInvalid":
    case "paginationLimitExceeded":
    case "planningFailed":
      return blocked("reconciliation", reconciliation.status);
  }
}

async function continueAfterStart(
  input: GooglePhotosSameAlbumSyncCoordinatorInput,
  adapters: GooglePhotosSameAlbumSyncCoordinatorAdapters,
  operationId: string,
  result: GooglePhotosSyncStartResult,
): Promise<GooglePhotosSameAlbumSyncCoordinatorResult> {
  switch (result.status) {
    case "noChanges":
      return { status: "noChanges" };
    case "checkpointed":
      return runMediaStage(input, adapters, operationId);
    case "locked":
    case "lockUnavailable":
    case "invalidStartInput":
    case "reconciliationBlocked":
      return blocked(
        "start",
        result.status === "reconciliationBlocked" ? result.reason : result.status,
      );
    case "albumCreateAmbiguous":
    case "albumCreatedCheckpointFailed":
      return recovery("start", result.status);
    case "staleBinding":
    case "checkpointWriteFailed":
    case "checkpointConflict":
    case "albumCreateFailed":
      return interrupted("start", result.status);
  }
}

async function continueFromPendingPhase(
  input: GooglePhotosSameAlbumSyncCoordinatorInput,
  adapters: GooglePhotosSameAlbumSyncCoordinatorAdapters,
  operationId: string,
  phase: string,
): Promise<GooglePhotosSameAlbumSyncCoordinatorResult> {
  switch (phase) {
    case "creatingAlbum":
      return recovery("start", "creatingAlbumRecoveryRequired");
    case "albumBound":
      return runMediaStage(input, adapters, operationId);
    case "mediaCreating":
      return recovery("media", "mediaCreateRecoveryRequired");
    case "mediaPrepared":
    case "membershipRemoving":
    case "membershipAdding":
      return runMembershipStage(input, adapters, operationId);
    case "titleUpdating":
    case "finalizing":
      return runFinalizeStage(input, adapters, operationId);
    default:
      return blocked("reconciliation", "invalidState");
  }
}

async function runMediaStage(
  input: GooglePhotosSameAlbumSyncCoordinatorInput,
  adapters: GooglePhotosSameAlbumSyncCoordinatorAdapters,
  operationId: string,
): Promise<GooglePhotosSameAlbumSyncCoordinatorResult> {
  input.signal.throwIfAborted();
  input.onProgress?.({ stage: "media" });
  const result = await adapters.syncMedia({
    ...commonInput(input),
    operationId,
    ...(input.mediaRuntime === undefined ? {} : { runtime: input.mediaRuntime }),
    ...(input.onMediaRuntime === undefined
      ? {}
      : { onRuntime: input.onMediaRuntime }),
    onProgress: (progress) => forwardMediaProgress(input, progress),
  });
  input.signal.throwIfAborted();

  switch (result.status) {
    case "mediaPrepared":
      return runMembershipStage(input, adapters, operationId);
    case "locked":
    case "lockUnavailable":
    case "wrongPhase":
      return blocked("media", result.status);
    case "mediaCreateRecoveryRequired":
    case "mediaCreatedCheckpointFailed":
      return recovery("media", result.status);
    default:
      return interrupted("media", result.status);
  }
}

async function runMembershipStage(
  input: GooglePhotosSameAlbumSyncCoordinatorInput,
  adapters: GooglePhotosSameAlbumSyncCoordinatorAdapters,
  operationId: string,
): Promise<GooglePhotosSameAlbumSyncCoordinatorResult> {
  input.signal.throwIfAborted();
  input.onProgress?.({ stage: "membership" });
  const result = await adapters.syncMembership({
    ...commonInput(input),
    operationId,
    onProgress: (progress) => forwardMembershipProgress(input, progress),
  });
  input.signal.throwIfAborted();

  switch (result.status) {
    case "membershipPrepared":
      return runFinalizeStage(input, adapters, operationId);
    case "locked":
    case "lockUnavailable":
    case "wrongPhase":
      return blocked("membership", result.status);
    case "membershipRecoveryRequired":
    case "membershipRemoveRecoveryRequired":
    case "membershipAddRecoveryRequired":
      return recovery("membership", result.status);
    default:
      return interrupted("membership", result.status);
  }
}

async function runFinalizeStage(
  input: GooglePhotosSameAlbumSyncCoordinatorInput,
  adapters: GooglePhotosSameAlbumSyncCoordinatorAdapters,
  operationId: string,
): Promise<GooglePhotosSameAlbumSyncCoordinatorResult> {
  input.signal.throwIfAborted();
  input.onProgress?.({ stage: "finalizing" });
  const result = await adapters.finalizeSync({
    ...commonInput(input),
    operationId,
    now: adapters.now,
    onProgress: (progress) => forwardFinalizeProgress(input, progress),
  });
  input.signal.throwIfAborted();

  switch (result.status) {
    case "completed":
      return { status: "completed" };
    case "locked":
    case "lockUnavailable":
    case "wrongPhase":
      return blocked("finalize", result.status);
    case "titleUpdateRecoveryRequired":
    case "finalizationRecoveryRequired":
    case "generationOverflow":
      return recovery("finalize", result.status);
    default:
      return interrupted("finalize", result.status);
  }
}

function commonInput(input: GooglePhotosSameAlbumSyncCoordinatorInput) {
  return {
    driveAccessToken: input.driveAccessToken,
    photosAccessToken: input.photosAccessToken,
    selectedProjectId: input.selectedProjectId,
    workspaceId: input.workspaceId,
    projectsRootFolderId: input.projectsRootFolderId,
    project: input.project,
    signal: input.signal,
  };
}

function createOperation(adapters: GooglePhotosSameAlbumSyncCoordinatorAdapters) {
  try {
    const operationId = adapters.createOperationId();
    if (operationId.length === 0 || operationId.trim() !== operationId) return null;
    const now = adapters.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
    return { operationId, startedAt: now.toISOString() };
  } catch {
    return null;
  }
}

function forwardMediaProgress(
  input: GooglePhotosSameAlbumSyncCoordinatorInput,
  progress: GooglePhotosSyncMediaProgress,
) {
  input.onProgress?.({
    stage: "media",
    completedCount: progress.completedItems,
    totalCount: progress.totalItems,
  });
}

function forwardMembershipProgress(
  input: GooglePhotosSameAlbumSyncCoordinatorInput,
  progress: GooglePhotosSyncMembershipProgress,
) {
  input.onProgress?.({
    stage: "membership",
    completedCount: progress.completedCount,
    totalCount: progress.totalCount,
  });
}

function forwardFinalizeProgress(
  input: GooglePhotosSameAlbumSyncCoordinatorInput,
  progress: GooglePhotosSyncFinalizeProgress,
) {
  void progress;
  input.onProgress?.({ stage: "finalizing" });
}

function blocked(
  stage: GooglePhotosSameAlbumSyncCoordinatorStage,
  reason: GooglePhotosSameAlbumSyncCoordinatorReason,
): GooglePhotosSameAlbumSyncCoordinatorResult {
  return { status: "blocked", stage, reason };
}

function interrupted(
  stage: GooglePhotosSameAlbumSyncCoordinatorStage,
  reason: GooglePhotosSameAlbumSyncCoordinatorReason,
): GooglePhotosSameAlbumSyncCoordinatorResult {
  return { status: "interrupted", stage, reason };
}

function recovery(
  stage: Exclude<GooglePhotosSameAlbumSyncCoordinatorStage, "reconciliation">,
  reason: GooglePhotosSameAlbumSyncCoordinatorReason,
): GooglePhotosSameAlbumSyncCoordinatorResult {
  return { status: "recoveryRequired", stage, reason };
}
