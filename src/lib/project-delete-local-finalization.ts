import type { ClearLocalOfflineProjectDataResult } from "@/lib/offline-local-project-clear";
import { clearLocalOfflineProjectData } from "@/lib/offline-local-project-clear";

export type ProjectDeleteLocalCopyStatus =
  | "notAttempted"
  | "cleared"
  | "absent"
  | "failed";

export const PROJECT_DELETE_LOCAL_COPY_MESSAGES = {
  cleared: "作品を削除しました。このiPadのコピーも削除しました。",
  absent: "作品を削除しました。このiPadには保存コピーがありませんでした。",
  failed:
    "作品は削除しましたが、このiPadのコピーを削除できませんでした。端末保存データから再度削除できます。",
} as const;

export function totalDeletedLocalOfflineRecords(
  result: ClearLocalOfflineProjectDataResult,
) {
  return (
    result.deletedProjects +
    result.deletedAssets +
    result.deletedAssetBlobs +
    result.deletedSyncStates +
    result.deletedStagingProjects +
    result.deletedStagingAssets +
    result.deletedStagingAssetBlobs
  );
}

export function projectDeleteLocalCopyStatusFromClearResult(
  result: ClearLocalOfflineProjectDataResult,
): Exclude<ProjectDeleteLocalCopyStatus, "notAttempted" | "failed"> {
  return totalDeletedLocalOfflineRecords(result) > 0 ? "cleared" : "absent";
}

export async function finalizeProjectDeleteLocalCopy(input: {
  projectId: string;
  clearLocal?: typeof clearLocalOfflineProjectData;
}): Promise<{
  status: Exclude<ProjectDeleteLocalCopyStatus, "notAttempted">;
  message: string;
}> {
  try {
    const clearLocal = input.clearLocal ?? clearLocalOfflineProjectData;
    const result = await clearLocal(input.projectId);
    const status = projectDeleteLocalCopyStatusFromClearResult(result);
    return {
      status,
      message: PROJECT_DELETE_LOCAL_COPY_MESSAGES[status],
    };
  } catch {
    return {
      status: "failed",
      message: PROJECT_DELETE_LOCAL_COPY_MESSAGES.failed,
    };
  }
}
