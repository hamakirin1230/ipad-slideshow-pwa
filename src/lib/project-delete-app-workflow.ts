import {
  executeDriveProjectDeletion,
  type DriveProjectDeleteOwner,
  type DriveProjectDeletePlan,
  type DriveProjectDeleteResult,
  type DriveProjectDeleteReview,
} from "@/lib/drive-project-delete";
import { isDriveAuthError } from "@/lib/google-drive";
import { sanitizeUserFacingDiagnostic } from "@/lib/user-facing-diagnostics";
import {
  finalizeProjectDeleteLocalCopy,
  type ProjectDeleteLocalCopyStatus,
} from "@/lib/project-delete-local-finalization";
import type { ClearLocalOfflineProjectDataResult } from "@/lib/offline-local-project-clear";

export type ProjectDeleteUiStatus =
  | "idle"
  | "checking"
  | "confirming"
  | "deleting"
  | "completed"
  | "partialFailure"
  | "blocked"
  | "error"
  | "cancelled";

export type ProjectDeletePublicResult = {
  status: DriveProjectDeleteResult["status"];
  indexRemoved: boolean;
  projectRootTrashed: boolean;
  authRequired: boolean;
};

export type ProjectDeleteInterpretation = {
  status: ProjectDeleteUiStatus;
  message: string;
  diagnostics: string[];
  publicResult: ProjectDeletePublicResult;
  shouldClearLocal: boolean;
  shouldRemoveDeletedProjectFromList: boolean;
  nextSelectedProjectId: string | null;
  keepCurrentSelection: boolean;
  shouldInvalidateGoogleAuth: boolean;
  shouldUpdateWorkspaceIndexText: boolean;
  shouldClearDeletedProjectReadyState: boolean;
};

export function isStrictDriveProjectDeleteCompleted(
  result: DriveProjectDeleteResult,
) {
  return (
    result.status === "completed" &&
    result.indexRemoved === true &&
    result.projectRootTrashed === true &&
    result.authRequired === false
  );
}

export function toProjectDeletePublicResult(
  result: DriveProjectDeleteResult,
): ProjectDeletePublicResult {
  return {
    status: result.status,
    indexRemoved: result.indexRemoved,
    projectRootTrashed: result.projectRootTrashed,
    authRequired: result.authRequired,
  };
}

export function interpretDriveProjectDeleteResult(
  result: DriveProjectDeleteResult,
): ProjectDeleteInterpretation {
  const publicResult = toProjectDeletePublicResult(result);

  if (result.status === "completed") {
    if (!isStrictDriveProjectDeleteCompleted(result)) {
      return {
        status: "error",
        message: "アルバムの削除結果を確定できませんでした。",
        diagnostics: sanitizeProjectDeleteDiagnostics([
          "アルバムの削除結果を確定できませんでした。ローカルコピーは変更していません。",
        ]),
        publicResult,
        shouldClearLocal: false,
        shouldRemoveDeletedProjectFromList: false,
        nextSelectedProjectId: null,
        keepCurrentSelection: true,
        shouldInvalidateGoogleAuth: false,
        shouldUpdateWorkspaceIndexText: false,
        shouldClearDeletedProjectReadyState: false,
      };
    }

    return {
      status: "completed",
      message: "Google Drive上のアルバムを削除しました。",
      diagnostics: sanitizeProjectDeleteDiagnostics(result.diagnostics),
      publicResult,
      shouldClearLocal: true,
      shouldRemoveDeletedProjectFromList: true,
      nextSelectedProjectId: null,
      keepCurrentSelection: false,
      shouldInvalidateGoogleAuth: false,
      shouldUpdateWorkspaceIndexText: true,
      shouldClearDeletedProjectReadyState: true,
    };
  }

  const diagnostics = sanitizeProjectDeleteDiagnostics(result.diagnostics);

  if (result.status === "partialFailure" && result.indexRemoved) {
    return {
      status: "partialFailure",
      message:
        "アルバム一覧からは削除されましたが、Google Drive上にデータが残っている可能性があります。",
      diagnostics,
      publicResult,
      shouldClearLocal: false,
      shouldRemoveDeletedProjectFromList: true,
      nextSelectedProjectId: null,
      keepCurrentSelection: false,
      shouldInvalidateGoogleAuth: result.authRequired,
      shouldUpdateWorkspaceIndexText: !result.authRequired,
      shouldClearDeletedProjectReadyState: true,
    };
  }

  if (result.status === "blocked") {
    return {
      status: "blocked",
      message: "アルバムの削除を中止しました。",
      diagnostics,
      publicResult,
      shouldClearLocal: false,
      shouldRemoveDeletedProjectFromList: false,
      nextSelectedProjectId: null,
      keepCurrentSelection: true,
      shouldInvalidateGoogleAuth: false,
      shouldUpdateWorkspaceIndexText: false,
      shouldClearDeletedProjectReadyState: false,
    };
  }

  return {
    status: "error",
    message: "アルバムを削除できませんでした。",
    diagnostics,
    publicResult,
    shouldClearLocal: false,
    shouldRemoveDeletedProjectFromList: false,
    nextSelectedProjectId: null,
    keepCurrentSelection: true,
    shouldInvalidateGoogleAuth: false,
    shouldUpdateWorkspaceIndexText: false,
    shouldClearDeletedProjectReadyState: false,
  };
}

export function removeDeletedProjectFromList<T extends { projectId: string }>(
  projects: T[],
  deletedProjectId: string,
) {
  return projects.filter((project) => project.projectId !== deletedProjectId);
}

export async function executeProjectDeleteDriveWorkflow(input: {
  plan: DriveProjectDeletePlan;
  currentOwner: DriveProjectDeleteOwner;
  execute?: typeof executeDriveProjectDeletion;
  executeInput: Omit<
    Parameters<typeof executeDriveProjectDeletion>[0],
    "plan" | "currentOwner"
  >;
  isCurrent: () => boolean;
}): Promise<ExecuteProjectDeleteDriveWorkflowResult> {
  const execute = input.execute ?? executeDriveProjectDeletion;
  let driveResult: DriveProjectDeleteResult;

  try {
    driveResult = await execute({
      plan: input.plan,
      currentOwner: input.currentOwner,
      ...input.executeInput,
    });
  } catch (error) {
    if (isDriveAuthError(error)) {
      return {
        kind: "preWriteAuthError",
        interpretation: null,
        driveResult: null,
        applyUi: input.isCurrent(),
      };
    }
    return {
      kind: "unexpectedError",
      interpretation: null,
      driveResult: null,
      applyUi: input.isCurrent(),
    };
  }

  if (!input.isCurrent()) {
    return {
      kind: "stale",
      interpretation: interpretDriveProjectDeleteResult(driveResult),
      driveResult,
      applyUi: false,
    };
  }

  return {
    kind: "driveSettled",
    interpretation: interpretDriveProjectDeleteResult(driveResult),
    driveResult,
    applyUi: true,
  };
}

export async function finalizeProjectDeleteLocalCopyAfterDriveState(input: {
  shouldClearLocal: boolean;
  projectId: string;
  applyDriveState: () => void;
  isCurrent: () => boolean;
  clearLocal: (
    projectId: string,
  ) => Promise<ClearLocalOfflineProjectDataResult>;
}): Promise<{
  localCopyStatus: ProjectDeleteLocalCopyStatus;
  localCopyMessage: string | null;
  applyLocalCopyUi: boolean;
}> {
  input.applyDriveState();

  if (!input.shouldClearLocal || !input.isCurrent()) {
    return {
      localCopyStatus: "notAttempted",
      localCopyMessage: null,
      applyLocalCopyUi: false,
    };
  }

  const localCopy = await finalizeProjectDeleteLocalCopy({
    projectId: input.projectId,
    clearLocal: input.clearLocal,
  });

  return {
    localCopyStatus: localCopy.status,
    localCopyMessage: localCopy.message,
    applyLocalCopyUi: input.isCurrent(),
  };
}

export function releaseOwnedProjectDeleteConfirmLocks(input: {
  ownedDriveRequestId: number;
  ownedDeleteRequestId: number;
  currentDriveRequestId: number;
  currentDeleteRequestId: number;
}) {
  return {
    releaseDriveLock: input.ownedDriveRequestId === input.currentDriveRequestId,
    releaseProjectDeleteLock:
      input.ownedDeleteRequestId === input.currentDeleteRequestId,
  };
}

export function shouldDiscardPendingProjectDeleteOnSelect(input: {
  driveOperationInFlight: boolean;
}) {
  return !input.driveOperationInFlight;
}

export function closePendingProjectDeleteConfirmation(input: {
  status: ProjectDeleteUiStatus;
}) {
  const isPendingConfirmation =
    input.status === "confirming" || input.status === "checking";

  return {
    shouldClearPendingPlan: true,
    shouldClearReview: true,
    shouldResetPendingUi: isPendingConfirmation,
    nextStatus: (isPendingConfirmation ? "idle" : input.status) as ProjectDeleteUiStatus,
    preserveSettledResult:
      input.status === "completed" || input.status === "partialFailure",
  };
}

export type ExecuteProjectDeleteDriveWorkflowResult = {
  kind: "driveSettled" | "preWriteAuthError" | "unexpectedError" | "stale";
  interpretation: ProjectDeleteInterpretation | null;
  driveResult: DriveProjectDeleteResult | null;
  applyUi: boolean;
};

export function sanitizeProjectDeleteDiagnostics(diagnostics: string[]) {
  return diagnostics.map((item) => sanitizeUserFacingDiagnostic(item));
}

export function isSanitizedProjectDeleteReview(
  review: DriveProjectDeleteReview,
) {
  return !("projectId" in review) && !("projectFolderId" in review);
}
