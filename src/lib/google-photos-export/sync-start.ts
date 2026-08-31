import type { DriveProjectSummary } from "../google-drive";
import {
  createDrivePhotosSyncBinding,
  readDrivePhotosSyncBinding,
  updateDrivePhotosSyncBindingBestEffort,
  type CreateDrivePhotosSyncBindingResult,
  type ReadDrivePhotosSyncBindingResult,
  type UpdateDrivePhotosSyncBindingResult,
} from "./drive-sync-binding";
import {
  createGooglePhotosAlbum,
  type GooglePhotosAlbumCreateResult,
} from "./library-api";
import {
  prepareGooglePhotosSyncReconciliation,
  type GooglePhotosSyncReconciliationResult,
} from "./sync-reconciliation";
import {
  beginGooglePhotosSyncPending,
  bindGooglePhotosSyncCreatedAlbum,
  getGooglePhotosSyncExpectedStableGeneration,
  inspectGooglePhotosSyncPendingContinuation,
} from "./sync-pending";
import {
  buildEmptyGooglePhotosSyncBinding,
  parseGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
} from "./sync-binding";
import {
  runWithGooglePhotosSyncWriteLock,
  type GooglePhotosSyncWriteLockResult,
} from "./sync-write-lock";
import type { GooglePhotosIncrementalSyncPlan } from "./sync-plan";
import type { GooglePhotosSyncPreparedSource } from "./sync-drive-source";

type StartInput = {
  driveAccessToken: string;
  photosAccessToken: string;
  selectedProjectId: string;
  workspaceId: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
  operationId: string;
  startedAt: string;
  signal: AbortSignal;
};

type ReconciliationBlockedReason = Exclude<
  GooglePhotosSyncReconciliationResult["status"],
  "initialSyncRequired" | "noChanges" | "ready"
>;

type ReadyReconciliation = Extract<
  GooglePhotosSyncReconciliationResult,
  { status: "noChanges" | "ready" }
> & { status: "ready" };

export type GooglePhotosSyncStartAdapters = {
  runWithLock: typeof runWithGooglePhotosSyncWriteLock;
  prepareReconciliation: typeof prepareGooglePhotosSyncReconciliation;
  readBinding: (
    input: Parameters<typeof readDrivePhotosSyncBinding>[0],
  ) => Promise<ReadDrivePhotosSyncBindingResult>;
  createBinding: (
    input: Parameters<typeof createDrivePhotosSyncBinding>[0],
  ) => Promise<CreateDrivePhotosSyncBindingResult>;
  updateBinding: (
    input: Parameters<typeof updateDrivePhotosSyncBindingBestEffort>[0],
  ) => Promise<UpdateDrivePhotosSyncBindingResult>;
  createAlbum: (
    input: Parameters<typeof createGooglePhotosAlbum>[0],
  ) => Promise<GooglePhotosAlbumCreateResult>;
  now: () => string;
};

export type GooglePhotosSyncStartResult =
  | { status: "locked" | "lockUnavailable" }
  | { status: "noChanges" }
  | { status: "reconciliationBlocked"; reason: ReconciliationBlockedReason }
  | { status: "invalidStartInput" }
  | { status: "staleBinding" }
  | { status: "checkpointWriteFailed" }
  | { status: "checkpointConflict" }
  | { status: "albumCreateFailed" }
  | { status: "albumCreateAmbiguous" }
  | { status: "albumCreatedCheckpointFailed" }
  | {
      status: "checkpointed";
      preparedSource: GooglePhotosSyncPreparedSource;
      plan?: GooglePhotosIncrementalSyncPlan;
      bindingFileId: string;
      binding: GooglePhotosSyncBinding;
    };

const defaultAdapters: GooglePhotosSyncStartAdapters = {
  runWithLock: runWithGooglePhotosSyncWriteLock,
  prepareReconciliation: prepareGooglePhotosSyncReconciliation,
  readBinding: readDrivePhotosSyncBinding,
  createBinding: createDrivePhotosSyncBinding,
  updateBinding: updateDrivePhotosSyncBindingBestEffort,
  createAlbum: createGooglePhotosAlbum,
  now: () => new Date().toISOString(),
};

export async function startGooglePhotosSyncAfterFreshReconciliation(
  input: StartInput,
  adapters: GooglePhotosSyncStartAdapters = defaultAdapters,
): Promise<GooglePhotosSyncStartResult> {
  throwIfAborted(input.signal);
  const locked: GooglePhotosSyncWriteLockResult<GooglePhotosSyncStartResult> =
    await adapters.runWithLock(
      { projectId: input.selectedProjectId },
      async () => runStartInsideLock(input, adapters),
    );
  if (!locked.acquired) return { status: locked.reason };
  return locked.value;
}

async function runStartInsideLock(
  input: StartInput,
  adapters: GooglePhotosSyncStartAdapters,
): Promise<GooglePhotosSyncStartResult> {
  throwIfAborted(input.signal);
  let reconciliation: GooglePhotosSyncReconciliationResult;
  try {
    reconciliation = await adapters.prepareReconciliation({
      driveAccessToken: input.driveAccessToken,
      photosAccessToken: input.photosAccessToken,
      selectedProjectId: input.selectedProjectId,
      workspaceId: input.workspaceId,
      projectsRootFolderId: input.projectsRootFolderId,
      project: input.project,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
  } catch (error) {
    rethrowAbort(error, input.signal);
    return {
      status: "reconciliationBlocked",
      reason: "sourcePreparationFailed",
    };
  }

  if (reconciliation.status === "noChanges") return { status: "noChanges" };
  if (
    reconciliation.status !== "ready" &&
    reconciliation.status !== "initialSyncRequired"
  ) {
    return { status: "reconciliationBlocked", reason: reconciliation.status };
  }
  if (reconciliation.status === "initialSyncRequired") {
    return checkpointInitialSync(input, reconciliation, adapters);
  }
  return checkpointExistingBoundSync(
    input,
    { ...reconciliation, status: "ready" },
    adapters,
  );
}

async function checkpointExistingBoundSync(
  input: StartInput,
  reconciliation: ReadyReconciliation,
  adapters: GooglePhotosSyncStartAdapters,
): Promise<GooglePhotosSyncStartResult> {
  const expectedGeneration = getGooglePhotosSyncExpectedStableGeneration(
    reconciliation.binding,
  );
  const pending = beginGooglePhotosSyncPending({
    binding: reconciliation.binding,
    operationId: input.operationId,
    startedAt: input.startedAt,
    sourceFingerprint: reconciliation.preparedSource.sourceFingerprint,
    targetTitle: reconciliation.preparedSource.targetAlbumTitle,
  });
  if (!pending.ok || pending.binding.pending?.phase !== "albumBound") {
    return { status: "invalidStartInput" };
  }

  // This fresh comparison plus the writer's generation check is best-effort;
  // it is not an atomic multi-device compare-and-swap.
  const fresh = await readFreshBinding(input, adapters);
  if (
    fresh.status !== "ready" ||
    !startSnapshotStillMatches(fresh, reconciliation)
  ) {
    return { status: "staleBinding" };
  }
  throwIfAborted(input.signal);
  const updated = await updateBindingSafely(
    input,
    pending.binding,
    expectedGeneration,
    adapters,
  );
  if (updated === null) return { status: "checkpointWriteFailed" };
  if (updated.status !== "updated") return mapUpdateFailure(updated);
  return {
    status: "checkpointed",
    preparedSource: reconciliation.preparedSource,
    plan: reconciliation.plan,
    bindingFileId: updated.fileId,
    binding: updated.binding,
  };
}

async function checkpointInitialSync(
  input: StartInput,
  reconciliation: Extract<
    GooglePhotosSyncReconciliationResult,
    { status: "initialSyncRequired" }
  >,
  adapters: GooglePhotosSyncStartAdapters,
): Promise<GooglePhotosSyncStartResult> {
  const initialBinding =
    reconciliation.binding ??
    buildEmptyGooglePhotosSyncBinding({
      workspaceId: input.workspaceId,
      projectId: input.selectedProjectId,
    });
  const pending = beginGooglePhotosSyncPending({
    binding: initialBinding,
    operationId: input.operationId,
    startedAt: input.startedAt,
    sourceFingerprint: reconciliation.preparedSource.sourceFingerprint,
    targetTitle: reconciliation.preparedSource.targetAlbumTitle,
  });
  if (!pending.ok || pending.binding.pending?.phase !== "creatingAlbum") {
    return { status: "invalidStartInput" };
  }

  let checkpoint: { fileId: string; binding: GooglePhotosSyncBinding };
  if (reconciliation.binding === null) {
    throwIfAborted(input.signal);
    const created = await createBindingSafely(input, pending.binding, adapters);
    if (created === null) return { status: "checkpointWriteFailed" };
    if (created.status !== "created") {
      return created.status === "alreadyExists"
        ? { status: "staleBinding" }
        : { status: "checkpointWriteFailed" };
    }
    checkpoint = { fileId: created.fileId, binding: created.binding };
  } else {
    const fresh = await readFreshBinding(input, adapters);
    if (
      fresh.status !== "ready" ||
      reconciliation.bindingFileId === null ||
      !startSnapshotStillMatches(fresh, {
        bindingFileId: reconciliation.bindingFileId,
        binding: reconciliation.binding,
      })
    ) {
      return { status: "staleBinding" };
    }
    throwIfAborted(input.signal);
    const updated = await updateBindingSafely(input, pending.binding, 0, adapters);
    if (updated === null) return { status: "checkpointWriteFailed" };
    if (updated.status !== "updated") return mapUpdateFailure(updated);
    checkpoint = { fileId: updated.fileId, binding: updated.binding };
  }

  const verifiedBeforeCreate = await readFreshBinding(input, adapters);
  if (
    !creatingAlbumCheckpointMatches(
      verifiedBeforeCreate,
      checkpoint.fileId,
      input,
      reconciliation.preparedSource,
    )
  ) {
    return { status: "checkpointConflict" };
  }

  throwIfAborted(input.signal);
  let albumResult: GooglePhotosAlbumCreateResult;
  try {
    albumResult = await adapters.createAlbum({
      accessToken: input.photosAccessToken,
      title: reconciliation.preparedSource.targetAlbumTitle,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
  } catch (error) {
    rethrowAbort(error, input.signal);
    return { status: "albumCreateAmbiguous" };
  }
  if (!albumResult.ok) return { status: "albumCreateFailed" };

  const verifiedAfterCreate = await readFreshBinding(input, adapters);
  if (
    !creatingAlbumCheckpointMatches(
      verifiedAfterCreate,
      checkpoint.fileId,
      input,
      reconciliation.preparedSource,
    )
  ) {
    return { status: "albumCreatedCheckpointFailed" };
  }
  let createdAt: string;
  try {
    createdAt = adapters.now();
  } catch {
    return { status: "albumCreatedCheckpointFailed" };
  }
  const bound = bindGooglePhotosSyncCreatedAlbum({
    binding: verifiedAfterCreate.binding,
    expectedOperationId: input.operationId,
    expectedSourceFingerprint: reconciliation.preparedSource.sourceFingerprint,
    albumId: albumResult.albumId,
    createdAt,
    lastKnownTitle: reconciliation.preparedSource.targetAlbumTitle,
  });
  if (!bound.ok) return { status: "albumCreatedCheckpointFailed" };

  throwIfAborted(input.signal);
  const updated = await updateBindingSafely(input, bound.binding, 0, adapters);
  if (updated === null) return { status: "albumCreatedCheckpointFailed" };
  if (updated.status !== "updated") {
    return { status: "albumCreatedCheckpointFailed" };
  }
  return {
    status: "checkpointed",
    preparedSource: reconciliation.preparedSource,
    bindingFileId: updated.fileId,
    binding: updated.binding,
  };
}

async function readFreshBinding(
  input: StartInput,
  adapters: GooglePhotosSyncStartAdapters,
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
    rethrowAbort(error, input.signal);
    return { status: "inaccessible" };
  }
}

async function createBindingSafely(
  input: StartInput,
  binding: GooglePhotosSyncBinding,
  adapters: GooglePhotosSyncStartAdapters,
): Promise<CreateDrivePhotosSyncBindingResult | null> {
  throwIfAborted(input.signal);
  try {
    const result = await adapters.createBinding({
      accessToken: input.driveAccessToken,
      projectRootFolderId: input.project.projectFolderId,
      workspaceId: input.workspaceId,
      projectId: input.selectedProjectId,
      binding,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
    return result;
  } catch (error) {
    rethrowAbort(error, input.signal);
    return null;
  }
}

async function updateBindingSafely(
  input: StartInput,
  binding: GooglePhotosSyncBinding,
  expectedStableGeneration: number,
  adapters: GooglePhotosSyncStartAdapters,
): Promise<UpdateDrivePhotosSyncBindingResult | null> {
  throwIfAborted(input.signal);
  try {
    const result = await adapters.updateBinding({
      accessToken: input.driveAccessToken,
      projectRootFolderId: input.project.projectFolderId,
      workspaceId: input.workspaceId,
      projectId: input.selectedProjectId,
      expectedStableGeneration,
      binding,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
    return result;
  } catch (error) {
    rethrowAbort(error, input.signal);
    return null;
  }
}

function startSnapshotStillMatches(
  fresh: Extract<ReadDrivePhotosSyncBindingResult, { status: "ready" }>,
  expected: { bindingFileId: string; binding: GooglePhotosSyncBinding },
): boolean {
  const parsed = parseGooglePhotosSyncBinding(fresh.binding, {
    workspaceId: expected.binding.workspaceId,
    projectId: expected.binding.projectId,
  });
  return (
    parsed.ok &&
    fresh.fileId === expected.bindingFileId &&
    parsed.value.workspaceId === expected.binding.workspaceId &&
    parsed.value.projectId === expected.binding.projectId &&
    parsed.value.pending === null &&
    equalJson(parsed.value.album, expected.binding.album) &&
    equalJson(parsed.value.stable, expected.binding.stable)
  );
}

function creatingAlbumCheckpointMatches(
  fresh: ReadDrivePhotosSyncBindingResult,
  expectedFileId: string,
  input: StartInput,
  source: GooglePhotosSyncPreparedSource,
): fresh is Extract<ReadDrivePhotosSyncBindingResult, { status: "ready" }> {
  if (fresh.status !== "ready" || fresh.fileId !== expectedFileId) return false;
  const parsed = parseGooglePhotosSyncBinding(fresh.binding, {
    workspaceId: input.workspaceId,
    projectId: input.selectedProjectId,
  });
  if (!parsed.ok) return false;
  const continuation = inspectGooglePhotosSyncPendingContinuation({
    binding: parsed.value,
    expectedOperationId: input.operationId,
    expectedSourceFingerprint: source.sourceFingerprint,
    expectedTargetTitle: source.targetAlbumTitle,
  });
  return (
    continuation.ok &&
    continuation.phase === "creatingAlbum" &&
    parsed.value.album === null &&
    parsed.value.stable === null
  );
}

function mapUpdateFailure(
  result: Exclude<UpdateDrivePhotosSyncBindingResult, { status: "updated" }>,
): GooglePhotosSyncStartResult {
  switch (result.status) {
    case "staleGeneration":
      return { status: "staleBinding" };
    case "invalid":
      return { status: "checkpointConflict" };
    case "writeFailed":
      return { status: "checkpointWriteFailed" };
  }
}

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

function rethrowAbort(error: unknown, signal: AbortSignal): void {
  if (signal.aborted) throwIfAborted(signal);
  if (error instanceof Error && error.name === "AbortError") throw error;
}
