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
  const diagnostics = sanitizeProjectDeleteDiagnostics(result.diagnostics);

  if (result.status === "completed") {
    return {
      status: "completed",
      message: "Google Drive上の作品を削除しました。",
      diagnostics,
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

  if (result.status === "partialFailure" && result.indexRemoved) {
    return {
      status: "partialFailure",
      message:
        "作品一覧からは削除されましたが、Google Drive上にデータが残っている可能性があります。",
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
      message: "作品の削除を中止しました。",
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
    message: "作品を削除できませんでした。",
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

export async function confirmProjectDeleteWorkflow(input: {
  plan: DriveProjectDeletePlan;
  currentOwner: DriveProjectDeleteOwner;
  execute?: typeof executeDriveProjectDeletion;
  executeInput: Omit<
    Parameters<typeof executeDriveProjectDeletion>[0],
    "plan" | "currentOwner"
  >;
  clearLocal: (
    projectId: string,
  ) => Promise<ClearLocalOfflineProjectDataResult>;
  isCurrent: () => boolean;
}): Promise<ConfirmProjectDeleteWorkflowResult> {
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
        localCopyStatus: "notAttempted",
        localCopyMessage: null,
        applyUi: input.isCurrent(),
      };
    }
    return {
      kind: "unexpectedError",
      interpretation: null,
      driveResult: null,
      localCopyStatus: "notAttempted",
      localCopyMessage: null,
      applyUi: input.isCurrent(),
    };
  }

  if (!input.isCurrent()) {
    return {
      kind: "stale",
      interpretation: interpretDriveProjectDeleteResult(driveResult),
      driveResult,
      localCopyStatus: "notAttempted",
      localCopyMessage: null,
      applyUi: false,
    };
  }

  const interpretation = interpretDriveProjectDeleteResult(driveResult);
  if (!interpretation.shouldClearLocal) {
    return {
      kind: "driveSettled",
      interpretation,
      driveResult,
      localCopyStatus: "notAttempted",
      localCopyMessage: null,
      applyUi: true,
    };
  }

  if (!input.isCurrent()) {
    return {
      kind: "stale",
      interpretation,
      driveResult,
      localCopyStatus: "notAttempted",
      localCopyMessage: null,
      applyUi: false,
    };
  }

  const localCopy = await finalizeProjectDeleteLocalCopy({
    projectId: input.plan.project.projectId,
    clearLocal: input.clearLocal,
  });

  return {
    kind: "driveSettled",
    interpretation: {
      ...interpretation,
      message: localCopy.message,
    },
    driveResult,
    localCopyStatus: localCopy.status,
    localCopyMessage: localCopy.message,
    applyUi: input.isCurrent(),
  };
}

export type ConfirmProjectDeleteWorkflowResult = {
  kind: "driveSettled" | "preWriteAuthError" | "unexpectedError" | "stale";
  interpretation: ProjectDeleteInterpretation | null;
  driveResult: DriveProjectDeleteResult | null;
  localCopyStatus: ProjectDeleteLocalCopyStatus;
  localCopyMessage: string | null;
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
