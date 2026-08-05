import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineSyncState } from "./offline-schema";
import { createOfflineSyncProgress } from "./offline-sync-progress";

const mocks = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
  writeStaging: vi.fn(),
  promote: vi.fn(),
  readState: vi.fn(),
  restoreState: vi.fn(async () => ({ updated: true as const })),
  markSyncing: vi.fn(async () => ({ updated: true as const })),
  markFailed: vi.fn(async () => ({ updated: true as const })),
}));

vi.mock("./drive-offline-staging-snapshot", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./drive-offline-staging-snapshot")>();
  return {
    ...original,
    fetchDriveOfflineStagingSnapshot: mocks.fetchSnapshot,
  };
});
vi.mock("./offline-staging-write", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./offline-staging-write")>();
  return {
    ...original,
    writeCompleteOfflineStagingSnapshot: mocks.writeStaging,
  };
});
vi.mock("./offline-staging-promotion-orchestration", () => ({
  promoteOfflineStagingForSyncRun: mocks.promote,
}));
vi.mock("./offline-sync-state", () => ({
  readOfflineSyncState: mocks.readState,
  restoreOfflineSyncStateAfterStaleManifest: mocks.restoreState,
  markOfflineSyncing: mocks.markSyncing,
  markOfflineSyncFailed: mocks.markFailed,
}));

import { DriveOfflineStagingSnapshotError } from "./drive-offline-staging-snapshot";
import { runDriveOfflineStagingPromotionOrchestration } from "./drive-offline-staging-orchestration";

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

const previousReadyState: OfflineSyncState = {
  schemaVersion: 1,
  projectId: PROJECT_ID,
  status: "ready",
  syncRunId: "previous-run",
  rootFolderId: "previous-root",
  workspaceFileId: "previous-workspace",
  indexFileId: "previous-index",
  manifestFileId: "previous-manifest",
  syncedAt: "2026-07-30T01:00:00.000Z",
  sourceUpdatedAt: "2026-07-30T00:59:00.000Z",
  slideCount: 2,
  assetCount: 2,
  lastErrorCode: "previous-warning",
  lastErrorMessage: "sanitized warning",
  lastFailedAt: "2026-07-29T01:00:00.000Z",
  sourceRevisionId: "source-revision",
  sourceETag: "source-etag",
  publicationProvenance: {
    status: "publishedMatch",
    checkedAt: "2026-07-30T01:00:00.000Z",
    currentPublishedRevisionId: "rev_20260730T010000000Z_ab12cd34",
    publishedAt: "2026-07-30T00:58:00.000Z",
    operation: "publish",
  },
};

function orchestrationArgs() {
  return {
    accessToken: "dummy-token",
    readyContext: {
      workspaceId: "11111111-1111-4111-8111-111111111111",
      workspaceRootFolderId: "dummy-root",
      workspaceJsonFileId: "dummy-workspace",
      indexJsonFileId: "dummy-index",
      projectsRootFolderId: "dummy-projects",
      indexJsonText: "{}",
    },
    project: {
      projectId: PROJECT_ID,
      title: "Fixture",
      projectFolderId: "dummy-project-folder",
      manifestFileId: "dummy-manifest",
      assetsFolderId: "dummy-assets",
      manifestPath: "manifest.json",
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    },
    signal: new AbortController().signal,
    syncRunId: "dummy-run",
    syncedAt: "2026-07-31T01:00:00.000Z" as const,
  };
}

function rejectSnapshotAsStaleManifest() {
  mocks.fetchSnapshot.mockRejectedValue(
    new DriveOfflineStagingSnapshotError(
      ["current manifest changed"],
      { code: "staleManifest" },
    ),
  );
}

function successfulSnapshot() {
  return {
    project: {
      schemaVersion: 1,
      projectId: PROJECT_ID,
      projectTitle: "Fixture",
      slides: [],
      sourceManifestFileId: "dummy-manifest",
      syncedAt: "2026-07-31T01:00:00.000Z",
      publicationProvenance: {
        status: "unpublished",
        checkedAt: "2026-07-31T01:00:00.000Z",
      },
    },
    assetPairs: [],
    assetsWithoutBlobs: [],
    details: {
      project: orchestrationArgs().project,
      slides: [],
      slideCount: 0,
      assetCount: 0,
      manifestSlideCount: 2,
    },
    diagnostics: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readState.mockResolvedValue(undefined);
  mocks.restoreState.mockResolvedValue({ updated: true });
  mocks.markSyncing.mockResolvedValue({ updated: true });
  mocks.markFailed.mockResolvedValue({ updated: true });
  mocks.writeStaging.mockResolvedValue({
    projectId: PROJECT_ID,
    syncRunId: "dummy-run",
    cleanup: {
      deletedProjects: 0,
      deletedAssets: 0,
      deletedAssetBlobs: 0,
    },
    writtenProjects: 1,
    writtenAssets: 0,
    writtenAssetBlobs: 0,
  });
  mocks.promote.mockResolvedValue({
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
  });
});

describe("Drive offline staging orchestration stale manifest", () => {
  it("restores the exact previous ready state without write, promotion, failure, or retry", async () => {
    mocks.readState.mockResolvedValue(previousReadyState);
    rejectSnapshotAsStaleManifest();

    const result = await runDriveOfflineStagingPromotionOrchestration(
      orchestrationArgs(),
    );

    expect(result).toEqual({
      ok: false,
      syncRunId: "dummy-run",
      reason: "stale-manifest",
      syncStateRestore: { updated: true },
    });
    expect(mocks.readState).toHaveBeenCalledBefore(mocks.markSyncing);
    expect(mocks.restoreState).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      syncRunId: "dummy-run",
      previousState: previousReadyState,
    });
    expect(mocks.fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.writeStaging).not.toHaveBeenCalled();
    expect(mocks.promote).not.toHaveBeenCalled();
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it("does not emit completed for staleManifest", async () => {
    const onProgress = vi.fn();
    rejectSnapshotAsStaleManifest();

    await runDriveOfflineStagingPromotionOrchestration({
      ...orchestrationArgs(),
      onProgress,
    });

    expect(onProgress.mock.calls.map(([progress]) => progress.phase)).toEqual([
      "preflight",
      "manifest",
    ]);
    expect(onProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({ phase: "completed" }),
    );
  });

  it("emits staging, promotion, and completed only on successful promotion", async () => {
    const onProgress = vi.fn();
    mocks.fetchSnapshot.mockImplementation(async ({ onProgress: emit }) => {
      emit(createOfflineSyncProgress({
        phase: "manifest",
        processedAssetCount: 0,
        totalAssetCount: 2,
      }));
      emit(createOfflineSyncProgress({
        phase: "publication",
        processedAssetCount: 0,
        totalAssetCount: 2,
      }));
      emit(createOfflineSyncProgress({
        phase: "assetMetadata",
        processedAssetCount: 0,
        totalAssetCount: 2,
      }));
      emit(createOfflineSyncProgress({
        phase: "assetSaving",
        processedAssetCount: 2,
        totalAssetCount: 2,
      }));
      return successfulSnapshot();
    });

    const result = await runDriveOfflineStagingPromotionOrchestration({
      ...orchestrationArgs(),
      onProgress,
    });

    expect(result.ok).toBe(true);
    expect(onProgress.mock.calls.map(([progress]) => progress.phase)).toEqual([
      "preflight",
      "manifest",
      "manifest",
      "publication",
      "assetMetadata",
      "assetSaving",
      "stagingValidation",
      "promotion",
      "completed",
    ]);
    expect(onProgress.mock.calls.at(-1)?.[0]).toMatchObject({
      message: "同期完了",
      processedAssetCount: 2,
      totalAssetCount: 2,
      percent: 100,
    });
  });

  it("removes the temporary syncing state when no previous state existed", async () => {
    mocks.readState.mockResolvedValue(undefined);
    rejectSnapshotAsStaleManifest();

    await runDriveOfflineStagingPromotionOrchestration(orchestrationArgs());

    expect(mocks.restoreState).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      syncRunId: "dummy-run",
      previousState: undefined,
    });
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it("returns stale-sync-run when a newer run owns the sync state", async () => {
    mocks.readState.mockResolvedValue(previousReadyState);
    mocks.restoreState.mockResolvedValue({
      updated: false,
      reason: "stale-sync-run",
    });
    rejectSnapshotAsStaleManifest();

    const result = await runDriveOfflineStagingPromotionOrchestration(
      orchestrationArgs(),
    );

    expect(result).toEqual({
      ok: false,
      syncRunId: "dummy-run",
      reason: "stale-sync-run",
    });
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it("does not report staleManifest success when restoration fails", async () => {
    mocks.readState.mockResolvedValue(previousReadyState);
    mocks.restoreState.mockRejectedValue(new Error("restore failed"));
    rejectSnapshotAsStaleManifest();

    await expect(
      runDriveOfflineStagingPromotionOrchestration(orchestrationArgs()),
    ).rejects.toThrow("restore failed");
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it("keeps the existing failed-state policy for unrelated failures", async () => {
    mocks.readState.mockResolvedValue(previousReadyState);
    mocks.fetchSnapshot.mockRejectedValue(new Error("ordinary fetch failure"));

    const result = await runDriveOfflineStagingPromotionOrchestration(
      orchestrationArgs(),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "drive-fetch-or-staging-write-failed",
    });
    expect(mocks.restoreState).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledTimes(1);
  });
});
