import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runSync: vi.fn(),
}));

vi.mock("./drive-offline-staging-sync", () => ({
  runDriveOfflineStagingSync: mocks.runSync,
}));

import { createDriveOfflineStagingSyncRuntime } from "./drive-offline-staging-sync-runtime";
import { createOfflineSyncProgress } from "./offline-sync-progress";

function args(onProgress: (progress: ReturnType<typeof createOfflineSyncProgress>) => void) {
  return {
    accessToken: "token-not-forwarded-to-progress",
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
    timeoutMs: null,
    onProgress,
  };
}

function deferredResult() {
  let resolve!: (value: { ok: false; status: "stale" }) => void;
  const promise = new Promise<{ ok: false; status: "stale" }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("Drive offline staging sync runtime progress ownership", () => {
  it("forwards only monotonic sanitized progress", async () => {
    mocks.runSync.mockImplementation(async ({ onProgress }) => {
      onProgress(createOfflineSyncProgress({ phase: "preflight" }));
      onProgress(createOfflineSyncProgress({ phase: "manifest" }));
      onProgress(createOfflineSyncProgress({ phase: "preflight" }));
      onProgress(
        createOfflineSyncProgress({
          phase: "assetSaving",
          processedAssetCount: 3,
          totalAssetCount: 12,
        }),
      );
      onProgress(
        createOfflineSyncProgress({
          phase: "assetSaving",
          processedAssetCount: 2,
          totalAssetCount: 12,
        }),
      );
      return { ok: false, status: "stale" };
    });
    const onProgress = vi.fn();
    const runtime = createDriveOfflineStagingSyncRuntime();

    await runtime.run(args(onProgress));

    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { phase: "preflight", message: "同期前確認中" },
      { phase: "manifest", message: "manifestを確認中" },
      {
        phase: "assetSaving",
        processedAssetCount: 3,
        totalAssetCount: 12,
        percent: 25,
        message: "素材を保存中 3 / 12",
      },
    ]);
  });

  it("ignores delayed progress after cancel and from a superseded run", async () => {
    const first = deferredResult();
    const second = deferredResult();
    mocks.runSync
      .mockImplementationOnce(({ onProgress }) => {
        queueMicrotask(() =>
          onProgress(createOfflineSyncProgress({ phase: "manifest" })),
        );
        return first.promise;
      })
      .mockImplementationOnce(({ onProgress }) => {
        onProgress(createOfflineSyncProgress({ phase: "preflight" }));
        return second.promise;
      });
    const firstProgress = vi.fn();
    const secondProgress = vi.fn();
    const runtime = createDriveOfflineStagingSyncRuntime();

    const firstRun = runtime.run(args(firstProgress));
    runtime.cancelCurrentRun();
    const secondRun = runtime.run(args(secondProgress));
    await Promise.resolve();

    expect(firstProgress).not.toHaveBeenCalled();
    expect(secondProgress).toHaveBeenCalledTimes(1);
    first.resolve({ ok: false, status: "stale" });
    second.resolve({ ok: false, status: "stale" });
    await Promise.all([firstRun, secondRun]);
  });
});
