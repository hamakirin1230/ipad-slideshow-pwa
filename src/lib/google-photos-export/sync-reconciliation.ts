import type { DriveProjectSummary } from "../google-drive";
import {
  readDrivePhotosSyncBinding,
  type ReadDrivePhotosSyncBindingResult,
} from "./drive-sync-binding";
import {
  prepareGooglePhotosSyncSourceWithAdapter,
  type GooglePhotosSyncPreparedSource,
  type PrepareGooglePhotosSyncSourceResult,
} from "./sync-drive-source";
import {
  getGooglePhotosSyncAlbum,
  GOOGLE_PHOTOS_MEDIA_SEARCH_PAGE_SIZE_MAX,
  searchGooglePhotosSyncAlbumMediaItemsPage,
  type GooglePhotosSyncAlbum,
  type GooglePhotosSyncAlbumReadResult,
  type GooglePhotosSyncMediaItemPageResult,
} from "./sync-library-api";
import {
  inspectGooglePhotosSyncPendingContinuation,
} from "./sync-pending";
import {
  planGooglePhotosIncrementalSync,
  type GooglePhotosIncrementalSyncPlan,
  type GooglePhotosIncrementalSyncPlanResult,
} from "./sync-plan";
import {
  parseGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
} from "./sync-binding";

export const GOOGLE_PHOTOS_SYNC_MEDIA_PAGE_LIMIT = 200;

export type GooglePhotosSyncReconciliationAdapters = {
  prepareSource: (
    input: Parameters<typeof prepareGooglePhotosSyncSourceWithAdapter>[0],
  ) => Promise<PrepareGooglePhotosSyncSourceResult>;
  readBinding: (
    input: Parameters<typeof readDrivePhotosSyncBinding>[0],
  ) => Promise<ReadDrivePhotosSyncBindingResult>;
  getAlbum: (
    input: Parameters<typeof getGooglePhotosSyncAlbum>[0],
  ) => Promise<GooglePhotosSyncAlbumReadResult>;
  searchAlbumMediaItemsPage: (
    input: Parameters<typeof searchGooglePhotosSyncAlbumMediaItemsPage>[0],
  ) => Promise<GooglePhotosSyncMediaItemPageResult>;
  planSync: (
    input: Parameters<typeof planGooglePhotosIncrementalSync>[0],
  ) => Promise<GooglePhotosIncrementalSyncPlanResult>;
};

type PreparedContext = { preparedSource: GooglePhotosSyncPreparedSource };
type BindingContext = PreparedContext & {
  bindingFileId: string;
  binding: GooglePhotosSyncBinding;
};
type AlbumContext = BindingContext & { album: GooglePhotosSyncAlbum };

export type GooglePhotosSyncReconciliationResult =
  | {
      status: "sourcePreparationFailed";
      error?: Extract<PrepareGooglePhotosSyncSourceResult, { ok: false }>["error"];
      reason?: Extract<
        PrepareGooglePhotosSyncSourceResult,
        { ok: false }
      >["reason"];
      diagnostics?: Extract<
        PrepareGooglePhotosSyncSourceResult,
        { ok: false }
      >["diagnostics"];
    }
  | (PreparedContext & { status: "bindingDuplicate" })
  | (PreparedContext & { status: "bindingInvalid" })
  | (PreparedContext & { status: "bindingInaccessible" })
  | (PreparedContext & {
      status: "initialSyncRequired";
      bindingFileId: string | null;
      binding: GooglePhotosSyncBinding | null;
    })
  | (BindingContext & { status: "continuationRequired" })
  | (BindingContext & { status: "continuationSourceChanged" })
  | (BindingContext & { status: "targetMissing" })
  | (BindingContext & { status: "photosReadFailed" })
  | (BindingContext & { status: "photosInvalidResponse" })
  | (AlbumContext & { status: "targetNotWritable" })
  | (AlbumContext & { status: "paginationInvalid" })
  | (AlbumContext & { status: "paginationLimitExceeded" })
  | (AlbumContext & {
      status: "planningFailed";
      currentAlbumMediaItemIds: string[];
    })
  | (AlbumContext & {
      status: "noChanges" | "ready";
      currentAlbumMediaItemIds: string[];
      plan: GooglePhotosIncrementalSyncPlan;
    });

const defaultAdapters: GooglePhotosSyncReconciliationAdapters = {
  prepareSource: prepareGooglePhotosSyncSourceWithAdapter,
  readBinding: readDrivePhotosSyncBinding,
  getAlbum: getGooglePhotosSyncAlbum,
  searchAlbumMediaItemsPage: searchGooglePhotosSyncAlbumMediaItemsPage,
  planSync: planGooglePhotosIncrementalSync,
};

export async function prepareGooglePhotosSyncReconciliation(
  input: {
    driveAccessToken: string;
    photosAccessToken: string;
    selectedProjectId: string;
    workspaceId: string;
    projectsRootFolderId: string;
    project: DriveProjectSummary;
    signal: AbortSignal;
  },
  adapters: GooglePhotosSyncReconciliationAdapters = defaultAdapters,
): Promise<GooglePhotosSyncReconciliationResult> {
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
    rethrowAbort(error, input.signal);
    return { status: "sourcePreparationFailed" };
  }
  if (!sourceResult.ok) {
    return {
      status: "sourcePreparationFailed",
      error: sourceResult.error,
      ...(sourceResult.reason === undefined ? {} : { reason: sourceResult.reason }),
      ...(sourceResult.diagnostics === undefined
        ? {}
        : { diagnostics: sourceResult.diagnostics }),
    };
  }
  const preparedSource = sourceResult.source;

  let bindingResult: ReadDrivePhotosSyncBindingResult;
  try {
    bindingResult = await adapters.readBinding({
      accessToken: input.driveAccessToken,
      projectRootFolderId: input.project.projectFolderId,
      workspaceId: input.workspaceId,
      projectId: input.selectedProjectId,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
  } catch (error) {
    rethrowAbort(error, input.signal);
    return { status: "bindingInaccessible", preparedSource };
  }
  if (bindingResult.status === "unbound") {
    return {
      status: "initialSyncRequired",
      preparedSource,
      bindingFileId: null,
      binding: null,
    };
  }
  if (bindingResult.status === "duplicate") {
    return { status: "bindingDuplicate", preparedSource };
  }
  if (bindingResult.status === "invalid") {
    return { status: "bindingInvalid", preparedSource };
  }
  if (bindingResult.status === "inaccessible") {
    return { status: "bindingInaccessible", preparedSource };
  }

  const parsedBinding = parseGooglePhotosSyncBinding(bindingResult.binding, {
    workspaceId: input.workspaceId,
    projectId: input.selectedProjectId,
  });
  if (!parsedBinding.ok) {
    return { status: "bindingInvalid", preparedSource };
  }
  const binding = parsedBinding.value;
  const bindingContext: BindingContext = {
    preparedSource,
    bindingFileId: bindingResult.fileId,
    binding,
  };

  if (binding.pending !== null) {
    const continuation = inspectGooglePhotosSyncPendingContinuation({
      binding,
      expectedOperationId: binding.pending.operationId,
      expectedSourceFingerprint: preparedSource.sourceFingerprint,
      expectedTargetTitle: preparedSource.targetAlbumTitle,
    });
    if (!continuation.ok) {
      return {
        status:
          continuation.reason === "sourceChanged"
            ? "continuationSourceChanged"
            : "bindingInvalid",
        ...bindingContext,
      };
    }
    return { status: "continuationRequired", ...bindingContext };
  }

  if (binding.album === null) {
    if (binding.stable !== null) {
      return { status: "bindingInvalid", preparedSource };
    }
    return {
      status: "initialSyncRequired",
      ...bindingContext,
    };
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
    rethrowAbort(error, input.signal);
    return { status: "photosReadFailed", ...bindingContext };
  }
  if (albumResult.status === "notFound") {
    return { status: "targetMissing", ...bindingContext };
  }
  if (albumResult.status === "inaccessible") {
    return { status: "photosReadFailed", ...bindingContext };
  }
  if (
    albumResult.status === "invalidResponse" ||
    albumResult.album.id !== binding.album.albumId
  ) {
    return { status: "photosInvalidResponse", ...bindingContext };
  }
  const albumContext: AlbumContext = {
    ...bindingContext,
    album: albumResult.album,
  };
  if (albumResult.album.isWriteable !== true) {
    return { status: "targetNotWritable", ...albumContext };
  }

  const membership = await readAllGooglePhotosSyncAlbumMediaItemIds(
    {
      accessToken: input.photosAccessToken,
      albumId: albumResult.album.id,
      signal: input.signal,
    },
    adapters.searchAlbumMediaItemsPage,
  );
  if (!membership.ok) {
    return { status: membership.status, ...albumContext };
  }

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
    rethrowAbort(error, input.signal);
    return {
      status: "planningFailed",
      ...albumContext,
      currentAlbumMediaItemIds: membership.mediaItemIds,
    };
  }
  if (
    !planResult.ok ||
    planResult.plan.sourceFingerprint !== preparedSource.sourceFingerprint
  ) {
    return {
      status: "planningFailed",
      ...albumContext,
      currentAlbumMediaItemIds: membership.mediaItemIds,
    };
  }

  const status =
    planResult.plan.createItems.length === 0 &&
    !planResult.plan.membershipNeedsRebuild &&
    !planResult.plan.titleNeedsUpdate
      ? "noChanges"
      : "ready";
  return {
    status,
    ...albumContext,
    currentAlbumMediaItemIds: membership.mediaItemIds,
    plan: planResult.plan,
  };
}

export async function readAllGooglePhotosSyncAlbumMediaItemIds(
  input: {
    accessToken: string;
    albumId: string;
    signal: AbortSignal;
  },
  searchPage: GooglePhotosSyncReconciliationAdapters["searchAlbumMediaItemsPage"],
): Promise<
  | { ok: true; mediaItemIds: string[] }
  | {
      ok: false;
      status:
        | "photosReadFailed"
        | "paginationInvalid"
        | "paginationLimitExceeded";
    }
> {
  const mediaItemIds: string[] = [];
  const seenMediaItemIds = new Set<string>();
  const seenPageTokens = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < GOOGLE_PHOTOS_SYNC_MEDIA_PAGE_LIMIT; page += 1) {
    throwIfAborted(input.signal);
    let pageResult: GooglePhotosSyncMediaItemPageResult;
    try {
      pageResult = await searchPage({
        accessToken: input.accessToken,
        albumId: input.albumId,
        pageSize: GOOGLE_PHOTOS_MEDIA_SEARCH_PAGE_SIZE_MAX,
        ...(pageToken === undefined ? {} : { pageToken }),
        signal: input.signal,
      });
      throwIfAborted(input.signal);
    } catch (error) {
      rethrowAbort(error, input.signal);
      return { ok: false, status: "photosReadFailed" };
    }
    if (pageResult.status === "inaccessible") {
      return { ok: false, status: "photosReadFailed" };
    }
    if (pageResult.status !== "ready") {
      return { ok: false, status: "paginationInvalid" };
    }
    if (!Array.isArray(pageResult.mediaItemIds)) {
      return { ok: false, status: "paginationInvalid" };
    }
    for (const mediaItemId of pageResult.mediaItemIds) {
      if (
        !isNonBlankTrimmedString(mediaItemId) ||
        seenMediaItemIds.has(mediaItemId)
      ) {
        return { ok: false, status: "paginationInvalid" };
      }
      seenMediaItemIds.add(mediaItemId);
      mediaItemIds.push(mediaItemId);
    }

    const nextPageToken = pageResult.nextPageToken;
    if (nextPageToken === null) return { ok: true, mediaItemIds };
    if (
      !isNonBlankTrimmedString(nextPageToken) ||
      seenPageTokens.has(nextPageToken)
    ) {
      return { ok: false, status: "paginationInvalid" };
    }
    if (page + 1 >= GOOGLE_PHOTOS_SYNC_MEDIA_PAGE_LIMIT) {
      return { ok: false, status: "paginationLimitExceeded" };
    }
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }
  return { ok: false, status: "paginationLimitExceeded" };
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

function rethrowAbort(error: unknown, signal: AbortSignal): void {
  if (signal.aborted) throwIfAborted(signal);
  if (error instanceof Error && error.name === "AbortError") throw error;
}

function isNonBlankTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}
