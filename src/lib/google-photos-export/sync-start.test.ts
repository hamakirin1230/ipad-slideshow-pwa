import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DriveProjectSummary } from "../google-drive";
import type {
  CreateDrivePhotosSyncBindingResult,
  ReadDrivePhotosSyncBindingResult,
  UpdateDrivePhotosSyncBindingResult,
} from "./drive-sync-binding";
import type { GooglePhotosAlbumCreateResult } from "./library-api";
import type { GooglePhotosSyncReconciliationResult } from "./sync-reconciliation";
import {
  beginGooglePhotosSyncPending,
} from "./sync-pending";
import {
  startGooglePhotosSyncAfterFreshReconciliation,
  type GooglePhotosSyncStartAdapters,
} from "./sync-start";
import {
  buildEmptyGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
} from "./sync-binding";
import type { GooglePhotosSyncPreparedSource } from "./sync-drive-source";
import type { GooglePhotosIncrementalSyncPlan } from "./sync-plan";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const DRIVE_TOKEN = "private-drive-token";
const PHOTOS_TOKEN = "private-photos-token";
const FINGERPRINT = `sha256:${"a".repeat(64)}`;
const KEY_A = `sha256:${"b".repeat(64)}`;
const TITLE = "夏の作品";
const STARTED_AT = "2026-08-31T03:00:00.000Z";
const CREATED_AT = "2026-08-31T03:05:00.000Z";
const OPERATION_ID = "sync-operation";

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

function startInput(signal = new AbortController().signal) {
  return {
    driveAccessToken: DRIVE_TOKEN,
    photosAccessToken: PHOTOS_TOKEN,
    selectedProjectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    projectsRootFolderId: "projects-root",
    project: PROJECT,
    operationId: OPERATION_ID,
    startedAt: STARTED_AT,
    signal,
  };
}

function preparedSource(): GooglePhotosSyncPreparedSource {
  return {
    projectId: PROJECT_ID,
    projectTitle: TITLE,
    targetAlbumTitle: TITLE,
    sourceSlideCount: 1,
    skippedVideoCount: 0,
    totalBytes: 1000,
    rendererVersion: 1,
    items: [],
    desiredSlides: [
      { slideId: "slide-1", renderKey: KEY_A, reuseEligible: true },
    ],
    sourceFingerprint: FINGERPRINT,
  };
}

function stableBinding(generation = 2): GooglePhotosSyncBinding {
  return {
    ...buildEmptyGooglePhotosSyncBinding({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    }),
    album: {
      albumId: "album-bound",
      createdAt: "2026-08-30T01:00:00.000Z",
      lastKnownTitle: TITLE,
    },
    stable: {
      generation,
      completedAt: "2026-08-30T01:30:00.000Z",
      rendererVersion: 1,
      items: [
        { slideId: "slide-1", renderKey: KEY_A, mediaItemId: "media-1" },
      ],
    },
  };
}

function emptyBinding(): GooglePhotosSyncBinding {
  return buildEmptyGooglePhotosSyncBinding({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
  });
}

function plan(): GooglePhotosIncrementalSyncPlan {
  return {
    targetItems: [
      { kind: "reuse", slideId: "slide-1", renderKey: KEY_A, mediaItemId: "media-1" },
    ],
    createItems: [],
    removeManagedMediaItemIds: [],
    membershipNeedsRebuild: false,
    titleNeedsUpdate: true,
    sourceFingerprint: FINGERPRINT,
  };
}

function readyReconciliation(
  current = stableBinding(),
): Extract<
  GooglePhotosSyncReconciliationResult,
  { status: "noChanges" | "ready" }
> & { status: "ready" } {
  return {
    status: "ready",
    preparedSource: preparedSource(),
    bindingFileId: "binding-file",
    binding: current,
    album: {
      id: "album-bound",
      title: "旧タイトル",
      isWriteable: true,
      mediaItemsCount: "1",
    },
    currentAlbumMediaItemIds: ["media-1"],
    plan: plan(),
  };
}

function initialReconciliation(
  current: GooglePhotosSyncBinding | null,
): Extract<
  GooglePhotosSyncReconciliationResult,
  { status: "initialSyncRequired" }
> {
  return {
    status: "initialSyncRequired",
    preparedSource: preparedSource(),
    bindingFileId: current === null ? null : "binding-file",
    binding: current,
  };
}

type AdapterOptions = {
  remoteBinding?: GooglePhotosSyncBinding | null;
  readResults?: ReadDrivePhotosSyncBindingResult[];
  createStatus?: Exclude<CreateDrivePhotosSyncBindingResult["status"], "created">;
  updateStatuses?: Array<
    Exclude<UpdateDrivePhotosSyncBindingResult["status"], "updated">
  >;
  albumResult?: GooglePhotosAlbumCreateResult;
  albumError?: Error;
};

function createAdapters(
  reconciliation: GooglePhotosSyncReconciliationResult,
  options: AdapterOptions = {},
) {
  const order: string[] = [];
  let remoteBinding =
    options.remoteBinding === undefined
      ? reconciliation.status === "ready" ||
        (reconciliation.status === "initialSyncRequired" &&
          reconciliation.binding !== null)
        ? structuredClone(reconciliation.binding)
        : null
      : structuredClone(options.remoteBinding);
  const readResults = [...(options.readResults ?? [])];
  const updateStatuses = [...(options.updateStatuses ?? [])];

  const prepareReconciliation = vi.fn(async () => {
    order.push("reconciliation");
    return reconciliation;
  });
  const readBinding = vi.fn(async (): Promise<ReadDrivePhotosSyncBindingResult> => {
    order.push("readBinding");
    const queued = readResults.shift();
    if (queued) return queued;
    return remoteBinding === null
      ? { status: "unbound" }
      : {
          status: "ready",
          fileId: "binding-file",
          binding: structuredClone(remoteBinding),
        };
  });
  const createBinding = vi.fn(
    async (writeInput): Promise<CreateDrivePhotosSyncBindingResult> => {
      order.push("createBinding");
      if (options.createStatus) return { status: options.createStatus };
      remoteBinding = structuredClone(writeInput.binding);
      return {
        status: "created",
        fileId: "binding-file",
        binding: structuredClone(remoteBinding),
      };
    },
  );
  const updateBinding = vi.fn(
    async (writeInput): Promise<UpdateDrivePhotosSyncBindingResult> => {
      order.push("updateBinding");
      const status = updateStatuses.shift();
      if (status) return { status };
      remoteBinding = structuredClone(writeInput.binding);
      return {
        status: "updated",
        fileId: "binding-file",
        binding: structuredClone(remoteBinding),
      };
    },
  );
  const createAlbum = vi.fn(async (): Promise<GooglePhotosAlbumCreateResult> => {
    order.push("createAlbum");
    if (options.albumError) throw options.albumError;
    return (
      options.albumResult ?? {
        ok: true,
        albumId: "album-created",
        productUrl: "https://photos.example/private-product-url",
      }
    );
  });
  const runWithLock: GooglePhotosSyncStartAdapters["runWithLock"] = async (
    _lockInput,
    write,
  ) => {
    order.push("lockAcquired");
    const value = await write();
    order.push("lockReleased");
    return { acquired: true, value };
  };
  const adapters: GooglePhotosSyncStartAdapters = {
    runWithLock,
    prepareReconciliation,
    readBinding,
    createBinding,
    updateBinding,
    createAlbum,
    now: () => CREATED_AT,
  };
  return {
    adapters,
    order,
    prepareReconciliation,
    readBinding,
    createBinding,
    updateBinding,
    createAlbum,
    getRemoteBinding: () => remoteBinding,
  };
}

describe("Google Photos sync start for an existing bound album", () => {
  it("holds the lock across fresh reconciliation and the pending checkpoint", async () => {
    const reconciliation = readyReconciliation();
    const fixture = createAdapters(reconciliation);
    const result = await startGooglePhotosSyncAfterFreshReconciliation(
      startInput(),
      fixture.adapters,
    );

    expect(fixture.order).toEqual([
      "lockAcquired",
      "reconciliation",
      "readBinding",
      "updateBinding",
      "lockReleased",
    ]);
    expect(result).toMatchObject({
      status: "checkpointed",
      preparedSource: reconciliation.preparedSource,
      plan: reconciliation.plan,
      bindingFileId: "binding-file",
      binding: {
        stable: { generation: 2 },
        pending: { phase: "albumBound", operationId: OPERATION_ID },
      },
    });
    expect(fixture.updateBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStableGeneration: 2,
        binding: expect.objectContaining({
          stable: expect.objectContaining({ generation: 2 }),
          pending: expect.objectContaining({ phase: "albumBound" }),
        }),
      }),
    );
    expect(fixture.createAlbum).not.toHaveBeenCalled();
    expect(fixture.createBinding).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(DRIVE_TOKEN);
    expect(JSON.stringify(result)).not.toContain(PHOTOS_TOKEN);
  });

  it.each(["pending", "album", "generation"] as const)(
    "does not overwrite when fresh binding changed: %s",
    async (change) => {
      const snapshot = stableBinding();
      const remote = structuredClone(snapshot);
      if (change === "pending") {
        const pending = beginGooglePhotosSyncPending({
          binding: remote,
          operationId: "other-operation",
          startedAt: STARTED_AT,
          sourceFingerprint: FINGERPRINT,
          targetTitle: TITLE,
        });
        if (!pending.ok) throw new Error("fixture failed");
        Object.assign(remote, pending.binding);
      } else if (change === "album") {
        remote.album!.albumId = "other-album";
      } else {
        remote.stable!.generation = 3;
      }
      const fixture = createAdapters(readyReconciliation(snapshot), {
        remoteBinding: remote,
      });
      await expect(
        startGooglePhotosSyncAfterFreshReconciliation(startInput(), fixture.adapters),
      ).resolves.toEqual({ status: "staleBinding" });
      expect(fixture.updateBinding).not.toHaveBeenCalled();
      expect(fixture.createAlbum).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["staleGeneration", "staleBinding"],
    ["invalid", "checkpointConflict"],
    ["writeFailed", "checkpointWriteFailed"],
  ] as const)("maps update %s without retry", async (updateStatus, status) => {
    const fixture = createAdapters(readyReconciliation(), {
      updateStatuses: [updateStatus],
    });
    await expect(
      startGooglePhotosSyncAfterFreshReconciliation(startInput(), fixture.adapters),
    ).resolves.toEqual({ status });
    expect(fixture.updateBinding).toHaveBeenCalledTimes(1);
    expect(fixture.createAlbum).not.toHaveBeenCalled();
  });

  it("uses pending validation authority and performs no write for invalid start input", async () => {
    const fixture = createAdapters(readyReconciliation());
    await expect(
      startGooglePhotosSyncAfterFreshReconciliation(
        { ...startInput(), operationId: " invalid " },
        fixture.adapters,
      ),
    ).resolves.toEqual({ status: "invalidStartInput" });
    expect(fixture.readBinding).not.toHaveBeenCalled();
    expect(fixture.updateBinding).not.toHaveBeenCalled();
    expect(fixture.createAlbum).not.toHaveBeenCalled();
  });
});

describe("Google Photos sync initial album checkpoint ordering", () => {
  it("creates the Drive pending checkpoint before album create and then binds albumBound", async () => {
    const fixture = createAdapters(initialReconciliation(null), {
      remoteBinding: null,
    });
    const result = await startGooglePhotosSyncAfterFreshReconciliation(
      startInput(),
      fixture.adapters,
    );

    expect(fixture.order).toEqual([
      "lockAcquired",
      "reconciliation",
      "createBinding",
      "readBinding",
      "createAlbum",
      "readBinding",
      "updateBinding",
      "lockReleased",
    ]);
    expect(fixture.createBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        binding: expect.objectContaining({
          album: null,
          stable: null,
          pending: expect.objectContaining({ phase: "creatingAlbum" }),
        }),
      }),
    );
    expect(fixture.createAlbum).toHaveBeenCalledWith({
      accessToken: PHOTOS_TOKEN,
      title: TITLE,
      signal: expect.any(AbortSignal),
    });
    expect(fixture.updateBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStableGeneration: 0,
        binding: expect.objectContaining({
          album: {
            albumId: "album-created",
            createdAt: CREATED_AT,
            lastKnownTitle: TITLE,
          },
          stable: null,
          pending: expect.objectContaining({ phase: "albumBound" }),
        }),
      }),
    );
    expect(result).toMatchObject({
      status: "checkpointed",
      binding: {
        stable: null,
        pending: { phase: "albumBound" },
      },
    });
    expect(JSON.stringify(result)).not.toContain("private-product-url");
  });

  it("updates an existing empty binding twice and never creates a second binding file", async () => {
    const empty = emptyBinding();
    const fixture = createAdapters(initialReconciliation(empty), {
      remoteBinding: empty,
    });
    await expect(
      startGooglePhotosSyncAfterFreshReconciliation(startInput(), fixture.adapters),
    ).resolves.toMatchObject({
      status: "checkpointed",
      binding: { pending: { phase: "albumBound" }, stable: null },
    });

    expect(fixture.createBinding).not.toHaveBeenCalled();
    expect(fixture.updateBinding).toHaveBeenCalledTimes(2);
    expect(fixture.updateBinding.mock.calls[0]?.[0]).toMatchObject({
      expectedStableGeneration: 0,
      binding: { pending: { phase: "creatingAlbum" } },
    });
    expect(fixture.updateBinding.mock.calls[1]?.[0]).toMatchObject({
      expectedStableGeneration: 0,
      binding: { pending: { phase: "albumBound" } },
    });
  });

  it.each(["alreadyExists", "validationFailed", "writeFailed"] as const)(
    "does not create an album when initial Drive create returns %s",
    async (createStatus) => {
      const fixture = createAdapters(initialReconciliation(null), {
        remoteBinding: null,
        createStatus,
      });
      const result = await startGooglePhotosSyncAfterFreshReconciliation(
        startInput(),
        fixture.adapters,
      );
      expect(result.status).toBe(
        createStatus === "alreadyExists" ? "staleBinding" : "checkpointWriteFailed",
      );
      expect(fixture.createAlbum).not.toHaveBeenCalled();
      expect(fixture.createBinding).toHaveBeenCalledTimes(1);
    },
  );

  it("does not create an album when the creatingAlbum checkpoint cannot be verified", async () => {
    const fixture = createAdapters(initialReconciliation(null), {
      remoteBinding: null,
      readResults: [{ status: "duplicate" }],
    });
    await expect(
      startGooglePhotosSyncAfterFreshReconciliation(startInput(), fixture.adapters),
    ).resolves.toEqual({ status: "checkpointConflict" });
    expect(fixture.createAlbum).not.toHaveBeenCalled();
  });

  it("keeps creatingAlbum pending on an explicit album create failure without retry", async () => {
    const fixture = createAdapters(initialReconciliation(null), {
      remoteBinding: null,
      albumResult: { ok: false },
    });
    await expect(
      startGooglePhotosSyncAfterFreshReconciliation(startInput(), fixture.adapters),
    ).resolves.toEqual({ status: "albumCreateFailed" });
    expect(fixture.createAlbum).toHaveBeenCalledTimes(1);
    expect(fixture.updateBinding).not.toHaveBeenCalled();
    expect(fixture.getRemoteBinding()?.pending?.phase).toBe("creatingAlbum");
  });

  it("classifies a network exception as ambiguous and never recreates automatically", async () => {
    const fixture = createAdapters(initialReconciliation(null), {
      remoteBinding: null,
      albumError: new Error("raw network response URL"),
    });
    const result = await startGooglePhotosSyncAfterFreshReconciliation(
      startInput(),
      fixture.adapters,
    );
    expect(result).toEqual({ status: "albumCreateAmbiguous" });
    expect(JSON.stringify(result)).not.toMatch(/raw network|URL/);
    expect(fixture.createAlbum).toHaveBeenCalledTimes(1);
    expect(fixture.getRemoteBinding()?.pending?.phase).toBe("creatingAlbum");
  });

  it("stops safely when album creation succeeds but albumBound checkpoint fails", async () => {
    const fixture = createAdapters(initialReconciliation(null), {
      remoteBinding: null,
      updateStatuses: ["writeFailed"],
    });
    const result = await startGooglePhotosSyncAfterFreshReconciliation(
      startInput(),
      fixture.adapters,
    );
    expect(result).toEqual({ status: "albumCreatedCheckpointFailed" });
    expect(fixture.createAlbum).toHaveBeenCalledTimes(1);
    expect(fixture.updateBinding).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/album-created|binding-file/);
    expect(fixture.getRemoteBinding()?.pending?.phase).toBe("creatingAlbum");
  });

  it("fails safely if the explicit album checkpoint clock is invalid", async () => {
    const fixture = createAdapters(initialReconciliation(null), {
      remoteBinding: null,
    });
    fixture.adapters.now = () => "invalid-time";
    await expect(
      startGooglePhotosSyncAfterFreshReconciliation(startInput(), fixture.adapters),
    ).resolves.toEqual({ status: "albumCreatedCheckpointFailed" });
    expect(fixture.createAlbum).toHaveBeenCalledTimes(1);
    expect(fixture.updateBinding).not.toHaveBeenCalled();
  });
});

describe("Google Photos sync start failure boundaries and abort", () => {
  it("performs zero I/O when the lock is unavailable or already held", async () => {
    for (const reason of ["locked", "lockUnavailable"] as const) {
      const fixture = createAdapters(readyReconciliation());
      fixture.adapters.runWithLock = async () => ({ acquired: false, reason });
      await expect(
        startGooglePhotosSyncAfterFreshReconciliation(startInput(), fixture.adapters),
      ).resolves.toEqual({ status: reason });
      expect(fixture.prepareReconciliation).not.toHaveBeenCalled();
      expect(fixture.readBinding).not.toHaveBeenCalled();
      expect(fixture.updateBinding).not.toHaveBeenCalled();
      expect(fixture.createAlbum).not.toHaveBeenCalled();
    }
  });

  it("performs zero writes for blocked reconciliation and noChanges", async () => {
    const blocked = createAdapters({
      status: "bindingDuplicate",
      preparedSource: preparedSource(),
    });
    await expect(
      startGooglePhotosSyncAfterFreshReconciliation(startInput(), blocked.adapters),
    ).resolves.toEqual({
      status: "reconciliationBlocked",
      reason: "bindingDuplicate",
    });
    expect(blocked.createBinding).not.toHaveBeenCalled();
    expect(blocked.updateBinding).not.toHaveBeenCalled();
    expect(blocked.createAlbum).not.toHaveBeenCalled();

    const matching = readyReconciliation();
    const noChanges = createAdapters({ ...matching, status: "noChanges" });
    await expect(
      startGooglePhotosSyncAfterFreshReconciliation(startInput(), noChanges.adapters),
    ).resolves.toEqual({ status: "noChanges" });
    expect(noChanges.readBinding).not.toHaveBeenCalled();
    expect(noChanges.updateBinding).not.toHaveBeenCalled();
    expect(noChanges.createAlbum).not.toHaveBeenCalled();
  });

  it("rejects an already-aborted signal before lock or reconciliation", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    const fixture = createAdapters(readyReconciliation());
    await expect(
      startGooglePhotosSyncAfterFreshReconciliation(
        startInput(controller.signal),
        fixture.adapters,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.prepareReconciliation).not.toHaveBeenCalled();
  });

  it("propagates AbortError from reconciliation", async () => {
    const fixture = createAdapters(readyReconciliation());
    fixture.prepareReconciliation.mockRejectedValueOnce(
      new DOMException("cancelled", "AbortError"),
    );
    await expect(
      startGooglePhotosSyncAfterFreshReconciliation(startInput(), fixture.adapters),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.updateBinding).not.toHaveBeenCalled();
  });

  it("propagates caller abort from a Drive write and does not continue", async () => {
    const controller = new AbortController();
    const fixture = createAdapters(readyReconciliation());
    fixture.updateBinding.mockImplementationOnce(async () => {
      controller.abort(new DOMException("cancelled", "AbortError"));
      return { status: "writeFailed" };
    });
    await expect(
      startGooglePhotosSyncAfterFreshReconciliation(
        startInput(controller.signal),
        fixture.adapters,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.updateBinding).toHaveBeenCalledTimes(1);
    expect(fixture.createAlbum).not.toHaveBeenCalled();
  });

  it("propagates AbortError during album creation without cleanup or retry", async () => {
    const fixture = createAdapters(initialReconciliation(null), {
      remoteBinding: null,
      albumError: new DOMException("cancelled", "AbortError"),
    });
    await expect(
      startGooglePhotosSyncAfterFreshReconciliation(startInput(), fixture.adapters),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.createAlbum).toHaveBeenCalledTimes(1);
    expect(fixture.updateBinding).not.toHaveBeenCalled();
    expect(fixture.getRemoteBinding()?.pending?.phase).toBe("creatingAlbum");
  });
});

describe("Google Photos sync start static security boundary", () => {
  it("uses existing primitives without direct upload, membership, title, retry, or storage code", () => {
    const source = readFileSync(new URL("./sync-start.ts", import.meta.url), "utf8");
    for (const forbidden of [
      /\bfetch\s*\(/,
      /localStorage/,
      /sessionStorage/,
      /indexedDB/,
      /document\.cookie/,
      /console\.(?:log|error|warn)/,
      /setTimeout/,
      /resumable/i,
      /batchCreate/i,
      /batchAdd/i,
      /batchRemove/i,
      /updateGooglePhotosSyncAlbumTitle/,
      /recordGooglePhotosSyncMediaPrepared/,
      /finalizeGooglePhotosSyncPending/,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
    expect(source).toContain("createGooglePhotosAlbum");
    expect(source).toContain("createDrivePhotosSyncBinding");
    expect(source).toContain("updateDrivePhotosSyncBindingBestEffort");
  });
});
