import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL(
    "../../app/admin/history/publish-history-client.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("/admin/history rollback preview UI contract", () => {
  it("shows an explicit read-only preview flow and snapshot guidance", () => {
    for (const text of [
      "ロールバック影響を確認",
      "読み取り専用の影響確認",
      "この画面ではDriveの内容を変更しません。",
      "影響を再確認",
      "影響確認を閉じる",
      "この結果は確認時点の状態です。",
      "実行時には最新状態をもう一度確認し",
      "remoteOnly",
      "公開後の未公開編集",
    ]) {
      expect(source).toContain(text);
    }
  });

  it("keeps fresh preflight and final commit as separate explicit stages", () => {
    for (const required of [
      "実行前の最新状態を再確認",
      "ロールバック最終確認",
      "この内容へロールバック",
      "過去の公開版は変更せず、復元内容から新しいロールバック版を作成",
      "Google Driveの公開版と公開URLが更新され、このiPadへの保存は別途必要",
      "保存済みの未公開編集",
    ]) {
      expect(source).toContain(required);
    }
    expect(source.indexOf("実行前の最新状態を再確認")).toBeLessThan(
      source.indexOf("この内容へロールバック"),
    );
  });

  it("keeps loading, blocking and race protections explicit", () => {
    for (const marker of [
      '"loading"',
      '"ready"',
      '"degraded"',
      '"blocked"',
      '"noChange"',
      '"stale"',
      '"error"',
      "AbortController",
      "previewSequenceRef",
      "previewOwnerRef",
      "previewInFlightRef",
      "rollbackActionInFlightRef",
      'role={isFailure ? "alert" : "status"}',
      'aria-live="polite"',
      "min-h-11",
    ]) {
      expect(source).toContain(marker);
    }
  });

  it("keeps an unresolved index warning after public activation retry", () => {
    expect(source).toContain("indexStatus: result.result.indexStatus");
    expect(source).toContain(
      'const indexWarning = rollbackOutcome?.indexStatus === "warning"',
    );
    expect(source).toContain('kind: indexWarning ? "warning" : "success"');
  });

  it("does not describe non-current revisions as safe or orphan", () => {
    expect(source).not.toContain("安全なrollback対象");
    expect(source).not.toContain("過去の正式公開版");
    expect(source).not.toContain("orphan revision");
  });

  it("does not render internal rollback execution data", () => {
    for (const forbidden of [
      "operationId",
      "contentCanonicalHash",
      "targetRevisionCanonicalHash",
      "targetRevisionCanonicalBody",
      "accessToken",
      "Authorization",
      "Bearer",
      "checksum:",
      "projectRollbackPreviewGuardRef",
      "pendingProjectRollbackRef",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
