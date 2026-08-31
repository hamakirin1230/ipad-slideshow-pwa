import { describe, expect, it, vi } from "vitest";
import type { DriveProjectSummary } from "../google-drive";
import type {
  ReadDrivePhotosSyncBindingResult,
  UpdateDrivePhotosSyncBindingResult,
} from "./drive-sync-binding";
import type { GooglePhotosRenderedImage } from "./image-renderer";
import type { GooglePhotosBatchCreateResult } from "./library-api";
import type { GooglePhotosSessionQueryResult } from "./resumable-upload";
import {
  createGooglePhotosSyncMediaItemsAfterAlbumBound,
  type GooglePhotosSyncMediaAdapters,
  type GooglePhotosSyncMediaRuntime,
} from "./sync-media";
import {
  buildEmptyGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
} from "./sync-binding";
import type {
  GooglePhotosSyncPreparedItem,
  GooglePhotosSyncPreparedSource,
  PrepareGooglePhotosSyncSourceResult,
} from "./sync-drive-source";
import type { GooglePhotosSyncAlbumReadResult } from "./sync-library-api";
import type {
  GooglePhotosIncrementalSyncPlan,
  GooglePhotosIncrementalSyncPlanResult,
} from "./sync-plan";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "sync-operation";
const FINGERPRINT = `sha256:${"a".repeat(64)}`;
const KEY_REUSE = `sha256:${"b".repeat(64)}`;
const KEY_CREATE = `sha256:${"c".repeat(64)}`;
const KEY_CREATE_2 = `sha256:${"d".repeat(64)}`;
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

function preparedItem(input: {
  slideId: string;
  renderKey: string;
  assetFileId: string;
  slideIndex: number;
  caption?: string;
}): GooglePhotosSyncPreparedItem {
  return {
    slideIndex: input.slideIndex,
    slideId: input.slideId,
    assetFileId: input.assetFileId,
    mediaKind: "image",
    mimeType: "image/jpeg",
    sizeBytes: 4,
    description: input.caption ?? "caption",
    imageEdit: { rotation: 90 },
    fileName: `${input.slideId}.jpg`,
    sourceChecksum: "checksum",
    sourceModifiedTime: null,
    outputMimeType: "image/jpeg",
    renderKey: input.renderKey,
    reuseEligible: true,
  };
}

function preparedSource(
  items = [
    preparedItem({
      slideId: "slide-reuse",
      renderKey: KEY_REUSE,
      assetFileId: "asset-reuse",
      slideIndex: 0,
    }),
    preparedItem({
      slideId: "slide-create",
      renderKey: KEY_CREATE,
      assetFileId: "asset-create",
      slideIndex: 1,
      caption: "作成キャプション",
    }),
  ],
): GooglePhotosSyncPreparedSource {
  return {
    projectId: PROJECT_ID,
    projectTitle: TITLE,
    targetAlbumTitle: TITLE,
    sourceSlideCount: items.length,
    skippedVideoCount: 0,
    totalBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
    rendererVersion: 1,
    items,
    desiredSlides: items.map((item) => ({
      slideId: item.slideId,
      renderKey: item.renderKey,
      reuseEligible: item.reuseEligible,
    })),
    sourceFingerprint: FINGERPRINT,
  };
}

function albumBoundBinding(): GooglePhotosSyncBinding {
  return {
    ...buildEmptyGooglePhotosSyncBinding({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    }),
    album: {
      albumId: "album-id",
      createdAt: "2026-08-30T01:00:00.000Z",
      lastKnownTitle: TITLE,
    },
    stable: {
      generation: 3,
      completedAt: "2026-08-30T02:00:00.000Z",
      rendererVersion: 1,
      items: [
        {
          slideId: "slide-reuse",
          renderKey: KEY_REUSE,
          mediaItemId: "media-reuse",
        },
      ],
    },
    pending: {
      operationId: OPERATION_ID,
      startedAt: "2026-08-31T03:00:00.000Z",
      phase: "albumBound",
      sourceFingerprint: FINGERPRINT,
      targetTitle: TITLE,
      previousManagedMediaItemIds: ["media-reuse"],
      targetItems: [],
    },
  };
}

function createPlan(): GooglePhotosIncrementalSyncPlan {
  return {
    targetItems: [
      {
        kind: "reuse",
        slideId: "slide-reuse",
        renderKey: KEY_REUSE,
        mediaItemId: "media-reuse",
      },
      { kind: "create", slideId: "slide-create", renderKey: KEY_CREATE },
    ],
    createItems: [
      { kind: "create", slideId: "slide-create", renderKey: KEY_CREATE },
    ],
    removeManagedMediaItemIds: ["media-reuse"],
    membershipNeedsRebuild: true,
    titleNeedsUpdate: false,
    sourceFingerprint: FINGERPRINT,
  };
}

function reusePlan(): GooglePhotosIncrementalSyncPlan {
  return {
    targetItems: [
      {
        kind: "reuse",
        slideId: "slide-reuse",
        renderKey: KEY_REUSE,
        mediaItemId: "media-reuse",
      },
    ],
    createItems: [],
    removeManagedMediaItemIds: [],
    membershipNeedsRebuild: false,
    titleNeedsUpdate: true,
    sourceFingerprint: FINGERPRINT,
  };
}

function mediaInput(signal = new AbortController().signal) {
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

function adapterHarness(options: {
  sourceResults?: GooglePhotosSyncPreparedSource[];
  plans?: GooglePhotosIncrementalSyncPlan[];
  initialBinding?: GooglePhotosSyncBinding;
  updateResults?: UpdateDrivePhotosSyncBindingResult["status"][];
  batchResult?: GooglePhotosBatchCreateResult;
  batchError?: Error;
  renderResult?: GooglePhotosRenderedImage;
  queryResult?: GooglePhotosSessionQueryResult;
  uploadError?: Error;
  albumResults?: GooglePhotosSyncAlbumReadResult[];
  mutateBeforeRead?: (readCount: number, remote: GooglePhotosSyncBinding) => GooglePhotosSyncBinding;
} = {}) {
  let remote = structuredClone(options.initialBinding ?? albumBoundBinding());
  let sourceCount = 0;
  let planCount = 0;
  let readCount = 0;
  let updateCount = 0;
  let albumCount = 0;
  const events: string[] = [];

  const prepareSource = vi.fn(async (): Promise<PrepareGooglePhotosSyncSourceResult> => {
    events.push("source");
    const values = options.sourceResults ?? [preparedSource()];
    const source = values[Math.min(sourceCount, values.length - 1)];
    sourceCount += 1;
    return source ? { ok: true, source: structuredClone(source) } : { ok: false, error: { kind: "drivePreflightFailed", message: "safe" } };
  });
  const readBinding = vi.fn(async (): Promise<ReadDrivePhotosSyncBindingResult> => {
    events.push("binding-read");
    readCount += 1;
    if (options.mutateBeforeRead) {
      remote = options.mutateBeforeRead(readCount, structuredClone(remote));
    }
    return { status: "ready", fileId: "binding-file", binding: structuredClone(remote) };
  });
  const updateBinding = vi.fn(
    async (input: Parameters<GooglePhotosSyncMediaAdapters["updateBinding"]>[0]): Promise<UpdateDrivePhotosSyncBindingResult> => {
      events.push(`binding-write-${input.binding.pending?.phase}`);
      const status = options.updateResults?.[updateCount] ?? "updated";
      updateCount += 1;
      if (status !== "updated") return { status } as UpdateDrivePhotosSyncBindingResult;
      expect(input.expectedStableGeneration).toBe(3);
      remote = structuredClone(input.binding);
      return { status: "updated", fileId: "binding-file", binding: structuredClone(remote) };
    },
  );
  const getAlbum = vi.fn(async (): Promise<GooglePhotosSyncAlbumReadResult> => {
    events.push("album");
    const fallback: GooglePhotosSyncAlbumReadResult = {
      status: "ready",
      album: {
        id: "album-id",
        title: TITLE,
        isWriteable: true,
        mediaItemsCount: "1",
      },
    };
    const values = options.albumResults ?? [fallback];
    const result = values[Math.min(albumCount, values.length - 1)] ?? fallback;
    albumCount += 1;
    return structuredClone(result);
  });
  const searchAlbumMediaItemsPage = vi.fn(async () => {
    events.push("membership");
    return { status: "ready" as const, mediaItemIds: ["media-reuse"], nextPageToken: null };
  });
  const planSync = vi.fn(async (): Promise<GooglePhotosIncrementalSyncPlanResult> => {
    events.push("plan");
    const values = options.plans ?? [createPlan()];
    const plan = values[Math.min(planCount, values.length - 1)];
    planCount += 1;
    return plan ? { ok: true, plan: structuredClone(plan) } : { ok: false, reason: "invalidDesiredItems" };
  });
  const openDriveAssetStream = vi.fn(async (input: { assetFileId: string }) => {
    events.push(`open-${input.assetFileId}`);
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
        controller.close();
      },
    });
  });
  const renderImage = vi.fn(async (): Promise<GooglePhotosRenderedImage> => {
    events.push("render");
    return options.renderResult ?? {
      blob: new Blob([new Uint8Array([5, 6, 7])], { type: "image/jpeg" }),
      mimeType: "image/jpeg",
      fileName: "rendered-output.jpg",
    };
  });
  const startSession = vi.fn(async () => {
    events.push("upload-start");
    return { sessionUrl: "private-session-url", chunkGranularity: 1 };
  });
  const uploadChunk = vi.fn(async (input: { finalize: boolean }) => {
    events.push("upload-chunk");
    if (options.uploadError) throw options.uploadError;
    return input.finalize ? "private-upload-token" : null;
  });
  const querySession = vi.fn(async (): Promise<GooglePhotosSessionQueryResult> => {
    events.push("upload-query");
    return options.queryResult ?? { ok: false };
  });
  const batchCreate = vi.fn(async (): Promise<GooglePhotosBatchCreateResult> => {
    events.push("batch-create");
    if (options.batchError) throw options.batchError;
    return options.batchResult ?? { ok: true, mediaItemIds: ["media-created"] };
  });
  const runWithLock: GooglePhotosSyncMediaAdapters["runWithLock"] = async (
    _input,
    write,
  ) => {
    events.push("lock");
    return { acquired: true, value: await write() };
  };

  const adapters: GooglePhotosSyncMediaAdapters = {
    runWithLock,
    prepareSource,
    readBinding,
    updateBinding,
    getAlbum,
    searchAlbumMediaItemsPage,
    planSync,
    openDriveAssetStream: openDriveAssetStream as GooglePhotosSyncMediaAdapters["openDriveAssetStream"],
    renderImage,
    resumable: { startSession, uploadChunk, querySession },
    batchCreate,
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
      planSync,
      openDriveAssetStream,
      renderImage,
      startSession,
      uploadChunk,
      querySession,
      batchCreate,
    },
    remote: () => structuredClone(remote),
  };
}

describe("Google Photos sync media execution", () => {
  it("directly checkpoints a complete reuse-only mapping without Photos writes", async () => {
    const source = preparedSource().items.slice(0, 1);
    const harness = adapterHarness({
      sourceResults: [preparedSource(source)],
      plans: [reusePlan()],
    });

    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      mediaInput(),
      harness.adapters,
    );

    expect(result).toEqual({ status: "mediaPrepared" });
    expect(harness.spies.openDriveAssetStream).not.toHaveBeenCalled();
    expect(harness.spies.renderImage).not.toHaveBeenCalled();
    expect(harness.spies.startSession).not.toHaveBeenCalled();
    expect(harness.spies.batchCreate).not.toHaveBeenCalled();
    expect(harness.spies.updateBinding).toHaveBeenCalledTimes(1);
    expect(harness.remote().pending).toMatchObject({
      phase: "mediaPrepared",
      targetItems: [
        { slideId: "slide-reuse", renderKey: KEY_REUSE, mediaItemId: "media-reuse" },
      ],
    });
    expect(harness.remote().stable?.generation).toBe(3);
  });

  it("renders only create items and checkpoints before and after one batchCreate", async () => {
    const harness = adapterHarness();

    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      mediaInput(),
      harness.adapters,
    );

    expect(result).toEqual({ status: "mediaPrepared" });
    expect(harness.spies.openDriveAssetStream).toHaveBeenCalledTimes(1);
    expect(harness.spies.openDriveAssetStream).toHaveBeenCalledWith(
      expect.objectContaining({ assetFileId: "asset-create" }),
    );
    expect(harness.spies.renderImage).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: "作成キャプション",
        imageEdit: { rotation: 90 },
        slideIndex: 1,
      }),
    );
    expect(harness.spies.batchCreate).toHaveBeenCalledTimes(1);
    expect(harness.spies.batchCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          {
            description: "作成キャプション",
            fileName: "rendered-output.jpg",
            uploadToken: "private-upload-token",
          },
        ],
      }),
    );
    expect(harness.events.indexOf("binding-write-mediaCreating")).toBeLessThan(
      harness.events.indexOf("batch-create"),
    );
    expect(harness.events.indexOf("batch-create")).toBeLessThan(
      harness.events.indexOf("binding-write-mediaPrepared"),
    );
    expect(harness.spies.prepareSource).toHaveBeenCalledTimes(2);
    expect(harness.spies.getAlbum).toHaveBeenCalledTimes(2);
    expect(harness.spies.planSync).toHaveBeenCalledTimes(2);
    expect(harness.remote().pending?.targetItems).toEqual([
      { slideId: "slide-reuse", renderKey: KEY_REUSE, mediaItemId: "media-reuse" },
      { slideId: "slide-create", renderKey: KEY_CREATE, mediaItemId: "media-created" },
    ]);
    expect(harness.remote().stable?.generation).toBe(3);
  });

  it("maps prepared items by slideId and renderKey while preserving create request order", async () => {
    const first = preparedItem({
      slideId: "slide-create",
      renderKey: KEY_CREATE,
      assetFileId: "asset-create",
      slideIndex: 0,
      caption: "first caption",
    });
    const second = preparedItem({
      slideId: "slide-create-2",
      renderKey: KEY_CREATE_2,
      assetFileId: "asset-create-2",
      slideIndex: 1,
      caption: "second caption",
    });
    const plan: GooglePhotosIncrementalSyncPlan = {
      ...createPlan(),
      targetItems: [
        { kind: "create", slideId: first.slideId, renderKey: first.renderKey },
        { kind: "create", slideId: second.slideId, renderKey: second.renderKey },
      ],
      createItems: [
        { kind: "create", slideId: first.slideId, renderKey: first.renderKey },
        { kind: "create", slideId: second.slideId, renderKey: second.renderKey },
      ],
    };
    const harness = adapterHarness({
      sourceResults: [preparedSource([second, first])],
      plans: [plan],
      batchResult: { ok: true, mediaItemIds: ["created-first", "created-second"] },
    });
    harness.adapters.renderImage = vi.fn(async (input) => ({
      blob: new Blob([1], { type: "image/jpeg" }),
      mimeType: "image/jpeg" as const,
      fileName: `${input.caption}.jpg`,
    }));
    harness.adapters.resumable.startSession = vi.fn(async (input) => ({
      sessionUrl: `session-${input.fileName}`,
      chunkGranularity: 1,
    }));
    harness.adapters.resumable.uploadChunk = vi.fn(async (input) =>
      input.finalize ? `token-${input.sessionUrl}` : null,
    );

    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      mediaInput(),
      harness.adapters,
    );

    expect(result).toEqual({ status: "mediaPrepared" });
    expect(harness.spies.openDriveAssetStream.mock.calls.map(([call]) => call.assetFileId)).toEqual([
      "asset-create",
      "asset-create-2",
    ]);
    expect(harness.spies.batchCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            description: "first caption",
            fileName: "first caption.jpg",
            uploadToken: "token-session-first caption.jpg",
          }),
          expect.objectContaining({
            description: "second caption",
            fileName: "second caption.jpg",
            uploadToken: "token-session-second caption.jpg",
          }),
        ],
      }),
    );
    expect(harness.remote().pending?.targetItems).toEqual([
      { slideId: first.slideId, renderKey: first.renderKey, mediaItemId: "created-first" },
      { slideId: second.slideId, renderKey: second.renderKey, mediaItemId: "created-second" },
    ]);
  });

  it.each([
    ["output MIME", { blob: new Blob([1], { type: "image/png" }), mimeType: "image/png", fileName: "bad.png" }],
    ["upload size", { blob: new Blob([], { type: "image/jpeg" }), mimeType: "image/jpeg", fileName: "empty.jpg" }],
  ])("fails closed for invalid rendered %s", async (_name, renderResult) => {
    const harness = adapterHarness({ renderResult });
    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      mediaInput(),
      harness.adapters,
    );
    expect(result).toEqual({ status: "renderFailed" });
    expect(harness.spies.batchCreate).not.toHaveBeenCalled();
    expect(harness.spies.updateBinding).not.toHaveBeenCalled();
    expect(harness.remote().pending?.phase).toBe("albumBound");
  });

  it("stops before checkpoint and batchCreate when source changes after upload", async () => {
    const changed = { ...preparedSource(), sourceFingerprint: `sha256:${"e".repeat(64)}` };
    const harness = adapterHarness({ sourceResults: [preparedSource(), changed] });
    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      mediaInput(),
      harness.adapters,
    );
    expect(result).toEqual({ status: "sourceChanged" });
    expect(harness.spies.batchCreate).not.toHaveBeenCalled();
    expect(harness.spies.updateBinding).not.toHaveBeenCalled();
  });

  it("rejects changed media identity after upload while allowing non-identity plan fields", async () => {
    const changed = createPlan();
    changed.targetItems = [
      changed.targetItems[0]!,
      { kind: "create", slideId: "slide-create", renderKey: KEY_CREATE_2 },
    ];
    changed.createItems = [
      { kind: "create", slideId: "slide-create", renderKey: KEY_CREATE_2 },
    ];
    const harness = adapterHarness({ plans: [createPlan(), changed] });
    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      mediaInput(),
      harness.adapters,
    );
    expect(result).toEqual({ status: "mediaPlanChanged" });
    expect(harness.spies.batchCreate).not.toHaveBeenCalled();
    expect(harness.spies.updateBinding).not.toHaveBeenCalled();
  });

  it("never calls batchCreate if the mediaCreating checkpoint write fails", async () => {
    const harness = adapterHarness({ updateResults: ["writeFailed"] });
    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      mediaInput(),
      harness.adapters,
    );
    expect(result).toEqual({ status: "checkpointWriteFailed" });
    expect(harness.spies.batchCreate).not.toHaveBeenCalled();
  });

  it("freshly verifies mediaCreating before batchCreate", async () => {
    const harness = adapterHarness({
      mutateBeforeRead(readCount, remote) {
        if (readCount === 3 && remote.pending?.phase === "mediaCreating") {
          remote.pending.operationId = "other-operation";
        }
        return remote;
      },
    });
    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      mediaInput(),
      harness.adapters,
    );
    expect(result).toEqual({ status: "checkpointConflict" });
    expect(harness.spies.batchCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["explicit failure", { batchResult: { ok: false, kind: "mediaCreatePartial" } as const }],
    ["partial response", { batchResult: { ok: true, mediaItemIds: [] } as const }],
    ["duplicate IDs", { batchResult: { ok: true, mediaItemIds: ["same", "same"] } as const }],
    ["network ambiguity", { batchError: new Error("raw private response") }],
  ])("leaves mediaCreating and never retries after %s", async (_name, option) => {
    const twoCreateSource = preparedSource([
      preparedItem({ slideId: "slide-create", renderKey: KEY_CREATE, assetFileId: "asset-create", slideIndex: 0 }),
      preparedItem({ slideId: "slide-create-2", renderKey: KEY_CREATE_2, assetFileId: "asset-create-2", slideIndex: 1 }),
    ]);
    const twoCreatePlan: GooglePhotosIncrementalSyncPlan = {
      ...createPlan(),
      targetItems: [
        { kind: "create", slideId: "slide-create", renderKey: KEY_CREATE },
        { kind: "create", slideId: "slide-create-2", renderKey: KEY_CREATE_2 },
      ],
      createItems: [
        { kind: "create", slideId: "slide-create", renderKey: KEY_CREATE },
        { kind: "create", slideId: "slide-create-2", renderKey: KEY_CREATE_2 },
      ],
    };
    const harness = adapterHarness({
      sourceResults: [twoCreateSource],
      plans: [twoCreatePlan],
      ...option,
    });
    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      mediaInput(),
      harness.adapters,
    );
    expect(result).toEqual({ status: "mediaCreateRecoveryRequired" });
    expect(harness.spies.batchCreate).toHaveBeenCalledTimes(1);
    expect(harness.remote().pending?.phase).toBe("mediaCreating");
    expect(harness.spies.updateBinding).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("raw private response");
  });

  it("reports a post-create checkpoint failure without replay or rollback", async () => {
    const harness = adapterHarness({ updateResults: ["updated", "writeFailed"] });
    const runtimeEvents: GooglePhotosSyncMediaRuntime[] = [];
    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      { ...mediaInput(), onRuntime: (runtime) => runtimeEvents.push(runtime) },
      harness.adapters,
    );
    expect(result).toEqual({ status: "mediaCreatedCheckpointFailed" });
    expect(harness.spies.batchCreate).toHaveBeenCalledTimes(1);
    expect(harness.remote().pending?.phase).toBe("mediaCreating");
    expect(runtimeEvents.at(-1)?.createdTargetItems).toEqual([
      { slideId: "slide-reuse", renderKey: KEY_REUSE, mediaItemId: "media-reuse" },
      { slideId: "slide-create", renderKey: KEY_CREATE, mediaItemId: "media-created" },
    ]);
    expect(JSON.stringify(result)).not.toContain("media-created");
  });

  it("reuses completed runtime uploads only for the same ordered creation identity", async () => {
    const runtime: GooglePhotosSyncMediaRuntime = {
      operationId: OPERATION_ID,
      sourceFingerprint: FINGERPRINT,
      createIdentity: [{ slideId: "slide-create", renderKey: KEY_CREATE }],
      completedUploads: [
        {
          slideId: "slide-create",
          renderKey: KEY_CREATE,
          uploadToken: "retained-private-token",
          fileName: "retained.jpg",
        },
      ],
      currentUpload: null,
    };
    const harness = adapterHarness();
    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      { ...mediaInput(), runtime },
      harness.adapters,
    );
    expect(result).toEqual({ status: "mediaPrepared" });
    expect(harness.spies.openDriveAssetStream).not.toHaveBeenCalled();
    expect(harness.spies.startSession).not.toHaveBeenCalled();
    expect(harness.spies.batchCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ uploadToken: "retained-private-token" })],
      }),
    );
  });

  it("resumes an active current session from the authoritative offset", async () => {
    const runtime: GooglePhotosSyncMediaRuntime = {
      operationId: OPERATION_ID,
      sourceFingerprint: FINGERPRINT,
      createIdentity: [{ slideId: "slide-create", renderKey: KEY_CREATE }],
      completedUploads: [],
      currentUpload: {
        slideId: "slide-create",
        renderKey: KEY_CREATE,
        sessionUrl: "private-session-url",
        chunkGranularity: 1,
        offset: 0,
        payloadMimeType: "image/jpeg",
        payloadSizeBytes: 3,
        payloadFileName: "rendered-output.jpg",
      },
    };
    const harness = adapterHarness({ queryResult: { ok: true, status: "active", offset: 2 } });
    await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      { ...mediaInput(), runtime },
      harness.adapters,
    );
    expect(harness.spies.querySession).toHaveBeenCalledTimes(1);
    expect(harness.spies.startSession).not.toHaveBeenCalled();
    expect(harness.spies.uploadChunk).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 2, finalize: true }),
    );
  });

  it("keeps completed uploads in memory and does not checkpoint after a later upload fails", async () => {
    const items = [
      preparedItem({ slideId: "slide-create", renderKey: KEY_CREATE, assetFileId: "asset-create", slideIndex: 0 }),
      preparedItem({ slideId: "slide-create-2", renderKey: KEY_CREATE_2, assetFileId: "asset-create-2", slideIndex: 1 }),
    ];
    const plan: GooglePhotosIncrementalSyncPlan = {
      ...createPlan(),
      targetItems: items.map((item) => ({ kind: "create" as const, slideId: item.slideId, renderKey: item.renderKey })),
      createItems: items.map((item) => ({ kind: "create" as const, slideId: item.slideId, renderKey: item.renderKey })),
    };
    const harness = adapterHarness({ sourceResults: [preparedSource(items)], plans: [plan] });
    let finalizeCount = 0;
    harness.adapters.resumable.uploadChunk = vi.fn(async (input) => {
      if (!input.finalize) return null;
      finalizeCount += 1;
      if (finalizeCount === 2) throw new Error("private network error");
      return "token-first";
    });
    let latestRuntime: GooglePhotosSyncMediaRuntime | undefined;

    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      {
        ...mediaInput(),
        onRuntime: (runtime) => {
          latestRuntime = runtime;
        },
      },
      harness.adapters,
    );

    expect(result).toEqual({ status: "uploadFailed" });
    expect(latestRuntime?.completedUploads).toHaveLength(1);
    expect(latestRuntime?.completedUploads[0]).toMatchObject({
      slideId: "slide-create",
      renderKey: KEY_CREATE,
    });
    expect(harness.spies.batchCreate).not.toHaveBeenCalled();
    expect(harness.spies.updateBinding).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private network error");
  });

  it("starts only the current item with a new session when its saved session is invalid", async () => {
    const runtime: GooglePhotosSyncMediaRuntime = {
      operationId: OPERATION_ID,
      sourceFingerprint: FINGERPRINT,
      createIdentity: [{ slideId: "slide-create", renderKey: KEY_CREATE }],
      completedUploads: [],
      currentUpload: {
        slideId: "slide-create",
        renderKey: KEY_CREATE,
        sessionUrl: "expired-private-session",
        chunkGranularity: 1,
        offset: 1,
        payloadMimeType: "image/jpeg",
        payloadSizeBytes: 3,
        payloadFileName: "rendered-output.jpg",
      },
    };
    const harness = adapterHarness({ queryResult: { ok: false } });
    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      { ...mediaInput(), runtime },
      harness.adapters,
    );
    expect(result).toEqual({ status: "mediaPrepared" });
    expect(harness.spies.querySession).toHaveBeenCalledTimes(1);
    expect(harness.spies.startSession).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing", { status: "notFound" } as const, "targetMissing"],
    [
      "non-writable",
      {
        status: "ready",
        album: { id: "album-id", title: TITLE, isWriteable: false, mediaItemsCount: "1" },
      } as const,
      "targetNotWritable",
    ],
  ])("blocks batchCreate when the fresh album is %s", async (_name, albumResult, status) => {
    const ready: GooglePhotosSyncAlbumReadResult = {
      status: "ready",
      album: { id: "album-id", title: TITLE, isWriteable: true, mediaItemsCount: "1" },
    };
    const harness = adapterHarness({ albumResults: [ready, albumResult] });
    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      mediaInput(),
      harness.adapters,
    );
    expect(result).toEqual({ status });
    expect(harness.spies.batchCreate).not.toHaveBeenCalled();
  });

  it("blocks batchCreate when stable binding content changes after upload", async () => {
    const harness = adapterHarness({
      mutateBeforeRead(readCount, remote) {
        if (readCount === 2 && remote.stable) remote.stable.generation += 1;
        return remote;
      },
    });
    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      mediaInput(),
      harness.adapters,
    );
    expect(result).toEqual({ status: "staleBinding" });
    expect(harness.spies.batchCreate).not.toHaveBeenCalled();
  });

  it("contains no persistence, logging, or direct protocol implementation", async () => {
    const source = await import("node:fs").then(({ readFileSync }) =>
      readFileSync(new URL("./sync-media.ts", import.meta.url), "utf8"),
    );
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    expect(source).not.toMatch(/console\.(?:log|warn|error)/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toContain("photoslibrary.googleapis.com");
  });

  it("fails closed before all I/O when the lock is unavailable", async () => {
    const harness = adapterHarness();
    harness.adapters.runWithLock = async () => ({
      acquired: false,
      reason: "locked",
    });
    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      mediaInput(),
      harness.adapters,
    );
    expect(result).toEqual({ status: "locked" });
    expect(harness.spies.prepareSource).not.toHaveBeenCalled();
    expect(harness.spies.readBinding).not.toHaveBeenCalled();
    expect(harness.spies.getAlbum).not.toHaveBeenCalled();
    expect(harness.spies.batchCreate).not.toHaveBeenCalled();
  });

  it.each(["creatingAlbum", "mediaPrepared", "membershipRemoving", "membershipAdding", "titleUpdating", "finalizing"] as const)(
    "does not run media operations from %s",
    async (phase) => {
      const binding = albumBoundBinding();
      if (binding.pending) binding.pending.phase = phase;
      const harness = adapterHarness({ initialBinding: binding });
      const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
        mediaInput(),
        harness.adapters,
      );
      expect(result).toEqual({ status: "wrongPhase" });
      expect(harness.spies.getAlbum).not.toHaveBeenCalled();
      expect(harness.spies.openDriveAssetStream).not.toHaveBeenCalled();
      expect(harness.spies.batchCreate).not.toHaveBeenCalled();
    },
  );

  it("requires manual recovery and never replays batchCreate from mediaCreating", async () => {
    const binding = albumBoundBinding();
    if (binding.pending) binding.pending.phase = "mediaCreating";
    const harness = adapterHarness({ initialBinding: binding });
    const result = await createGooglePhotosSyncMediaItemsAfterAlbumBound(
      mediaInput(),
      harness.adapters,
    );
    expect(result).toEqual({ status: "mediaCreateRecoveryRequired" });
    expect(harness.spies.openDriveAssetStream).not.toHaveBeenCalled();
    expect(harness.spies.batchCreate).not.toHaveBeenCalled();
  });

  it("propagates AbortError after mediaCreating without retrying batchCreate", async () => {
    const controller = new AbortController();
    const abort = new DOMException("aborted", "AbortError");
    const harness = adapterHarness({ batchError: abort });
    harness.adapters.batchCreate = vi.fn(async () => {
      controller.abort(abort);
      throw abort;
    });
    await expect(
      createGooglePhotosSyncMediaItemsAfterAlbumBound(
        mediaInput(controller.signal),
        harness.adapters,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(harness.adapters.batchCreate).toHaveBeenCalledTimes(1);
    expect(harness.remote().pending?.phase).toBe("mediaCreating");
  });
});
