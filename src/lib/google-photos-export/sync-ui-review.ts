import type { DriveProjectSummary } from "../google-drive";
import {
  readDrivePhotosSyncBinding,
  type ReadDrivePhotosSyncBindingResult,
} from "./drive-sync-binding";
import { parseGooglePhotosSyncBinding } from "./sync-binding";
import {
  prepareGooglePhotosSyncSourceWithAdapter,
  type GooglePhotosSyncPreparedSource,
  type PrepareGooglePhotosSyncSourceResult,
} from "./sync-drive-source";
import { inspectGooglePhotosSyncPendingContinuation } from "./sync-pending";

export type GooglePhotosSyncUiReviewMode = "initial" | "update" | "continue";

export type GooglePhotosSyncUiReview = {
  mode: GooglePhotosSyncUiReviewMode;
  projectTitle: string;
  targetAlbumTitle: string;
  sourceSlideCount: number;
  syncPhotoCount: number;
  skippedVideoCount: number;
  totalBytes: number;
};

export type GooglePhotosSyncUiReviewFailureReason =
  | "sourcePreparationFailed"
  | "bindingDuplicate"
  | "bindingInvalid"
  | "bindingInaccessible"
  | "sourceChanged"
  | "manualRecoveryRequired";

export type GooglePhotosSyncUiReviewResult =
  | { ok: true; review: GooglePhotosSyncUiReview }
  | { ok: false; reason: GooglePhotosSyncUiReviewFailureReason };

export type GooglePhotosSyncUiReviewAdapters = {
  prepareSource: (
    input: Parameters<typeof prepareGooglePhotosSyncSourceWithAdapter>[0],
  ) => Promise<PrepareGooglePhotosSyncSourceResult>;
  readBinding: (
    input: Parameters<typeof readDrivePhotosSyncBinding>[0],
  ) => Promise<ReadDrivePhotosSyncBindingResult>;
};

const defaultAdapters: GooglePhotosSyncUiReviewAdapters = {
  prepareSource: prepareGooglePhotosSyncSourceWithAdapter,
  readBinding: readDrivePhotosSyncBinding,
};

const safeContinuationPhases = new Set([
  "albumBound",
  "mediaPrepared",
  "membershipRemoving",
  "membershipAdding",
  "titleUpdating",
  "finalizing",
]);

export async function prepareGooglePhotosSyncUiReviewInDrive(
  input: {
    accessToken: string;
    selectedProjectId: string;
    workspaceId: string;
    projectsRootFolderId: string;
    project: DriveProjectSummary;
    signal: AbortSignal;
  },
  adapters: GooglePhotosSyncUiReviewAdapters = defaultAdapters,
): Promise<GooglePhotosSyncUiReviewResult> {
  input.signal.throwIfAborted();
  let sourceResult: PrepareGooglePhotosSyncSourceResult;
  try {
    sourceResult = await adapters.prepareSource(input);
    input.signal.throwIfAborted();
  } catch (error) {
    rethrowAbort(error, input.signal);
    return { ok: false, reason: "sourcePreparationFailed" };
  }
  if (!sourceResult.ok) {
    return { ok: false, reason: "sourcePreparationFailed" };
  }
  const source = sourceResult.source;

  let bindingResult: ReadDrivePhotosSyncBindingResult;
  try {
    bindingResult = await adapters.readBinding({
      accessToken: input.accessToken,
      projectRootFolderId: input.project.projectFolderId,
      workspaceId: input.workspaceId,
      projectId: input.selectedProjectId,
      signal: input.signal,
    });
    input.signal.throwIfAborted();
  } catch (error) {
    rethrowAbort(error, input.signal);
    return { ok: false, reason: "bindingInaccessible" };
  }

  switch (bindingResult.status) {
    case "unbound":
      return success("initial", source);
    case "duplicate":
      return { ok: false, reason: "bindingDuplicate" };
    case "invalid":
      return { ok: false, reason: "bindingInvalid" };
    case "inaccessible":
      return { ok: false, reason: "bindingInaccessible" };
    case "ready":
      break;
  }

  const parsed = parseGooglePhotosSyncBinding(bindingResult.binding, {
    workspaceId: input.workspaceId,
    projectId: input.selectedProjectId,
  });
  if (!parsed.ok) {
    return { ok: false, reason: "bindingInvalid" };
  }
  const binding = parsed.value;

  if (binding.pending !== null) {
    const continuation = inspectGooglePhotosSyncPendingContinuation({
      binding,
      expectedOperationId: binding.pending.operationId,
      expectedSourceFingerprint: source.sourceFingerprint,
      expectedTargetTitle: source.targetAlbumTitle,
    });
    if (!continuation.ok) {
      return {
        ok: false,
        reason:
          continuation.reason === "sourceChanged"
            ? "sourceChanged"
            : "bindingInvalid",
      };
    }
    if (
      continuation.phase === "creatingAlbum" ||
      continuation.phase === "mediaCreating"
    ) {
      return { ok: false, reason: "manualRecoveryRequired" };
    }
    if (!safeContinuationPhases.has(continuation.phase)) {
      return { ok: false, reason: "bindingInvalid" };
    }
    return success("continue", source);
  }

  if (binding.album !== null) {
    return success("update", source);
  }
  if (binding.stable !== null) {
    return { ok: false, reason: "bindingInvalid" };
  }
  return success("initial", source);
}

function success(
  mode: GooglePhotosSyncUiReviewMode,
  source: GooglePhotosSyncPreparedSource,
): GooglePhotosSyncUiReviewResult {
  return {
    ok: true,
    review: {
      mode,
      projectTitle: source.projectTitle,
      targetAlbumTitle: source.targetAlbumTitle,
      sourceSlideCount: source.sourceSlideCount,
      syncPhotoCount: source.items.length,
      skippedVideoCount: source.skippedVideoCount,
      totalBytes: source.totalBytes,
    },
  };
}

function rethrowAbort(error: unknown, signal: AbortSignal) {
  if (signal.aborted) signal.throwIfAborted();
  if (error instanceof DOMException && error.name === "AbortError") throw error;
}
