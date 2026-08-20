import { readDriveFileMetadata, readDriveTextFile } from "../google-drive";
import {
  buildGooglePhotosExportReview,
  createSanitizedGooglePhotosExportError,
  type GooglePhotosExportProgress,
  type GooglePhotosExportRuntime,
  type SanitizedGooglePhotosExportError,
  type SanitizedGooglePhotosExportSuccess,
  type GooglePhotosExportReview,
} from "./contract";
import { openDriveProjectAssetStream } from "./drive-media";
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

export type GooglePhotosExportWriteAdapter = {
  openDriveAssetStream: typeof openDriveProjectAssetStream;
  resumable: GooglePhotosResumableUploadAdapter;
  library: GooglePhotosLibraryAdapter;
};

const defaultWriteAdapter: GooglePhotosExportWriteAdapter = {
  openDriveAssetStream: openDriveProjectAssetStream,
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

export async function executeGooglePhotosExportWithAdapter(
  input: {
    driveAccessToken: string;
    photosAccessToken: string;
    runtime: GooglePhotosExportRuntime;
    now?: Date;
    signal: AbortSignal;
    onProgress: (progress: GooglePhotosExportProgress) => void;
    onRuntime: (runtime: GooglePhotosExportRuntime) => void;
  },
  adapter: GooglePhotosExportWriteAdapter = defaultWriteAdapter,
): Promise<CommitGooglePhotosExportResult> {
  const { plan } = input.runtime;
  const uploadTokens = [...input.runtime.uploadTokens];
  let currentUpload = input.runtime.currentUpload;

  try {
    for (let slideIndex = uploadTokens.length; slideIndex < plan.items.length; slideIndex += 1) {
      const item = plan.items[slideIndex];
      if (!item) {
        return failExport("drivePreflightFailed");
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
        item,
        photosAccessToken: input.photosAccessToken,
        signal: input.signal,
        adapter: adapter.resumable,
      });
      currentUpload = { slideIndex, ...session };
      input.onRuntime({ plan, uploadTokens, currentUpload });
      input.onProgress({
        phase: "uploading",
        currentSlide: slideIndex + 1,
        totalSlides: plan.items.length,
        mediaKind: item.mediaKind,
        uploadedBytes: session.offset,
        fileBytes: item.sizeBytes,
      });

      const uploadToken = await uploadFromAuthoritativeOffset({
        driveAccessToken: input.driveAccessToken,
        item,
        session,
        signal: input.signal,
        adapter,
        onOffset: (nextOffset) => {
          currentUpload = {
            slideIndex,
            sessionUrl: session.sessionUrl,
            chunkGranularity: session.chunkGranularity,
            offset: nextOffset,
          };
          input.onRuntime({ plan, uploadTokens, currentUpload });
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
      currentUpload = null;
      input.onRuntime({ plan, uploadTokens, currentUpload });
    }

    input.onProgress({
      phase: "creatingMedia",
      currentSlide: plan.items.length,
      totalSlides: plan.items.length,
      mediaKind: plan.items[plan.items.length - 1]?.mediaKind ?? "image",
      uploadedBytes: plan.totalBytes,
      fileBytes: plan.totalBytes,
    });

    const created = await adapter.library.batchCreateMediaItems({
      accessToken: input.photosAccessToken,
      items: plan.items.map((item, index) => ({
        description: item.description,
        fileName: item.fileName,
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
      uploadedBytes: plan.totalBytes,
      fileBytes: plan.totalBytes,
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
      uploadedBytes: plan.totalBytes,
      fileBytes: plan.totalBytes,
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
    const failKind =
      input.signal.aborted || isAbortError(error) ? "aborted" : "uploadFailed";
    if (!currentUpload) {
      return { ...failExport(failKind), canResume: false };
    }

    const item = plan.items[currentUpload.slideIndex];
    const queried = await querySessionSafely(
      adapter.resumable,
      currentUpload.sessionUrl,
    );
    if (
      item &&
      queried.ok &&
      isGooglePhotosResumeOffsetValid(queried.offset, item.sizeBytes)
    ) {
      currentUpload = { ...currentUpload, offset: queried.offset };
      input.onRuntime({ plan, uploadTokens, currentUpload });
      return { ...failExport(failKind), canResume: true };
    }

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

async function resolveResumableSession(input: {
  currentUpload: GooglePhotosExportRuntime["currentUpload"];
  item: GooglePhotosExportRuntime["plan"]["items"][number];
  photosAccessToken: string;
  signal: AbortSignal;
  adapter: GooglePhotosResumableUploadAdapter;
}): Promise<GooglePhotosResumableSession> {
  if (input.currentUpload?.slideIndex === input.item.slideIndex) {
    const queried = await input.adapter.querySession({
      sessionUrl: input.currentUpload.sessionUrl,
      signal: input.signal,
    });
    if (
      !queried.ok ||
      !isGooglePhotosResumeOffsetValid(queried.offset, input.item.sizeBytes)
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
    mimeType: input.item.mimeType,
    sizeBytes: input.item.sizeBytes,
    fileName: input.item.fileName,
    signal: input.signal,
  });
  return { ...started, offset: 0 };
}

async function uploadFromAuthoritativeOffset(input: {
  driveAccessToken: string;
  item: GooglePhotosExportRuntime["plan"]["items"][number];
  session: GooglePhotosResumableSession;
  signal: AbortSignal;
  adapter: GooglePhotosExportWriteAdapter;
  onOffset: (offset: number) => void;
}) {
  if (input.session.offset === input.item.sizeBytes) {
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

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
