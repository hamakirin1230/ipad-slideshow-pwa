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
  startGooglePhotosResumableSession,
  uploadGooglePhotosResumableChunk,
  uploadGooglePhotosResumableStream,
  type GooglePhotosResumableUploadAdapter,
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
        uploadedBytes: currentUpload?.slideIndex === slideIndex ? currentUpload.offset : 0,
        fileBytes: item.sizeBytes,
      });

      const sessionUrl =
        currentUpload?.slideIndex === slideIndex
          ? currentUpload.sessionUrl
          : await adapter.resumable.startSession({
              accessToken: input.photosAccessToken,
              mimeType: item.mimeType,
              sizeBytes: item.sizeBytes,
              fileName: item.fileName,
              signal: input.signal,
            });
      const offset =
        currentUpload?.slideIndex === slideIndex ? currentUpload.offset : 0;
      currentUpload = { slideIndex, sessionUrl, offset };
      input.onRuntime({ plan, uploadTokens, currentUpload });

      const stream = await adapter.openDriveAssetStream({
        accessToken: input.driveAccessToken,
        assetFileId: item.assetFileId,
        expectedMimeType: item.mimeType,
        startByte: offset,
        signal: input.signal,
      });
      const uploadToken = await uploadGooglePhotosResumableStream({
        stream,
        session: { sessionUrl, offset },
        sizeBytes: item.sizeBytes,
        signal: input.signal,
        adapter: adapter.resumable,
        onOffset: (nextOffset) => {
          currentUpload = { slideIndex, sessionUrl, offset: nextOffset };
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
    if (input.signal.aborted || isAbortError(error)) {
      return { ...failExport("aborted"), canResume: currentUpload !== null };
    }
    return { ...failExport("uploadFailed"), canResume: currentUpload !== null };
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

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
