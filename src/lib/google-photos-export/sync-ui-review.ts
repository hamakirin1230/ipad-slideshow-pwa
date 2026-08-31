import type { DriveProjectSummary } from "../google-drive";
import {
  planProjectDiff,
  type ProjectDiffSummary,
  type ProjectSlideDiff,
  type SafeSlideSnapshot,
  type SlideFieldChange,
} from "../project-diff";
import type { ProjectSlideImageEdit } from "../project-slide-image-edit";
import {
  readDrivePhotosSyncBinding,
  type ReadDrivePhotosSyncBindingResult,
} from "./drive-sync-binding";
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
import { inspectGooglePhotosSyncPendingContinuation } from "./sync-pending";
import { createGooglePhotosSyncRenderIdentity } from "./render-key";

export type GooglePhotosSyncUiReviewMode = "initial" | "update" | "continue";

export type GooglePhotosSyncUiDiffField =
  | "asset"
  | "caption"
  | "duration"
  | "imageEdit"
  | "position";

export type GooglePhotosSyncUiDiffChange = {
  field: GooglePhotosSyncUiDiffField;
  before: string;
  after: string;
  affectsGooglePhotos: boolean;
};

export type GooglePhotosSyncUiDiffItem =
  | {
      kind: "added" | "removed";
      displayName: string;
      changes: [];
    }
  | {
      kind: "changed";
      displayName: string;
      changes: GooglePhotosSyncUiDiffChange[];
    };

export type GooglePhotosSyncUiDiff = {
  baselineStatus: "available" | "unavailable";
  albumTitleChange: null | { before: string; after: string };
  items: GooglePhotosSyncUiDiffItem[];
  currentDisplayNames: string[];
  summary: null | {
    added: number;
    removed: number;
    changed: number;
    moved: number;
    unchanged: number;
  };
  hasGooglePhotosChanges: boolean | null;
  metadataOnlyChangeCount: number;
};

export type GooglePhotosSyncUiReview = {
  mode: GooglePhotosSyncUiReviewMode;
  projectTitle: string;
  targetAlbumTitle: string;
  sourceSlideCount: number;
  syncPhotoCount: number;
  skippedVideoCount: number;
  totalBytes: number;
  diff: GooglePhotosSyncUiDiff;
};

export type GooglePhotosSyncUiReviewFailureReason =
  | "sourcePreparationFailed"
  | "bindingDuplicate"
  | "bindingInvalid"
  | "bindingInaccessible"
  | "sourceChanged"
  | "manualRecoveryRequired";

export type GooglePhotosSyncUiReviewResult =
  | { ok: true; review: GooglePhotosSyncUiReview }
  | { ok: false; reason: GooglePhotosSyncUiReviewFailureReason };

export type GooglePhotosSyncUiReviewAdapters = {
  prepareSource: (
    input: Parameters<typeof prepareGooglePhotosSyncSourceWithAdapter>[0],
  ) => Promise<PrepareGooglePhotosSyncSourceResult>;
  readBinding: (
    input: Parameters<typeof readDrivePhotosSyncBinding>[0],
  ) => Promise<ReadDrivePhotosSyncBindingResult>;
};

const defaultAdapters: GooglePhotosSyncUiReviewAdapters = {
  prepareSource: prepareGooglePhotosSyncSourceWithAdapter,
  readBinding: readDrivePhotosSyncBinding,
};

const safeContinuationPhases = new Set([
  "albumBound",
  "mediaPrepared",
  "membershipRemoving",
  "membershipAdding",
  "titleUpdating",
  "finalizing",
]);

export async function prepareGooglePhotosSyncUiReviewInDrive(
  input: {
    accessToken: string;
    selectedProjectId: string;
    workspaceId: string;
    projectsRootFolderId: string;
    project: DriveProjectSummary;
    signal: AbortSignal;
  },
  adapters: GooglePhotosSyncUiReviewAdapters = defaultAdapters,
): Promise<GooglePhotosSyncUiReviewResult> {
  input.signal.throwIfAborted();
  let sourceResult: PrepareGooglePhotosSyncSourceResult;
  try {
    sourceResult = await adapters.prepareSource(input);
    input.signal.throwIfAborted();
  } catch (error) {
    rethrowAbort(error, input.signal);
    return { ok: false, reason: "sourcePreparationFailed" };
  }
  if (!sourceResult.ok) {
    return { ok: false, reason: "sourcePreparationFailed" };
  }
  const source = sourceResult.source;

  let bindingResult: ReadDrivePhotosSyncBindingResult;
  try {
    bindingResult = await adapters.readBinding({
      accessToken: input.accessToken,
      projectRootFolderId: input.project.projectFolderId,
      workspaceId: input.workspaceId,
      projectId: input.selectedProjectId,
      signal: input.signal,
    });
    input.signal.throwIfAborted();
  } catch (error) {
    rethrowAbort(error, input.signal);
    return { ok: false, reason: "bindingInaccessible" };
  }

  switch (bindingResult.status) {
    case "unbound":
      return success("initial", source, null);
    case "duplicate":
      return { ok: false, reason: "bindingDuplicate" };
    case "invalid":
      return { ok: false, reason: "bindingInvalid" };
    case "inaccessible":
      return { ok: false, reason: "bindingInaccessible" };
    case "ready":
      break;
  }

  const parsed = parseGooglePhotosSyncBinding(bindingResult.binding, {
    workspaceId: input.workspaceId,
    projectId: input.selectedProjectId,
  });
  if (!parsed.ok) {
    return { ok: false, reason: "bindingInvalid" };
  }
  const binding = parsed.value;

  if (binding.pending !== null) {
    const continuation = inspectGooglePhotosSyncPendingContinuation({
      binding,
      expectedOperationId: binding.pending.operationId,
      expectedSourceFingerprint: source.sourceFingerprint,
      expectedTargetTitle: source.targetAlbumTitle,
    });
    if (!continuation.ok) {
      return {
        ok: false,
        reason:
          continuation.reason === "sourceChanged"
            ? "sourceChanged"
            : "bindingInvalid",
      };
    }
    if (
      continuation.phase === "creatingAlbum" ||
      continuation.phase === "mediaCreating"
    ) {
      return { ok: false, reason: "manualRecoveryRequired" };
    }
    if (!safeContinuationPhases.has(continuation.phase)) {
      return { ok: false, reason: "bindingInvalid" };
    }
    return success("continue", source, binding);
  }

  if (binding.album !== null) {
    return success("update", source, binding);
  }
  if (binding.stable !== null) {
    return { ok: false, reason: "bindingInvalid" };
  }
  return success("initial", source, binding);
}

async function success(
  mode: GooglePhotosSyncUiReviewMode,
  source: GooglePhotosSyncPreparedSource,
  binding: GooglePhotosSyncBinding | null,
): Promise<GooglePhotosSyncUiReviewResult> {
  return {
    ok: true,
    review: {
      mode,
      projectTitle: source.projectTitle,
      targetAlbumTitle: source.targetAlbumTitle,
      sourceSlideCount: source.sourceSlideCount,
      syncPhotoCount: source.items.length,
      skippedVideoCount: source.skippedVideoCount,
      totalBytes: source.totalBytes,
      diff: await buildGooglePhotosSyncUiDiff(mode, source, binding),
    },
  };
}

async function buildGooglePhotosSyncUiDiff(
  mode: GooglePhotosSyncUiReviewMode,
  source: GooglePhotosSyncPreparedSource,
  binding: GooglePhotosSyncBinding | null,
): Promise<GooglePhotosSyncUiDiff> {
  const albumTitleChange = buildAlbumTitleChange(mode, source, binding);
  const target = resolveReviewTarget(mode, source, binding);
  if (!target) return baselineUnavailable(source, albumTitleChange);
  const continuesInitialSync =
    mode === "continue" &&
    binding?.stable === null &&
    binding.pending?.previousManagedMediaItemIds.length === 0;
  if (mode === "initial" || binding === null || continuesInitialSync) {
    return planSafeUiDiff({
      currentTitle: source.targetAlbumTitle,
      nextTitle: source.targetAlbumTitle,
      currentItems: [],
      nextItems: target.map((item) => ({
        slideId: item.slideId,
        assetIdentity: item.renderKey,
        snapshot: item.snapshot,
      })),
      albumTitleChange,
      currentDisplayNames: target.map((item) => item.snapshot.displayName),
    });
  }

  if (binding.stable === null) {
    return baselineUnavailable(source, albumTitleChange);
  }

  if (binding.stable.items.some((item) => item.snapshot === null)) {
    return baselineUnavailable(source, albumTitleChange);
  }

  const currentItems = binding.stable.items.map((item) => ({
    slideId: item.slideId,
    assetIdentity: item.renderKey,
    snapshot: item.snapshot as SafeSlideSnapshot,
  }));
  const stableBySlideId = new Map(
    binding.stable.items.map((item) => [item.slideId, item]),
  );
  const nextItems = [];
  const renderChangedSlideIds = new Set<string>();
  for (const targetItem of target) {
    const stableItem = stableBySlideId.get(targetItem.slideId);
    if (!stableItem || stableItem.renderKey !== targetItem.renderKey) {
      renderChangedSlideIds.add(targetItem.slideId);
    }
    const stableSnapshot = stableItem?.snapshot;
    let assetIdentity = targetItem.renderKey;
    if (
      stableItem &&
      stableSnapshot &&
      (stableItem.renderKey === targetItem.renderKey ||
        (targetItem.source !== null &&
          (await freshAssetMatchesStableRender(
            targetItem.source,
            { ...stableItem, snapshot: stableSnapshot },
            binding.stable.rendererVersion,
          ))))
    ) {
      assetIdentity = stableItem.renderKey;
    }
    nextItems.push({
      slideId: targetItem.slideId,
      assetIdentity,
      snapshot: targetItem.snapshot,
    });
  }

  return planSafeUiDiff({
    currentTitle:
      binding.album?.lastKnownTitle ?? source.targetAlbumTitle,
    nextTitle: source.targetAlbumTitle,
    currentItems,
    nextItems,
    albumTitleChange,
    currentDisplayNames: target.map((item) => item.snapshot.displayName),
    renderChangedSlideIds,
  });
}

function resolveReviewTarget(
  mode: GooglePhotosSyncUiReviewMode,
  source: GooglePhotosSyncPreparedSource,
  binding: GooglePhotosSyncBinding | null,
): Array<{
  slideId: string;
  renderKey: string;
  snapshot: SafeSlideSnapshot;
  source: GooglePhotosSyncPreparedItem | null;
}> | null {
  const sourceBySlideId = new Map(
    source.items.map((item) => [item.slideId, item]),
  );
  const pendingItems =
    mode === "continue" && binding?.pending?.targetItems.length
      ? binding.pending.targetItems
      : null;
  if (!pendingItems) {
    return source.items.map((item) => ({
      slideId: item.slideId,
      renderKey: item.renderKey,
      snapshot: item.snapshot,
      source: item,
    }));
  }
  if (pendingItems.some((item) => item.snapshot === null)) return null;
  return pendingItems.map((item) => ({
    slideId: item.slideId,
    renderKey: item.renderKey,
    snapshot: item.snapshot as SafeSlideSnapshot,
    source: sourceBySlideId.get(item.slideId) ?? null,
  }));
}

async function freshAssetMatchesStableRender(
  source: GooglePhotosSyncPreparedItem,
  stable: GooglePhotosSyncManagedItem & { snapshot: SafeSlideSnapshot },
  rendererVersion: number,
) {
  const result = await createGooglePhotosSyncRenderIdentity(
    {
      slideId: source.slideId,
      assetFileId: source.assetFileId,
      sourceChecksum: source.sourceChecksum,
      sourceModifiedTime: source.sourceModifiedTime,
      sourceSizeBytes: source.sizeBytes,
      sourceMimeType: source.mimeType,
      caption: stable.snapshot.caption,
      outputMimeType: source.outputMimeType,
      ...(stable.snapshot.imageEdit
        ? { imageEdit: stable.snapshot.imageEdit }
        : {}),
    },
    { rendererVersion },
  );
  return result.ok && result.renderKey === stable.renderKey;
}

function buildAlbumTitleChange(
  mode: GooglePhotosSyncUiReviewMode,
  source: GooglePhotosSyncPreparedSource,
  binding: GooglePhotosSyncBinding | null,
) {
  const before = binding?.album?.lastKnownTitle;
  return mode !== "initial" && before !== undefined && before !== source.targetAlbumTitle
    ? { before, after: source.targetAlbumTitle }
    : null;
}

function baselineUnavailable(
  source: GooglePhotosSyncPreparedSource,
  albumTitleChange: GooglePhotosSyncUiDiff["albumTitleChange"],
): GooglePhotosSyncUiDiff {
  return {
    baselineStatus: "unavailable",
    albumTitleChange,
    items: [],
    currentDisplayNames: source.items.map((item) => item.snapshot.displayName),
    summary: null,
    hasGooglePhotosChanges: albumTitleChange ? true : null,
    metadataOnlyChangeCount: 0,
  };
}

function planSafeUiDiff(input: {
  currentTitle: string;
  nextTitle: string;
  currentItems: Array<{
    slideId: string;
    assetIdentity: string;
    snapshot: SafeSlideSnapshot;
  }>;
  nextItems: Array<{
    slideId: string;
    assetIdentity: string;
    snapshot: SafeSlideSnapshot;
  }>;
  albumTitleChange: GooglePhotosSyncUiDiff["albumTitleChange"];
  currentDisplayNames: string[];
  renderChangedSlideIds?: ReadonlySet<string>;
}): GooglePhotosSyncUiDiff {
  const result = planProjectDiff({
    current: {
      projectTitle: input.currentTitle,
      slides: input.currentItems.map(toProjectDiffSlide),
    },
    next: {
      projectTitle: input.nextTitle,
      slides: input.nextItems.map(toProjectDiffSlide),
    },
  });
  if (!result.ok) {
    return {
      baselineStatus: "unavailable",
      albumTitleChange: input.albumTitleChange,
      items: [],
      currentDisplayNames: input.currentDisplayNames,
      summary: null,
      hasGooglePhotosChanges: input.albumTitleChange ? true : null,
      metadataOnlyChangeCount: 0,
    };
  }
  return toSafeUiDiff(
    result.diff,
    input.currentDisplayNames,
    input.renderChangedSlideIds ?? new Set(),
  );
}

function toProjectDiffSlide(input: {
  slideId: string;
  assetIdentity: string;
  snapshot: SafeSlideSnapshot;
}) {
  return {
    slideId: input.slideId,
    assetIdentity: input.assetIdentity,
    ...input.snapshot,
  };
}

function toSafeUiDiff(
  diff: ProjectDiffSummary,
  currentDisplayNames: string[],
  renderChangedSlideIds: ReadonlySet<string>,
): GooglePhotosSyncUiDiff {
  const items = diff.slides.flatMap((item) =>
    toSafeUiDiffItem(item, renderChangedSlideIds),
  );
  const hasGooglePhotosChanges =
    diff.projectTitleChange !== null ||
    items.some(
      (item) =>
        item.kind !== "changed" ||
        item.changes.some((change) => change.affectsGooglePhotos),
    );
  return {
    baselineStatus: "available",
    albumTitleChange: diff.projectTitleChange,
    items,
    currentDisplayNames,
    summary: diff.counts,
    hasGooglePhotosChanges,
    metadataOnlyChangeCount: items.filter(
      (item) =>
        item.kind === "changed" &&
        item.changes.length > 0 &&
        item.changes.every((change) => !change.affectsGooglePhotos),
    ).length,
  };
}

function toSafeUiDiffItem(
  diff: ProjectSlideDiff,
  renderChangedSlideIds: ReadonlySet<string>,
): GooglePhotosSyncUiDiffItem[] {
  switch (diff.kind) {
    case "added":
      return diff.after.mediaKind === "image"
        ? [{ kind: "added", displayName: diff.after.displayName, changes: [] }]
        : [];
    case "removed":
      return diff.before.mediaKind === "image"
        ? [{ kind: "removed", displayName: diff.before.displayName, changes: [] }]
        : [];
    case "changed":
      if (diff.before.mediaKind !== "image" && diff.after.mediaKind !== "image") {
        return [];
      }
      return [
        {
          kind: "changed",
          displayName: diff.after.displayName,
          changes: diff.changes.map((field) =>
            formatSafeChange(
              field,
              diff.before,
              diff.after,
              {
                before: diff.beforeIndex,
                after: diff.afterIndex,
              },
              renderChangedSlideIds.has(diff.slideId),
            ),
          ),
        },
      ];
    case "moved":
      return diff.snapshot.mediaKind === "image"
        ? [
            {
              kind: "changed",
              displayName: diff.snapshot.displayName,
              changes: [
                formatSafeChange(
                  "position",
                  diff.snapshot,
                  diff.snapshot,
                  {
                    before: diff.beforeIndex,
                    after: diff.afterIndex,
                  },
                  true,
                ),
              ],
            },
          ]
        : [];
    case "unchanged":
      return [];
  }
}

function formatSafeChange(
  field: SlideFieldChange,
  before: SafeSlideSnapshot,
  after: SafeSlideSnapshot,
  position: { before: number; after: number },
  renderChanged: boolean,
): GooglePhotosSyncUiDiffChange {
  switch (field) {
    case "asset":
      return {
        field,
        before: before.displayName,
        after: after.displayName,
        affectsGooglePhotos: renderChanged,
      };
    case "caption":
      return {
        field,
        before: formatCaption(before.caption),
        after: formatCaption(after.caption),
        affectsGooglePhotos: renderChanged,
      };
    case "duration":
      return {
        field,
        before: formatDuration(before.durationMs),
        after: formatDuration(after.durationMs),
        affectsGooglePhotos: false,
      };
    case "imageEdit":
      return {
        field,
        before: formatImageEdit(before.imageEdit),
        after: formatImageEdit(after.imageEdit),
        affectsGooglePhotos: renderChanged,
      };
    case "position":
      return {
        field,
        before: `${position.before + 1}番目`,
        after: `${position.after + 1}番目`,
        affectsGooglePhotos: true,
      };
  }
}

function formatCaption(value: string) {
  return value.length > 0 ? value : "なし";
}

function formatDuration(durationMs: number) {
  const seconds = durationMs / 1000;
  return `${Number(seconds.toFixed(3))}秒`;
}

function formatImageEdit(edit: ProjectSlideImageEdit | undefined) {
  const rotation = edit?.rotation ?? 0;
  if (!edit?.crop) return `回転 ${rotation}°・切り抜きなし`;
  const percent = (value: number) => `${Number((value * 100).toFixed(1))}%`;
  return `回転 ${rotation}°・切り抜き 左${percent(edit.crop.x)} 上${percent(edit.crop.y)} 幅${percent(edit.crop.width)} 高さ${percent(edit.crop.height)}`;
}

function rethrowAbort(error: unknown, signal: AbortSignal) {
  if (signal.aborted) signal.throwIfAborted();
  if (error instanceof DOMException && error.name === "AbortError") throw error;
}
