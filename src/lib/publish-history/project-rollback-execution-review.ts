import type { ProjectRollbackPreview } from "./project-rollback-preview";
import type { ProjectRollbackWritePlan } from "./project-rollback-write-plan";

export type ProjectRollbackExecutionReview = {
  projectId: string;
  targetRevisionId: string;
  targetPublishedAt: string;
  targetOperation: "publish" | "rollback";
  restoredFromRevisionId: string | null;
  previousRevisionId: string;
  revisionId: string;
  checkedAt: string;
  rollbackProjectTitle: string;
  rollbackSlideCount: number;
  rollbackAssetCount: number;
  rollbackRemoteOnlyAssetCount: number;
  replacesUnpublishedChanges: boolean;
  createsNewRollbackRevision: true;
  updatesCurrentManifest: true;
  updatesIndexMirror: true;
  offlineSyncRequired: true;
};

export type PrepareProjectRollbackExecutionReviewResult =
  | { ok: true; review: ProjectRollbackExecutionReview }
  | {
      ok: false;
      category: "stale" | "blocked" | "error";
      code: string;
      message: string;
    };

export type InternalProjectRollbackExecutionReviewResult =
  | {
      ok: true;
      review: ProjectRollbackExecutionReview;
      plan: ProjectRollbackWritePlan;
    }
  | Extract<PrepareProjectRollbackExecutionReviewResult, { ok: false }>;

export function buildProjectRollbackExecutionReview(input: {
  preview: ProjectRollbackPreview;
  plan: ProjectRollbackWritePlan;
}): ProjectRollbackExecutionReview {
  return {
    projectId: input.plan.projectId,
    targetRevisionId: input.plan.targetRevisionId,
    targetPublishedAt: input.preview.targetPublishedAt,
    targetOperation: input.preview.targetOperation,
    restoredFromRevisionId: input.preview.restoredFromRevisionId,
    previousRevisionId: input.plan.expectedCurrent.currentRevisionId,
    revisionId: input.plan.revisionFile.revisionId,
    checkedAt: input.plan.checkedAt,
    rollbackProjectTitle: input.plan.currentManifestUpdate.body.title,
    rollbackSlideCount: input.plan.currentManifestUpdate.body.slides.length,
    rollbackAssetCount: input.plan.revisionFile.body.assets.length,
    rollbackRemoteOnlyAssetCount:
      input.plan.revisionFile.body.summary.remoteOnlyAssetCount,
    replacesUnpublishedChanges: input.preview.replacesUnpublishedChanges,
    createsNewRollbackRevision: true,
    updatesCurrentManifest: true,
    updatesIndexMirror: true,
    offlineSyncRequired: true,
  };
}

export function createProjectRollbackExecutionReviewFailure(
  code: string,
  category: "stale" | "blocked" | "error" = "blocked",
): Extract<PrepareProjectRollbackExecutionReviewResult, { ok: false }> {
  const messages: Record<string, string> = {
    notReady:
      "rollback実行前確認の準備ができていません。previewをやり直してください。",
    previewNotReady:
      "readyのrollback previewだけが実行前確認へ進めます。",
    previewOwnerMismatch:
      "rollback previewの対象が現在の選択内容と一致しません。",
    stalePreview:
      "preview後にDriveの状態が変更されました。最新状態でpreviewをやり直してください。",
    invalidProjectLocation:
      "project、manifest、assets、historyの正式な配置を確認できませんでした。",
    invalidIndex: "index.jsonの対象projectを確認できませんでした。",
    invalidCurrent: "現在のmanifestとpublicationを確認できませんでした。",
    invalidTarget: "rollback対象revisionを確認できませんでした。",
    invalidAsset: "rollback対象assetの最新metadataを確認できませんでした。",
    noChange: "現在の内容とrollback後の内容が同じため実行できません。",
    aborted: "rollback実行前確認を中止しました。",
    driveReadFailed:
      "Google Driveからrollback実行前確認に必要な情報を読み込めませんでした。",
  };
  return {
    ok: false,
    category,
    code,
    message: messages[code] ?? "rollback実行前確認を完了できませんでした。",
  };
}
