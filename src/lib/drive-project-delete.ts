import { sanitizeUserFacingDiagnostic } from "@/lib/user-facing-diagnostics";
import {
  buildDriveProjectIndexJsonWithoutProject,
  driveProjectSummariesEqual,
  isDriveAuthError,
  verifyDriveProjectIndexAfterRemoval,
  type DriveFileCandidate,
  type DriveProjectDeleteBlockedReason,
  type DriveProjectDeletePreflightResult,
  type DriveProjectDeleteTrashResult,
  type DriveProjectSummary,
} from "@/lib/google-drive";

export type DriveProjectDeleteOwner = {
  workspaceId: string;
  indexJsonFileId: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
};

export type DriveProjectDeletePlan = {
  owner: DriveProjectDeleteOwner;
  project: DriveProjectSummary;
  remainingProjects: DriveProjectSummary[];
  indexJsonText: string;
  indexCreatedAt: string;
  indexUpdatedAt: string;
  indexFingerprint: string;
  projectRootFingerprint: string;
  manifestFingerprint: string;
  assetsFolderFingerprint: string;
};

export type DriveProjectDeleteReview = {
  projectTitle: string;
  remainingProjectCount: number;
};

export type PrepareDriveProjectDeleteResult =
  | {
      ok: true;
      plan: DriveProjectDeletePlan;
      review: DriveProjectDeleteReview;
    }
  | {
      ok: false;
      reason: "preflightMissing" | "preflightBlocked" | "ownerMismatch";
      blockedReason?: DriveProjectDeleteBlockedReason;
      diagnostics: string[];
    };

export type DriveProjectDeleteResult = {
  status: "completed" | "blocked" | "partialFailure" | "failed";
  blockedReason?: DriveProjectDeleteBlockedReason;
  indexRemoved: boolean;
  projectRootTrashed: boolean;
  authRequired: boolean;
  diagnostics: string[];
};

export function buildDriveProjectDeleteOwner(input: {
  workspaceId: string;
  indexJsonFileId: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
}): DriveProjectDeleteOwner {
  return {
    workspaceId: input.workspaceId,
    indexJsonFileId: input.indexJsonFileId,
    projectsRootFolderId: input.projectsRootFolderId,
    project: input.project,
  };
}

export function driveProjectDeleteOwnerMatches(
  expected: DriveProjectDeleteOwner,
  actual: DriveProjectDeleteOwner,
) {
  return (
    expected.workspaceId === actual.workspaceId &&
    expected.indexJsonFileId === actual.indexJsonFileId &&
    expected.projectsRootFolderId === actual.projectsRootFolderId &&
    driveProjectSummariesEqual(expected.project, actual.project)
  );
}

export function prepareDriveProjectDeletion(input: {
  preflightResult: DriveProjectDeletePreflightResult | null;
  currentOwner: DriveProjectDeleteOwner;
}): PrepareDriveProjectDeleteResult {
  const preflight = input.preflightResult;

  if (!preflight) {
    return {
      ok: false,
      reason: "preflightMissing",
      diagnostics: ["アルバム削除前の確認結果がありません。"],
    };
  }

  if (preflight.status === "blocked") {
    return {
      ok: false,
      reason: "preflightBlocked",
      blockedReason: preflight.reason,
      diagnostics: sanitizeDiagnostics(preflight.diagnostics),
    };
  }

  const preflightOwner = buildDriveProjectDeleteOwner(preflight);
  if (!driveProjectDeleteOwnerMatches(preflightOwner, input.currentOwner)) {
    return {
      ok: false,
      reason: "ownerMismatch",
      blockedReason: "ownerMismatch",
      diagnostics: ["選択中のアルバム情報が確認時と一致していません。"],
    };
  }

  return {
    ok: true,
    plan: {
      owner: input.currentOwner,
      project: preflight.project,
      remainingProjects: preflight.remainingProjects,
      indexJsonText: preflight.indexJsonText,
      indexCreatedAt: preflight.indexCreatedAt,
      indexUpdatedAt: preflight.indexUpdatedAt,
      indexFingerprint: preflight.indexFingerprint,
      projectRootFingerprint: preflight.projectRootFingerprint,
      manifestFingerprint: preflight.manifestFingerprint,
      assetsFolderFingerprint: preflight.assetsFolderFingerprint,
    },
    review: {
      projectTitle: preflight.project.title,
      remainingProjectCount: preflight.remainingProjects.length,
    },
  };
}

export async function executeDriveProjectDeletion(input: {
  plan: DriveProjectDeletePlan;
  currentOwner: DriveProjectDeleteOwner;
  now?: () => string;
  runFreshPreflight: () => Promise<DriveProjectDeletePreflightResult>;
  writeIndexJson: (indexJsonText: string) => Promise<void>;
  readIndexJson: () => Promise<string>;
  trashProjectRoot: () => Promise<DriveProjectDeleteTrashResult>;
  readProjectRootMetadata: () => Promise<DriveFileCandidate>;
  listActiveProjectRoots: () => Promise<DriveFileCandidate[]>;
}): Promise<DriveProjectDeleteResult> {
  if (!driveProjectDeleteOwnerMatches(input.plan.owner, input.currentOwner)) {
    return blockedResult("ownerMismatch", [
      "選択中のアルバム情報が削除計画と一致していません。",
    ]);
  }

  let executePreflight: DriveProjectDeletePreflightResult;
  try {
    executePreflight = await input.runFreshPreflight();
  } catch (error) {
    rethrowDriveAuthError(error);
    return failedResult("アルバム削除前の再確認に失敗しました。");
  }

  if (executePreflight.status === "blocked") {
    return blockedResult(executePreflight.reason, executePreflight.diagnostics);
  }

  if (!driveProjectDeletePlanMatchesFreshPreflight(input.plan, executePreflight)) {
    return blockedResult("planStale", [
      "確認後にGoogle Drive上のアルバム情報が変わったため、削除を中止しました。",
    ]);
  }

  const indexUpdatedAt = input.now?.() ?? new Date().toISOString();
  const nextIndex = buildDriveProjectIndexJsonWithoutProject({
    indexJsonText: executePreflight.indexJsonText,
    expectedWorkspaceId: input.plan.owner.workspaceId,
    removedProject: input.plan.project,
    expectedRemainingProjects: input.plan.remainingProjects,
    indexUpdatedAt,
  });

  if (nextIndex.status === "invalid") {
    return blockedResult("planStale", [
      "確認後にGoogle Drive上のアルバム一覧が変わったため、削除を中止しました。",
    ]);
  }

  try {
    await input.writeIndexJson(nextIndex.indexJsonText);
  } catch (error) {
    rethrowDriveAuthError(error);
    return failedResult("アルバム一覧の更新に失敗しました。");
  }

  let freshIndexJsonText: string;
  try {
    freshIndexJsonText = await input.readIndexJson();
  } catch (error) {
    rethrowDriveAuthError(error);
    return failedResult("アルバム一覧の再確認に失敗しました。");
  }

  const indexVerification = verifyDriveProjectIndexAfterRemoval({
    indexJsonText: freshIndexJsonText,
    expectedWorkspaceId: input.plan.owner.workspaceId,
    removedProjectId: input.plan.project.projectId,
    expectedRemainingProjects: input.plan.remainingProjects,
  });

  if (indexVerification.status === "invalid") {
    return failedResult("アルバム一覧の更新結果を確認できませんでした。");
  }

  try {
    await input.trashProjectRoot();
  } catch (error) {
    return postIndexFailureResult({
      error,
      message: "アルバムフォルダを削除状態にできませんでした。",
      projectRootTrashed: false,
    });
  }

  let projectRootTrashed = false;
  try {
    projectRootTrashed = await confirmProjectRootTrashed(
      input.readProjectRootMetadata,
    );
  } catch (error) {
    return postIndexFailureResult({
      error,
      message: "アルバムフォルダの削除状態を確認できませんでした。",
      projectRootTrashed: false,
    });
  }

  if (!projectRootTrashed) {
    return partialFailureResult({
      message: "アルバムフォルダの削除状態を確認できませんでした。",
      projectRootTrashed: false,
    });
  }

  let activeRoots: DriveFileCandidate[];
  try {
    activeRoots = await input.listActiveProjectRoots();
  } catch (error) {
    return postIndexFailureResult({
      error,
      message: "削除後のアルバムフォルダを確認できませんでした。",
      projectRootTrashed: true,
    });
  }

  if (activeRoots.length > 0) {
    return partialFailureResult({
      message: "削除後も有効なアルバムフォルダが残っています。",
      projectRootTrashed: true,
    });
  }

  return {
    status: "completed",
    indexRemoved: true,
    projectRootTrashed: true,
    authRequired: false,
    diagnostics: ["Google Drive上のアルバムを削除しました。"],
  };
}

function driveProjectDeletePlanMatchesFreshPreflight(
  plan: DriveProjectDeletePlan,
  preflight: Extract<DriveProjectDeletePreflightResult, { status: "ready" }>,
) {
  const freshOwner = buildDriveProjectDeleteOwner(preflight);
  return (
    driveProjectDeleteOwnerMatches(plan.owner, freshOwner) &&
    driveProjectSummariesEqual(plan.project, preflight.project) &&
    plan.indexFingerprint === preflight.indexFingerprint &&
    plan.projectRootFingerprint === preflight.projectRootFingerprint &&
    plan.manifestFingerprint === preflight.manifestFingerprint &&
    plan.assetsFolderFingerprint === preflight.assetsFolderFingerprint
  );
}

async function confirmProjectRootTrashed(
  readProjectRootMetadata: () => Promise<DriveFileCandidate>,
) {
  const metadata = await readProjectRootMetadata();
  return metadata.trashed === true;
}

function blockedResult(
  reason: DriveProjectDeleteBlockedReason,
  diagnostics: string[],
): DriveProjectDeleteResult {
  return {
    status: "blocked",
    blockedReason: reason,
    indexRemoved: false,
    projectRootTrashed: false,
    authRequired: false,
    diagnostics: sanitizeDiagnostics(diagnostics),
  };
}

function failedResult(message: string): DriveProjectDeleteResult {
  return {
    status: "failed",
    indexRemoved: false,
    projectRootTrashed: false,
    authRequired: false,
    diagnostics: sanitizeDiagnostics([message]),
  };
}

function partialFailureResult(input: {
  message: string;
  projectRootTrashed: boolean;
  authRequired?: boolean;
}): DriveProjectDeleteResult {
  return {
    status: "partialFailure",
    indexRemoved: true,
    projectRootTrashed: input.projectRootTrashed,
    authRequired: input.authRequired === true,
    diagnostics: sanitizeDiagnostics([
      input.message,
      "アルバム一覧からは削除されましたが、Google Drive上にデータが残っている可能性があります。",
    ]),
  };
}

function postIndexFailureResult(input: {
  error: unknown;
  message: string;
  projectRootTrashed: boolean;
}): DriveProjectDeleteResult {
  return partialFailureResult({
    message: input.message,
    projectRootTrashed: input.projectRootTrashed,
    authRequired: isDriveAuthError(input.error),
  });
}

function rethrowDriveAuthError(error: unknown): void {
  if (isDriveAuthError(error)) {
    throw error;
  }
}

function sanitizeDiagnostics(diagnostics: string[]) {
  return diagnostics.map((item) => sanitizeUserFacingDiagnostic(item));
}
