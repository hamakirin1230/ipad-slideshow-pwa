import type { DriveProjectSummary } from "../google-drive";
import {
  readDrivePhotosSyncBinding,
  updateDrivePhotosSyncBindingBestEffort,
  type ReadDrivePhotosSyncBindingResult,
  type UpdateDrivePhotosSyncBindingResult,
} from "./drive-sync-binding";
import { openDriveProjectAssetStream } from "./drive-media";
import {
  isGooglePhotosRenderedImageWithinUploadLimit,
  renderGooglePhotosExportImage,
  type GooglePhotosImageRenderInput,
  type GooglePhotosRenderedImage,
} from "./image-renderer";
import {
  batchCreateGooglePhotosMediaItems,
  type GooglePhotosBatchCreateResult,
} from "./library-api";
import {
  isGooglePhotosResumeOffsetValid,
  queryGooglePhotosResumableSession,
  startGooglePhotosResumableSession,
  uploadGooglePhotosResumableChunk,
  uploadGooglePhotosResumableStream,
  type GooglePhotosResumableSession,
  type GooglePhotosResumableUploadAdapter,
} from "./resumable-upload";
import {
  readAllGooglePhotosSyncAlbumMediaItemIds,
} from "./sync-reconciliation";
import {
  getGooglePhotosSyncAlbum,
  searchGooglePhotosSyncAlbumMediaItemsPage,
  type GooglePhotosSyncAlbum,
  type GooglePhotosSyncAlbumReadResult,
  type GooglePhotosSyncMediaItemPageResult,
} from "./sync-library-api";
import {
  getGooglePhotosSyncExpectedStableGeneration,
  inspectGooglePhotosSyncPendingContinuation,
  recordGooglePhotosSyncCreatedMediaPrepared,
  recordGooglePhotosSyncMediaPrepared,
  transitionGooglePhotosSyncToMediaCreating,
} from "./sync-pending";
import {
  parseGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
  type GooglePhotosSyncManagedItem,
} from "./sync-binding";
import {
  prepareGooglePhotosSyncSourceWithAdapter,
  type GooglePhotosSyncPreparedItem,
  type GooglePhotosSyncPreparedSource,
  type PrepareGooglePhotosSyncSourceResult,
} from "./sync-drive-source";
import {
  planGooglePhotosIncrementalSync,
  type GooglePhotosIncrementalSyncPlan,
  type GooglePhotosIncrementalSyncPlanResult,
} from "./sync-plan";
import {
  runWithGooglePhotosSyncWriteLock,
  type GooglePhotosSyncWriteLockResult,
} from "./sync-write-lock";

type SyncMediaInput = {
  driveAccessToken: string;
  photosAccessToken: string;
  selectedProjectId: string;
  workspaceId: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
  operationId: string;
  signal: AbortSignal;
  runtime?: GooglePhotosSyncMediaRuntime;
  onRuntime?: (runtime: GooglePhotosSyncMediaRuntime) => void;
  onProgress?: (progress: GooglePhotosSyncMediaProgress) => void;
};

export const GOOGLE_PHOTOS_SYNC_MEDIA_CONCURRENCY = 2;

export type GooglePhotosSyncMediaProgress = {
  phase: "renderingImage" | "uploading" | "creatingMedia" | "checkpointing";
  currentItem: number;
  completedItems: number;
  totalItems: number;
  uploadedBytes: number;
  fileBytes: number;
};

export type GooglePhotosSyncMediaCompletedUpload = {
  slideId: string;
  renderKey: string;
  uploadToken: string;
  fileName: string;
};

export type GooglePhotosSyncMediaCurrentUpload = {
  slideId: string;
  renderKey: string;
  sessionUrl: string;
  chunkGranularity: number;
  offset: number;
  payloadMimeType: string;
  payloadSizeBytes: number;
  payloadFileName: string;
};

/**
 * Ephemeral continuation data for the currently open page only. It must never
 * be persisted, logged, placed in a URL, or treated as user-facing state.
 */
export type GooglePhotosSyncMediaRuntime = {
  operationId: string;
  sourceFingerprint: string;
  createIdentity: Array<{ slideId: string; renderKey: string }>;
  completedUploads: GooglePhotosSyncMediaCompletedUpload[];
  activeUploads?: GooglePhotosSyncMediaCurrentUpload[];
  /** Compatibility alias for runtimes created before bounded concurrency. */
  currentUpload: GooglePhotosSyncMediaCurrentUpload | null;
  createdTargetItems?: GooglePhotosSyncManagedItem[];
};

export type GooglePhotosSyncRenderedImageHolder = {
  slideId: string;
  renderKey: string;
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
};

export type GooglePhotosSyncMediaResult =
  | { status: "locked" | "lockUnavailable" }
  | {
      status:
        | "sourcePreparationFailed"
        | "bindingInaccessible"
        | "bindingInvalid"
        | "bindingDuplicate"
        | "sourceChanged"
        | "wrongPhase"
        | "staleBinding"
        | "targetMissing"
        | "targetNotWritable"
        | "photosReadFailed"
        | "photosInvalidResponse"
        | "paginationInvalid"
        | "paginationLimitExceeded"
        | "planningFailed"
        | "mediaPlanChanged"
        | "invalidCreateMapping"
        | "renderFailed"
        | "uploadFailed"
        | "checkpointWriteFailed"
        | "checkpointConflict"
        | "mediaCreateRecoveryRequired"
        | "mediaCreatedCheckpointFailed";
    }
  | { status: "mediaPrepared" };

export type GooglePhotosSyncMediaAdapters = {
  runWithLock: typeof runWithGooglePhotosSyncWriteLock;
  prepareSource: (
    input: Parameters<typeof prepareGooglePhotosSyncSourceWithAdapter>[0],
  ) => Promise<PrepareGooglePhotosSyncSourceResult>;
  readBinding: (
    input: Parameters<typeof readDrivePhotosSyncBinding>[0],
  ) => Promise<ReadDrivePhotosSyncBindingResult>;
  updateBinding: (
    input: Parameters<typeof updateDrivePhotosSyncBindingBestEffort>[0],
  ) => Promise<UpdateDrivePhotosSyncBindingResult>;
  getAlbum: (
    input: Parameters<typeof getGooglePhotosSyncAlbum>[0],
  ) => Promise<GooglePhotosSyncAlbumReadResult>;
  searchAlbumMediaItemsPage: (
    input: Parameters<typeof searchGooglePhotosSyncAlbumMediaItemsPage>[0],
  ) => Promise<GooglePhotosSyncMediaItemPageResult>;
  planSync: (
    input: Parameters<typeof planGooglePhotosIncrementalSync>[0],
  ) => Promise<GooglePhotosIncrementalSyncPlanResult>;
  openDriveAssetStream: typeof openDriveProjectAssetStream;
  renderImage: (
    input: GooglePhotosImageRenderInput,
  ) => Promise<GooglePhotosRenderedImage>;
  resumable: GooglePhotosResumableUploadAdapter;
  batchCreate: (
    input: Parameters<typeof batchCreateGooglePhotosMediaItems>[0],
  ) => Promise<GooglePhotosBatchCreateResult>;
};

const defaultAdapters: GooglePhotosSyncMediaAdapters = {
  runWithLock: runWithGooglePhotosSyncWriteLock,
  prepareSource: (input) => prepareGooglePhotosSyncSourceWithAdapter(input),
  readBinding: readDrivePhotosSyncBinding,
  updateBinding: updateDrivePhotosSyncBindingBestEffort,
  getAlbum: getGooglePhotosSyncAlbum,
  searchAlbumMediaItemsPage: searchGooglePhotosSyncAlbumMediaItemsPage,
  planSync: planGooglePhotosIncrementalSync,
  openDriveAssetStream: openDriveProjectAssetStream,
  renderImage: renderGooglePhotosExportImage,
  resumable: {
    startSession: startGooglePhotosResumableSession,
    uploadChunk: uploadGooglePhotosResumableChunk,
    querySession: queryGooglePhotosResumableSession,
  },
  batchCreate: batchCreateGooglePhotosMediaItems,
};

type Authority = {
  preparedSource: GooglePhotosSyncPreparedSource;
  bindingFileId: string;
  binding: GooglePhotosSyncBinding;
  album: GooglePhotosSyncAlbum;
  plan: GooglePhotosIncrementalSyncPlan;
};

type AuthorityResult =
  | { ok: true; value: Authority }
  | { ok: false; result: GooglePhotosSyncMediaResult };

export async function createGooglePhotosSyncMediaItemsAfterAlbumBound(
  input: SyncMediaInput,
  adapters: GooglePhotosSyncMediaAdapters = defaultAdapters,
): Promise<GooglePhotosSyncMediaResult> {
  throwIfAborted(input.signal);
  const locked: GooglePhotosSyncWriteLockResult<GooglePhotosSyncMediaResult> =
    await adapters.runWithLock(
      { projectId: input.selectedProjectId },
      async () => runMediaInsideLock(input, adapters),
    );
  if (!locked.acquired) return { status: locked.reason };
  return locked.value;
}

async function runMediaInsideLock(
  input: SyncMediaInput,
  adapters: GooglePhotosSyncMediaAdapters,
): Promise<GooglePhotosSyncMediaResult> {
  const initial = await readAuthority(input, adapters);
  if (!initial.ok) return initial.result;
  const { preparedSource, plan } = initial.value;

  const mapped = mapCreateItems(preparedSource, plan);
  if (!mapped.ok) return { status: "invalidCreateMapping" };

  if (plan.createItems.length === 0) {
    const targetItems = resolveReuseOnlyTargetItems(preparedSource, plan);
    if (!targetItems) return { status: "invalidCreateMapping" };
    return checkpointReuseOnlyMedia(input, initial.value, targetItems, adapters);
  }

  let runtime = normalizeRuntime(
    input.runtime,
    input.operationId,
    preparedSource,
    plan,
  );
  const publishRuntime = () => input.onRuntime?.(cloneRuntime(runtime));
  publishRuntime();
  const hasPendingUploads = mapped.items.some(
    (item) => !runtimeHasCompletedUpload(runtime, item),
  );
  if (hasPendingUploads) {
    const uploadFailure = await runBoundedCreateUploads({
      input,
      adapters,
      items: mapped.items,
      getRuntime: () => runtime,
      setRuntime(next) {
        runtime = next;
        publishRuntime();
      },
    });
    if (uploadFailure) return { status: uploadFailure };
  }

  const fresh = hasPendingUploads ? await readAuthority(input, adapters) : initial;
  if (!fresh.ok) return fresh.result;
  if (!authorityBindingSnapshotMatches(initial.value, fresh.value)) {
    return { status: "staleBinding" };
  }
  if (!mediaCreationIdentityMatches(plan, fresh.value.plan)) {
    return { status: "mediaPlanChanged" };
  }
  if (!completedUploadsMatch(runtime.completedUploads, fresh.value.plan)) {
    return { status: "mediaPlanChanged" };
  }

  input.onProgress?.(checkpointProgress(plan.createItems.length));
  const creating = transitionGooglePhotosSyncToMediaCreating({
    binding: fresh.value.binding,
    expectedOperationId: input.operationId,
    expectedSourceFingerprint: preparedSource.sourceFingerprint,
  });
  if (!creating.ok) return { status: "staleBinding" };
  const creatingWrite = await updateBindingSafely(
    input,
    creating.binding,
    getGooglePhotosSyncExpectedStableGeneration(fresh.value.binding),
    adapters,
  );
  if (!creatingWrite.ok) return creatingWrite.result;

  const verifiedCreating = await readBindingSafely(input, adapters);
  if (
    verifiedCreating.status !== "ready" ||
    verifiedCreating.fileId !== creatingWrite.value.fileId ||
    !bindingsEqual(verifiedCreating.binding, creatingWrite.value.binding) ||
    !isExpectedPendingPhase(
      input,
      verifiedCreating.binding,
      preparedSource,
      "mediaCreating",
    )
  ) {
    return { status: "checkpointConflict" };
  }

  input.onProgress?.({
    phase: "creatingMedia",
    currentItem: plan.createItems.length,
    completedItems: plan.createItems.length,
    totalItems: plan.createItems.length,
    uploadedBytes: 0,
    fileBytes: 0,
  });
  let created: GooglePhotosBatchCreateResult;
  try {
    created = await adapters.batchCreate({
      accessToken: input.photosAccessToken,
      items: runtime.completedUploads.map((upload, index) => ({
        description: mapped.items[index]?.description ?? "",
        fileName: upload.fileName,
        uploadToken: upload.uploadToken,
      })),
      signal: input.signal,
    });
    throwIfAborted(input.signal);
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;
    return { status: "mediaCreateRecoveryRequired" };
  }

  const createdIds = validateCreatedMediaIds(created, plan.createItems.length);
  if (!createdIds) return { status: "mediaCreateRecoveryRequired" };
  const completeTargetItems = resolveCompleteTargetItems(
    fresh.value.preparedSource,
    fresh.value.plan,
    createdIds,
  );
  if (!completeTargetItems) return { status: "mediaCreateRecoveryRequired" };
  runtime = { ...runtime, createdTargetItems: completeTargetItems };
  publishRuntime();

  const afterCreate = await readBindingSafely(input, adapters);
  if (
    afterCreate.status !== "ready" ||
    afterCreate.fileId !== creatingWrite.value.fileId ||
    !bindingsEqual(afterCreate.binding, creatingWrite.value.binding) ||
    !isExpectedPendingPhase(input, afterCreate.binding, preparedSource, "mediaCreating")
  ) {
    return { status: "mediaCreatedCheckpointFailed" };
  }
  const prepared = recordGooglePhotosSyncCreatedMediaPrepared({
    binding: afterCreate.binding,
    expectedOperationId: input.operationId,
    expectedSourceFingerprint: preparedSource.sourceFingerprint,
    targetItems: completeTargetItems,
  });
  if (!prepared.ok) return { status: "mediaCreatedCheckpointFailed" };

  input.onProgress?.(checkpointProgress(plan.createItems.length));
  const preparedWrite = await updateBindingSafely(
    input,
    prepared.binding,
    getGooglePhotosSyncExpectedStableGeneration(afterCreate.binding),
    adapters,
  );
  if (!preparedWrite.ok) return { status: "mediaCreatedCheckpointFailed" };
  return { status: "mediaPrepared" };
}

async function checkpointReuseOnlyMedia(
  input: SyncMediaInput,
  authority: Authority,
  targetItems: GooglePhotosSyncManagedItem[],
  adapters: GooglePhotosSyncMediaAdapters,
): Promise<GooglePhotosSyncMediaResult> {
  const fresh = await readBindingSafely(input, adapters);
  if (
    fresh.status !== "ready" ||
    fresh.fileId !== authority.bindingFileId ||
    !bindingsEqual(fresh.binding, authority.binding)
  ) {
    return { status: "staleBinding" };
  }
  const prepared = recordGooglePhotosSyncMediaPrepared({
    binding: fresh.binding,
    expectedOperationId: input.operationId,
    expectedSourceFingerprint: authority.preparedSource.sourceFingerprint,
    targetItems,
  });
  if (!prepared.ok) return { status: "staleBinding" };
  input.onProgress?.(checkpointProgress(0));
  const updated = await updateBindingSafely(
    input,
    prepared.binding,
    getGooglePhotosSyncExpectedStableGeneration(fresh.binding),
    adapters,
  );
  return updated.ok ? { status: "mediaPrepared" } : updated.result;
}

async function readAuthority(
  input: SyncMediaInput,
  adapters: GooglePhotosSyncMediaAdapters,
): Promise<AuthorityResult> {
  throwIfAborted(input.signal);
  let sourceResult: PrepareGooglePhotosSyncSourceResult;
  try {
    sourceResult = await adapters.prepareSource({
      accessToken: input.driveAccessToken,
      selectedProjectId: input.selectedProjectId,
      workspaceId: input.workspaceId,
      projectsRootFolderId: input.projectsRootFolderId,
      project: input.project,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;
    return failAuthority("sourcePreparationFailed");
  }
  if (!sourceResult.ok) return failAuthority("sourcePreparationFailed");
  const preparedSource = sourceResult.source;

  const bindingResult = await readBindingSafely(input, adapters);
  if (bindingResult.status !== "ready") {
    return failAuthority(mapBindingReadStatus(bindingResult.status));
  }
  const parsed = parseGooglePhotosSyncBinding(bindingResult.binding, {
    workspaceId: input.workspaceId,
    projectId: input.selectedProjectId,
  });
  if (!parsed.ok) return failAuthority("bindingInvalid");
  const binding = parsed.value;
  const continuation = inspectGooglePhotosSyncPendingContinuation({
    binding,
    expectedOperationId: input.operationId,
    expectedSourceFingerprint: preparedSource.sourceFingerprint,
    expectedTargetTitle: preparedSource.targetAlbumTitle,
  });
  if (!continuation.ok) {
    return failAuthority(
      continuation.reason === "sourceChanged" ? "sourceChanged" : "wrongPhase",
    );
  }
  if (continuation.phase === "mediaCreating") {
    return failAuthority("mediaCreateRecoveryRequired");
  }
  if (continuation.phase !== "albumBound" || binding.album === null) {
    return failAuthority("wrongPhase");
  }

  let albumResult: GooglePhotosSyncAlbumReadResult;
  try {
    albumResult = await adapters.getAlbum({
      accessToken: input.photosAccessToken,
      albumId: binding.album.albumId,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;
    return failAuthority("photosReadFailed");
  }
  if (albumResult.status === "notFound") return failAuthority("targetMissing");
  if (albumResult.status === "inaccessible") return failAuthority("photosReadFailed");
  if (
    albumResult.status !== "ready" ||
    albumResult.album.id !== binding.album.albumId
  ) {
    return failAuthority("photosInvalidResponse");
  }
  if (albumResult.album.isWriteable !== true) {
    return failAuthority("targetNotWritable");
  }

  const membership = await readAllGooglePhotosSyncAlbumMediaItemIds(
    {
      accessToken: input.photosAccessToken,
      albumId: albumResult.album.id,
      signal: input.signal,
    },
    adapters.searchAlbumMediaItemsPage,
  );
  if (!membership.ok) return failAuthority(membership.status);

  let planResult: GooglePhotosIncrementalSyncPlanResult;
  try {
    planResult = await adapters.planSync({
      targetAlbumTitle: preparedSource.targetAlbumTitle,
      currentGoogleAlbumTitle: albumResult.album.title,
      desiredSlides: preparedSource.desiredSlides,
      stableManagedItems: binding.stable?.items ?? [],
      currentAlbumMediaItemIds: membership.mediaItemIds,
    });
    throwIfAborted(input.signal);
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;
    return failAuthority("planningFailed");
  }
  if (!planResult.ok || planResult.plan.sourceFingerprint !== preparedSource.sourceFingerprint) {
    return failAuthority("planningFailed");
  }
  return {
    ok: true,
    value: {
      preparedSource,
      bindingFileId: bindingResult.fileId,
      binding,
      album: albumResult.album,
      plan: planResult.plan,
    },
  };
}

function mapCreateItems(
  source: GooglePhotosSyncPreparedSource,
  plan: GooglePhotosIncrementalSyncPlan,
): { ok: true; items: GooglePhotosSyncPreparedItem[] } | { ok: false } {
  const bySlideId = new Map<string, GooglePhotosSyncPreparedItem>();
  for (const item of source.items) {
    if (bySlideId.has(item.slideId)) return { ok: false };
    bySlideId.set(item.slideId, item);
  }
  const items: GooglePhotosSyncPreparedItem[] = [];
  for (const create of plan.createItems) {
    const item = bySlideId.get(create.slideId);
    if (
      !item ||
      item.renderKey !== create.renderKey ||
      item.mediaKind !== "image"
    ) {
      return { ok: false };
    }
    items.push(item);
  }
  return { ok: true, items };
}

async function runBoundedCreateUploads(input: {
  input: SyncMediaInput;
  adapters: GooglePhotosSyncMediaAdapters;
  items: GooglePhotosSyncPreparedItem[];
  getRuntime: () => GooglePhotosSyncMediaRuntime;
  setRuntime: (runtime: GooglePhotosSyncMediaRuntime) => void;
}): Promise<"renderFailed" | "uploadFailed" | null> {
  const pendingIndexes = input.items
    .map((_, index) => index)
    .filter(
      (index) =>
        !runtimeHasCompletedUpload(input.getRuntime(), input.items[index]),
    );
  if (pendingIndexes.length === 0) return null;

  const workerController = new AbortController();
  const abortWorkers = () => workerController.abort(input.input.signal.reason);
  input.input.signal.addEventListener("abort", abortWorkers, { once: true });
  let nextPendingIndex = 0;
  let dispatchStopped = false;
  let failure: "renderFailed" | "uploadFailed" | null = null;

  const setActiveUpload = (
    item: GooglePhotosSyncPreparedItem,
    next: GooglePhotosSyncMediaCurrentUpload | null,
  ) => {
    const runtime = input.getRuntime();
    const activeUploads = getActiveUploads(runtime).filter(
      (upload) => !sameCreationIdentity(upload, item),
    );
    if (next) activeUploads.push(next);
    activeUploads.sort(
      (left, right) =>
        creationIdentityIndex(runtime.createIdentity, left) -
        creationIdentityIndex(runtime.createIdentity, right),
    );
    input.setRuntime(withActiveUploads(runtime, activeUploads));
  };

  const completeUpload = (completed: GooglePhotosSyncMediaCompletedUpload) => {
    const runtime = input.getRuntime();
    const completedUploads = runtime.completedUploads
      .filter((upload) => !sameCreationIdentity(upload, completed))
      .concat(completed)
      .sort(
        (left, right) =>
          creationIdentityIndex(runtime.createIdentity, left) -
          creationIdentityIndex(runtime.createIdentity, right),
      );
    const activeUploads = getActiveUploads(runtime).filter(
      (upload) => !sameCreationIdentity(upload, completed),
    );
    input.setRuntime({
      ...withActiveUploads(runtime, activeUploads),
      completedUploads,
    });
  };

  const worker = async () => {
    while (!dispatchStopped && !workerController.signal.aborted) {
      const createIndex = pendingIndexes[nextPendingIndex];
      if (createIndex === undefined) return;
      nextPendingIndex += 1;
      const preparedItem = input.items[createIndex];
      if (!preparedItem) {
        dispatchStopped = true;
        failure = "renderFailed";
        workerController.abort();
        return;
      }
      const renderedImageRef: {
        current: GooglePhotosSyncRenderedImageHolder | null;
      } = { current: null };
      try {
        const activeUpload = getActiveUploads(input.getRuntime()).find(
          (upload) => sameCreationIdentity(upload, preparedItem),
        );
        const completed = await renderAndUploadCreateItem({
          input: { ...input.input, signal: workerController.signal },
          adapters: input.adapters,
          preparedItem,
          createIndex,
          totalItems: input.items.length,
          activeUpload: activeUpload ?? null,
          renderedImageRef,
          getCompletedItems: () => input.getRuntime().completedUploads.length,
          onCurrentUpload: (next) => setActiveUpload(preparedItem, next),
        });
        completeUpload(completed);
      } catch (error) {
        renderedImageRef.current = null;
        if (input.input.signal.aborted) return;
        if (dispatchStopped || isAbortError(error, workerController.signal)) return;

        dispatchStopped = true;
        failure =
          error instanceof SyncMediaRenderError ? "renderFailed" : "uploadFailed";
        workerController.abort(
          new DOMException("A media worker failed.", "AbortError"),
        );

        const current = getActiveUploads(input.getRuntime()).find((upload) =>
          sameCreationIdentity(upload, preparedItem),
        );
        if (current) {
          const queried = await querySessionSafely(
            input.adapters.resumable,
            current.sessionUrl,
            input.input.signal,
          );
          throwIfAborted(input.input.signal);
          setActiveUpload(
            preparedItem,
            queried.ok &&
              isGooglePhotosResumeOffsetValid(
                queried.offset,
                current.payloadSizeBytes,
              )
              ? { ...current, offset: queried.offset }
              : null,
          );
        }
        return;
      } finally {
        renderedImageRef.current = null;
      }
    }
  };

  try {
    const workerCount = Math.min(
      GOOGLE_PHOTOS_SYNC_MEDIA_CONCURRENCY,
      pendingIndexes.length,
    );
    await Promise.allSettled(Array.from({ length: workerCount }, () => worker()));
    throwIfAborted(input.input.signal);
    return failure;
  } finally {
    input.input.signal.removeEventListener("abort", abortWorkers);
  }
}

async function renderAndUploadCreateItem(input: {
  input: SyncMediaInput;
  adapters: GooglePhotosSyncMediaAdapters;
  preparedItem: GooglePhotosSyncPreparedItem;
  createIndex: number;
  totalItems: number;
  activeUpload: GooglePhotosSyncMediaCurrentUpload | null;
  renderedImageRef: { current: GooglePhotosSyncRenderedImageHolder | null };
  getCompletedItems: () => number;
  onCurrentUpload: (current: GooglePhotosSyncMediaCurrentUpload) => void;
}): Promise<GooglePhotosSyncMediaCompletedUpload> {
  const holder = await resolveRenderedHolder(input);
  let session: GooglePhotosResumableSession;
  if (currentUploadMatches(input.activeUpload, input.preparedItem, holder)) {
    const queried = await input.adapters.resumable.querySession({
      sessionUrl: input.activeUpload.sessionUrl,
      signal: input.input.signal,
    });
    session =
      queried.ok && isGooglePhotosResumeOffsetValid(queried.offset, holder.sizeBytes)
        ? {
            sessionUrl: input.activeUpload.sessionUrl,
            chunkGranularity: input.activeUpload.chunkGranularity,
            offset: queried.offset,
          }
        : await startSession(input, holder);
  } else {
    session = await startSession(input, holder);
  }
  input.onCurrentUpload(toCurrentUpload(input.preparedItem, holder, session));
  input.input.onProgress?.({
    phase: "uploading",
    currentItem: input.createIndex + 1,
    completedItems: input.getCompletedItems(),
    totalItems: input.totalItems,
    uploadedBytes: session.offset,
    fileBytes: holder.sizeBytes,
  });
  const uploadToken = await uploadBlobFromOffset({
    blob: holder.blob,
    session,
    signal: input.input.signal,
    resumable: input.adapters.resumable,
    onOffset(offset) {
      input.onCurrentUpload(
        toCurrentUpload(input.preparedItem, holder, { ...session, offset }),
      );
      input.input.onProgress?.({
        phase: "uploading",
        currentItem: input.createIndex + 1,
        completedItems: input.getCompletedItems(),
        totalItems: input.totalItems,
        uploadedBytes: offset,
        fileBytes: holder.sizeBytes,
      });
    },
  });
  if (!isNonBlankTrimmedString(uploadToken)) throw new Error("upload-failed");
  return {
    slideId: input.preparedItem.slideId,
    renderKey: input.preparedItem.renderKey,
    uploadToken,
    fileName: holder.fileName,
  };
}

async function resolveRenderedHolder(input: {
  input: SyncMediaInput;
  adapters: GooglePhotosSyncMediaAdapters;
  preparedItem: GooglePhotosSyncPreparedItem;
  createIndex: number;
  totalItems: number;
  renderedImageRef: { current: GooglePhotosSyncRenderedImageHolder | null };
  getCompletedItems: () => number;
}): Promise<GooglePhotosSyncRenderedImageHolder> {
  const retained = input.renderedImageRef.current;
  if (
    retained?.slideId === input.preparedItem.slideId &&
    retained.renderKey === input.preparedItem.renderKey
  ) {
    return retained;
  }
  input.renderedImageRef.current = null;
  input.input.onProgress?.({
    phase: "renderingImage",
    currentItem: input.createIndex + 1,
    completedItems: input.getCompletedItems(),
    totalItems: input.totalItems,
    uploadedBytes: 0,
    fileBytes: input.preparedItem.sizeBytes,
  });
  try {
    const stream = await input.adapters.openDriveAssetStream({
      accessToken: input.input.driveAccessToken,
      assetFileId: input.preparedItem.assetFileId,
      expectedMimeType: input.preparedItem.mimeType,
      expectedSizeBytes: input.preparedItem.sizeBytes,
      signal: input.input.signal,
    });
    const source = await collectStreamBlob(
      stream,
      input.preparedItem.mimeType,
      input.preparedItem.sizeBytes,
      input.input.signal,
    );
    const rendered = await input.adapters.renderImage({
      source,
      sourceMimeType: input.preparedItem.mimeType,
      caption: input.preparedItem.description,
      imageEdit: input.preparedItem.imageEdit,
      fileName: input.preparedItem.fileName,
      slideIndex: input.preparedItem.slideIndex,
      signal: input.input.signal,
    });
    if (
      rendered.mimeType !== input.preparedItem.outputMimeType ||
      rendered.blob.type !== rendered.mimeType ||
      !isGooglePhotosRenderedImageWithinUploadLimit(rendered.blob.size)
    ) {
      throw new SyncMediaRenderError();
    }
    const holder: GooglePhotosSyncRenderedImageHolder = {
      slideId: input.preparedItem.slideId,
      renderKey: input.preparedItem.renderKey,
      blob: rendered.blob,
      mimeType: rendered.mimeType,
      sizeBytes: rendered.blob.size,
      fileName: rendered.fileName,
    };
    input.renderedImageRef.current = holder;
    return holder;
  } catch (error) {
    if (isAbortError(error, input.input.signal)) throw error;
    throw new SyncMediaRenderError();
  }
}

async function startSession(
  input: {
    input: SyncMediaInput;
    adapters: GooglePhotosSyncMediaAdapters;
  },
  holder: GooglePhotosSyncRenderedImageHolder,
): Promise<GooglePhotosResumableSession> {
  const started = await input.adapters.resumable.startSession({
    accessToken: input.input.photosAccessToken,
    mimeType: holder.mimeType,
    sizeBytes: holder.sizeBytes,
    fileName: holder.fileName,
    signal: input.input.signal,
  });
  return { ...started, offset: 0 };
}

async function uploadBlobFromOffset(input: {
  blob: Blob;
  session: GooglePhotosResumableSession;
  signal: AbortSignal;
  resumable: GooglePhotosResumableUploadAdapter;
  onOffset: (offset: number) => void;
}) {
  if (input.session.offset === input.blob.size) {
    const token = await input.resumable.uploadChunk({
      sessionUrl: input.session.sessionUrl,
      chunk: new Uint8Array(0),
      offset: input.session.offset,
      finalize: true,
      signal: input.signal,
    });
    if (!token) throw new Error("upload-failed");
    input.onOffset(input.session.offset);
    return token;
  }
  const remaining = input.blob.slice(input.session.offset);
  if (typeof remaining.stream !== "function") throw new Error("upload-failed");
  return uploadGooglePhotosResumableStream({
    stream: remaining.stream(),
    session: input.session,
    sizeBytes: input.blob.size,
    signal: input.signal,
    adapter: input.resumable,
    onOffset: input.onOffset,
  });
}

async function collectStreamBlob(
  stream: ReadableStream<Uint8Array>,
  mimeType: string,
  expectedSizeBytes: number,
  signal: AbortSignal,
) {
  const reader = stream.getReader();
  const chunks: BlobPart[] = [];
  let size = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        size += value.byteLength;
        if (size > expectedSizeBytes) throw new SyncMediaRenderError();
        chunks.push(toBlobPart(value));
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (size !== expectedSizeBytes) throw new SyncMediaRenderError();
  return new Blob(chunks, { type: mimeType });
}

function normalizeRuntime(
  candidate: GooglePhotosSyncMediaRuntime | undefined,
  operationId: string,
  source: GooglePhotosSyncPreparedSource,
  plan: GooglePhotosIncrementalSyncPlan,
): GooglePhotosSyncMediaRuntime {
  const identity = plan.createItems.map(({ slideId, renderKey }) => ({
    slideId,
    renderKey,
  }));
  const completedUploads = candidate
    ? normalizeCompletedUploads(candidate.completedUploads, identity)
    : null;
  const candidateActiveUploads =
    candidate?.activeUploads ??
    (candidate?.currentUpload ? [candidate.currentUpload] : []);
  const activeUploads = normalizeActiveUploads(
    candidateActiveUploads,
    identity,
    completedUploads ?? [],
  );
  if (
    candidate &&
    candidate.operationId === operationId &&
    candidate.sourceFingerprint === source.sourceFingerprint &&
    createIdentityEqual(candidate.createIdentity, identity) &&
    completedUploads !== null &&
    activeUploads !== null
  ) {
    return withActiveUploads(
      { ...cloneRuntime(candidate), completedUploads },
      activeUploads,
    );
  }
  return {
    operationId,
    sourceFingerprint: source.sourceFingerprint,
    createIdentity: identity,
    completedUploads: [],
    activeUploads: [],
    currentUpload: null,
  };
}

function cloneRuntime(runtime: GooglePhotosSyncMediaRuntime): GooglePhotosSyncMediaRuntime {
  return {
    operationId: runtime.operationId,
    sourceFingerprint: runtime.sourceFingerprint,
    createIdentity: runtime.createIdentity.map((item) => ({ ...item })),
    completedUploads: runtime.completedUploads.map((item) => ({ ...item })),
    activeUploads: getActiveUploads(runtime).map((item) => ({ ...item })),
    currentUpload: runtime.currentUpload ? { ...runtime.currentUpload } : null,
    ...(runtime.createdTargetItems
      ? { createdTargetItems: runtime.createdTargetItems.map(cloneManagedItem) }
      : {}),
  };
}

function cloneManagedItem(
  item: GooglePhotosSyncManagedItem,
): GooglePhotosSyncManagedItem {
  return {
    ...item,
    snapshot: item.snapshot
      ? {
          ...item.snapshot,
          ...(item.snapshot.imageEdit
            ? {
                imageEdit: {
                  ...item.snapshot.imageEdit,
                  ...(item.snapshot.imageEdit.crop
                    ? { crop: { ...item.snapshot.imageEdit.crop } }
                    : {}),
                },
              }
            : {}),
        }
      : null,
  };
}

function normalizeCompletedUploads(
  uploads: GooglePhotosSyncMediaCompletedUpload[],
  identity: Array<{ slideId: string; renderKey: string }>,
): GooglePhotosSyncMediaCompletedUpload[] | null {
  if (uploads.length > identity.length) return null;
  const seen = new Set<number>();
  const normalized: GooglePhotosSyncMediaCompletedUpload[] = [];
  for (const upload of uploads) {
    const index = creationIdentityIndex(identity, upload);
    if (
      index < 0 ||
      seen.has(index) ||
      !isNonBlankTrimmedString(upload.uploadToken) ||
      !isNonBlankTrimmedString(upload.fileName)
    ) {
      return null;
    }
    seen.add(index);
    normalized.push({ ...upload });
  }
  return normalized.sort(
    (left, right) =>
      creationIdentityIndex(identity, left) - creationIdentityIndex(identity, right),
  );
}

function completedUploadsMatch(
  uploads: GooglePhotosSyncMediaCompletedUpload[],
  plan: GooglePhotosIncrementalSyncPlan,
) {
  return (
    uploads.length === plan.createItems.length &&
    normalizeCompletedUploads(uploads, plan.createItems)?.every(
      (upload, index) => sameCreationIdentity(upload, plan.createItems[index]),
    ) === true
  );
}

function normalizeActiveUploads(
  uploads: GooglePhotosSyncMediaCurrentUpload[],
  identity: Array<{ slideId: string; renderKey: string }>,
  completedUploads: GooglePhotosSyncMediaCompletedUpload[],
): GooglePhotosSyncMediaCurrentUpload[] | null {
  const completed = new Set(completedUploads.map(identityKey));
  const seen = new Set<number>();
  const normalized: GooglePhotosSyncMediaCurrentUpload[] = [];
  for (const upload of uploads) {
    const index = creationIdentityIndex(identity, upload);
    if (
      index < 0 ||
      seen.has(index) ||
      completed.has(identityKey(upload)) ||
      !currentUploadBelongsAtIndex(upload, identity[index])
    ) {
      return null;
    }
    seen.add(index);
    normalized.push({ ...upload });
  }
  return normalized.sort(
    (left, right) =>
      creationIdentityIndex(identity, left) - creationIdentityIndex(identity, right),
  );
}

function getActiveUploads(runtime: GooglePhotosSyncMediaRuntime) {
  return (
    runtime.activeUploads ?? (runtime.currentUpload ? [runtime.currentUpload] : [])
  );
}

function withActiveUploads(
  runtime: GooglePhotosSyncMediaRuntime,
  activeUploads: GooglePhotosSyncMediaCurrentUpload[],
): GooglePhotosSyncMediaRuntime {
  return {
    ...runtime,
    activeUploads,
    currentUpload: activeUploads[0] ?? null,
  };
}

function runtimeHasCompletedUpload(
  runtime: GooglePhotosSyncMediaRuntime,
  item: GooglePhotosSyncPreparedItem | undefined,
) {
  return (
    item !== undefined &&
    runtime.completedUploads.some((upload) => sameCreationIdentity(upload, item))
  );
}

function sameCreationIdentity(
  left: { slideId: string; renderKey: string },
  right: { slideId: string; renderKey: string } | undefined,
) {
  return left.slideId === right?.slideId && left.renderKey === right?.renderKey;
}

function creationIdentityIndex(
  identity: Array<{ slideId: string; renderKey: string }>,
  item: { slideId: string; renderKey: string },
) {
  return identity.findIndex((candidate) => sameCreationIdentity(candidate, item));
}

function currentUploadBelongsAtIndex(
  upload: GooglePhotosSyncMediaCurrentUpload,
  identity: { slideId: string; renderKey: string } | undefined,
) {
  return (
    identity !== undefined &&
    upload.slideId === identity.slideId &&
    upload.renderKey === identity.renderKey &&
    isNonBlankTrimmedString(upload.sessionUrl) &&
    Number.isSafeInteger(upload.chunkGranularity) &&
    upload.chunkGranularity > 0 &&
    isGooglePhotosResumeOffsetValid(upload.offset, upload.payloadSizeBytes) &&
    isNonBlankTrimmedString(upload.payloadMimeType) &&
    isNonBlankTrimmedString(upload.payloadFileName)
  );
}

function currentUploadMatches(
  upload: GooglePhotosSyncMediaCurrentUpload | null,
  item: GooglePhotosSyncPreparedItem,
  holder: GooglePhotosSyncRenderedImageHolder,
): upload is GooglePhotosSyncMediaCurrentUpload {
  return Boolean(
    upload &&
      upload.slideId === item.slideId &&
      upload.renderKey === item.renderKey &&
      upload.payloadMimeType === holder.mimeType &&
      upload.payloadSizeBytes === holder.sizeBytes &&
      upload.payloadFileName === holder.fileName,
  );
}

function toCurrentUpload(
  item: GooglePhotosSyncPreparedItem,
  holder: GooglePhotosSyncRenderedImageHolder,
  session: GooglePhotosResumableSession,
): GooglePhotosSyncMediaCurrentUpload {
  return {
    slideId: item.slideId,
    renderKey: item.renderKey,
    sessionUrl: session.sessionUrl,
    chunkGranularity: session.chunkGranularity,
    offset: session.offset,
    payloadMimeType: holder.mimeType,
    payloadSizeBytes: holder.sizeBytes,
    payloadFileName: holder.fileName,
  };
}

function mediaCreationIdentityMatches(
  left: GooglePhotosIncrementalSyncPlan,
  right: GooglePhotosIncrementalSyncPlan,
) {
  return targetIdentityEqual(left.targetItems, right.targetItems) &&
    createIdentityEqual(left.createItems, right.createItems);
}

function targetIdentityEqual(
  left: GooglePhotosIncrementalSyncPlan["targetItems"],
  right: GooglePhotosIncrementalSyncPlan["targetItems"],
) {
  return left.length === right.length && left.every((item, index) => {
    const other = right[index];
    return item.kind === other?.kind &&
      item.slideId === other.slideId &&
      item.renderKey === other.renderKey &&
      (item.kind === "create" ||
        (other.kind === "reuse" && item.mediaItemId === other.mediaItemId));
  });
}

function createIdentityEqual(
  left: Array<{ slideId: string; renderKey: string }>,
  right: Array<{ slideId: string; renderKey: string }>,
) {
  return left.length === right.length && left.every((item, index) =>
    item.slideId === right[index]?.slideId && item.renderKey === right[index]?.renderKey,
  );
}

function resolveReuseOnlyTargetItems(
  source: GooglePhotosSyncPreparedSource,
  plan: GooglePhotosIncrementalSyncPlan,
) {
  if (plan.targetItems.some((item) => item.kind !== "reuse")) return null;
  const snapshots = snapshotsBySlideId(source);
  const targetItems: GooglePhotosSyncManagedItem[] = [];
  for (const item of plan.targetItems) {
    const snapshot = snapshots.get(item.slideId);
    if (!snapshot) return null;
    targetItems.push({
      slideId: item.slideId,
      renderKey: item.renderKey,
      mediaItemId: (item as Extract<typeof item, { kind: "reuse" }>).mediaItemId,
      snapshot,
    });
  }
  return targetItems;
}

function resolveCompleteTargetItems(
  source: GooglePhotosSyncPreparedSource,
  plan: GooglePhotosIncrementalSyncPlan,
  createdIds: string[],
): GooglePhotosSyncManagedItem[] | null {
  const createdByIdentity = new Map<string, string>();
  plan.createItems.forEach((item, index) => {
    createdByIdentity.set(identityKey(item), createdIds[index] ?? "");
  });
  const snapshots = snapshotsBySlideId(source);
  const targetItems = plan.targetItems.map((item) => ({
    slideId: item.slideId,
    renderKey: item.renderKey,
    mediaItemId:
      item.kind === "reuse" ? item.mediaItemId : createdByIdentity.get(identityKey(item)) ?? "",
    snapshot: snapshots.get(item.slideId) ?? null,
  }));
  const slideIds = new Set<string>();
  const mediaIds = new Set<string>();
  for (const item of targetItems) {
    if (
      !isNonBlankTrimmedString(item.mediaItemId) ||
      item.snapshot === null ||
      slideIds.has(item.slideId) ||
      mediaIds.has(item.mediaItemId)
    ) {
      return null;
    }
    slideIds.add(item.slideId);
    mediaIds.add(item.mediaItemId);
  }
  return targetItems;
}

function snapshotsBySlideId(source: GooglePhotosSyncPreparedSource) {
  return new Map(source.items.map((item) => [item.slideId, item.snapshot]));
}

function validateCreatedMediaIds(
  result: GooglePhotosBatchCreateResult,
  expectedCount: number,
) {
  if (!result.ok || result.mediaItemIds.length !== expectedCount) return null;
  const seen = new Set<string>();
  for (const id of result.mediaItemIds) {
    if (!isNonBlankTrimmedString(id) || seen.has(id)) return null;
    seen.add(id);
  }
  return [...result.mediaItemIds];
}

function identityKey(item: { slideId: string; renderKey: string }) {
  return `${item.slideId}\u0000${item.renderKey}`;
}

function authorityBindingSnapshotMatches(left: Authority, right: Authority) {
  return left.bindingFileId === right.bindingFileId && bindingsEqual(left.binding, right.binding);
}

function isExpectedPendingPhase(
  input: SyncMediaInput,
  binding: GooglePhotosSyncBinding,
  source: GooglePhotosSyncPreparedSource,
  phase: "mediaCreating",
) {
  const continuation = inspectGooglePhotosSyncPendingContinuation({
    binding,
    expectedOperationId: input.operationId,
    expectedSourceFingerprint: source.sourceFingerprint,
    expectedTargetTitle: source.targetAlbumTitle,
  });
  return continuation.ok && continuation.phase === phase && binding.pending?.targetItems.length === 0;
}

async function readBindingSafely(
  input: SyncMediaInput,
  adapters: GooglePhotosSyncMediaAdapters,
): Promise<ReadDrivePhotosSyncBindingResult> {
  throwIfAborted(input.signal);
  try {
    const result = await adapters.readBinding({
      accessToken: input.driveAccessToken,
      projectRootFolderId: input.project.projectFolderId,
      workspaceId: input.workspaceId,
      projectId: input.selectedProjectId,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
    return result;
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;
    return { status: "inaccessible" };
  }
}

async function updateBindingSafely(
  input: SyncMediaInput,
  binding: GooglePhotosSyncBinding,
  expectedStableGeneration: number,
  adapters: GooglePhotosSyncMediaAdapters,
): Promise<
  | { ok: true; value: Extract<UpdateDrivePhotosSyncBindingResult, { status: "updated" }> }
  | { ok: false; result: GooglePhotosSyncMediaResult }
> {
  throwIfAborted(input.signal);
  let result: UpdateDrivePhotosSyncBindingResult;
  try {
    result = await adapters.updateBinding({
      accessToken: input.driveAccessToken,
      projectRootFolderId: input.project.projectFolderId,
      workspaceId: input.workspaceId,
      projectId: input.selectedProjectId,
      expectedStableGeneration,
      binding,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;
    return { ok: false, result: { status: "checkpointWriteFailed" } };
  }
  if (result.status === "updated") return { ok: true, value: result };
  return {
    ok: false,
    result: {
      status: result.status === "staleGeneration" ? "staleBinding" : "checkpointWriteFailed",
    },
  };
}

async function querySessionSafely(
  adapter: GooglePhotosResumableUploadAdapter,
  sessionUrl: string,
  signal: AbortSignal,
) {
  try {
    const result = await adapter.querySession({ sessionUrl, signal });
    throwIfAborted(signal);
    return result;
  } catch (error) {
    if (isAbortError(error, signal)) throw error;
    return { ok: false } as const;
  }
}

function checkpointProgress(totalItems: number): GooglePhotosSyncMediaProgress {
  return {
    phase: "checkpointing",
    currentItem: totalItems,
    completedItems: totalItems,
    totalItems,
    uploadedBytes: 0,
    fileBytes: 0,
  };
}

function mapBindingReadStatus(status: ReadDrivePhotosSyncBindingResult["status"]) {
  if (status === "duplicate") return "bindingDuplicate" as const;
  if (status === "inaccessible") return "bindingInaccessible" as const;
  return "bindingInvalid" as const;
}

function failAuthority(
  status: Exclude<GooglePhotosSyncMediaResult, { status: "mediaPrepared" }> ["status"],
): AuthorityResult {
  return { ok: false, result: { status } as GooglePhotosSyncMediaResult };
}

function bindingsEqual(left: GooglePhotosSyncBinding, right: GooglePhotosSyncBinding) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isNonBlankTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function toBlobPart(chunk: Uint8Array): BlobPart {
  const { buffer, byteOffset, byteLength } = chunk;
  if (buffer instanceof ArrayBuffer) {
    return byteOffset === 0 && byteLength === buffer.byteLength
      ? buffer
      : new Uint8Array(buffer, byteOffset, byteLength);
  }
  return chunk.slice();
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(error: unknown, signal: AbortSignal) {
  return signal.aborted || (error instanceof Error && error.name === "AbortError");
}

class SyncMediaRenderError extends Error {
  constructor() {
    super("sync-media-render-failed");
    this.name = "SyncMediaRenderError";
  }
}
