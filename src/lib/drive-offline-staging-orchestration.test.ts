import { afterEach, describe, expect, it, vi } from "vitest";
import type { OfflineSyncState } from "./offline-schema";

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

afterEach(() => {
  vi.clearAllMocks();
  mocks.readState.mockResolvedValue(undefined);
  mocks.restoreState.mockResolvedValue({ updated: true });
  mocks.markSyncing.mockResolvedValue({ updated: true });
  mocks.markFailed.mockResolvedValue({ updated: true });
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
