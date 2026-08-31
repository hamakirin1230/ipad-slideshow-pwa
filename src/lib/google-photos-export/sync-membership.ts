import type { DriveProjectSummary } from "../google-drive";
import {
  readDrivePhotosSyncBinding,
  updateDrivePhotosSyncBindingBestEffort,
  type ReadDrivePhotosSyncBindingResult,
  type UpdateDrivePhotosSyncBindingResult,
} from "./drive-sync-binding";
import { readAllGooglePhotosSyncAlbumMediaItemIds } from "./sync-reconciliation";
import {
  batchAddGooglePhotosSyncMediaItems,
  batchRemoveGooglePhotosSyncMediaItems,
  getGooglePhotosSyncAlbum,
  searchGooglePhotosSyncAlbumMediaItemsPage,
  type GooglePhotosMembershipMutationResult,
  type GooglePhotosSyncAlbum,
  type GooglePhotosSyncAlbumReadResult,
  type GooglePhotosSyncMediaItemPageResult,
} from "./sync-library-api";
import {
  completeGooglePhotosSyncMembership,
  getGooglePhotosSyncExpectedStableGeneration,
  inspectGooglePhotosSyncPendingContinuation,
  skipGooglePhotosSyncMembership,
  transitionGooglePhotosSyncToMembershipAdding,
  transitionGooglePhotosSyncToMembershipRemoving,
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

type SyncMembershipInput = {
  driveAccessToken: string;
  photosAccessToken: string;
  selectedProjectId: string;
  workspaceId: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
  operationId: string;
  signal: AbortSignal;
  onProgress?: (progress: GooglePhotosSyncMembershipProgress) => void;
};

export type GooglePhotosSyncMembershipProgress = {
  phase: "checkpointing" | "removing" | "adding" | "verifying";
  completedCount: number;
  totalCount: number;
};

export type GooglePhotosSyncMembershipResult =
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
        | "checkpointWriteFailed"
        | "checkpointConflict"
        | "membershipRecoveryRequired"
        | "membershipRemoveRecoveryRequired"
        | "membershipAddRecoveryRequired";
    }
  | {
      status: "membershipPrepared";
      nextPhase: "titleUpdating" | "finalizing";
    };

export type GooglePhotosSyncMembershipAdapters = {
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
  batchRemove: (
    input: Parameters<typeof batchRemoveGooglePhotosSyncMediaItems>[0],
  ) => Promise<GooglePhotosMembershipMutationResult>;
  batchAdd: (
    input: Parameters<typeof batchAddGooglePhotosSyncMediaItems>[0],
  ) => Promise<GooglePhotosMembershipMutationResult>;
};

const defaultAdapters: GooglePhotosSyncMembershipAdapters = {
  runWithLock: runWithGooglePhotosSyncWriteLock,
  prepareSource: (input) => prepareGooglePhotosSyncSourceWithAdapter(input),
  readBinding: readDrivePhotosSyncBinding,
  updateBinding: updateDrivePhotosSyncBindingBestEffort,
  getAlbum: getGooglePhotosSyncAlbum,
  searchAlbumMediaItemsPage: searchGooglePhotosSyncAlbumMediaItemsPage,
  batchRemove: batchRemoveGooglePhotosSyncMediaItems,
  batchAdd: batchAddGooglePhotosSyncMediaItems,
};

type AllowedMembershipPhase =
  | "mediaPrepared"
  | "membershipRemoving"
  | "membershipAdding";

type MembershipSnapshot = {
  preparedSource: GooglePhotosSyncPreparedSource;
  bindingFileId: string;
  binding: GooglePhotosSyncBinding;
  album: GooglePhotosSyncAlbum;
  currentMediaItemIds: string[];
  phase: AllowedMembershipPhase;
  previousIds: string[];
  targetIds: string[];
};

type SnapshotResult =
  | { ok: true; value: MembershipSnapshot }
  | { ok: false; result: GooglePhotosSyncMembershipResult };

export async function reconcileGooglePhotosSyncMembership(
  input: SyncMembershipInput,
  adapters: GooglePhotosSyncMembershipAdapters = defaultAdapters,
): Promise<GooglePhotosSyncMembershipResult> {
  throwIfAborted(input.signal);
  const locked: GooglePhotosSyncWriteLockResult<GooglePhotosSyncMembershipResult> =
    await adapters.runWithLock(
      { projectId: input.selectedProjectId },
      async () => runMembershipInsideLock(input, adapters),
    );
  if (!locked.acquired) return { status: locked.reason };
  return locked.value;
}

async function runMembershipInsideLock(
  input: SyncMembershipInput,
  adapters: GooglePhotosSyncMembershipAdapters,
): Promise<GooglePhotosSyncMembershipResult> {
  const initial = await readMembershipSnapshot(input, adapters);
  if (!initial.ok) return initial.result;
  switch (initial.value.phase) {
    case "mediaPrepared":
      return continueFromMediaPrepared(input, initial.value, adapters);
    case "membershipRemoving":
      return continueMembershipRemoving(input, initial.value, adapters);
    case "membershipAdding":
      return continueMembershipAdding(input, initial.value, adapters);
  }
}

async function continueFromMediaPrepared(
  input: SyncMembershipInput,
  snapshot: MembershipSnapshot,
  adapters: GooglePhotosSyncMembershipAdapters,
): Promise<GooglePhotosSyncMembershipResult> {
  const state = inspectMembershipState(snapshot);
  if (state.desiredComplete) {
    return finishMembership(input, snapshot, "mediaPrepared", adapters);
  }
  if (state.hasPartialNewTarget) {
    return { status: "membershipRecoveryRequired" };
  }

  const fresh = await readMembershipSnapshot(input, adapters, {
    expectedPhase: "mediaPrepared",
    expectedSnapshot: snapshot,
  });
  if (!fresh.ok) return fresh.result;
  const freshState = inspectMembershipState(fresh.value);
  if (freshState.desiredComplete) {
    return finishMembership(input, fresh.value, "mediaPrepared", adapters);
  }
  if (freshState.hasPartialNewTarget) {
    return { status: "membershipRecoveryRequired" };
  }

  const removing = transitionGooglePhotosSyncToMembershipRemoving({
    binding: fresh.value.binding,
    expectedOperationId: input.operationId,
    expectedSourceFingerprint: fresh.value.preparedSource.sourceFingerprint,
  });
  if (!removing.ok) return { status: "staleBinding" };
  const checkpoint = await writeCheckpoint(
    input,
    fresh.value.binding,
    removing.binding,
    adapters,
  );
  if (!checkpoint.ok) return checkpoint.result;
  return continueMembershipRemoving(
    input,
    snapshotFromCheckpoint(fresh.value, checkpoint.value.binding, "membershipRemoving"),
    adapters,
  );
}

async function continueMembershipRemoving(
  input: SyncMembershipInput,
  expected: MembershipSnapshot,
  adapters: GooglePhotosSyncMembershipAdapters,
): Promise<GooglePhotosSyncMembershipResult> {
  const fresh = await readMembershipSnapshot(input, adapters, {
    expectedPhase: "membershipRemoving",
    expectedSnapshot: expected,
  });
  if (!fresh.ok) return fresh.result;
  let snapshot = fresh.value;
  let state = inspectMembershipState(snapshot);
  if (state.hasPartialNewTarget) {
    return { status: "membershipRecoveryRequired" };
  }

  const current = new Set(snapshot.currentMediaItemIds);
  const removeIds = snapshot.previousIds.filter((id) => current.has(id));
  if (removeIds.length > 0) {
    input.onProgress?.({
      phase: "removing",
      completedCount: 0,
      totalCount: removeIds.length,
    });
    let removed: GooglePhotosMembershipMutationResult;
    try {
      removed = await adapters.batchRemove({
        accessToken: input.photosAccessToken,
        albumId: snapshot.album.id,
        mediaItemIds: removeIds,
        signal: input.signal,
      });
      throwIfAborted(input.signal);
    } catch (error) {
      if (isAbortError(error, input.signal)) throw error;
      return { status: "membershipRemoveRecoveryRequired" };
    }
    if (removed.status !== "completed") {
      return { status: "membershipRemoveRecoveryRequired" };
    }
  }

  input.onProgress?.({
    phase: "verifying",
    completedCount: removeIds.length,
    totalCount: removeIds.length,
  });
  const verified = await readMembershipSnapshot(input, adapters, {
    expectedPhase: "membershipRemoving",
    expectedSnapshot: snapshot,
  });
  if (!verified.ok) return verified.result;
  snapshot = verified.value;
  state = inspectMembershipState(snapshot);
  if (state.hasPartialNewTarget) {
    return { status: "membershipRecoveryRequired" };
  }
  if (snapshot.previousIds.some((id) => state.current.has(id))) {
    return { status: "membershipRemoveRecoveryRequired" };
  }
  if (state.presentTargetCount !== 0 && !state.desiredComplete) {
    return { status: "membershipRecoveryRequired" };
  }
  return checkpointMembershipAdding(input, snapshot, adapters);
}

async function checkpointMembershipAdding(
  input: SyncMembershipInput,
  snapshot: MembershipSnapshot,
  adapters: GooglePhotosSyncMembershipAdapters,
): Promise<GooglePhotosSyncMembershipResult> {
  const adding = transitionGooglePhotosSyncToMembershipAdding({
    binding: snapshot.binding,
    expectedOperationId: input.operationId,
    expectedSourceFingerprint: snapshot.preparedSource.sourceFingerprint,
  });
  if (!adding.ok) return { status: "staleBinding" };
  const checkpoint = await writeCheckpoint(
    input,
    snapshot.binding,
    adding.binding,
    adapters,
  );
  if (!checkpoint.ok) return checkpoint.result;
  return continueMembershipAdding(
    input,
    snapshotFromCheckpoint(snapshot, checkpoint.value.binding, "membershipAdding"),
    adapters,
  );
}

async function continueMembershipAdding(
  input: SyncMembershipInput,
  expected: MembershipSnapshot,
  adapters: GooglePhotosSyncMembershipAdapters,
): Promise<GooglePhotosSyncMembershipResult> {
  const fresh = await readMembershipSnapshot(input, adapters, {
    expectedPhase: "membershipAdding",
    expectedSnapshot: expected,
  });
  if (!fresh.ok) return fresh.result;
  let snapshot = fresh.value;
  let state = inspectMembershipState(snapshot);
  if (state.hasObsoletePrevious) {
    return { status: "membershipRecoveryRequired" };
  }
  if (state.desiredComplete) {
    return finishMembership(input, snapshot, "membershipAdding", adapters);
  }
  if (state.presentTargetCount !== 0) {
    return { status: "membershipAddRecoveryRequired" };
  }

  input.onProgress?.({
    phase: "adding",
    completedCount: 0,
    totalCount: snapshot.targetIds.length,
  });
  let added: GooglePhotosMembershipMutationResult;
  try {
    added = await adapters.batchAdd({
      accessToken: input.photosAccessToken,
      albumId: snapshot.album.id,
      mediaItemIds: [...snapshot.targetIds],
      signal: input.signal,
    });
    throwIfAborted(input.signal);
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;
    return { status: "membershipAddRecoveryRequired" };
  }
  if (added.status !== "completed") {
    return { status: "membershipAddRecoveryRequired" };
  }

  input.onProgress?.({
    phase: "verifying",
    completedCount: snapshot.targetIds.length,
    totalCount: snapshot.targetIds.length,
  });
  const verified = await readMembershipSnapshot(input, adapters, {
    expectedPhase: "membershipAdding",
    expectedSnapshot: snapshot,
  });
  if (!verified.ok) return verified.result;
  snapshot = verified.value;
  state = inspectMembershipState(snapshot);
  if (state.hasObsoletePrevious) {
    return { status: "membershipRecoveryRequired" };
  }
  if (!state.desiredComplete) {
    return { status: "membershipAddRecoveryRequired" };
  }
  return finishMembership(input, snapshot, "membershipAdding", adapters);
}

async function finishMembership(
  input: SyncMembershipInput,
  expected: MembershipSnapshot,
  phase: "mediaPrepared" | "membershipAdding",
  adapters: GooglePhotosSyncMembershipAdapters,
): Promise<GooglePhotosSyncMembershipResult> {
  const fresh = await readMembershipSnapshot(input, adapters, {
    expectedPhase: phase,
    expectedSnapshot: expected,
  });
  if (!fresh.ok) return fresh.result;
  const state = inspectMembershipState(fresh.value);
  if (!state.desiredComplete) {
    return {
      status:
        phase === "membershipAdding"
          ? "membershipAddRecoveryRequired"
          : "membershipRecoveryRequired",
    };
  }
  const titleNeedsUpdate = fresh.value.album.title !== fresh.value.binding.pending?.targetTitle;
  const transition =
    phase === "mediaPrepared"
      ? skipGooglePhotosSyncMembership({
          binding: fresh.value.binding,
          expectedOperationId: input.operationId,
          expectedSourceFingerprint: fresh.value.preparedSource.sourceFingerprint,
          titleNeedsUpdate,
        })
      : completeGooglePhotosSyncMembership({
          binding: fresh.value.binding,
          expectedOperationId: input.operationId,
          expectedSourceFingerprint: fresh.value.preparedSource.sourceFingerprint,
          titleNeedsUpdate,
        });
  if (!transition.ok) return { status: "staleBinding" };
  const checkpoint = await writeCheckpoint(
    input,
    fresh.value.binding,
    transition.binding,
    adapters,
  );
  if (!checkpoint.ok) return checkpoint.result;
  const nextPhase = checkpoint.value.binding.pending?.phase;
  if (nextPhase !== "titleUpdating" && nextPhase !== "finalizing") {
    return { status: "checkpointConflict" };
  }
  return { status: "membershipPrepared", nextPhase };
}

async function readMembershipSnapshot(
  input: SyncMembershipInput,
  adapters: GooglePhotosSyncMembershipAdapters,
  expected?: {
    expectedPhase: AllowedMembershipPhase;
    expectedSnapshot: MembershipSnapshot;
  },
): Promise<SnapshotResult> {
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
  if (!isAllowedMembershipPhase(continuation.phase) || binding.album === null) {
    return failSnapshot("wrongPhase");
  }
  if (expected) {
    if (continuation.phase !== expected.expectedPhase) {
      return failSnapshot("checkpointConflict");
    }
    if (
      bindingResult.fileId !== expected.expectedSnapshot.bindingFileId ||
      !membershipAuthorityEqual(binding, expected.expectedSnapshot.binding)
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
      previousIds: [...pending.previousManagedMediaItemIds],
      targetIds: pending.targetItems.map((item) => item.mediaItemId),
    },
  };
}

function inspectMembershipState(snapshot: MembershipSnapshot) {
  const current = new Set(snapshot.currentMediaItemIds);
  const previous = new Set(snapshot.previousIds);
  const target = new Set(snapshot.targetIds);
  const presentTargetCount = snapshot.targetIds.filter((id) => current.has(id)).length;
  const newTargetIds = snapshot.targetIds.filter((id) => !previous.has(id));
  const presentNewTargetCount = newTargetIds.filter((id) => current.has(id)).length;
  const desiredComplete =
    presentTargetCount === snapshot.targetIds.length &&
    targetIdsAppearInRelativeOrder(snapshot.currentMediaItemIds, snapshot.targetIds) &&
    snapshot.previousIds.every((id) => target.has(id) || !current.has(id));
  return {
    current,
    presentTargetCount,
    desiredComplete,
    hasPartialNewTarget: presentNewTargetCount > 0 && !desiredComplete,
    hasObsoletePrevious: snapshot.previousIds.some(
      (id) => !target.has(id) && current.has(id),
    ),
  };
}

export function targetIdsAppearInRelativeOrder(
  currentAlbumMediaItemIds: readonly string[],
  targetIds: readonly string[],
) {
  if (targetIds.length === 0 || new Set(targetIds).size !== targetIds.length) {
    return false;
  }
  let targetIndex = 0;
  for (const currentId of currentAlbumMediaItemIds) {
    if (currentId === targetIds[targetIndex]) targetIndex += 1;
    if (targetIndex === targetIds.length) return true;
  }
  return false;
}

async function writeCheckpoint(
  input: SyncMembershipInput,
  previousBinding: GooglePhotosSyncBinding,
  nextBinding: GooglePhotosSyncBinding,
  adapters: GooglePhotosSyncMembershipAdapters,
): Promise<
  | { ok: true; value: Extract<UpdateDrivePhotosSyncBindingResult, { status: "updated" }> }
  | { ok: false; result: GooglePhotosSyncMembershipResult }
> {
  input.onProgress?.({ phase: "checkpointing", completedCount: 0, totalCount: 0 });
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

async function readBindingSafely(
  input: SyncMembershipInput,
  adapters: GooglePhotosSyncMembershipAdapters,
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
  snapshot: MembershipSnapshot,
  binding: GooglePhotosSyncBinding,
  phase: AllowedMembershipPhase,
): MembershipSnapshot {
  return { ...snapshot, binding, phase };
}

function membershipAuthorityEqual(
  left: GooglePhotosSyncBinding,
  right: GooglePhotosSyncBinding,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isAllowedMembershipPhase(
  phase: GooglePhotosSyncPendingPhase,
): phase is AllowedMembershipPhase {
  return (
    phase === "mediaPrepared" ||
    phase === "membershipRemoving" ||
    phase === "membershipAdding"
  );
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

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(error: unknown, signal: AbortSignal) {
  return signal.aborted || (error instanceof Error && error.name === "AbortError");
}
