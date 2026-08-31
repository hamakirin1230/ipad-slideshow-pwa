import type { DriveProjectSummary } from "../google-drive";
import {
  readDrivePhotosSyncBinding,
  updateDrivePhotosSyncBindingBestEffort,
  type ReadDrivePhotosSyncBindingResult,
  type UpdateDrivePhotosSyncBindingResult,
} from "./drive-sync-binding";
import { readAllGooglePhotosSyncAlbumMediaItemIds } from "./sync-reconciliation";
import {
  getGooglePhotosSyncAlbum,
  searchGooglePhotosSyncAlbumMediaItemsPage,
  updateGooglePhotosSyncAlbumTitle,
  type GooglePhotosSyncAlbum,
  type GooglePhotosSyncAlbumReadResult,
  type GooglePhotosSyncAlbumUpdateResult,
  type GooglePhotosSyncMediaItemPageResult,
} from "./sync-library-api";
import { targetIdsAppearInRelativeOrder } from "./sync-membership";
import {
  completeGooglePhotosSyncTitleUpdate,
  finalizeGooglePhotosSyncPending,
  getGooglePhotosSyncExpectedStableGeneration,
  inspectGooglePhotosSyncPendingContinuation,
} from "./sync-pending";
import {
  parseGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
  type GooglePhotosSyncPendingPhase,
} from "./sync-binding";
import {
  prepareGooglePhotosSyncSourceWithAdapter,
  type GooglePhotosSyncPreparedSource,
  type PrepareGooglePhotosSyncSourceResult,
} from "./sync-drive-source";
import {
  runWithGooglePhotosSyncWriteLock,
  type GooglePhotosSyncWriteLockResult,
} from "./sync-write-lock";

type SyncFinalizeInput = {
  driveAccessToken: string;
  photosAccessToken: string;
  selectedProjectId: string;
  workspaceId: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
  operationId: string;
  signal: AbortSignal;
  now?: () => Date;
  onProgress?: (progress: GooglePhotosSyncFinalizeProgress) => void;
};

export type GooglePhotosSyncFinalizeProgress = {
  phase: "verifying" | "updatingTitle" | "checkpointing" | "finalizing";
};

export type GooglePhotosSyncFinalizeResult =
  | { status: "locked" | "lockUnavailable" }
  | {
      status:
        | "sourcePreparationFailed"
        | "sourceChanged"
        | "bindingInaccessible"
        | "bindingInvalid"
        | "bindingDuplicate"
        | "wrongPhase"
        | "staleBinding"
        | "targetMissing"
        | "targetNotWritable"
        | "photosReadFailed"
        | "photosInvalidResponse"
        | "paginationInvalid"
        | "paginationLimitExceeded"
        | "titleUpdateRecoveryRequired"
        | "finalizationRecoveryRequired"
        | "checkpointWriteFailed"
        | "checkpointConflict"
        | "finalizationWriteFailed"
        | "generationOverflow";
    }
  | { status: "completed" };

export type GooglePhotosSyncFinalizeAdapters = {
  runWithLock: typeof runWithGooglePhotosSyncWriteLock;
  prepareSource: (
    input: Parameters<typeof prepareGooglePhotosSyncSourceWithAdapter>[0],
  ) => Promise<PrepareGooglePhotosSyncSourceResult>;
  readBinding: (
    input: Parameters<typeof readDrivePhotosSyncBinding>[0],
  ) => Promise<ReadDrivePhotosSyncBindingResult>;
  updateBinding: (
    input: Parameters<typeof updateDrivePhotosSyncBindingBestEffort>[0],
  ) => Promise<UpdateDrivePhotosSyncBindingResult>;
  getAlbum: (
    input: Parameters<typeof getGooglePhotosSyncAlbum>[0],
  ) => Promise<GooglePhotosSyncAlbumReadResult>;
  searchAlbumMediaItemsPage: (
    input: Parameters<typeof searchGooglePhotosSyncAlbumMediaItemsPage>[0],
  ) => Promise<GooglePhotosSyncMediaItemPageResult>;
  updateAlbumTitle: (
    input: Parameters<typeof updateGooglePhotosSyncAlbumTitle>[0],
  ) => Promise<GooglePhotosSyncAlbumUpdateResult>;
};

const defaultAdapters: GooglePhotosSyncFinalizeAdapters = {
  runWithLock: runWithGooglePhotosSyncWriteLock,
  prepareSource: (input) => prepareGooglePhotosSyncSourceWithAdapter(input),
  readBinding: readDrivePhotosSyncBinding,
  updateBinding: updateDrivePhotosSyncBindingBestEffort,
  getAlbum: getGooglePhotosSyncAlbum,
  searchAlbumMediaItemsPage: searchGooglePhotosSyncAlbumMediaItemsPage,
  updateAlbumTitle: updateGooglePhotosSyncAlbumTitle,
};

type FinalizePhase = "titleUpdating" | "finalizing";

type FinalizeSnapshot = {
  preparedSource: GooglePhotosSyncPreparedSource;
  bindingFileId: string;
  binding: GooglePhotosSyncBinding;
  album: GooglePhotosSyncAlbum;
  currentMediaItemIds: string[];
  phase: FinalizePhase;
  targetIds: string[];
  previousIds: string[];
};

type SnapshotResult =
  | { ok: true; value: FinalizeSnapshot }
  | { ok: false; result: GooglePhotosSyncFinalizeResult };

export async function finalizeGooglePhotosSameAlbumSync(
  input: SyncFinalizeInput,
  adapters: GooglePhotosSyncFinalizeAdapters = defaultAdapters,
): Promise<GooglePhotosSyncFinalizeResult> {
  throwIfAborted(input.signal);
  const locked: GooglePhotosSyncWriteLockResult<GooglePhotosSyncFinalizeResult> =
    await adapters.runWithLock(
      { projectId: input.selectedProjectId },
      async () => runFinalizeInsideLock(input, adapters),
    );
  if (!locked.acquired) return { status: locked.reason };
  return locked.value;
}

async function runFinalizeInsideLock(
  input: SyncFinalizeInput,
  adapters: GooglePhotosSyncFinalizeAdapters,
): Promise<GooglePhotosSyncFinalizeResult> {
  const initial = await readFinalizeSnapshot(input, adapters);
  if (!initial.ok) return initial.result;
  if (!finalMembershipIsValid(initial.value)) {
    return { status: "finalizationRecoveryRequired" };
  }
  return initial.value.phase === "titleUpdating"
    ? continueTitleUpdating(input, initial.value, adapters)
    : finalizeStableBinding(input, initial.value, adapters);
}

async function continueTitleUpdating(
  input: SyncFinalizeInput,
  initial: FinalizeSnapshot,
  adapters: GooglePhotosSyncFinalizeAdapters,
): Promise<GooglePhotosSyncFinalizeResult> {
  let verified = await readFinalizeSnapshot(input, adapters, {
    expectedPhase: "titleUpdating",
    expectedSnapshot: initial,
  });
  if (!verified.ok) return verified.result;
  if (!finalMembershipIsValid(verified.value)) {
    return { status: "finalizationRecoveryRequired" };
  }

  if (verified.value.album.title !== verified.value.binding.pending?.targetTitle) {
    input.onProgress?.({ phase: "updatingTitle" });
    let updated: GooglePhotosSyncAlbumUpdateResult;
    try {
      updated = await adapters.updateAlbumTitle({
        accessToken: input.photosAccessToken,
        albumId: verified.value.album.id,
        title: verified.value.binding.pending?.targetTitle ?? "",
        signal: input.signal,
      });
      throwIfAborted(input.signal);
    } catch (error) {
      if (isAbortError(error, input.signal)) throw error;
      return { status: "titleUpdateRecoveryRequired" };
    }
    if (
      updated.status !== "updated" ||
      updated.album.id !== verified.value.album.id ||
      updated.album.title !== verified.value.binding.pending?.targetTitle
    ) {
      return { status: "titleUpdateRecoveryRequired" };
    }

    const afterPatch = await readFinalizeSnapshot(input, adapters, {
      expectedPhase: "titleUpdating",
      expectedSnapshot: verified.value,
    });
    if (!afterPatch.ok) return afterPatch.result;
    if (!finalMembershipIsValid(afterPatch.value)) {
      return { status: "finalizationRecoveryRequired" };
    }
    if (afterPatch.value.album.title !== afterPatch.value.binding.pending?.targetTitle) {
      return { status: "titleUpdateRecoveryRequired" };
    }
    verified = afterPatch;
  }

  const transition = completeGooglePhotosSyncTitleUpdate({
    binding: verified.value.binding,
    expectedOperationId: input.operationId,
    expectedSourceFingerprint: verified.value.preparedSource.sourceFingerprint,
  });
  if (!transition.ok) return { status: "staleBinding" };
  const checkpoint = await writePhaseCheckpoint(
    input,
    verified.value.binding,
    transition.binding,
    adapters,
  );
  if (!checkpoint.ok) return checkpoint.result;
  return finalizeStableBinding(
    input,
    snapshotFromCheckpoint(verified.value, checkpoint.value.binding, "finalizing"),
    adapters,
  );
}

async function finalizeStableBinding(
  input: SyncFinalizeInput,
  expected: FinalizeSnapshot,
  adapters: GooglePhotosSyncFinalizeAdapters,
): Promise<GooglePhotosSyncFinalizeResult> {
  input.onProgress?.({ phase: "verifying" });
  const fresh = await readFinalizeSnapshot(input, adapters, {
    expectedPhase: "finalizing",
    expectedSnapshot: expected,
  });
  if (!fresh.ok) return fresh.result;
  if (
    fresh.value.album.title !== fresh.value.binding.pending?.targetTitle ||
    !finalMembershipIsValid(fresh.value)
  ) {
    return { status: "finalizationRecoveryRequired" };
  }

  let completedAt: string;
  try {
    completedAt = (input.now?.() ?? new Date()).toISOString();
  } catch {
    return { status: "finalizationRecoveryRequired" };
  }
  const candidate = finalizeGooglePhotosSyncPending({
    binding: fresh.value.binding,
    expectedOperationId: input.operationId,
    expectedSourceFingerprint: fresh.value.preparedSource.sourceFingerprint,
    completedAt,
    rendererVersion: fresh.value.preparedSource.rendererVersion,
  });
  if (!candidate.ok) {
    return {
      status:
        candidate.reason === "generationOverflow"
          ? "generationOverflow"
          : "finalizationRecoveryRequired",
    };
  }

  input.onProgress?.({ phase: "finalizing" });
  const expectedGeneration = getGooglePhotosSyncExpectedStableGeneration(
    fresh.value.binding,
  );
  let writeResult: UpdateDrivePhotosSyncBindingResult;
  try {
    writeResult = await adapters.updateBinding({
      accessToken: input.driveAccessToken,
      projectRootFolderId: input.project.projectFolderId,
      workspaceId: input.workspaceId,
      projectId: input.selectedProjectId,
      expectedStableGeneration: expectedGeneration,
      binding: candidate.binding,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;
    writeResult = { status: "writeFailed" };
  }
  if (writeResult.status === "staleGeneration") {
    return { status: "staleBinding" };
  }

  const verified = await readBindingSafely(input, adapters);
  if (
    verified.status === "ready" &&
    verified.fileId === fresh.value.bindingFileId &&
    bindingsEqual(verified.binding, candidate.binding)
  ) {
    return { status: "completed" };
  }
  if (writeResult.status === "updated") {
    return { status: "checkpointConflict" };
  }
  if (writeResult.status === "invalid") {
    return { status: "finalizationRecoveryRequired" };
  }
  if (
    verified.status === "ready" &&
    verified.fileId === fresh.value.bindingFileId &&
    bindingsEqual(verified.binding, fresh.value.binding)
  ) {
    return { status: "finalizationWriteFailed" };
  }
  return {
    status:
      verified.status === "inaccessible"
        ? "finalizationWriteFailed"
        : "checkpointConflict",
  };
}

async function writePhaseCheckpoint(
  input: SyncFinalizeInput,
  previousBinding: GooglePhotosSyncBinding,
  nextBinding: GooglePhotosSyncBinding,
  adapters: GooglePhotosSyncFinalizeAdapters,
): Promise<
  | { ok: true; value: Extract<UpdateDrivePhotosSyncBindingResult, { status: "updated" }> }
  | { ok: false; result: GooglePhotosSyncFinalizeResult }
> {
  input.onProgress?.({ phase: "checkpointing" });
  throwIfAborted(input.signal);
  let result: UpdateDrivePhotosSyncBindingResult;
  try {
    result = await adapters.updateBinding({
      accessToken: input.driveAccessToken,
      projectRootFolderId: input.project.projectFolderId,
      workspaceId: input.workspaceId,
      projectId: input.selectedProjectId,
      expectedStableGeneration:
        getGooglePhotosSyncExpectedStableGeneration(previousBinding),
      binding: nextBinding,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;
    return { ok: false, result: { status: "checkpointWriteFailed" } };
  }
  if (result.status === "updated") return { ok: true, value: result };
  return {
    ok: false,
    result: {
      status:
        result.status === "staleGeneration"
          ? "staleBinding"
          : "checkpointWriteFailed",
    },
  };
}

async function readFinalizeSnapshot(
  input: SyncFinalizeInput,
  adapters: GooglePhotosSyncFinalizeAdapters,
  expected?: {
    expectedPhase: FinalizePhase;
    expectedSnapshot: FinalizeSnapshot;
  },
): Promise<SnapshotResult> {
  input.onProgress?.({ phase: "verifying" });
  throwIfAborted(input.signal);
  let sourceResult: PrepareGooglePhotosSyncSourceResult;
  try {
    sourceResult = await adapters.prepareSource({
      accessToken: input.driveAccessToken,
      selectedProjectId: input.selectedProjectId,
      workspaceId: input.workspaceId,
      projectsRootFolderId: input.projectsRootFolderId,
      project: input.project,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;
    return failSnapshot("sourcePreparationFailed");
  }
  if (!sourceResult.ok) return failSnapshot("sourcePreparationFailed");
  const preparedSource = sourceResult.source;

  const bindingResult = await readBindingSafely(input, adapters);
  if (bindingResult.status !== "ready") {
    return failSnapshot(mapBindingReadStatus(bindingResult.status));
  }
  const parsed = parseGooglePhotosSyncBinding(bindingResult.binding, {
    workspaceId: input.workspaceId,
    projectId: input.selectedProjectId,
  });
  if (!parsed.ok) return failSnapshot("bindingInvalid");
  const binding = parsed.value;
  const continuation = inspectGooglePhotosSyncPendingContinuation({
    binding,
    expectedOperationId: input.operationId,
    expectedSourceFingerprint: preparedSource.sourceFingerprint,
    expectedTargetTitle: preparedSource.targetAlbumTitle,
  });
  if (!continuation.ok) {
    return failSnapshot(
      continuation.reason === "sourceChanged"
        ? "sourceChanged"
        : expected
          ? "checkpointConflict"
          : "wrongPhase",
    );
  }
  if (!isFinalizePhase(continuation.phase) || binding.album === null) {
    return failSnapshot("wrongPhase");
  }
  if (expected) {
    if (continuation.phase !== expected.expectedPhase) {
      return failSnapshot("checkpointConflict");
    }
    if (
      bindingResult.fileId !== expected.expectedSnapshot.bindingFileId ||
      !bindingsEqual(binding, expected.expectedSnapshot.binding)
    ) {
      return failSnapshot("checkpointConflict");
    }
  }

  let albumResult: GooglePhotosSyncAlbumReadResult;
  try {
    albumResult = await adapters.getAlbum({
      accessToken: input.photosAccessToken,
      albumId: binding.album.albumId,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;
    return failSnapshot("photosReadFailed");
  }
  if (albumResult.status === "notFound") return failSnapshot("targetMissing");
  if (albumResult.status === "inaccessible") return failSnapshot("photosReadFailed");
  if (
    albumResult.status !== "ready" ||
    albumResult.album.id !== binding.album.albumId
  ) {
    return failSnapshot("photosInvalidResponse");
  }
  if (albumResult.album.isWriteable !== true) {
    return failSnapshot("targetNotWritable");
  }

  const membership = await readAllGooglePhotosSyncAlbumMediaItemIds(
    {
      accessToken: input.photosAccessToken,
      albumId: albumResult.album.id,
      signal: input.signal,
    },
    adapters.searchAlbumMediaItemsPage,
  );
  if (!membership.ok) return failSnapshot(membership.status);
  const pending = binding.pending;
  if (!pending || pending.targetItems.length === 0) {
    return failSnapshot("bindingInvalid");
  }
  return {
    ok: true,
    value: {
      preparedSource,
      bindingFileId: bindingResult.fileId,
      binding,
      album: albumResult.album,
      currentMediaItemIds: membership.mediaItemIds,
      phase: continuation.phase,
      targetIds: pending.targetItems.map((item) => item.mediaItemId),
      previousIds: [...pending.previousManagedMediaItemIds],
    },
  };
}

function finalMembershipIsValid(snapshot: FinalizeSnapshot) {
  const current = new Set(snapshot.currentMediaItemIds);
  const target = new Set(snapshot.targetIds);
  return (
    snapshot.targetIds.every((id) => current.has(id)) &&
    targetIdsAppearInRelativeOrder(
      snapshot.currentMediaItemIds,
      snapshot.targetIds,
    ) &&
    snapshot.previousIds.every((id) => target.has(id) || !current.has(id))
  );
}

async function readBindingSafely(
  input: SyncFinalizeInput,
  adapters: GooglePhotosSyncFinalizeAdapters,
): Promise<ReadDrivePhotosSyncBindingResult> {
  throwIfAborted(input.signal);
  try {
    const result = await adapters.readBinding({
      accessToken: input.driveAccessToken,
      projectRootFolderId: input.project.projectFolderId,
      workspaceId: input.workspaceId,
      projectId: input.selectedProjectId,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
    return result;
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;
    return { status: "inaccessible" };
  }
}

function snapshotFromCheckpoint(
  snapshot: FinalizeSnapshot,
  binding: GooglePhotosSyncBinding,
  phase: FinalizePhase,
): FinalizeSnapshot {
  return { ...snapshot, binding, phase };
}

function isFinalizePhase(phase: GooglePhotosSyncPendingPhase): phase is FinalizePhase {
  return phase === "titleUpdating" || phase === "finalizing";
}

function mapBindingReadStatus(status: ReadDrivePhotosSyncBindingResult["status"]) {
  if (status === "duplicate") return "bindingDuplicate" as const;
  if (status === "inaccessible") return "bindingInaccessible" as const;
  return "bindingInvalid" as const;
}

function failSnapshot(
  status:
    | "sourcePreparationFailed"
    | "sourceChanged"
    | "bindingInaccessible"
    | "bindingInvalid"
    | "bindingDuplicate"
    | "wrongPhase"
    | "targetMissing"
    | "targetNotWritable"
    | "photosReadFailed"
    | "photosInvalidResponse"
    | "paginationInvalid"
    | "paginationLimitExceeded"
    | "checkpointConflict",
): SnapshotResult {
  return { ok: false, result: { status } };
}

function bindingsEqual(left: GooglePhotosSyncBinding, right: GooglePhotosSyncBinding) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(error: unknown, signal: AbortSignal) {
  return signal.aborted || (error instanceof Error && error.name === "AbortError");
}
