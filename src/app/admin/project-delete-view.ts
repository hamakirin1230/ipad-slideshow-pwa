import type { ProjectDeleteStatus } from "@/app/app-providers";
import type { ProjectDeleteLocalCopyStatus } from "@/lib/project-delete-local-finalization";
import { PROJECT_DELETE_LOCAL_COPY_MESSAGES } from "@/lib/project-delete-local-finalization";
import { sanitizeUserFacingDiagnostic } from "@/lib/user-facing-diagnostics";

export const PROJECT_DELETE_BUTTON_LABEL = "アルバムを削除";
export const PROJECT_DELETE_CHECKING_LABEL = "削除対象を確認中";
export const PROJECT_DELETE_DELETING_LABEL = "アルバムを削除中";
export const PROJECT_DELETE_DIALOG_TITLE = "アルバムを削除しますか？";
export const PROJECT_DELETE_DIALOG_CONFIRM_LABEL = "アルバムを削除";

export type ProjectDeleteViewTone = "success" | "warning" | "error" | "notice";

export type ProjectDeleteViewState = {
  visible: boolean;
  tone: ProjectDeleteViewTone;
  liveRole: "status" | "alert";
  title: string;
  body: string[];
};

export function getProjectDeleteButtonLabel(status: ProjectDeleteStatus) {
  if (status === "checking") {
    return PROJECT_DELETE_CHECKING_LABEL;
  }

  if (status === "deleting") {
    return PROJECT_DELETE_DELETING_LABEL;
  }

  return PROJECT_DELETE_BUTTON_LABEL;
}

export function canStartProjectDeletion(input: {
  hasSelectedProject: boolean;
  blockedReason: string | null;
  status: ProjectDeleteStatus;
  isProjectDeleteInFlight: boolean;
}) {
  return (
    input.hasSelectedProject &&
    input.blockedReason === null &&
    !input.isProjectDeleteInFlight &&
    input.status !== "checking" &&
    input.status !== "confirming" &&
    input.status !== "deleting"
  );
}

export function buildProjectDeleteConfirmationDescription(projectTitle: string) {
  return [
    `『${projectTitle}』を削除します。`,
    "",
    "Google Drive上のアルバムデータ（スライド、素材、公開履歴）を削除します。",
    "ローカルコピーがある場合も、Google Driveの削除が完了した後に削除します。",
    "Googleフォトへ書き出した写真は削除されません。",
    "この操作はアプリから元に戻せません。",
  ].join("\n");
}

export function getProjectDeleteViewState(input: {
  status: ProjectDeleteStatus;
  localCopyStatus: ProjectDeleteLocalCopyStatus;
  message: string | null;
  diagnostics: string[];
}): ProjectDeleteViewState | null {
  const diagnostics = input.diagnostics.map((item) =>
    sanitizeUserFacingDiagnostic(item),
  );
  const message = input.message
    ? sanitizeUserFacingDiagnostic(input.message)
    : null;

  if (input.status === "completed" && input.localCopyStatus === "cleared") {
    return {
      visible: true,
      tone: "success",
      liveRole: "status",
      title: PROJECT_DELETE_LOCAL_COPY_MESSAGES.cleared,
      body: [],
    };
  }

  if (input.status === "completed" && input.localCopyStatus === "absent") {
    return {
      visible: true,
      tone: "success",
      liveRole: "status",
      title: PROJECT_DELETE_LOCAL_COPY_MESSAGES.absent,
      body: [],
    };
  }

  if (input.status === "completed" && input.localCopyStatus === "failed") {
    return {
      visible: true,
      tone: "warning",
      liveRole: "alert",
      title: PROJECT_DELETE_LOCAL_COPY_MESSAGES.failed,
      body: [
        "Google Drive上のアルバムは削除済みです。端末保存データから、ローカルコピーを再度削除できます。",
      ],
    };
  }

  if (input.status === "partialFailure") {
    return {
      visible: true,
      tone: "warning",
      liveRole: "alert",
      title:
        message ??
        "アルバム一覧からは削除されましたが、Google Drive上にデータが残っている可能性があります。",
      body: [
        "ローカルコピーは削除していません。",
        "自動では再試行しません。",
        ...diagnostics,
      ],
    };
  }

  if (input.status === "blocked") {
    return {
      visible: true,
      tone: "notice",
      liveRole: "status",
      title: message ?? "アルバムの削除を中止しました。",
      body: diagnostics,
    };
  }

  if (input.status === "error") {
    return {
      visible: true,
      tone: "error",
      liveRole: "alert",
      title: message ?? "アルバムを削除できませんでした。",
      body: diagnostics,
    };
  }

  if (input.status === "cancelled") {
    return {
      visible: true,
      tone: "notice",
      liveRole: "status",
      title: message ?? "アルバムの削除をキャンセルしました。",
      body: [],
    };
  }

  if (input.status === "checking" || input.status === "deleting") {
    return {
      visible: true,
      tone: "notice",
      liveRole: "status",
      title: message ?? getProjectDeleteButtonLabel(input.status),
      body: [],
    };
  }

  return null;
}

export function getProjectDeleteViewClassName(tone: ProjectDeleteViewTone) {
  if (tone === "success") {
    return "rounded-xl border border-emerald-400/25 bg-emerald-400/8 p-4 text-emerald-100";
  }

  if (tone === "warning") {
    return "rounded-xl border border-amber-400/25 bg-amber-400/8 p-4 text-amber-100";
  }

  if (tone === "error") {
    return "rounded-xl border border-red-400/25 bg-red-400/8 p-4 text-red-100";
  }

  return "rounded-xl border border-white/10 bg-white/[0.035] p-4 text-slate-300";
}

export function shouldAutoCheckProject(input: {
  driveStatus: string;
  projectStatus: string;
  isDriveOperationInFlight: boolean;
}) {
  return (
    input.driveStatus === "ready" &&
    input.projectStatus === "idle" &&
    !input.isDriveOperationInFlight
  );
}
