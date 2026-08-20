import { readDriveFileMetadata, readDriveTextFile } from "../google-drive";
import {
  buildGooglePhotosExportReview,
  createSanitizedGooglePhotosExportError,
  googlePhotosExportSourceMatchesPreparedPlan,
  type GooglePhotosExportPlanItem,
  type GooglePhotosExportProgress,
  type GooglePhotosExportRuntime,
  type SanitizedGooglePhotosExportError,
  type SanitizedGooglePhotosExportSuccess,
  type GooglePhotosExportReview,
} from "./contract";
import { openDriveProjectAssetStream } from "./drive-media";
import {
  GooglePhotosImageRenderError,
  isGooglePhotosRenderedImageWithinUploadLimit,
  renderGooglePhotosExportImage,
  type GooglePhotosImageRenderInput,
  type GooglePhotosRenderedImage,
} from "./image-renderer";
import {
  prepareGooglePhotosExportSourceWithAdapter,
  type GooglePhotosExportSourceAdapter,
  type GooglePhotosExportSourceResult,
} from "./drive-source";
import {
  batchAddGooglePhotosMediaItems,
  batchCreateGooglePhotosMediaItems,
  createGooglePhotosAlbum,
  type GooglePhotosLibraryAdapter,
} from "./library-api";
import {
  isGooglePhotosResumeOffsetValid,
  queryGooglePhotosResumableSession,
  startGooglePhotosResumableSession,
  uploadGooglePhotosResumableChunk,
  uploadGooglePhotosResumableStream,
  type GooglePhotosResumableSession,
  type GooglePhotosResumableUploadAdapter,
  type GooglePhotosSessionQueryResult,
} from "./resumable-upload";

const defaultAdapter: GooglePhotosExportSourceAdapter = {
  readMetadata: readDriveFileMetadata,
  readText: readDriveTextFile,
};

export type PrepareGooglePhotosExportReviewResult =
  | { ok: true; review: GooglePhotosExportReview }
  | { ok: false; error: SanitizedGooglePhotosExportError };

export type InternalGooglePhotosExportPreparationResult =
  | Extract<GooglePhotosExportSourceResult, { ok: true }>
  | Extract<PrepareGooglePhotosExportReviewResult, { ok: false }>;

export async function prepareGooglePhotosExportReviewInDrive(input: {
  accessToken: string;
  selectedProjectId: string;
  workspaceId: string;
  projectsRootFolderId: string;
  project: Parameters<
    typeof prepareGooglePhotosExportSourceWithAdapter
  >[0]["project"];
  now?: Date;
  signal: AbortSignal;
}): Promise<InternalGooglePhotosExportPreparationResult> {
  return prepareGooglePhotosExportReviewWithAdapter(input, defaultAdapter);
}

export async function prepareGooglePhotosExportReviewWithAdapter(
  input: {
    accessToken: string;
    selectedProjectId: string;
    workspaceId: string;
    projectsRootFolderId: string;
    project: Parameters<
      typeof prepareGooglePhotosExportSourceWithAdapter
    >[0]["project"];
    now?: Date;
    signal: AbortSignal;
  },
  adapter: GooglePhotosExportSourceAdapter,
): Promise<InternalGooglePhotosExportPreparationResult> {
  const result = await prepareGooglePhotosExportSourceWithAdapter(
    input,
    adapter,
  );
  if (!result.ok) {
    return result;
  }
  return result;
}

export function toGooglePhotosExportReviewResult(
  result: InternalGooglePhotosExportPreparationResult,
): PrepareGooglePhotosExportReviewResult {
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    review: buildGooglePhotosExportReview(result.plan),
  };
}

export function createGooglePhotosExportAuthorizationError(
  kind: "authorizationRequired" | "authorizationDenied" | "aborted",
): PrepareGooglePhotosExportReviewResult {
  return {
    ok: false,
    error: createSanitizedGooglePhotosExportError(kind),
  };
}

export type CommitGooglePhotosExportResult =
  | { ok: true; result: SanitizedGooglePhotosExportSuccess }
  | { ok: false; error: SanitizedGooglePhotosExportError; canResume: boolean };

export type GooglePhotosRenderedImageHolder = {
  slideIndex: number;
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
};

export type GooglePhotosExportWriteAdapter = {
  openDriveAssetStream: typeof openDriveProjectAssetStream;
  renderImage: (
    input: GooglePhotosImageRenderInput,
  ) => Promise<GooglePhotosRenderedImage>;
  resumable: GooglePhotosResumableUploadAdapter;
  library: GooglePhotosLibraryAdapter;
};

export type GooglePhotosExportCommitAdapters = {
  source?: GooglePhotosExportSourceAdapter;
  write?: GooglePhotosExportWriteAdapter;
};

const defaultWriteAdapter: GooglePhotosExportWriteAdapter = {
  openDriveAssetStream: openDriveProjectAssetStream,
  renderImage: renderGooglePhotosExportImage,
  resumable: {
    startSession: startGooglePhotosResumableSession,
    uploadChunk: uploadGooglePhotosResumableChunk,
    querySession: queryGooglePhotosResumableSession,
  },
  library: {
    batchCreateMediaItems: batchCreateGooglePhotosMediaItems,
    createAlbum: createGooglePhotosAlbum,
    batchAddMediaItems: batchAddGooglePhotosMediaItems,
  },
};

export async function commitGooglePhotosExportAfterFreshValidation(
  input: {
    driveAccessToken: string;
    photosAccessToken: string;
    selectedProjectId: string;
    workspaceId: string;
    projectsRootFolderId: string;
    project: Parameters<
      typeof prepareGooglePhotosExportSourceWithAdapter
    >[0]["project"];
    runtime: GooglePhotosExportRuntime;
    now?: Date;
    signal: AbortSignal;
    onProgress: (progress: GooglePhotosExportProgress) => void;
    onRuntime: (runtime: GooglePhotosExportRuntime) => void;
    renderedImageRef?: { current: GooglePhotosRenderedImageHolder | null };
  },
  adapters: GooglePhotosExportCommitAdapters = {},
): Promise<CommitGooglePhotosExportResult> {
  const sourceAdapter = adapters.source ?? defaultAdapter;
  const writeAdapter = adapters.write ?? defaultWriteAdapter;

  const fresh = await prepareGooglePhotosExportReviewWithAdapter(
    {
      accessToken: input.driveAccessToken,
      selectedProjectId: input.selectedProjectId,
      workspaceId: input.workspaceId,
      projectsRootFolderId: input.projectsRootFolderId,
      project: input.project,
      signal: input.signal,
    },
    sourceAdapter,
  );
  if (!fresh.ok) {
    clearRenderedImage(input.renderedImageRef);
    return { ...fresh, canResume: false };
  }
  if (
    !googlePhotosExportSourceMatchesPreparedPlan(input.runtime.plan, fresh.plan)
  ) {
    clearRenderedImage(input.renderedImageRef);
    return {
      ok: false,
      error: createSanitizedGooglePhotosExportError("sourceChanged"),
      canResume: false,
    };
  }

  return executeGooglePhotosExportWithAdapter(
    {
      driveAccessToken: input.driveAccessToken,
      photosAccessToken: input.photosAccessToken,
      runtime: input.runtime,
      now: input.now,
      signal: input.signal,
      onProgress: input.onProgress,
      onRuntime: input.onRuntime,
      renderedImageRef: input.renderedImageRef,
    },
    writeAdapter,
  );
}

export async function executeGooglePhotosExportWithAdapter(
  input: {
    driveAccessToken: string;
    photosAccessToken: string;
    runtime: GooglePhotosExportRuntime;
    now?: Date;
    signal: AbortSignal;
    onProgress: (progress: GooglePhotosExportProgress) => void;
    onRuntime: (runtime: GooglePhotosExportRuntime) => void;
    renderedImageRef?: { current: GooglePhotosRenderedImageHolder | null };
  },
  adapter: GooglePhotosExportWriteAdapter = defaultWriteAdapter,
): Promise<CommitGooglePhotosExportResult> {
  const { plan } = input.runtime;
  const uploadTokens = [...input.runtime.uploadTokens];
  const uploadedFileNames = alignUploadedFileNames(
    uploadTokens,
    input.runtime.uploadedFileNames,
    plan.items,
  );
  const renderedImageRef = input.renderedImageRef ?? { current: null };
  let currentUpload = input.runtime.currentUpload;

  const publishRuntime = () => {
    input.onRuntime({
      plan,
      uploadTokens: [...uploadTokens],
      uploadedFileNames: [...uploadedFileNames],
      currentUpload,
    });
  };

  try {
    for (let slideIndex = uploadTokens.length; slideIndex < plan.items.length; slideIndex += 1) {
      const item = plan.items[slideIndex];
      if (!item) {
        return failExport("drivePreflightFailed");
      }

      if (item.mediaKind === "image") {
        const exported = await exportRenderedImageSlide({
          driveAccessToken: input.driveAccessToken,
          photosAccessToken: input.photosAccessToken,
          item,
          currentUpload,
          renderedImageRef,
          signal: input.signal,
          adapter,
          onProgress: input.onProgress,
          totalSlides: plan.items.length,
          onSession: (next) => {
            currentUpload = next;
            publishRuntime();
          },
        });
        if (!exported.ok) {
          return exported;
        }
        uploadTokens.push(exported.uploadToken);
        uploadedFileNames.push(exported.fileName);
        currentUpload = null;
        clearRenderedImage(renderedImageRef);
        publishRuntime();
        continue;
      }

      input.onProgress({
        phase: "uploading",
        currentSlide: slideIndex + 1,
        totalSlides: plan.items.length,
        mediaKind: item.mediaKind,
        uploadedBytes: 0,
        fileBytes: item.sizeBytes,
      });

      const session = await resolveResumableSession({
        currentUpload,
        payload: {
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          fileName: item.fileName,
        },
        slideIndex,
        photosAccessToken: input.photosAccessToken,
        signal: input.signal,
        adapter: adapter.resumable,
      });
      currentUpload = {
        slideIndex,
        sessionUrl: session.sessionUrl,
        chunkGranularity: session.chunkGranularity,
        offset: session.offset,
        payloadMimeType: item.mimeType,
        payloadSizeBytes: item.sizeBytes,
        payloadFileName: item.fileName,
      };
      publishRuntime();
      input.onProgress({
        phase: "uploading",
        currentSlide: slideIndex + 1,
        totalSlides: plan.items.length,
        mediaKind: item.mediaKind,
        uploadedBytes: session.offset,
        fileBytes: item.sizeBytes,
      });

      const uploadToken = await uploadVideoFromAuthoritativeOffset({
        driveAccessToken: input.driveAccessToken,
        item,
        session,
        signal: input.signal,
        adapter,
        onOffset: (nextOffset) => {
          currentUpload = currentUpload
            ? { ...currentUpload, offset: nextOffset }
            : currentUpload;
          publishRuntime();
          input.onProgress({
            phase: "uploading",
            currentSlide: slideIndex + 1,
            totalSlides: plan.items.length,
            mediaKind: item.mediaKind,
            uploadedBytes: nextOffset,
            fileBytes: item.sizeBytes,
          });
        },
      });
      uploadTokens.push(uploadToken);
      uploadedFileNames.push(item.fileName);
      currentUpload = null;
      publishRuntime();
    }

    input.onProgress({
      phase: "creatingMedia",
      currentSlide: plan.items.length,
      totalSlides: plan.items.length,
      mediaKind: plan.items[plan.items.length - 1]?.mediaKind ?? "image",
      uploadedBytes: 0,
      fileBytes: 0,
    });

    const created = await adapter.library.batchCreateMediaItems({
      accessToken: input.photosAccessToken,
      items: plan.items.map((item, index) => ({
        description: item.description,
        fileName: uploadedFileNames[index] ?? item.fileName,
        uploadToken: uploadTokens[index] ?? "",
      })),
      signal: input.signal,
    });
    if (!created.ok || created.mediaItemIds.length !== plan.items.length) {
      return failExport("mediaCreatePartial");
    }

    input.onProgress({
      phase: "creatingAlbum",
      currentSlide: plan.items.length,
      totalSlides: plan.items.length,
      mediaKind: plan.items[plan.items.length - 1]?.mediaKind ?? "image",
      uploadedBytes: 0,
      fileBytes: 0,
    });

    const album = await adapter.library.createAlbum({
      accessToken: input.photosAccessToken,
      title: plan.albumTitle,
      signal: input.signal,
    });
    if (!album.ok) {
      return failExport("albumCreateFailed");
    }

    input.onProgress({
      phase: "addingToAlbum",
      currentSlide: plan.items.length,
      totalSlides: plan.items.length,
      mediaKind: plan.items[plan.items.length - 1]?.mediaKind ?? "image",
      uploadedBytes: 0,
      fileBytes: 0,
    });

    const added = await adapter.library.batchAddMediaItems({
      accessToken: input.photosAccessToken,
      albumId: album.albumId,
      mediaItemIds: created.mediaItemIds,
      signal: input.signal,
    });
    if (!added) {
      return failExport("albumAddFailed");
    }

    clearRenderedImage(renderedImageRef);
    return {
      ok: true,
      result: {
        albumTitle: plan.albumTitle,
        mediaItemCount: created.mediaItemIds.length,
        completedAt: (input.now ?? new Date()).toISOString(),
        productUrl: album.productUrl,
      },
    };
  } catch (error) {
    const failKind = classifyWriteError(error, input.signal);
    if (failKind === "imageRenderFailed") {
      clearRenderedImage(renderedImageRef);
      return { ...failExport(failKind), canResume: false };
    }
    if (!currentUpload) {
      clearRenderedImage(renderedImageRef);
      return { ...failExport(failKind), canResume: false };
    }

    const item = plan.items[currentUpload.slideIndex];
    const queried = await querySessionSafely(
      adapter.resumable,
      currentUpload.sessionUrl,
    );
    const payloadSize = currentUpload.payloadSizeBytes;
    if (
      item &&
      queried.ok &&
      isGooglePhotosResumeOffsetValid(queried.offset, payloadSize) &&
      canResumeCurrentUpload({
        item,
        currentUpload,
        renderedImage: renderedImageRef.current,
      })
    ) {
      currentUpload = { ...currentUpload, offset: queried.offset };
      publishRuntime();
      return { ...failExport(failKind), canResume: true };
    }

    clearRenderedImage(renderedImageRef);
    return { ...failExport(failKind), canResume: false };
  }
}

function failExport(
  kind: SanitizedGooglePhotosExportError["kind"],
): Extract<CommitGooglePhotosExportResult, { ok: false }> {
  return {
    ok: false,
    error: createSanitizedGooglePhotosExportError(kind),
    canResume: false,
  };
}

async function exportRenderedImageSlide(input: {
  driveAccessToken: string;
  photosAccessToken: string;
  item: GooglePhotosExportPlanItem;
  currentUpload: GooglePhotosExportRuntime["currentUpload"];
  renderedImageRef: { current: GooglePhotosRenderedImageHolder | null };
  signal: AbortSignal;
  adapter: GooglePhotosExportWriteAdapter;
  onProgress: (progress: GooglePhotosExportProgress) => void;
  totalSlides: number;
  onSession: (session: NonNullable<GooglePhotosExportRuntime["currentUpload"]>) => void;
}): Promise<
  | { ok: true; uploadToken: string; fileName: string }
  | Extract<CommitGooglePhotosExportResult, { ok: false }>
> {
  const payload = await resolveRenderedImagePayload(input);
  if (!payload.ok) {
    return payload;
  }

  input.onProgress({
    phase: "uploading",
    currentSlide: input.item.slideIndex + 1,
    totalSlides: input.totalSlides,
    mediaKind: "image",
    uploadedBytes: 0,
    fileBytes: payload.holder.sizeBytes,
  });

  const session = await resolveResumableSession({
    currentUpload: input.currentUpload,
    payload: {
      mimeType: payload.holder.mimeType,
      sizeBytes: payload.holder.sizeBytes,
      fileName: payload.holder.fileName,
    },
    slideIndex: input.item.slideIndex,
    photosAccessToken: input.photosAccessToken,
    signal: input.signal,
    adapter: input.adapter.resumable,
  });
  input.onSession({
    slideIndex: input.item.slideIndex,
    sessionUrl: session.sessionUrl,
    chunkGranularity: session.chunkGranularity,
    offset: session.offset,
    payloadMimeType: payload.holder.mimeType,
    payloadSizeBytes: payload.holder.sizeBytes,
    payloadFileName: payload.holder.fileName,
  });
  input.onProgress({
    phase: "uploading",
    currentSlide: input.item.slideIndex + 1,
    totalSlides: input.totalSlides,
    mediaKind: "image",
    uploadedBytes: session.offset,
    fileBytes: payload.holder.sizeBytes,
  });

  const uploadToken = await uploadBlobFromAuthoritativeOffset({
    blob: payload.holder.blob,
    session,
    sizeBytes: payload.holder.sizeBytes,
    signal: input.signal,
    adapter: input.adapter,
    onOffset: (nextOffset) => {
      input.onSession({
        slideIndex: input.item.slideIndex,
        sessionUrl: session.sessionUrl,
        chunkGranularity: session.chunkGranularity,
        offset: nextOffset,
        payloadMimeType: payload.holder.mimeType,
        payloadSizeBytes: payload.holder.sizeBytes,
        payloadFileName: payload.holder.fileName,
      });
      input.onProgress({
        phase: "uploading",
        currentSlide: input.item.slideIndex + 1,
        totalSlides: input.totalSlides,
        mediaKind: "image",
        uploadedBytes: nextOffset,
        fileBytes: payload.holder.sizeBytes,
      });
    },
  });
  return {
    ok: true,
    uploadToken,
    fileName: payload.holder.fileName,
  };
}

async function resolveRenderedImagePayload(input: {
  driveAccessToken: string;
  item: GooglePhotosExportPlanItem;
  currentUpload: GooglePhotosExportRuntime["currentUpload"];
  renderedImageRef: { current: GooglePhotosRenderedImageHolder | null };
  signal: AbortSignal;
  adapter: GooglePhotosExportWriteAdapter;
  onProgress: (progress: GooglePhotosExportProgress) => void;
  totalSlides: number;
}): Promise<
  | { ok: true; holder: GooglePhotosRenderedImageHolder }
  | Extract<CommitGooglePhotosExportResult, { ok: false }>
> {
  const retained = matchingRenderedImage(
    input.renderedImageRef.current,
    input.item.slideIndex,
    input.currentUpload,
  );
  if (input.currentUpload?.slideIndex === input.item.slideIndex) {
    if (!retained) {
      return { ...failExport("uploadFailed"), canResume: false };
    }
    return { ok: true, holder: retained };
  }

  clearRenderedImage(input.renderedImageRef);
  input.onProgress({
    phase: "renderingImage",
    currentSlide: input.item.slideIndex + 1,
    totalSlides: input.totalSlides,
    mediaKind: "image",
    uploadedBytes: 0,
    fileBytes: input.item.sizeBytes,
  });

  const stream = await input.adapter.openDriveAssetStream({
    accessToken: input.driveAccessToken,
    assetFileId: input.item.assetFileId,
    expectedMimeType: input.item.mimeType,
    expectedSizeBytes: input.item.sizeBytes,
    startByte: 0,
    signal: input.signal,
  });
  const sourceBlob = await collectStreamBlob(
    stream,
    input.item.mimeType,
    input.signal,
  );
  const rendered = await input.adapter.renderImage({
    source: sourceBlob,
    sourceMimeType: input.item.mimeType,
    caption: input.item.description,
    fileName: input.item.fileName,
    slideIndex: input.item.slideIndex,
    signal: input.signal,
  });
  if (!isGooglePhotosRenderedImageWithinUploadLimit(rendered.blob.size)) {
    return failExport("unsupportedMedia");
  }

  const holder: GooglePhotosRenderedImageHolder = {
    slideIndex: input.item.slideIndex,
    blob: rendered.blob,
    mimeType: rendered.mimeType,
    sizeBytes: rendered.blob.size,
    fileName: rendered.fileName,
  };
  input.renderedImageRef.current = holder;
  return { ok: true, holder };
}

async function resolveResumableSession(input: {
  currentUpload: GooglePhotosExportRuntime["currentUpload"];
  payload: { mimeType: string; sizeBytes: number; fileName: string };
  slideIndex: number;
  photosAccessToken: string;
  signal: AbortSignal;
  adapter: GooglePhotosResumableUploadAdapter;
}): Promise<GooglePhotosResumableSession> {
  if (input.currentUpload?.slideIndex === input.slideIndex) {
    const queried = await input.adapter.querySession({
      sessionUrl: input.currentUpload.sessionUrl,
      signal: input.signal,
    });
    if (
      !queried.ok ||
      !isGooglePhotosResumeOffsetValid(queried.offset, input.payload.sizeBytes)
    ) {
      throw new Error("photos-upload-resume-unavailable");
    }
    return {
      sessionUrl: input.currentUpload.sessionUrl,
      chunkGranularity: input.currentUpload.chunkGranularity,
      offset: queried.offset,
    };
  }

  const started = await input.adapter.startSession({
    accessToken: input.photosAccessToken,
    mimeType: input.payload.mimeType,
    sizeBytes: input.payload.sizeBytes,
    fileName: input.payload.fileName,
    signal: input.signal,
  });
  return { ...started, offset: 0 };
}

async function uploadVideoFromAuthoritativeOffset(input: {
  driveAccessToken: string;
  item: GooglePhotosExportPlanItem;
  session: GooglePhotosResumableSession;
  signal: AbortSignal;
  adapter: GooglePhotosExportWriteAdapter;
  onOffset: (offset: number) => void;
}) {
  if (input.session.offset === input.item.sizeBytes) {
    return finalizeEmptyRemaining(input);
  }

  const stream = await input.adapter.openDriveAssetStream({
    accessToken: input.driveAccessToken,
    assetFileId: input.item.assetFileId,
    expectedMimeType: input.item.mimeType,
    expectedSizeBytes: input.item.sizeBytes,
    startByte: input.session.offset,
    signal: input.signal,
  });
  return uploadGooglePhotosResumableStream({
    stream,
    session: input.session,
    sizeBytes: input.item.sizeBytes,
    signal: input.signal,
    adapter: input.adapter.resumable,
    onOffset: input.onOffset,
  });
}

async function uploadBlobFromAuthoritativeOffset(input: {
  blob: Blob;
  session: GooglePhotosResumableSession;
  sizeBytes: number;
  signal: AbortSignal;
  adapter: GooglePhotosExportWriteAdapter;
  onOffset: (offset: number) => void;
}) {
  if (input.session.offset === input.sizeBytes) {
    const uploadToken = await input.adapter.resumable.uploadChunk({
      sessionUrl: input.session.sessionUrl,
      chunk: new Uint8Array(0),
      offset: input.session.offset,
      finalize: true,
      signal: input.signal,
    });
    if (!uploadToken) {
      throw new Error("photos-upload-token-missing");
    }
    input.onOffset(input.session.offset);
    return uploadToken;
  }

  const remaining = input.blob.slice(input.session.offset);
  if (typeof remaining.stream !== "function") {
    throw new Error("photos-upload-stream-unavailable");
  }
  return uploadGooglePhotosResumableStream({
    stream: remaining.stream(),
    session: input.session,
    sizeBytes: input.sizeBytes,
    signal: input.signal,
    adapter: input.adapter.resumable,
    onOffset: input.onOffset,
  });
}

async function finalizeEmptyRemaining(input: {
  session: GooglePhotosResumableSession;
  signal: AbortSignal;
  adapter: GooglePhotosExportWriteAdapter;
  onOffset: (offset: number) => void;
}) {
  const uploadToken = await input.adapter.resumable.uploadChunk({
    sessionUrl: input.session.sessionUrl,
    chunk: new Uint8Array(0),
    offset: input.session.offset,
    finalize: true,
    signal: input.signal,
  });
  if (!uploadToken) {
    throw new Error("photos-upload-token-missing");
  }
  input.onOffset(input.session.offset);
  return uploadToken;
}

async function collectStreamBlob(
  stream: ReadableStream<Uint8Array>,
  mimeType: string,
  signal: AbortSignal,
) {
  const reader = stream.getReader();
  const chunks: BlobPart[] = [];
  try {
    while (true) {
      if (signal.aborted) {
        throw new DOMException("aborted", "AbortError");
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value && value.byteLength > 0) {
        chunks.push(toBlobPart(value));
      }
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, { type: mimeType });
}

function toBlobPart(chunk: Uint8Array): BlobPart {
  const { buffer, byteOffset, byteLength } = chunk;
  if (buffer instanceof ArrayBuffer) {
    if (byteOffset === 0 && byteLength === buffer.byteLength) {
      return buffer;
    }
    return new Uint8Array(buffer, byteOffset, byteLength);
  }
  return chunk.slice();
}

async function querySessionSafely(
  adapter: GooglePhotosResumableUploadAdapter,
  sessionUrl: string,
): Promise<GooglePhotosSessionQueryResult> {
  try {
    return await adapter.querySession({
      sessionUrl,
      signal: new AbortController().signal,
    });
  } catch {
    return { ok: false };
  }
}

function alignUploadedFileNames(
  uploadTokens: string[],
  uploadedFileNames: string[] | undefined,
  items: GooglePhotosExportPlanItem[],
) {
  if (uploadedFileNames && uploadedFileNames.length === uploadTokens.length) {
    return [...uploadedFileNames];
  }
  return uploadTokens.map((_, index) => items[index]?.fileName ?? "");
}

function matchingRenderedImage(
  holder: GooglePhotosRenderedImageHolder | null,
  slideIndex: number,
  currentUpload: GooglePhotosExportRuntime["currentUpload"],
) {
  if (!holder || holder.slideIndex !== slideIndex) {
    return null;
  }
  if (!currentUpload || currentUpload.slideIndex !== slideIndex) {
    return holder;
  }
  if (
    holder.sizeBytes !== currentUpload.payloadSizeBytes ||
    holder.mimeType !== currentUpload.payloadMimeType ||
    holder.fileName !== currentUpload.payloadFileName
  ) {
    return null;
  }
  return holder;
}

function canResumeCurrentUpload(input: {
  item: GooglePhotosExportPlanItem;
  currentUpload: NonNullable<GooglePhotosExportRuntime["currentUpload"]>;
  renderedImage: GooglePhotosRenderedImageHolder | null;
}) {
  if (input.item.mediaKind === "video") {
    return true;
  }
  return matchingRenderedImage(
    input.renderedImage,
    input.currentUpload.slideIndex,
    input.currentUpload,
  ) !== null;
}

function clearRenderedImage(
  renderedImageRef?: { current: GooglePhotosRenderedImageHolder | null },
) {
  if (renderedImageRef) {
    renderedImageRef.current = null;
  }
}

function classifyWriteError(error: unknown, signal: AbortSignal) {
  if (signal.aborted || isAbortError(error)) {
    return "aborted" as const;
  }
  if (error instanceof GooglePhotosImageRenderError) {
    return "imageRenderFailed" as const;
  }
  return "uploadFailed" as const;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
