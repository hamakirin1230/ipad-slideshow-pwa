export type UserFacingOperationFailure =
  | "offlineDbCheck"
  | "confirmedStoreCheck"
  | "localProjectClear"
  | "storageManagementCheck"
  | "appShellCacheClear"
  | "assetImport";

const operationFailureMessages: Record<UserFacingOperationFailure, string> = {
  offlineDbCheck:
    "この端末のオフライン再生用データベースを確認できませんでした。ブラウザの設定を確認して、もう一度お試しください。",
  confirmedStoreCheck:
    "この端末のオフライン再生用データを確認できませんでした。もう一度お試しください。",
  localProjectClear:
    "この端末の対象プロジェクトのオフライン再生用データを削除できませんでした。もう一度状態を確認してください。",
  storageManagementCheck:
    "この端末の保存容量を確認できませんでした。ブラウザの設定を確認して、もう一度お試しください。",
  appShellCacheClear:
    "アプリの一時データを削除できませんでした。もう一度状態を確認してください。",
  assetImport:
    "素材を追加できませんでした。接続状態を確認して、もう一度お試しください。",
};

const secretPatterns = [
  /\bBearer\s+[^\s,;]+/giu,
  /https?:\/\/[^\s)\]}]+/giu,
  /\b(?:projectId|revisionId|assetId|fileId|operationId|checksum|hash)\s*[:=]\s*[^\s,;]+/giu,
  /\b[A-Za-z0-9_-]{24,}\b/gu,
];

export function getUserFacingOperationFailureMessage(
  operation: UserFacingOperationFailure,
  error?: unknown,
): string {
  void error;
  return operationFailureMessages[operation];
}

export function sanitizeUserFacingDiagnostic(value: string): string {
  return secretPatterns.reduce(
    (sanitized, pattern) => sanitized.replace(pattern, "[内部情報は表示しません]"),
    value,
  );
}

export function buildLocalOfflineProjectClearConfirmation(project: {
  projectId: string;
  projectTitle?: string;
}): string {
  const projectLabel = project.projectTitle?.trim() || "名称未設定";

  return [
    "この端末に保存された対象プロジェクトのオフライン再生用データを削除します。",
    "",
    `対象プロジェクト: ${projectLabel}`,
    "",
    "削除対象:",
    "・再生用プロジェクト情報",
    "・素材情報",
    "・端末に保存した画像・動画",
    "・同期状態と一時データ",
    "",
    "Google Drive上のプロジェクトと素材は削除しません。",
    "削除後にこの作品を再生するには、「つくる」の「このiPad」から保存をもう一度実行してください。",
    "",
    "削除しますか？",
  ].join("\n");
}
