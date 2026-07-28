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

  it("does not add rollback execution or confirmation controls", () => {
    for (const forbidden of [
      "ロールバックを実行",
      "この内容へ戻す",
      "rollback実行button",
      "実行確認checkbox",
    ]) {
      expect(source).not.toContain(forbidden);
    }
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
});
