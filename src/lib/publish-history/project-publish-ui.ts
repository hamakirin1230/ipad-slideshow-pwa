import type {
  ProjectPublishPreflightIssue,
  ProjectPublishPreflightSummary,
} from "./project-publish-preflight";
import type { ProjectPublishWorkflowResult } from "./project-publish-workflow";

export type ProjectPublishWarning = {
  code: string;
  message: string;
};

export const PROJECT_PUBLISH_ASSET_DIAGNOSTIC_CODES = [
  "assetFileIdMismatch",
  "assetMimeTypeMismatch",
  "assetParentCountMismatch",
  "assetParentMismatch",
  "assetAppMismatch",
  "assetRoleMismatch",
  "assetSchemaVersionMismatch",
  "assetWorkspaceMismatch",
  "assetProjectMismatch",
  "assetIdMismatch",
  "assetFileReferenceMismatch",
  "assetSizeMismatch",
  "assetMediaTypeMismatch",
] as const;

export type ProjectPublishAssetDiagnosticCode =
  (typeof PROJECT_PUBLISH_ASSET_DIAGNOSTIC_CODES)[number];

export type ProjectPublishReview = {
  projectId: string;
  projectTitle: string;
  revisionId: string;
  publishedAt: string;
  initialPublish: boolean;
  previousRevisionId: string | null;
  slideCount: number;
  assetCount: number;
  remoteOnlyAssetCount: number;
  warnings: ProjectPublishWarning[];
};

export type PrepareProjectPublishReviewResult =
  | { ok: true; review: ProjectPublishReview }
  | {
      ok: false;
      code: string;
      message: string;
      diagnosticCode?: ProjectPublishAssetDiagnosticCode;
    };

export type SanitizedPublishSuccess = {
  revisionId: string;
  publishedAt: string;
  revisionStatus: "created" | "alreadyPrepared";
  manifestStatus: "committed" | "alreadyCommitted";
  refreshStatus: "refreshed" | "refreshFailed";
  refreshMessage: string | null;
};

export type SanitizedPublishError = {
  code: string;
  message: string;
  recoverability: "retryable" | "conflict" | "requiresInspection";
  canRetry: boolean;
};

export type CommitPreparedProjectPublishResult =
  | { ok: true; result: SanitizedPublishSuccess }
  | { ok: false; error: SanitizedPublishError };

export type PendingProjectPublishOwner = {
  projectId: string;
  revisionId: string;
  requestSequence: number;
};

export type PublishPlanDisposition =
  | "retain"
  | "discard";

export const PROJECT_PUBLISH_DRIVE_SUCCESS_MESSAGE =
  "Google Drive上の公開版を更新しました。";
export const PROJECT_PUBLISH_OFFLINE_SYNC_MESSAGE =
  "このiPadへ反映するには「このiPadに保存」を実行してください。";

export function buildProjectPublishReview(input: {
  projectId: string;
  projectTitle: string;
  publishedAt: string;
  summary: ProjectPublishPreflightSummary;
  warnings: readonly ProjectPublishPreflightIssue[];
}): ProjectPublishReview {
  return {
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    revisionId: input.summary.revisionId,
    publishedAt: input.publishedAt,
    initialPublish: input.summary.initialPublish,
    previousRevisionId: input.summary.previousRevisionId,
    slideCount: input.summary.slideCount,
    assetCount: input.summary.assetCount,
    remoteOnlyAssetCount: input.summary.remoteOnlyAssetCount,
    warnings: input.warnings.map(mapPublishPreflightIssue),
  };
}

export function mapPublishPreflightIssue(
  issue: Pick<ProjectPublishPreflightIssue, "code" | "message">,
): ProjectPublishWarning {
  return {
    code: issue.code,
    message: issue.message,
  };
}

export function createPrepareReviewFailure(input?: {
  code?: string;
  message?: string;
  diagnosticCode?: ProjectPublishAssetDiagnosticCode;
}): Extract<PrepareProjectPublishReviewResult, { ok: false }> {
  return {
    ok: false,
    code: input?.code ?? "preflightFailed",
    message:
      input?.message ??
      "公開前確認を完了できませんでした。現在のデータを再読込してから、もう一度確認してください。",
    ...(input?.diagnosticCode
      ? { diagnosticCode: input.diagnosticCode }
      : {}),
  };
}

export function getProjectPublishAssetDiagnosticCode(
  value: string,
): ProjectPublishAssetDiagnosticCode | undefined {
  return PROJECT_PUBLISH_ASSET_DIAGNOSTIC_CODES.find(
    (code) => code === value,
  );
}

export function getProjectPublishAssetDiagnosticLabel(
  code: ProjectPublishAssetDiagnosticCode,
): string {
  const labels: Record<ProjectPublishAssetDiagnosticCode, string> = {
    assetFileIdMismatch: "素材ファイル参照不一致",
    assetMimeTypeMismatch: "素材形式不一致",
    assetParentCountMismatch: "保存場所の件数不一致",
    assetParentMismatch: "保存場所不一致",
    assetAppMismatch: "アプリ管理情報不一致",
    assetRoleMismatch: "素材の管理種別不一致",
    assetSchemaVersionMismatch: "保存形式のバージョン不一致",
    assetWorkspaceMismatch: "Drive保存領域の情報不一致",
    assetProjectMismatch: "プロジェクト情報不一致",
    assetIdMismatch: "素材情報不一致",
    assetFileReferenceMismatch: "プロジェクト設定の素材参照不一致",
    assetSizeMismatch: "ファイルサイズ不一致",
    assetMediaTypeMismatch: "画像・動画分類不一致",
  };
  return labels[code];
}

export function mapPublishWorkflowError(
  result: Extract<ProjectPublishWorkflowResult, { ok: false }>,
): SanitizedPublishError {
  const messages = {
    retryable:
      "公開処理を完了できませんでした。同じ公開内容で再試行できます。",
    conflict:
      "公開前確認後にGoogle Drive上の内容が変更されました。公開前確認をやり直してください。",
    requiresInspection:
      "公開履歴または現在の公開版が部分的に更新された可能性があります。自動修復は行いません。公開履歴を確認してください。",
  } as const;

  return {
    code: result.code,
    message: messages[result.recoverability],
    recoverability: result.recoverability,
    canRetry: result.recoverability === "retryable",
  };
}

export function getProjectPublishFailureDisplayMessage(input: {
  phase: "preflight" | "publish";
  error: {
    message?: string;
    recoverability?: SanitizedPublishError["recoverability"];
  };
}): string {
  if (input.phase === "preflight") {
    return "公開前確認を完了できませんでした。現在の状態を再確認して、もう一度お試しください。";
  }

  switch (input.error.recoverability) {
    case "retryable":
      return "公開処理を完了できませんでした。同じ公開内容で再試行できます。";
    case "conflict":
      return "公開前確認後にGoogle Drive上の内容が変更されました。公開前確認をやり直してください。";
    case "requiresInspection":
      return "公開履歴または現在の公開版が部分的に更新された可能性があります。公開履歴を確認してください。";
    default:
      return "公開処理を完了できませんでした。現在の状態を確認してください。";
  }
}

export function shouldDiscardPendingPlan(
  reason:
    | "projectChanged"
    | "googleDisconnected"
    | "workspaceChanged"
    | "cancelled"
    | "newReview"
    | "success"
    | "retryable"
    | "conflict"
    | "requiresInspection"
    | "aborted",
): PublishPlanDisposition {
  return reason === "retryable" || reason === "aborted"
    ? "retain"
    : "discard";
}

export function pendingProjectPublishOwnerMatches(
  owner: PendingProjectPublishOwner | null,
  expected: Pick<PendingProjectPublishOwner, "projectId" | "revisionId">,
): boolean {
  return (
    owner !== null &&
    owner.projectId === expected.projectId &&
    owner.revisionId === expected.revisionId
  );
}

export function isCurrentProjectPublishRequest(
  owner: PendingProjectPublishOwner,
  input: {
    requestSequence: number;
    selectedProjectId: string | null;
  },
): boolean {
  return (
    owner.requestSequence === input.requestSequence &&
    owner.projectId === input.selectedProjectId
  );
}

export function createRandomHexSuffix(
  byteLength = 4,
  cryptoSource: Pick<Crypto, "getRandomValues"> = crypto,
): string {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) {
    throw new TypeError("byteLength must be a positive integer");
  }
  const bytes = new Uint8Array(byteLength);
  cryptoSource.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getProjectPublishModeLabel(review: ProjectPublishReview) {
  return review.initialPublish ? "初回公開" : "更新公開";
}

export function getRevisionPreparationLabel(
  status: SanitizedPublishSuccess["revisionStatus"],
) {
  return status === "created"
    ? "新しい履歴を作成しました。"
    : "既存の同一履歴を確認しました。";
}

export function getManifestCommitLabel(
  status: SanitizedPublishSuccess["manifestStatus"],
) {
  return status === "committed"
    ? "Google Drive上の公開版を更新しました。"
    : "Google Drive上の同一公開版を確認しました。";
}

export function buildSanitizedPublishSuccess(input: {
  workflow: Extract<ProjectPublishWorkflowResult, { ok: true }>;
  publishedAt: string;
  refreshed: boolean;
}): SanitizedPublishSuccess {
  return {
    revisionId: input.workflow.revisionId,
    publishedAt: input.publishedAt,
    revisionStatus: input.workflow.revisionStatus,
    manifestStatus: input.workflow.manifestStatus,
    refreshStatus: input.refreshed ? "refreshed" : "refreshFailed",
    refreshMessage: input.refreshed
      ? null
      : "公開は完了しましたが、画面の最新状態を再取得できませんでした。画面を再読込してください。",
  };
}
