import type { ProjectConsistency } from "./google-drive";

export const PROJECT_SUMMARY_STALE_REASON =
  "アルバムの一覧情報が同期されていないため、現在は更新操作を利用できません。";

export const PROJECT_SUMMARY_STALE_WARNING =
  "アルバムの内容は確認できますが、一覧情報が同期されていません。安全のため、現在は編集・公開・同期・削除などの更新操作を停止しています。";

export function getProjectConsistencyBlockedReason(
  consistency: ProjectConsistency | null,
): string | null {
  return consistency === "summaryStale" ? PROJECT_SUMMARY_STALE_REASON : null;
}
