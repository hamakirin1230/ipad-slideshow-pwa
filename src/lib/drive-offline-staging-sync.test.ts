import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runOrchestration: vi.fn(),
}));

vi.mock("./drive-offline-staging-orchestration", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./drive-offline-staging-orchestration")>();
  return {
    ...original,
    runDriveOfflineStagingPromotionOrchestration: mocks.runOrchestration,
  };
});

import { runDriveOfflineStagingSync } from "./drive-offline-staging-sync";
import { createOfflineSyncProgress } from "./offline-sync-progress";

describe("Drive offline staging sync progress facade", () => {
  it("forwards progress while returning only the lightweight summary", async () => {
    mocks.runOrchestration.mockImplementation(async ({ onProgress }) => {
      onProgress(createOfflineSyncProgress({ phase: "preflight" }));
      return {
        ok: false,
        syncRunId: "internal-run-id",
        reason: "stale-manifest",
        syncStateRestore: { updated: true },
      };
    });
    const onProgress = vi.fn();

    const result = await runDriveOfflineStagingSync({
      accessToken: "internal-token",
      readyContext: {
        workspaceId: "workspace-id",
        workspaceRootFolderId: "root-id",
        workspaceJsonFileId: "workspace-file-id",
        indexJsonFileId: "index-file-id",
        projectsRootFolderId: "projects-root-id",
        indexJsonText: "{}",
      },
      project: {
        projectId: "project-id",
        title: "Fixture",
        projectFolderId: "project-folder-id",
        manifestFileId: "manifest-file-id",
        assetsFolderId: "assets-folder-id",
        manifestPath: "manifest.json",
        createdAt: "2026-08-05T00:00:00.000Z",
        updatedAt: "2026-08-05T00:00:00.000Z",
      },
      signal: new AbortController().signal,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith({
      phase: "preflight",
      message: "同期前確認中",
    });
    expect(result).toMatchObject({ ok: false, status: "staleManifest" });
    expect(JSON.stringify(result)).not.toMatch(
      /internal-run-id|internal-token|workspace-id|project-id/i,
    );
  });
});
