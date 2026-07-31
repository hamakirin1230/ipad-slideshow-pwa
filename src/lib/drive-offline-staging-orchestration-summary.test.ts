import { describe, expect, it } from "vitest";
import { summarizeDriveOfflineStagingPromotionOrchestrationResult } from "./drive-offline-staging-orchestration-summary";

describe("Drive offline staging orchestration summary provenance", () => {
  it("returns only the sanitized provenance view on success", () => {
    const summary = summarizeDriveOfflineStagingPromotionOrchestrationResult({
      ok: true,
      syncRunId: "dummy-run",
      snapshot: {
        project: {
          schemaVersion: 1,
          projectId: "dummy-project",
          slides: [],
          sourceManifestFileId: "dummy-manifest",
          syncedAt: "2026-07-31T01:00:00.000Z",
          publicationProvenance: {
            status: "needsInspection",
            checkedAt: "2026-07-31T01:00:00.000Z",
            needsInspectionReason: "historyUnavailable",
          },
        },
        assetPairs: [],
        assetsWithoutBlobs: [],
        details: {
          project: {
            projectId: "dummy-project",
            title: "Fixture",
            projectFolderId: "dummy-folder",
            manifestFileId: "dummy-manifest",
            assetsFolderId: "dummy-assets",
            manifestPath: "manifest.json",
            createdAt: "2026-07-30T00:00:00.000Z",
            updatedAt: "2026-07-31T00:00:00.000Z",
          },
          slides: [],
          slideCount: 0,
          assetCount: 0,
        },
        diagnostics: [],
      },
      stagingWrite: {
        projectId: "dummy-project",
        syncRunId: "dummy-run",
        cleanup: {
          deletedProjects: 0,
          deletedAssets: 0,
          deletedAssetBlobs: 0,
        },
        writtenProjects: 1,
        writtenAssets: 0,
        writtenAssetBlobs: 0,
      },
      promotion: {
        ok: true,
        promotion: {
          promotedProjects: 1,
          promotedAssets: 0,
          promotedAssetBlobs: 0,
          deletedObsoleteAssets: 0,
          deletedObsoleteAssetBlobs: 0,
        },
        cleanup: {
          deletedProjects: 1,
          deletedAssets: 0,
          deletedAssetBlobs: 0,
        },
        syncStateUpdate: { updated: true },
      },
    });
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.publicationProvenance).toMatchObject({
      status: "needsInspection",
      warning: true,
      needsInspectionReason: "historyUnavailable",
    });
    expect(JSON.stringify(summary.publicationProvenance)).not.toMatch(
      /dummy-manifest|dummy-folder|fnv1a64|checksum|token|raw/i,
    );
  });

  it("summarizes staleManifest without compared values", () => {
    const summary = summarizeDriveOfflineStagingPromotionOrchestrationResult({
      ok: false,
      syncRunId: "dummy-run",
      reason: "stale-manifest",
      syncStateRestore: { updated: true },
    });
    expect(summary).toEqual({
      ok: false,
      status: "staleManifest",
      diagnostics: [
        "asset取得中にcurrent manifestが変更されました。",
        "confirmed storeは変更していません。手動でoffline syncを再実行してください。",
      ],
      omittedDiagnosticCount: 0,
      syncStateUpdated: true,
    });
    expect(JSON.stringify(summary)).not.toMatch(
      /dummy-run|fnv1a64|dummy-manifest|modifiedTime.*2026/i,
    );
  });
});
