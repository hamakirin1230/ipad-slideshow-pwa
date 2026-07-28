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
      "読み取り専用preview",
      "この画面ではDriveの内容を変更しません。",
      "previewを再確認",
      "previewを閉じる",
      "このpreviewは確認時点のsnapshotです。",
      "実行時には再度fresh",
      "remoteOnly",
      "公開後の未公開編集",
    ]) {
      expect(source).toContain(text);
    }
  });

  it("keeps fresh preflight and final commit as separate explicit stages", () => {
    for (const required of [
      "実行前の最新状態を再確認",
      "rollback最終確認",
      "この内容へロールバック",
      "過去revisionは変更せず、新しいrollback revisionを作成",
      "offline利用には別途offline syncが必要",
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
