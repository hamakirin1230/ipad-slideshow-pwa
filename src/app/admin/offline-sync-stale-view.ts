import type { DriveOfflineStagingSyncRuntimeResult } from "@/lib/drive-offline-staging-sync-runtime";
import { OFFLINE_SYNC_STALE_MANIFEST_MESSAGE } from "@/lib/offline-sync-progress";

export type OfflineSyncStaleView = {
  title: string;
  message: string;
  retentionMessage: string;
};

export function buildOfflineSyncStaleView(
  status: DriveOfflineStagingSyncRuntimeResult["status"] | undefined,
): OfflineSyncStaleView {
  if (status === "staleManifest") {
    return {
      title: "Drive上の内容が変更されています",
      message: OFFLINE_SYNC_STALE_MANIFEST_MESSAGE,
      retentionMessage:
        "今回の結果はconfirmed storeへ反映していません。以前のconfirmed storeと以前のsync stateを維持しています。自動retryは行いません。最新内容を反映する場合はoffline syncを手動で再実行してください。",
    };
  }

  if (status === "stale") {
    return {
      title: "今回の同期結果が古くなっています",
      message:
        "より新しいsync runが優先されたため、今回の結果はconfirmed storeへ反映していません。",
      retentionMessage:
        "以前のconfirmed storeを維持しています。最新内容を反映する場合はoffline syncを手動で再実行してください。",
    };
  }

  return {
    title: "今回の同期結果を反映していません",
    message: "今回の結果はconfirmed storeへ反映していません。",
    retentionMessage:
      "以前のconfirmed storeを維持しています。状態を確認し、offline syncを手動で再実行してください。",
  };
}
