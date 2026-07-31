import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
  writeStaging: vi.fn(),
  promote: vi.fn(),
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
  markOfflineSyncing: mocks.markSyncing,
  markOfflineSyncFailed: mocks.markFailed,
}));

import {
  DriveOfflineStagingSnapshotError,
} from "./drive-offline-staging-snapshot";
import { runDriveOfflineStagingPromotionOrchestration } from "./drive-offline-staging-orchestration";

describe("Drive offline staging orchestration stale manifest", () => {
  it("does not write, promote, or auto-retry after staleManifest", async () => {
    mocks.fetchSnapshot.mockRejectedValue(
      new DriveOfflineStagingSnapshotError(
        ["current manifest changed"],
        { code: "staleManifest" },
      ),
    );
    const result = await runDriveOfflineStagingPromotionOrchestration({
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
        projectId: "22222222-2222-4222-8222-222222222222",
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
      syncedAt: "2026-07-31T01:00:00.000Z",
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "stale-manifest",
    });
    expect(mocks.fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.writeStaging).not.toHaveBeenCalled();
    expect(mocks.promote).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledTimes(1);
  });
});
