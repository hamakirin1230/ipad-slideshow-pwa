import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOfflineSyncStaleView } from "./offline-sync-stale-view";

const source = readFileSync(
  new URL("./offline-sync-panel.tsx", import.meta.url),
  "utf8",
);

describe("offline sync panel progress accessibility", () => {
  it("uses a polite status region for in-flight progress", () => {
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
  });

  it("renders percent only when the sanitized progress defines it", () => {
    expect(source).toContain(
      "progressView?.percent !== undefined",
    );
    expect(source).toContain("<progress");
  });

  it("selects the stale explanation from the last result status", () => {
    expect(source).toContain(
      "buildOfflineSyncStaleView(\n    offlineSyncLastResult?.status,",
    );
  });

  it("opens the selected project after a ready save", () => {
    expect(source).toContain("createPlayerProjectLinkHref(selectedProjectId)");
    expect(source).toContain("このアルバムを再生");
    expect(source).not.toContain('<Link href="/player">');
  });

  it("uses review before the exact local save action", () => {
    const reviewCall = source.indexOf("await prepareReview(controller.signal)");
    const actualSave = source.indexOf("startSync();", reviewCall);
    expect(reviewCall).toBeGreaterThan(-1);
    expect(actualSave).toBeGreaterThan(reviewCall);
    expect(source).toContain("変更内容");
    expect(source).toContain("ローカル保存内容に変更はありません。");
    expect(source).toContain("再ダウンロードなし");
    expect(source).toContain("オフライン対象外");
    expect(source).toContain("前回の詳細は表示できません。");
  });

  it("keeps concise local-save guidance in a disclosure", () => {
    expect(source).toContain("ローカル保存について");
    expect(source).toContain("保存完了までは現在のローカルコピーを維持します。");
    expect(source).toContain("変更のない素材は再利用します。");
    expect(source).toContain("公開やGoogleフォト同期とは別の操作です。");
  });
});

describe("offline sync stale view", () => {
  it("explains staleManifest as a Drive manifest change", () => {
    const view = buildOfflineSyncStaleView("staleManifest");
    const serialized = JSON.stringify(view);

    expect(view.message).toBe(
      "Drive上の内容が同期中に変更されました。再度同期してください",
    );
    expect(view.retentionMessage).toContain(
      "今回の結果はローカルの保存データへ反映していません",
    );
    expect(view.retentionMessage).toContain(
      "以前の保存データと状態を維持しています",
    );
    expect(view.retentionMessage).toContain("自動再試行は行いません");
    expect(view.retentionMessage).toContain("手動でもう一度実行してください");
    expect(serialized).not.toContain("新しい処理が優先された");
    expect(serialized).not.toContain("より新しいsync run");
  });

  it("explains stale sync runs as superseded by a newer run", () => {
    const view = buildOfflineSyncStaleView("stale");

    expect(view.message).toContain("より新しい保存処理が優先された");
    expect(view.message).toContain(
      "今回の結果はローカルへ反映していません",
    );
    expect(view.retentionMessage).toContain(
      "以前の保存データを維持しています",
    );
  });

  it.each(["staleManifest", "stale"] as const)(
    "does not expose identifiers or connection details for %s",
    (status) => {
      const serialized = JSON.stringify(buildOfflineSyncStaleView(status));
      const forbiddenValues = [
        "ya29.access-token-fixture",
        "drive-file-id-fixture",
        "workspace-id-fixture",
        "project-id-fixture",
        "sync-run-id-fixture",
        "https://drive.example.invalid/file",
        "sha256-fixture",
        "checksum-fixture",
      ];

      for (const value of forbiddenValues) {
        expect(serialized).not.toContain(value);
      }
      expect(serialized).not.toContain("appProperties");
      expect(serialized).not.toContain("raw metadata");
    },
  );
});
