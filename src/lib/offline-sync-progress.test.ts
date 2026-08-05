import { describe, expect, it } from "vitest";
import {
  OFFLINE_SYNC_PROGRESS_PHASES,
  OFFLINE_SYNC_CANCELLED_MESSAGE,
  OFFLINE_SYNC_COMPLETED_MESSAGE,
  OFFLINE_SYNC_STALE_MANIFEST_MESSAGE,
  advanceOfflineSyncProgress,
  buildOfflineSyncProgressView,
  createOfflineSyncProgress,
  type OfflineSyncProgress,
} from "./offline-sync-progress";

describe("offline sync progress model", () => {
  it("advances through the defined phases in order", () => {
    let current: OfflineSyncProgress | null = null;
    for (const phase of OFFLINE_SYNC_PROGRESS_PHASES) {
      const candidate = createOfflineSyncProgress({
        phase,
        ...(phase === "preflight"
          ? {}
          : { processedAssetCount: phase === "completed" ? 12 : 0, totalAssetCount: 12 }),
      });
      current = advanceOfflineSyncProgress(current, candidate);
      expect(current?.phase).toBe(phase);
    }
  });

  it("ignores phase and processed-count regression", () => {
    const current = createOfflineSyncProgress({
      phase: "assetSaving",
      processedAssetCount: 3,
      totalAssetCount: 12,
    });
    expect(
      advanceOfflineSyncProgress(
        current,
        createOfflineSyncProgress({
          phase: "assetMetadata",
          processedAssetCount: 3,
          totalAssetCount: 12,
        }),
      ),
    ).toBe(current);
    expect(
      advanceOfflineSyncProgress(
        current,
        createOfflineSyncProgress({
          phase: "assetSaving",
          processedAssetCount: 2,
          totalAssetCount: 12,
        }),
      ),
    ).toBe(current);
  });

  it("defines percent only after total is known", () => {
    expect(createOfflineSyncProgress({ phase: "manifest" })).not.toHaveProperty(
      "percent",
    );
    expect(
      createOfflineSyncProgress({
        phase: "assetSaving",
        processedAssetCount: 3,
        totalAssetCount: 12,
      }),
    ).toMatchObject({ percent: 25, message: "素材を保存中 3 / 12" });
    expect(
      createOfflineSyncProgress({
        phase: "assetSaving",
        processedAssetCount: 12,
        totalAssetCount: 12,
      }).percent,
    ).toBe(100);
  });

  it("handles zero total without NaN or Infinity and completes at 100", () => {
    const pending = createOfflineSyncProgress({
      phase: "manifest",
      processedAssetCount: 0,
      totalAssetCount: 0,
    });
    const completed = createOfflineSyncProgress({
      phase: "completed",
      processedAssetCount: 0,
      totalAssetCount: 0,
    });
    expect(pending.percent).toBe(0);
    expect(completed.percent).toBe(100);
    expect(Number.isFinite(pending.percent)).toBe(true);
  });

  it("strips unrecognized values and preserves only fixed safe output", () => {
    const forbiddenValues = [
      "access-token-fixture",
      "drive-file-id-fixture",
      "drive-folder-id-fixture",
      "asset-id-fixture",
      "workspace-id-fixture",
      "project-id-fixture",
      "sync-run-id-fixture",
      "private-file-name.jpg",
      "image/jpeg",
      "https://example.invalid/private",
      "fnv1a64:1234567890abcdef",
      "checksum-fixture",
      "raw-error-fixture",
      "raw-diagnostics-fixture",
    ];
    const unsafe = {
      ...createOfflineSyncProgress({ phase: "preflight" }),
      message: forbiddenValues.join(" "),
      rawDiagnostics: forbiddenValues,
    };
    const result = advanceOfflineSyncProgress(
      null,
      unsafe as OfflineSyncProgress,
    );
    expect(result).toEqual({ phase: "preflight", message: "同期前確認中" });
    const serialized = JSON.stringify(result);
    for (const value of forbiddenValues) {
      expect(serialized).not.toContain(value);
    }
    expect(serialized).not.toContain("rawDiagnostics");
    expect(JSON.stringify(buildOfflineSyncProgressView(result))).toEqual(
      JSON.stringify({ message: "同期前確認中" }),
    );
  });

  it("defines the exact final user-facing messages", () => {
    expect(OFFLINE_SYNC_COMPLETED_MESSAGE).toBe("同期完了");
    expect(OFFLINE_SYNC_CANCELLED_MESSAGE).toBe("同期を中止しました");
    expect(OFFLINE_SYNC_STALE_MANIFEST_MESSAGE).toBe(
      "Drive上の内容が同期中に変更されました。再度同期してください",
    );
  });
});
