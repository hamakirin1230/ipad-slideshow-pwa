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
});

describe("offline sync stale view", () => {
  it("explains staleManifest as a Drive manifest change", () => {
    const view = buildOfflineSyncStaleView("staleManifest");
    const serialized = JSON.stringify(view);

    expect(view.message).toBe(
      "Drive上の内容が同期中に変更されました。再度同期してください",
    );
    expect(view.retentionMessage).toContain(
      "今回の結果は端末保存データへ反映していません",
    );
    expect(view.retentionMessage).toContain(
      "以前の端末保存データと同期状態を維持しています",
    );
    expect(view.retentionMessage).toContain("自動再試行は行いません");
    expect(view.retentionMessage).toContain("手動で再実行してください");
    expect(serialized).not.toContain("新しい処理が優先された");
    expect(serialized).not.toContain("より新しいsync run");
  });

  it("explains stale sync runs as superseded by a newer run", () => {
    const view = buildOfflineSyncStaleView("stale");

    expect(view.message).toContain("より新しい同期処理が優先された");
    expect(view.message).toContain(
      "今回の結果は端末保存データへ反映していません",
    );
    expect(view.retentionMessage).toContain(
      "以前の端末保存データを維持しています",
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
