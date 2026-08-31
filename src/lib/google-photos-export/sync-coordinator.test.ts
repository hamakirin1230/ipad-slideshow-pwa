import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DriveProjectSummary } from "../google-drive";
import {
  runGooglePhotosSameAlbumSync,
  type GooglePhotosSameAlbumSyncCoordinatorAdapters,
  type GooglePhotosSameAlbumSyncCoordinatorInput,
} from "./sync-coordinator";
import type { GooglePhotosSyncReconciliationResult } from "./sync-reconciliation";
import type { GooglePhotosSyncBinding, GooglePhotosSyncPendingPhase } from "./sync-binding";
import { buildEmptyGooglePhotosSyncBinding } from "./sync-binding";
import type { GooglePhotosSyncPreparedSource } from "./sync-drive-source";
import type { GooglePhotosSyncMediaRuntime } from "./sync-media";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "operation-1";
const STARTED_AT = "2026-08-31T04:00:00.000Z";
const FINGERPRINT = `sha256:${"a".repeat(64)}`;

const PROJECT: DriveProjectSummary = {
  projectId: PROJECT_ID,
  title: "夏の作品",
  projectFolderId: "project-root",
  manifestFileId: "manifest-file",
  assetsFolderId: "assets-folder",
  manifestPath: "projects/project/manifest.json",
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-31T00:00:00.000Z",
};

function input(
  overrides: Partial<GooglePhotosSameAlbumSyncCoordinatorInput> = {},
): GooglePhotosSameAlbumSyncCoordinatorInput {
  return {
    driveAccessToken: "private-drive-token",
    photosAccessToken: "private-photos-token",
    selectedProjectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    projectsRootFolderId: "projects-root",
    project: PROJECT,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function preparedSource(): GooglePhotosSyncPreparedSource {
  return {
    projectId: PROJECT_ID,
    projectTitle: PROJECT.title,
    targetAlbumTitle: PROJECT.title,
    sourceSlideCount: 0,
    skippedVideoCount: 0,
    totalBytes: 0,
    rendererVersion: 1,
    items: [],
    desiredSlides: [],
    sourceFingerprint: FINGERPRINT,
  };
}

function pendingBinding(phase: GooglePhotosSyncPendingPhase): GooglePhotosSyncBinding {
  return {
    ...buildEmptyGooglePhotosSyncBinding({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    }),
    album:
      phase === "creatingAlbum"
        ? null
        : {
            albumId: "private-album-id",
            createdAt: "2026-08-30T01:00:00.000Z",
            lastKnownTitle: PROJECT.title,
          },
    pending: {
      operationId: OPERATION_ID,
      startedAt: STARTED_AT,
      phase,
      sourceFingerprint: FINGERPRINT,
      targetTitle: PROJECT.title,
      previousManagedMediaItemIds: [],
      targetItems: [],
    },
  };
}

function continuation(
  phase: GooglePhotosSyncPendingPhase,
): GooglePhotosSyncReconciliationResult {
  return {
    status: "continuationRequired",
    preparedSource: preparedSource(),
    bindingFileId: "private-binding-file-id",
    binding: pendingBinding(phase),
  };
}

function makeAdapters(
  overrides: Partial<GooglePhotosSameAlbumSyncCoordinatorAdapters> = {},
): GooglePhotosSameAlbumSyncCoordinatorAdapters {
  return {
    prepareReconciliation: vi.fn(async () => ({ status: "noChanges" })),
    startSync: vi.fn(async () => ({ status: "checkpointed" })),
    syncMedia: vi.fn(async () => ({ status: "mediaPrepared" })),
    syncMembership: vi.fn(async () => ({
      status: "membershipPrepared",
      nextPhase: "finalizing",
    })),
    finalizeSync: vi.fn(async () => ({ status: "completed" })),
    createOperationId: vi.fn(() => OPERATION_ID),
    now: vi.fn(() => new Date(STARTED_AT)),
    ...overrides,
  };
}

function expectWriteCounts(
  adapters: GooglePhotosSameAlbumSyncCoordinatorAdapters,
  expected: { start: number; media: number; membership: number; finalize: number },
) {
  expect(adapters.startSync).toHaveBeenCalledTimes(expected.start);
  expect(adapters.syncMedia).toHaveBeenCalledTimes(expected.media);
  expect(adapters.syncMembership).toHaveBeenCalledTimes(expected.membership);
  expect(adapters.finalizeSync).toHaveBeenCalledTimes(expected.finalize);
}

describe("Google Photos same-album sync coordinator", () => {
  it("returns noChanges without generating an operation or calling writers", async () => {
    const adapters = makeAdapters();

    await expect(runGooglePhotosSameAlbumSync(input(), adapters)).resolves.toEqual({
      status: "noChanges",
    });

    expect(adapters.prepareReconciliation).toHaveBeenCalledTimes(1);
    expect(adapters.createOperationId).not.toHaveBeenCalled();
    expect(adapters.now).not.toHaveBeenCalled();
    expectWriteCounts(adapters, { start: 0, media: 0, membership: 0, finalize: 0 });
  });

  it.each(["initialSyncRequired", "ready"] as const)(
    "runs a %s operation forward once in stage order",
    async (status) => {
      const calls: string[] = [];
      const adapters = makeAdapters({
        prepareReconciliation: vi.fn(async () => {
          calls.push("reconciliation");
          return status === "initialSyncRequired"
            ? {
                status,
                preparedSource: preparedSource(),
                bindingFileId: null,
                binding: null,
              }
            : {
                status,
                preparedSource: preparedSource(),
                bindingFileId: "private-binding-file-id",
                binding: pendingBinding("albumBound"),
                album: {
                  id: "private-album-id",
                  title: PROJECT.title,
                  isWriteable: true,
                },
                currentAlbumMediaItemIds: [],
                plan: {
                  createItems: [],
                  reuseItems: [],
                  removeMediaItemIds: [],
                  addMediaItemIds: [],
                  targetItems: [],
                  titleNeedsUpdate: false,
                },
              };
        }),
        startSync: vi.fn(async () => {
          calls.push("start");
          return { status: "checkpointed" };
        }),
        syncMedia: vi.fn(async () => {
          calls.push("media");
          return { status: "mediaPrepared" };
        }),
        syncMembership: vi.fn(async () => {
          calls.push("membership");
          return { status: "membershipPrepared", nextPhase: "finalizing" };
        }),
        finalizeSync: vi.fn(async () => {
          calls.push("finalize");
          return { status: "completed" };
        }),
      });

      const result = await runGooglePhotosSameAlbumSync(input(), adapters);

      expect(result).toEqual({ status: "completed" });
      expect(calls).toEqual([
        "reconciliation",
        "start",
        "media",
        "membership",
        "finalize",
      ]);
      expect(adapters.createOperationId).toHaveBeenCalledTimes(1);
      expect(adapters.now).toHaveBeenCalledTimes(1);
      expectWriteCounts(adapters, { start: 1, media: 1, membership: 1, finalize: 1 });
      const startCall = vi.mocked(adapters.startSync).mock.calls[0]?.[0];
      const mediaCall = vi.mocked(adapters.syncMedia).mock.calls[0]?.[0];
      const membershipCall = vi.mocked(adapters.syncMembership).mock.calls[0]?.[0];
      const finalizeCall = vi.mocked(adapters.finalizeSync).mock.calls[0]?.[0];
      expect(startCall).toMatchObject({ operationId: OPERATION_ID, startedAt: STARTED_AT });
      expect(mediaCall?.operationId).toBe(OPERATION_ID);
      expect(membershipCall?.operationId).toBe(OPERATION_ID);
      expect(finalizeCall?.operationId).toBe(OPERATION_ID);
      expect(JSON.stringify(result)).not.toContain(OPERATION_ID);
    },
  );

  it("stops when the start executor's fresh reconciliation finds no changes", async () => {
    const adapters = makeAdapters({
      prepareReconciliation: vi.fn(async () => ({
        status: "initialSyncRequired",
        preparedSource: preparedSource(),
        bindingFileId: null,
        binding: null,
      })),
      startSync: vi.fn(async () => ({ status: "noChanges" })),
    });

    await expect(runGooglePhotosSameAlbumSync(input(), adapters)).resolves.toEqual({
      status: "noChanges",
    });
    expectWriteCounts(adapters, { start: 1, media: 0, membership: 0, finalize: 0 });
  });

  it("maps an initial authority failure to a safe blocked result", async () => {
    const adapters = makeAdapters({
      prepareReconciliation: vi.fn(async () => ({
        status: "bindingDuplicate",
        preparedSource: preparedSource(),
      })),
    });

    await expect(runGooglePhotosSameAlbumSync(input(), adapters)).resolves.toEqual({
      status: "blocked",
      stage: "reconciliation",
      reason: "bindingDuplicate",
    });
    expect(adapters.createOperationId).not.toHaveBeenCalled();
    expectWriteCounts(adapters, { start: 0, media: 0, membership: 0, finalize: 0 });
  });

  it.each([
    ["albumBound", { start: 0, media: 1, membership: 1, finalize: 1 }],
    ["mediaPrepared", { start: 0, media: 0, membership: 1, finalize: 1 }],
    ["membershipRemoving", { start: 0, media: 0, membership: 1, finalize: 1 }],
    ["membershipAdding", { start: 0, media: 0, membership: 1, finalize: 1 }],
    ["titleUpdating", { start: 0, media: 0, membership: 0, finalize: 1 }],
    ["finalizing", { start: 0, media: 0, membership: 0, finalize: 1 }],
  ] as const)("routes pending %s from its authoritative phase", async (phase, counts) => {
    const adapters = makeAdapters({
      prepareReconciliation: vi.fn(async () => continuation(phase)),
    });

    await expect(runGooglePhotosSameAlbumSync(input(), adapters)).resolves.toEqual({
      status: "completed",
    });

    expect(adapters.createOperationId).not.toHaveBeenCalled();
    expectWriteCounts(adapters, counts);
    for (const executor of [
      adapters.syncMedia,
      adapters.syncMembership,
      adapters.finalizeSync,
    ]) {
      const call = vi.mocked(executor).mock.calls[0]?.[0];
      if (call) expect(call.operationId).toBe(OPERATION_ID);
    }
  });

  it.each([
    ["creatingAlbum", "start", "creatingAlbumRecoveryRequired"],
    ["mediaCreating", "media", "mediaCreateRecoveryRequired"],
  ] as const)("stops ambiguous pending phase %s without replay", async (phase, stage, reason) => {
    const adapters = makeAdapters({
      prepareReconciliation: vi.fn(async () => continuation(phase)),
    });

    await expect(runGooglePhotosSameAlbumSync(input(), adapters)).resolves.toEqual({
      status: "recoveryRequired",
      stage,
      reason,
    });
    expectWriteCounts(adapters, { start: 0, media: 0, membership: 0, finalize: 0 });
  });

  it("stops continuationSourceChanged before generating or writing", async () => {
    const adapters = makeAdapters({
      prepareReconciliation: vi.fn(async () => ({
        ...continuation("albumBound"),
        status: "continuationSourceChanged",
      })),
    });

    await expect(runGooglePhotosSameAlbumSync(input(), adapters)).resolves.toEqual({
      status: "interrupted",
      stage: "reconciliation",
      reason: "sourceChanged",
    });
    expect(adapters.createOperationId).not.toHaveBeenCalled();
    expectWriteCounts(adapters, { start: 0, media: 0, membership: 0, finalize: 0 });
  });

  it("fails closed when operation identity or time cannot be created", async () => {
    const initial = vi.fn(async () => ({
      status: "initialSyncRequired" as const,
      preparedSource: preparedSource(),
      bindingFileId: null,
      binding: null,
    }));
    const cases: GooglePhotosSameAlbumSyncCoordinatorAdapters[] = [
      makeAdapters({ prepareReconciliation: initial, createOperationId: () => "" }),
      makeAdapters({
        prepareReconciliation: initial,
        createOperationId: () => {
          throw new Error("identity unavailable");
        },
      }),
      makeAdapters({ prepareReconciliation: initial, now: () => new Date(Number.NaN) }),
    ];

    for (const adapters of cases) {
      await expect(runGooglePhotosSameAlbumSync(input(), adapters)).resolves.toEqual({
        status: "blocked",
        stage: "start",
        reason: "operationStartFailed",
      });
      expectWriteCounts(adapters, { start: 0, media: 0, membership: 0, finalize: 0 });
    }
  });

  it.each([
    ["start", "albumCreateFailed", { start: 1, media: 0, membership: 0, finalize: 0 }],
    ["media", "uploadFailed", { start: 1, media: 1, membership: 0, finalize: 0 }],
    ["membership", "checkpointWriteFailed", { start: 1, media: 1, membership: 1, finalize: 0 }],
    ["finalize", "finalizationWriteFailed", { start: 1, media: 1, membership: 1, finalize: 1 }],
  ] as const)("stops after a %s failure without retry", async (stage, reason, counts) => {
    const adapters = makeAdapters({
      prepareReconciliation: vi.fn(async () => ({
        status: "initialSyncRequired",
        preparedSource: preparedSource(),
        bindingFileId: null,
        binding: null,
      })),
      ...(stage === "start" ? { startSync: vi.fn(async () => ({ status: reason })) } : {}),
      ...(stage === "media" ? { syncMedia: vi.fn(async () => ({ status: reason })) } : {}),
      ...(stage === "membership"
        ? { syncMembership: vi.fn(async () => ({ status: reason })) }
        : {}),
      ...(stage === "finalize"
        ? { finalizeSync: vi.fn(async () => ({ status: reason })) }
        : {}),
    });

    const result = await runGooglePhotosSameAlbumSync(input(), adapters);

    expect(result).toMatchObject({ status: "interrupted", stage, reason });
    expectWriteCounts(adapters, counts);
  });

  it("maps ambiguity and partial mutation results to recoveryRequired", async () => {
    const cases = [
      { key: "startSync", status: "albumCreateAmbiguous", stage: "start" },
      { key: "syncMedia", status: "mediaCreatedCheckpointFailed", stage: "media" },
      {
        key: "syncMembership",
        status: "membershipAddRecoveryRequired",
        stage: "membership",
      },
      { key: "finalizeSync", status: "generationOverflow", stage: "finalize" },
    ] as const;

    for (const item of cases) {
      const adapters = makeAdapters({
        prepareReconciliation: vi.fn(async () => ({
          status: "initialSyncRequired",
          preparedSource: preparedSource(),
          bindingFileId: null,
          binding: null,
        })),
        [item.key]: vi.fn(async () => ({ status: item.status })),
      });

      await expect(runGooglePhotosSameAlbumSync(input(), adapters)).resolves.toEqual({
        status: "recoveryRequired",
        stage: item.stage,
        reason: item.status,
      });
    }
  });

  it("stops immediately when a stage reports sourceChanged", async () => {
    const adapters = makeAdapters({
      prepareReconciliation: vi.fn(async () => continuation("albumBound")),
      syncMedia: vi.fn(async () => ({ status: "sourceChanged" })),
    });

    await expect(runGooglePhotosSameAlbumSync(input(), adapters)).resolves.toEqual({
      status: "interrupted",
      stage: "media",
      reason: "sourceChanged",
    });
    expectWriteCounts(adapters, { start: 0, media: 1, membership: 0, finalize: 0 });
  });

  it("forwards ephemeral media runtime only to media and returns sanitized progress", async () => {
    const runtime: GooglePhotosSyncMediaRuntime = {
      operationId: OPERATION_ID,
      sourceFingerprint: FINGERPRINT,
      createIdentity: [],
      completedUploads: [],
      currentUpload: {
        slideId: "slide-private",
        renderKey: FINGERPRINT,
        sessionUrl: "https://private-session.example/upload",
        chunkGranularity: 256,
        offset: 0,
        payloadMimeType: "image/jpeg",
        payloadSizeBytes: 10,
        payloadFileName: "private.jpg",
      },
    };
    const onMediaRuntime = vi.fn();
    const onProgress = vi.fn();
    const adapters = makeAdapters({
      prepareReconciliation: vi.fn(async () => continuation("albumBound")),
      syncMedia: vi.fn(async (mediaInput) => {
        mediaInput.onRuntime?.(runtime);
        mediaInput.onProgress?.({
          phase: "uploading",
          currentItem: 2,
          completedItems: 1,
          totalItems: 3,
          uploadedBytes: 5,
          fileBytes: 10,
        });
        return { status: "mediaPrepared" };
      }),
    });

    const result = await runGooglePhotosSameAlbumSync(
      input({ mediaRuntime: runtime, onMediaRuntime, onProgress }),
      adapters,
    );

    expect(vi.mocked(adapters.syncMedia).mock.calls[0]?.[0].runtime).toBe(runtime);
    expect(onMediaRuntime).toHaveBeenCalledWith(runtime);
    expect(onProgress).toHaveBeenCalledWith({
      stage: "media",
      completedCount: 1,
      totalCount: 3,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("private-session");
    expect(serialized).not.toContain(OPERATION_ID);
    expect(serialized).not.toContain(FINGERPRINT);
  });

  it("does not use media runtime to replay a mediaCreating phase", async () => {
    const adapters = makeAdapters({
      prepareReconciliation: vi.fn(async () => continuation("mediaCreating")),
    });

    await runGooglePhotosSameAlbumSync(
      input({
        mediaRuntime: {
          operationId: OPERATION_ID,
          sourceFingerprint: FINGERPRINT,
          createIdentity: [],
          completedUploads: [],
          currentUpload: null,
        },
      }),
      adapters,
    );

    expect(adapters.syncMedia).not.toHaveBeenCalled();
  });

  it.each(["reconciliation", "start", "media", "membership", "finalize"] as const)(
    "propagates AbortError from %s and does not continue",
    async (stage) => {
      const abortError = new DOMException("cancelled", "AbortError");
      const adapters = makeAdapters({
        prepareReconciliation:
          stage === "reconciliation"
            ? vi.fn(async () => Promise.reject(abortError))
            : vi.fn(async () => ({
                status: "initialSyncRequired",
                preparedSource: preparedSource(),
                bindingFileId: null,
                binding: null,
              })),
        ...(stage === "start"
          ? { startSync: vi.fn(async () => Promise.reject(abortError)) }
          : {}),
        ...(stage === "media"
          ? { syncMedia: vi.fn(async () => Promise.reject(abortError)) }
          : {}),
        ...(stage === "membership"
          ? { syncMembership: vi.fn(async () => Promise.reject(abortError)) }
          : {}),
        ...(stage === "finalize"
          ? { finalizeSync: vi.fn(async () => Promise.reject(abortError)) }
          : {}),
      });

      await expect(runGooglePhotosSameAlbumSync(input(), adapters)).rejects.toBe(
        abortError,
      );
      expect(vi.mocked(adapters.startSync).mock.calls.length).toBeLessThanOrEqual(1);
      expect(vi.mocked(adapters.syncMedia).mock.calls.length).toBeLessThanOrEqual(1);
      expect(vi.mocked(adapters.syncMembership).mock.calls.length).toBeLessThanOrEqual(1);
      expect(vi.mocked(adapters.finalizeSync).mock.calls.length).toBeLessThanOrEqual(1);
    },
  );

  it("contains orchestration only, with no outer lock, direct API, persistence, or retry loop", () => {
    const source = readFileSync(
      new URL("./sync-coordinator.ts", import.meta.url),
      "utf8",
    );

    for (const forbidden of [
      "runWithGooglePhotosSyncWriteLock",
      "photoslibrary.googleapis.com",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "document.cookie",
      "console.log",
      "console.warn",
      "console.error",
      "setTimeout",
      "createGooglePhotosAlbum",
      "batchCreateGooglePhotosMediaItems",
      "batchAddGooglePhotosSyncMediaItems",
      "batchRemoveGooglePhotosSyncMediaItems",
      "updateGooglePhotosSyncAlbumTitle",
      "fetch(",
      "while (",
      "while(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
