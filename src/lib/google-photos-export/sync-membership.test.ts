import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DriveProjectSummary } from "../google-drive";
import type {
  ReadDrivePhotosSyncBindingResult,
  UpdateDrivePhotosSyncBindingResult,
} from "./drive-sync-binding";
import {
  reconcileGooglePhotosSyncMembership,
  targetIdsAppearInRelativeOrder,
  type GooglePhotosSyncMembershipAdapters,
} from "./sync-membership";
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
  GooglePhotosMembershipMutationResult,
  GooglePhotosSyncAlbumReadResult,
} from "./sync-library-api";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "sync-operation";
const FINGERPRINT = `sha256:${"a".repeat(64)}`;
const KEY_OLD_A = `sha256:${"b".repeat(64)}`;
const KEY_OLD_B = `sha256:${"c".repeat(64)}`;
const KEY_NEW_C = `sha256:${"d".repeat(64)}`;
const TITLE = "夏の作品";

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

function membershipInput(signal = new AbortController().signal) {
  return {
    driveAccessToken: "private-drive-token",
    photosAccessToken: "private-photos-token",
    selectedProjectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    projectsRootFolderId: "projects-root",
    project: PROJECT,
    operationId: OPERATION_ID,
    signal,
  };
}

function preparedSource(
  fingerprint = FINGERPRINT,
  targetAlbumTitle = TITLE,
): GooglePhotosSyncPreparedSource {
  return {
    projectId: PROJECT_ID,
    projectTitle: targetAlbumTitle,
    targetAlbumTitle,
    sourceSlideCount: 2,
    skippedVideoCount: 0,
    totalBytes: 8,
    rendererVersion: 1,
    items: [],
    desiredSlides: [],
    sourceFingerprint: fingerprint,
  };
}

function membershipBinding(
  phase: GooglePhotosSyncPendingPhase = "mediaPrepared",
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
      generation: 4,
      completedAt: "2026-08-30T02:00:00.000Z",
      rendererVersion: 1,
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
  phase?: GooglePhotosSyncPendingPhase;
  binding?: GooglePhotosSyncBinding;
  membership?: string[];
  albumTitles?: string[];
  albumResults?: GooglePhotosSyncAlbumReadResult[];
  sourceResults?: GooglePhotosSyncPreparedSource[];
  updateStatuses?: UpdateDrivePhotosSyncBindingResult["status"][];
  removeResult?: GooglePhotosMembershipMutationResult;
  addResult?: GooglePhotosMembershipMutationResult;
  removeError?: Error;
  addError?: Error;
  keepRemovedIds?: boolean;
  skipAddedIds?: boolean;
  mutateSourceAtCall?: number;
  mutateBindingAtRead?: number;
};

function harness(options: HarnessOptions = {}) {
  let remoteBinding = structuredClone(
    options.binding ?? membershipBinding(options.phase ?? "mediaPrepared"),
  );
  let currentMembership = [...(options.membership ?? [
    "unmanaged-x",
    "old-a",
    "unmanaged-y",
    "old-b",
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
    if (options.mutateBindingAtRead === readCount && remoteBinding.pending) {
      remoteBinding.pending.operationId = "other-operation";
    }
    return {
      status: "ready",
      fileId: "binding-file",
      binding: structuredClone(remoteBinding),
    };
  });
  const updateBinding = vi.fn(
    async (input: Parameters<GooglePhotosSyncMembershipAdapters["updateBinding"]>[0]): Promise<UpdateDrivePhotosSyncBindingResult> => {
      events.push(`binding-write-${input.binding.pending?.phase}`);
      const status = options.updateStatuses?.[updateCount] ?? "updated";
      updateCount += 1;
      if (status !== "updated") return { status } as UpdateDrivePhotosSyncBindingResult;
      expect(input.expectedStableGeneration).toBe(4);
      remoteBinding = structuredClone(input.binding);
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
    const title = options.albumTitles?.[
      Math.min(albumCount, (options.albumTitles?.length ?? 1) - 1)
    ] ?? TITLE;
    albumCount += 1;
    return configured ?? {
      status: "ready",
      album: {
        id: "album-id",
        title,
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
  const batchRemove = vi.fn(async (input: { mediaItemIds: string[] }) => {
    events.push("remove");
    if (options.removeError) throw options.removeError;
    const result = options.removeResult ?? { status: "completed" as const };
    if (result.status === "completed" && !options.keepRemovedIds) {
      const removed = new Set(input.mediaItemIds);
      currentMembership = currentMembership.filter((id) => !removed.has(id));
    }
    return result;
  });
  const batchAdd = vi.fn(async (input: { mediaItemIds: string[] }) => {
    events.push("add");
    if (options.addError) throw options.addError;
    const result = options.addResult ?? { status: "completed" as const };
    if (result.status === "completed" && !options.skipAddedIds) {
      currentMembership.push(...input.mediaItemIds);
    }
    return result;
  });
  const runWithLock: GooglePhotosSyncMembershipAdapters["runWithLock"] = async (
    _input,
    write,
  ) => {
    events.push("lock");
    return { acquired: true, value: await write() };
  };

  const adapters: GooglePhotosSyncMembershipAdapters = {
    runWithLock,
    prepareSource,
    readBinding,
    updateBinding,
    getAlbum,
    searchAlbumMediaItemsPage,
    batchRemove: batchRemove as GooglePhotosSyncMembershipAdapters["batchRemove"],
    batchAdd: batchAdd as GooglePhotosSyncMembershipAdapters["batchAdd"],
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
      batchRemove,
      batchAdd,
    },
    remoteBinding: () => structuredClone(remoteBinding),
    membership: () => [...currentMembership],
  };
}

describe("targetIdsAppearInRelativeOrder", () => {
  it("allows unmanaged items before, between, and after ordered targets", () => {
    expect(
      targetIdsAppearInRelativeOrder(
        ["unmanaged-a", "target-a", "unmanaged-b", "target-b", "unmanaged-c"],
        ["target-a", "target-b"],
      ),
    ).toBe(true);
  });

  it("rejects missing, reversed, empty, and duplicate targets", () => {
    expect(targetIdsAppearInRelativeOrder(["b", "a"], ["a", "b"])).toBe(false);
    expect(targetIdsAppearInRelativeOrder(["a"], ["a", "b"])).toBe(false);
    expect(targetIdsAppearInRelativeOrder(["a"], [])).toBe(false);
    expect(targetIdsAppearInRelativeOrder(["a"], ["a", "a"])).toBe(false);
  });
});

describe("Google Photos sync membership reconciliation", () => {
  it.each([
    ["same title", TITLE, "finalizing"],
    ["different title", "別のタイトル", "titleUpdating"],
  ] as const)(
    "skips remove/add for complete relative membership with %s",
    async (_name, actualTitle, nextPhase) => {
      const test = harness({
        membership: ["unmanaged-a", "old-b", "unmanaged-b", "new-c", "unmanaged-c"],
        albumTitles: [actualTitle],
      });
      const result = await reconcileGooglePhotosSyncMembership(
        membershipInput(),
        test.adapters,
      );
      expect(result).toEqual({ status: "membershipPrepared", nextPhase });
      expect(test.spies.batchRemove).not.toHaveBeenCalled();
      expect(test.spies.batchAdd).not.toHaveBeenCalled();
      expect(test.spies.updateBinding).toHaveBeenCalledTimes(1);
      expect(test.remoteBinding().pending?.phase).toBe(nextPhase);
      expect(test.remoteBinding().stable).toEqual(membershipBinding().stable);
      expect(test.membership()).toEqual([
        "unmanaged-a",
        "old-b",
        "unmanaged-b",
        "new-c",
        "unmanaged-c",
      ]);
    },
  );

  it("rebuilds only managed membership in checkpointed order", async () => {
    const test = harness({ albumTitles: [TITLE] });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );

    expect(result).toEqual({ status: "membershipPrepared", nextPhase: "finalizing" });
    expect(test.spies.batchRemove).toHaveBeenCalledTimes(1);
    expect(test.spies.batchRemove).toHaveBeenCalledWith(
      expect.objectContaining({ mediaItemIds: ["old-a", "old-b"] }),
    );
    expect(test.spies.batchAdd).toHaveBeenCalledTimes(1);
    expect(test.spies.batchAdd).toHaveBeenCalledWith(
      expect.objectContaining({ mediaItemIds: ["old-b", "new-c"] }),
    );
    expect(test.membership()).toEqual([
      "unmanaged-x",
      "unmanaged-y",
      "old-b",
      "new-c",
    ]);
    expect(test.events.indexOf("binding-write-membershipRemoving")).toBeLessThan(
      test.events.indexOf("remove"),
    );
    expect(test.events.indexOf("remove")).toBeLessThan(
      test.events.indexOf("binding-write-membershipAdding"),
    );
    expect(test.events.indexOf("binding-write-membershipAdding")).toBeLessThan(
      test.events.indexOf("add"),
    );
    expect(test.events.indexOf("add")).toBeLessThan(
      test.events.indexOf("binding-write-finalizing"),
    );
    expect(test.remoteBinding().stable).toEqual(membershipBinding().stable);
  });

  it("continues membershipRemoving with one fresh managed-only remove", async () => {
    const test = harness({ phase: "membershipRemoving" });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "membershipPrepared", nextPhase: "finalizing" });
    expect(test.spies.batchRemove).toHaveBeenCalledTimes(1);
    expect(test.spies.batchRemove).toHaveBeenCalledWith(
      expect.objectContaining({ mediaItemIds: ["old-a", "old-b"] }),
    );
    expect(test.spies.batchAdd).toHaveBeenCalledTimes(1);
  });

  it("does not replay remove when continuation observes previous IDs absent", async () => {
    const test = harness({
      phase: "membershipRemoving",
      membership: ["unmanaged-x", "unmanaged-y"],
    });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "membershipPrepared", nextPhase: "finalizing" });
    expect(test.spies.batchRemove).not.toHaveBeenCalled();
    expect(test.spies.batchAdd).toHaveBeenCalledTimes(1);
  });

  it("does not skip the removing phase merely because all targets are present", async () => {
    const test = harness({
      phase: "membershipRemoving",
      membership: ["unmanaged", "old-b", "new-c"],
    });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(test.spies.batchRemove).toHaveBeenCalledTimes(1);
    expect(test.spies.batchRemove).toHaveBeenCalledWith(
      expect.objectContaining({ mediaItemIds: ["old-b"] }),
    );
    expect(result).toEqual({ status: "membershipRecoveryRequired" });
    expect(test.spies.batchAdd).not.toHaveBeenCalled();
  });

  it.each([
    ["explicit failure", { removeResult: { status: "failed" } as const }],
    ["invalid request result", { removeResult: { status: "invalidInput" } as const }],
    ["network ambiguity", { removeError: new Error("raw private error") }],
    ["verification failure", { keepRemovedIds: true }],
  ])("leaves membershipRemoving after %s", async (_name, option) => {
    const test = harness(option);
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "membershipRemoveRecoveryRequired" });
    expect(test.spies.batchRemove).toHaveBeenCalledTimes(1);
    expect(test.spies.batchAdd).not.toHaveBeenCalled();
    expect(test.remoteBinding().pending?.phase).toBe("membershipRemoving");
    expect(JSON.stringify(result)).not.toContain("raw private error");
  });

  it("leaves removed membership recoverable if membershipAdding checkpoint fails", async () => {
    const test = harness({ updateStatuses: ["updated", "writeFailed"] });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "checkpointWriteFailed" });
    expect(test.spies.batchRemove).toHaveBeenCalledTimes(1);
    expect(test.spies.batchAdd).not.toHaveBeenCalled();
    expect(test.membership()).toEqual(["unmanaged-x", "unmanaged-y"]);
    expect(test.remoteBinding().pending?.phase).toBe("membershipRemoving");
  });

  it("continues after a failed membershipAdding checkpoint without removing twice", async () => {
    const test = harness({ updateStatuses: ["updated", "writeFailed"] });
    const first = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(first).toEqual({ status: "checkpointWriteFailed" });

    const continued = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(continued).toEqual({
      status: "membershipPrepared",
      nextPhase: "finalizing",
    });
    expect(test.spies.batchRemove).toHaveBeenCalledTimes(1);
    expect(test.spies.batchAdd).toHaveBeenCalledTimes(1);
  });

  it("completes membershipAdding without replay when targets are already ordered", async () => {
    const test = harness({
      phase: "membershipAdding",
      membership: ["unmanaged-x", "old-b", "unmanaged-y", "new-c"],
    });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "membershipPrepared", nextPhase: "finalizing" });
    expect(test.spies.batchAdd).not.toHaveBeenCalled();
    expect(test.spies.batchRemove).not.toHaveBeenCalled();
  });

  it("adds target order exactly once when membershipAdding observes zero targets", async () => {
    const test = harness({
      phase: "membershipAdding",
      membership: ["unmanaged-x", "unmanaged-y"],
    });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "membershipPrepared", nextPhase: "finalizing" });
    expect(test.spies.batchAdd).toHaveBeenCalledTimes(1);
    expect(test.spies.batchAdd).toHaveBeenCalledWith(
      expect.objectContaining({ mediaItemIds: ["old-b", "new-c"] }),
    );
  });

  it.each([
    ["partial targets", ["unmanaged", "old-b"], "membershipAddRecoveryRequired"],
    ["wrong target order", ["new-c", "unmanaged", "old-b"], "membershipAddRecoveryRequired"],
    ["obsolete previous ID", ["old-a", "unmanaged"], "membershipRecoveryRequired"],
  ] as const)("fails closed for membershipAdding with %s", async (_name, membership, status) => {
    const test = harness({ phase: "membershipAdding", membership: [...membership] });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status });
    expect(test.spies.batchAdd).not.toHaveBeenCalled();
    expect(test.spies.batchRemove).not.toHaveBeenCalled();
    expect(test.remoteBinding().pending?.phase).toBe("membershipAdding");
  });

  it.each([
    ["explicit failure", { addResult: { status: "failed" } as const }],
    ["invalid request result", { addResult: { status: "invalidInput" } as const }],
    ["network ambiguity", { addError: new Error("raw private error") }],
    ["verification failure", { skipAddedIds: true }],
  ])("leaves membershipAdding after %s", async (_name, option) => {
    const test = harness({
      phase: "membershipAdding",
      membership: ["unmanaged-x"],
      ...option,
    });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "membershipAddRecoveryRequired" });
    expect(test.spies.batchAdd).toHaveBeenCalledTimes(1);
    expect(test.spies.batchRemove).not.toHaveBeenCalled();
    expect(test.remoteBinding().pending?.phase).toBe("membershipAdding");
    expect(JSON.stringify(result)).not.toContain("raw private error");
  });

  it("continues after a failed final checkpoint without adding twice", async () => {
    const test = harness({
      phase: "membershipAdding",
      membership: ["unmanaged"],
      updateStatuses: ["writeFailed"],
    });
    const first = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(first).toEqual({ status: "checkpointWriteFailed" });
    expect(test.remoteBinding().pending?.phase).toBe("membershipAdding");

    const continued = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(continued).toEqual({
      status: "membershipPrepared",
      nextPhase: "finalizing",
    });
    expect(test.spies.batchAdd).toHaveBeenCalledTimes(1);
    expect(test.spies.batchRemove).not.toHaveBeenCalled();
  });

  it("fails closed on partial new target membership from mediaPrepared", async () => {
    const test = harness({ membership: ["unmanaged", "old-a", "old-b", "new-c"] });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "membershipRecoveryRequired" });
    expect(test.spies.updateBinding).not.toHaveBeenCalled();
    expect(test.spies.batchRemove).not.toHaveBeenCalled();
    expect(test.spies.batchAdd).not.toHaveBeenCalled();
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
          mediaItemsCount: "4",
        },
      } as const,
      "targetNotWritable",
    ],
  ])("does not mutate membership when the target is %s", async (_name, albumResult, status) => {
    const test = harness({ albumResults: [albumResult] });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status });
    expect(test.spies.updateBinding).not.toHaveBeenCalled();
    expect(test.spies.batchRemove).not.toHaveBeenCalled();
    expect(test.spies.batchAdd).not.toHaveBeenCalled();
  });

  it.each([
    ["at entry", 1, "mediaPrepared"],
    ["before remove", 3, "membershipRemoving"],
    ["after remove before add", 4, "membershipRemoving"],
  ] as const)("stops without rollback when source changes %s", async (_name, call, phase) => {
    const test = harness({ mutateSourceAtCall: call });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "sourceChanged" });
    expect(test.spies.batchAdd).not.toHaveBeenCalled();
    if (call <= 3) expect(test.spies.batchRemove).not.toHaveBeenCalled();
    if (call === 4) expect(test.spies.batchRemove).toHaveBeenCalledTimes(1);
    expect(test.remoteBinding().pending?.phase).toBe(phase);
  });

  it("does not call membership APIs before a failed checkpoint", async () => {
    const test = harness({ updateStatuses: ["writeFailed"] });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "checkpointWriteFailed" });
    expect(test.spies.batchRemove).not.toHaveBeenCalled();
    expect(test.spies.batchAdd).not.toHaveBeenCalled();
  });

  it("freshly verifies a phase checkpoint before its membership side effect", async () => {
    const test = harness({ mutateBindingAtRead: 3 });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "checkpointConflict" });
    expect(test.spies.batchRemove).not.toHaveBeenCalled();
    expect(test.spies.batchAdd).not.toHaveBeenCalled();
  });

  it("maps a stale generation without attempting the remote mutation", async () => {
    const test = harness({ updateStatuses: ["staleGeneration"] });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "staleBinding" });
    expect(test.spies.batchRemove).not.toHaveBeenCalled();
    expect(test.spies.batchAdd).not.toHaveBeenCalled();
  });

  it("propagates AbortError after remove checkpoint without retry or add", async () => {
    const controller = new AbortController();
    const abort = new DOMException("aborted", "AbortError");
    const test = harness();
    test.adapters.batchRemove = vi.fn(async () => {
      controller.abort(abort);
      throw abort;
    });
    await expect(
      reconcileGooglePhotosSyncMembership(
        membershipInput(controller.signal),
        test.adapters,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(test.adapters.batchRemove).toHaveBeenCalledTimes(1);
    expect(test.spies.batchAdd).not.toHaveBeenCalled();
    expect(test.remoteBinding().pending?.phase).toBe("membershipRemoving");
  });

  it("propagates AbortError after add checkpoint without retry or rollback", async () => {
    const controller = new AbortController();
    const abort = new DOMException("aborted", "AbortError");
    const test = harness({ phase: "membershipAdding", membership: ["unmanaged"] });
    test.adapters.batchAdd = vi.fn(async () => {
      controller.abort(abort);
      throw abort;
    });
    await expect(
      reconcileGooglePhotosSyncMembership(
        membershipInput(controller.signal),
        test.adapters,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(test.adapters.batchAdd).toHaveBeenCalledTimes(1);
    expect(test.spies.batchRemove).not.toHaveBeenCalled();
    expect(test.remoteBinding().pending?.phase).toBe("membershipAdding");
  });

  it("fails closed before I/O when the sync lock is unavailable", async () => {
    const test = harness();
    test.adapters.runWithLock = async () => ({ acquired: false, reason: "locked" });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
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
    "titleUpdating",
    "finalizing",
  ] as const)("does not execute membership from %s", async (phase) => {
    const binding = membershipBinding();
    if (binding.pending) binding.pending.phase = phase;
    if (phase === "creatingAlbum" || phase === "albumBound" || phase === "mediaCreating") {
      if (binding.pending) binding.pending.targetItems = [];
      if (phase === "creatingAlbum") {
        binding.album = null;
        binding.stable = null;
        if (binding.pending) binding.pending.previousManagedMediaItemIds = [];
      }
    }
    const test = harness({ binding });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({ status: "wrongPhase" });
    expect(test.spies.batchRemove).not.toHaveBeenCalled();
    expect(test.spies.batchAdd).not.toHaveBeenCalled();
  });

  it("uses fresh album title for the final phase choice", async () => {
    const test = harness({
      membership: ["old-b", "new-c"],
      albumTitles: [TITLE, "外部変更タイトル"],
    });
    const result = await reconcileGooglePhotosSyncMembership(
      membershipInput(),
      test.adapters,
    );
    expect(result).toEqual({
      status: "membershipPrepared",
      nextPhase: "titleUpdating",
    });
  });

  it("contains no planner, persistence, logging, retry timer, direct protocol, or deletion", () => {
    const source = readFileSync(new URL("./sync-membership.ts", import.meta.url), "utf8");
    expect(source).not.toContain("planGooglePhotosIncrementalSync");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    expect(source).not.toMatch(/console\.(?:log|warn|error)/);
    expect(source).not.toMatch(/\bfetch\s*\(|setTimeout\s*\(/);
    expect(source).not.toContain("photoslibrary.googleapis.com");
    expect(source).not.toMatch(/deleteMedia|batchCreate|updateAlbumTitle/);
  });
});
