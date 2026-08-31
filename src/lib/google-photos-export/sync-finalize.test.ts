import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DriveProjectSummary } from "../google-drive";
import type {
  ReadDrivePhotosSyncBindingResult,
  UpdateDrivePhotosSyncBindingResult,
} from "./drive-sync-binding";
import {
  finalizeGooglePhotosSameAlbumSync,
  type GooglePhotosSyncFinalizeAdapters,
} from "./sync-finalize";
import {
  buildEmptyGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
  type GooglePhotosSyncPendingPhase,
} from "./sync-binding";
import type {
  GooglePhotosSyncPreparedSource,
  PrepareGooglePhotosSyncSourceResult,
} from "./sync-drive-source";
import type {
  GooglePhotosSyncAlbumReadResult,
  GooglePhotosSyncAlbumUpdateResult,
} from "./sync-library-api";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "sync-operation";
const FINGERPRINT = `sha256:${"a".repeat(64)}`;
const KEY_OLD_A = `sha256:${"b".repeat(64)}`;
const KEY_OLD_B = `sha256:${"c".repeat(64)}`;
const KEY_NEW_C = `sha256:${"d".repeat(64)}`;
const TITLE = "夏の作品";
const COMPLETED_AT = "2026-08-31T12:00:00.000Z";

const PROJECT: DriveProjectSummary = {
  projectId: PROJECT_ID,
  title: TITLE,
  projectFolderId: "project-root",
  manifestFileId: "manifest-file",
  assetsFolderId: "assets-folder",
  manifestPath: "projects/project/manifest.json",
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-31T00:00:00.000Z",
};

function finalizeInput(signal = new AbortController().signal) {
  return {
    driveAccessToken: "private-drive-token",
    photosAccessToken: "private-photos-token",
    selectedProjectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    projectsRootFolderId: "projects-root",
    project: PROJECT,
    operationId: OPERATION_ID,
    signal,
    now: () => new Date(COMPLETED_AT),
  };
}

function preparedSource(
  fingerprint = FINGERPRINT,
  targetAlbumTitle = TITLE,
  rendererVersion = 7,
): GooglePhotosSyncPreparedSource {
  return {
    projectId: PROJECT_ID,
    projectTitle: targetAlbumTitle,
    targetAlbumTitle,
    sourceSlideCount: 2,
    skippedVideoCount: 0,
    totalBytes: 8,
    rendererVersion,
    items: [],
    desiredSlides: [],
    sourceFingerprint: fingerprint,
  };
}

function finalizeBinding(
  phase: GooglePhotosSyncPendingPhase = "titleUpdating",
  generation = 4,
): GooglePhotosSyncBinding {
  return {
    ...buildEmptyGooglePhotosSyncBinding({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    }),
    album: {
      albumId: "album-id",
      createdAt: "2026-08-30T01:00:00.000Z",
      lastKnownTitle: "旧タイトル",
    },
    stable: {
      generation,
      completedAt: "2026-08-30T02:00:00.000Z",
      rendererVersion: 2,
      items: [
        { slideId: "slide-old-a", renderKey: KEY_OLD_A, mediaItemId: "old-a" },
        { slideId: "slide-old-b", renderKey: KEY_OLD_B, mediaItemId: "old-b" },
      ],
    },
    pending: {
      operationId: OPERATION_ID,
      startedAt: "2026-08-31T03:00:00.000Z",
      phase,
      sourceFingerprint: FINGERPRINT,
      targetTitle: TITLE,
      previousManagedMediaItemIds: ["old-a", "old-b"],
      targetItems: [
        { slideId: "slide-old-b", renderKey: KEY_OLD_B, mediaItemId: "old-b" },
        { slideId: "slide-new-c", renderKey: KEY_NEW_C, mediaItemId: "new-c" },
      ],
    },
  };
}

type HarnessOptions = {
  binding?: GooglePhotosSyncBinding;
  phase?: GooglePhotosSyncPendingPhase;
  generation?: number;
  albumTitle?: string;
  membership?: string[];
  sourceResults?: GooglePhotosSyncPreparedSource[];
  mutateSourceAtCall?: number;
  albumResults?: GooglePhotosSyncAlbumReadResult[];
  updateTitleResult?: GooglePhotosSyncAlbumUpdateResult;
  updateTitleError?: Error;
  patchChangesRemoteTitle?: boolean;
  updateStatuses?: UpdateDrivePhotosSyncBindingResult["status"][];
  applyFailedWriteAt?: number;
  mutateBindingAtRead?: number;
};

function harness(options: HarnessOptions = {}) {
  let remoteBinding = structuredClone(
    options.binding ??
      finalizeBinding(options.phase ?? "titleUpdating", options.generation ?? 4),
  );
  let albumTitle = options.albumTitle ?? "旧タイトル";
  const currentMembership = [...(options.membership ?? [
    "unmanaged-a",
    "old-b",
    "unmanaged-b",
    "new-c",
  ])];
  let sourceCount = 0;
  let readCount = 0;
  let updateCount = 0;
  let albumCount = 0;
  const events: string[] = [];

  const prepareSource = vi.fn(async (): Promise<PrepareGooglePhotosSyncSourceResult> => {
    events.push("source");
    sourceCount += 1;
    const configured = options.sourceResults?.[
      Math.min(sourceCount - 1, (options.sourceResults?.length ?? 1) - 1)
    ];
    if (configured) return { ok: true, source: structuredClone(configured) };
    if (options.mutateSourceAtCall === sourceCount) {
      return {
        ok: true,
        source: preparedSource(`sha256:${"e".repeat(64)}`),
      };
    }
    return { ok: true, source: preparedSource() };
  });
  const readBinding = vi.fn(async (): Promise<ReadDrivePhotosSyncBindingResult> => {
    events.push("binding-read");
    readCount += 1;
    if (options.mutateBindingAtRead === readCount) {
      if (remoteBinding.pending) {
        remoteBinding.pending.operationId = "other-operation";
      } else if (remoteBinding.album) {
        remoteBinding.album.lastKnownTitle = "external-drift";
      }
    }
    return {
      status: "ready",
      fileId: "binding-file",
      binding: structuredClone(remoteBinding),
    };
  });
  const updateBinding = vi.fn(
    async (input: Parameters<GooglePhotosSyncFinalizeAdapters["updateBinding"]>[0]): Promise<UpdateDrivePhotosSyncBindingResult> => {
      const label = input.binding.pending?.phase ?? "stable";
      events.push(`binding-write-${label}`);
      const callIndex = updateCount;
      const status = options.updateStatuses?.[callIndex] ?? "updated";
      updateCount += 1;
      if (status === "updated" || options.applyFailedWriteAt === callIndex) {
        remoteBinding = structuredClone(input.binding);
      }
      if (status !== "updated") return { status } as UpdateDrivePhotosSyncBindingResult;
      return {
        status: "updated",
        fileId: "binding-file",
        binding: structuredClone(remoteBinding),
      };
    },
  );
  const getAlbum = vi.fn(async (): Promise<GooglePhotosSyncAlbumReadResult> => {
    events.push("album");
    const configured = options.albumResults?.[
      Math.min(albumCount, (options.albumResults?.length ?? 1) - 1)
    ];
    albumCount += 1;
    return configured ?? {
      status: "ready",
      album: {
        id: "album-id",
        title: albumTitle,
        isWriteable: true,
        mediaItemsCount: String(currentMembership.length),
      },
    };
  });
  const searchAlbumMediaItemsPage = vi.fn(async () => {
    events.push("membership");
    return {
      status: "ready" as const,
      mediaItemIds: [...currentMembership],
      nextPageToken: null,
    };
  });
  const updateAlbumTitle = vi.fn(async (input: { title: string }) => {
    events.push("patch-title");
    if (options.updateTitleError) throw options.updateTitleError;
    const result = options.updateTitleResult ?? {
      status: "updated" as const,
      album: {
        id: "album-id",
        title: input.title,
        isWriteable: true,
        mediaItemsCount: String(currentMembership.length),
      },
    };
    if (
      result.status === "updated" &&
      options.patchChangesRemoteTitle !== false
    ) {
      albumTitle = input.title;
    }
    return result;
  });
  const runWithLock: GooglePhotosSyncFinalizeAdapters["runWithLock"] = async (
    _input,
    write,
  ) => {
    events.push("lock");
    return { acquired: true, value: await write() };
  };

  const adapters: GooglePhotosSyncFinalizeAdapters = {
    runWithLock,
    prepareSource,
    readBinding,
    updateBinding,
    getAlbum,
    searchAlbumMediaItemsPage,
    updateAlbumTitle: updateAlbumTitle as GooglePhotosSyncFinalizeAdapters["updateAlbumTitle"],
  };
  return {
    adapters,
    events,
    spies: {
      prepareSource,
      readBinding,
      updateBinding,
      getAlbum,
      searchAlbumMediaItemsPage,
      updateAlbumTitle,
    },
    remoteBinding: () => structuredClone(remoteBinding),
    albumTitle: () => albumTitle,
  };
}

describe("Google Photos same-album sync finalization", () => {
  it("skips an already-completed title PATCH and finalizes stable state", async () => {
    const test = harness({ albumTitle: TITLE });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );

    expect(result).toEqual({ status: "completed" });
    expect(test.spies.updateAlbumTitle).not.toHaveBeenCalled();
    expect(test.events).toContain("binding-write-finalizing");
    expect(test.events).toContain("binding-write-stable");
    const remote = test.remoteBinding();
    expect(remote.pending).toBeNull();
    expect(remote.album).toMatchObject({
      albumId: "album-id",
      createdAt: "2026-08-30T01:00:00.000Z",
      lastKnownTitle: TITLE,
    });
    expect(remote.stable).toEqual({
      generation: 5,
      completedAt: COMPLETED_AT,
      rendererVersion: 7,
      items: [
        { slideId: "slide-old-b", renderKey: KEY_OLD_B, mediaItemId: "old-b" },
        { slideId: "slide-new-c", renderKey: KEY_NEW_C, mediaItemId: "new-c" },
      ],
    });
  });

  it("PATCHes title once before finalizing checkpoint and stable write", async () => {
    const test = harness();
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "completed" });
    expect(test.spies.updateAlbumTitle).toHaveBeenCalledTimes(1);
    expect(test.spies.updateAlbumTitle).toHaveBeenCalledWith(
      expect.objectContaining({ title: TITLE, albumId: "album-id" }),
    );
    expect(test.events.indexOf("patch-title")).toBeLessThan(
      test.events.indexOf("binding-write-finalizing"),
    );
    expect(test.events.indexOf("binding-write-finalizing")).toBeLessThan(
      test.events.indexOf("binding-write-stable"),
    );
    expect(test.spies.prepareSource).toHaveBeenCalledTimes(4);
    const [titleCheckpoint, stableWrite] = test.spies.updateBinding.mock.calls;
    expect(titleCheckpoint?.[0]).toMatchObject({
      expectedStableGeneration: 4,
      binding: { stable: { generation: 4 }, pending: { phase: "finalizing" } },
    });
    expect(stableWrite?.[0]).toMatchObject({
      expectedStableGeneration: 4,
      binding: { stable: { generation: 5 }, pending: null },
    });
  });

  it.each([
    ["failed", { updateTitleResult: { status: "failed" } as const }],
    ["invalid input", { updateTitleResult: { status: "invalidInput" } as const }],
    ["invalid response", { updateTitleResult: { status: "invalidResponse" } as const }],
    [
      "mismatched returned album",
      {
        updateTitleResult: {
          status: "updated",
          album: {
            id: "other-album",
            title: TITLE,
            isWriteable: true,
            mediaItemsCount: "2",
          },
        } as const,
      },
    ],
    ["network ambiguity", { updateTitleError: new Error("raw private response") }],
  ])("keeps titleUpdating after PATCH %s", async (_name, option) => {
    const test = harness(option);
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "titleUpdateRecoveryRequired" });
    expect(test.spies.updateAlbumTitle).toHaveBeenCalledTimes(1);
    expect(test.spies.updateBinding).not.toHaveBeenCalled();
    expect(test.remoteBinding().pending?.phase).toBe("titleUpdating");
    expect(JSON.stringify(result)).not.toContain("raw private response");
  });

  it("does not accept PATCH response without fresh remote title verification", async () => {
    const test = harness({ patchChangesRemoteTitle: false });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "titleUpdateRecoveryRequired" });
    expect(test.spies.updateAlbumTitle).toHaveBeenCalledTimes(1);
    expect(test.spies.updateBinding).not.toHaveBeenCalled();
  });

  it("continues without another PATCH after title succeeded but checkpoint failed", async () => {
    const test = harness({ updateStatuses: ["writeFailed"] });
    const first = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(first).toEqual({ status: "checkpointWriteFailed" });
    expect(test.albumTitle()).toBe(TITLE);
    expect(test.remoteBinding().pending?.phase).toBe("titleUpdating");

    const continued = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(continued).toEqual({ status: "completed" });
    expect(test.spies.updateAlbumTitle).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["at entry", 1, 0],
    ["immediately before PATCH", 2, 0],
    ["after PATCH", 3, 1],
  ] as const)("stops without rollback when source changes %s", async (_name, call, patchCalls) => {
    const test = harness({ mutateSourceAtCall: call });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "sourceChanged" });
    expect(test.spies.updateAlbumTitle).toHaveBeenCalledTimes(patchCalls);
    expect(test.spies.updateBinding).not.toHaveBeenCalled();
    expect(test.remoteBinding().pending?.phase).toBe("titleUpdating");
    if (call === 3) expect(test.albumTitle()).toBe(TITLE);
  });

  it("directly finalizes a verified finalizing checkpoint", async () => {
    const test = harness({ phase: "finalizing", albumTitle: TITLE });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "completed" });
    expect(test.spies.updateAlbumTitle).not.toHaveBeenCalled();
    expect(test.spies.updateBinding).toHaveBeenCalledTimes(1);
    expect(test.spies.updateBinding).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStableGeneration: 4 }),
    );
    expect(test.spies.readBinding).toHaveBeenCalledTimes(3);
    expect(test.remoteBinding().stable?.generation).toBe(5);
    expect(test.remoteBinding().pending).toBeNull();
  });

  it("rechecks source immediately before a direct stable finalization write", async () => {
    const test = harness({
      phase: "finalizing",
      albumTitle: TITLE,
      mutateSourceAtCall: 2,
    });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "sourceChanged" });
    expect(test.spies.updateBinding).not.toHaveBeenCalled();
    expect(test.remoteBinding().pending?.phase).toBe("finalizing");
  });

  it("finalizes a null stable state at generation one", async () => {
    const binding = finalizeBinding("finalizing");
    binding.stable = null;
    if (binding.pending) binding.pending.previousManagedMediaItemIds = [];
    const test = harness({ binding, albumTitle: TITLE });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "completed" });
    expect(test.remoteBinding().stable?.generation).toBe(1);
  });

  it("fails closed on generation overflow without a Drive write", async () => {
    const test = harness({
      phase: "finalizing",
      albumTitle: TITLE,
      generation: Number.MAX_SAFE_INTEGER,
    });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "generationOverflow" });
    expect(test.spies.updateBinding).not.toHaveBeenCalled();
    expect(test.remoteBinding().pending?.phase).toBe("finalizing");
  });

  it("does not increment again after successful finalization", async () => {
    const test = harness({ phase: "finalizing", albumTitle: TITLE });
    expect(
      await finalizeGooglePhotosSameAlbumSync(finalizeInput(), test.adapters),
    ).toEqual({ status: "completed" });
    expect(test.remoteBinding().stable?.generation).toBe(5);

    const repeated = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(repeated).toEqual({ status: "wrongPhase" });
    expect(test.remoteBinding().stable?.generation).toBe(5);
    expect(test.spies.updateBinding).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["title drift", { albumTitle: "外部変更" }, "finalizationRecoveryRequired"],
    ["missing target", { membership: ["old-b"] }, "finalizationRecoveryRequired"],
    ["wrong target order", { membership: ["new-c", "old-b"] }, "finalizationRecoveryRequired"],
    ["obsolete previous", { membership: ["old-a", "old-b", "new-c"] }, "finalizationRecoveryRequired"],
  ] as const)("does not repair finalizing remote drift: %s", async (_name, option, status) => {
    const test = harness({ phase: "finalizing", albumTitle: TITLE, ...option });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status });
    expect(test.spies.updateAlbumTitle).not.toHaveBeenCalled();
    expect(test.spies.updateBinding).not.toHaveBeenCalled();
  });

  it("allows unmanaged membership changes during finalization", async () => {
    const test = harness({
      phase: "finalizing",
      albumTitle: TITLE,
      membership: ["unmanaged-a", "old-b", "unmanaged-b", "new-c", "unmanaged-c"],
    });
    expect(
      await finalizeGooglePhotosSameAlbumSync(finalizeInput(), test.adapters),
    ).toEqual({ status: "completed" });
  });

  it.each([
    ["missing", { status: "notFound" } as const, "targetMissing"],
    [
      "non-writable",
      {
        status: "ready",
        album: {
          id: "album-id",
          title: TITLE,
          isWriteable: false,
          mediaItemsCount: "2",
        },
      } as const,
      "targetNotWritable",
    ],
  ])("stops when final album is %s", async (_name, albumResult, status) => {
    const test = harness({
      phase: "finalizing",
      albumTitle: TITLE,
      albumResults: [albumResult],
    });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status });
    expect(test.spies.updateBinding).not.toHaveBeenCalled();
  });

  it.each([
    ["stale generation", "staleGeneration", "staleBinding"],
    ["remote unchanged", "writeFailed", "finalizationWriteFailed"],
    ["invalid write", "invalid", "finalizationRecoveryRequired"],
  ] as const)("does not retry final Drive %s", async (_name, updateStatus, status) => {
    const test = harness({
      phase: "finalizing",
      albumTitle: TITLE,
      updateStatuses: [updateStatus],
    });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status });
    expect(test.spies.updateBinding).toHaveBeenCalledTimes(1);
    expect(test.remoteBinding().pending?.phase).toBe("finalizing");
  });

  it("accepts an exact candidate after final Drive response loss", async () => {
    const test = harness({
      phase: "finalizing",
      albumTitle: TITLE,
      updateStatuses: ["writeFailed"],
      applyFailedWriteAt: 0,
    });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "completed" });
    expect(test.spies.updateBinding).toHaveBeenCalledTimes(1);
    expect(test.remoteBinding().pending).toBeNull();
    expect(test.remoteBinding().stable?.generation).toBe(5);
  });

  it("requires exact final fresh binding verification", async () => {
    const test = harness({
      phase: "finalizing",
      albumTitle: TITLE,
      mutateBindingAtRead: 3,
    });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "checkpointConflict" });
    expect(test.spies.updateBinding).toHaveBeenCalledTimes(1);
  });

  it("propagates title PATCH AbortError without retry or checkpoint", async () => {
    const controller = new AbortController();
    const abort = new DOMException("aborted", "AbortError");
    const test = harness();
    test.adapters.updateAlbumTitle = vi.fn(async () => {
      controller.abort(abort);
      throw abort;
    });
    await expect(
      finalizeGooglePhotosSameAlbumSync(
        finalizeInput(controller.signal),
        test.adapters,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(test.adapters.updateAlbumTitle).toHaveBeenCalledTimes(1);
    expect(test.spies.updateBinding).not.toHaveBeenCalled();
    expect(test.remoteBinding().pending?.phase).toBe("titleUpdating");
  });

  it("propagates final Drive AbortError without retry", async () => {
    const controller = new AbortController();
    const abort = new DOMException("aborted", "AbortError");
    const test = harness({ phase: "finalizing", albumTitle: TITLE });
    test.adapters.updateBinding = vi.fn(async () => {
      controller.abort(abort);
      throw abort;
    });
    await expect(
      finalizeGooglePhotosSameAlbumSync(
        finalizeInput(controller.signal),
        test.adapters,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(test.adapters.updateBinding).toHaveBeenCalledTimes(1);
    expect(test.remoteBinding().pending?.phase).toBe("finalizing");
  });

  it("fails closed before I/O when the sync lock is unavailable", async () => {
    const test = harness();
    test.adapters.runWithLock = async () => ({ acquired: false, reason: "locked" });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "locked" });
    expect(test.spies.prepareSource).not.toHaveBeenCalled();
    expect(test.spies.readBinding).not.toHaveBeenCalled();
    expect(test.spies.getAlbum).not.toHaveBeenCalled();
  });

  it.each([
    "creatingAlbum",
    "albumBound",
    "mediaCreating",
    "mediaPrepared",
    "membershipRemoving",
    "membershipAdding",
  ] as const)("does not finalize from %s", async (phase) => {
    const binding = finalizeBinding();
    if (binding.pending) binding.pending.phase = phase;
    if (phase === "creatingAlbum" || phase === "albumBound" || phase === "mediaCreating") {
      if (binding.pending) binding.pending.targetItems = [];
      if (phase === "creatingAlbum") {
        binding.album = null;
        binding.stable = null;
        if (binding.pending) binding.pending.previousManagedMediaItemIds = [];
      }
    }
    const test = harness({ binding, albumTitle: TITLE });
    const result = await finalizeGooglePhotosSameAlbumSync(
      finalizeInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "wrongPhase" });
    expect(test.spies.updateAlbumTitle).not.toHaveBeenCalled();
    expect(test.spies.updateBinding).not.toHaveBeenCalled();
  });

  it("contains no planner, membership mutation, creation, persistence, logging, timer, direct protocol, or deletion", () => {
    const source = readFileSync(new URL("./sync-finalize.ts", import.meta.url), "utf8");
    expect(source).not.toContain("planGooglePhotosIncrementalSync");
    expect(source).not.toMatch(/batchCreate|batchAdd|batchRemove|createGooglePhotosAlbum/);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    expect(source).not.toMatch(/console\.(?:log|warn|error)/);
    expect(source).not.toMatch(/\bfetch\s*\(|setTimeout\s*\(/);
    expect(source).not.toContain("photoslibrary.googleapis.com");
    expect(source).not.toMatch(/deleteMedia/);
  });
});
