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
        "今回の結果はローカルの保存データへ反映していません。以前の保存データと状態を維持しています。自動再試行は行いません。最新内容を反映する場合は「ローカルに保存」を手動でもう一度実行してください。",
    };
  }

  if (status === "stale") {
    return {
      title: "今回の保存結果が古くなっています",
      message:
        "より新しい保存処理が優先されたため、今回の結果はローカルへ反映していません。",
      retentionMessage:
        "以前の保存データを維持しています。最新内容を反映する場合は「ローカルに保存」を手動でもう一度実行してください。",
    };
  }

  return {
    title: "今回の保存結果を反映していません",
    message: "今回の結果はローカルへ反映していません。",
    retentionMessage:
      "以前の保存データを維持しています。状態を確認し、「ローカルに保存」を手動でもう一度実行してください。",
  };
}
