import {
  planProjectDiff,
  projectDiffHasChanges,
  type ProjectDiffState,
  type ProjectSlideDiff,
  type SafeSlideSnapshot,
  type SlideFieldChange,
} from "./project-diff";
import { planOfflineAssetTransfers } from "./offline-asset-transfer-plan";
import {
  readOfflineConfirmedTransferSnapshot,
  type OfflineConfirmedTransferSnapshot,
} from "./offline-confirmed-transfer-snapshot";
import {
  readDriveOfflineSaveReviewSource,
  type OfflineSaveReviewSource,
} from "./drive-offline-save-review-source";
import type { OfflineAsset, OfflineProject } from "./offline-schema";
import type { ProjectSlideImageEdit } from "./project-slide-image-edit";
import {
  PROJECT_SLIDE_TRANSITION_STRENGTH_UI_OPTIONS,
  PROJECT_SLIDE_TRANSITION_UI_OPTIONS,
  type ProjectSlideTransition,
  type ProjectSlideTransitionStrength,
} from "./project-slide-transition";
import type {
  DriveProjectSummary,
  DriveWorkspaceReadyContext,
} from "./google-drive";

export type OfflineSaveUiTransferImpact =
  | "reuse"
  | "download"
  | "offlineExcluded"
  | "deletePlanned";

export type OfflineSaveUiDiffField =
  | "asset"
  | "caption"
  | "duration"
  | "imageEdit"
  | "position";

export type OfflineSaveUiDiffChange = {
  field: OfflineSaveUiDiffField;
  before: string;
  after: string;
};

export type OfflineSaveUiDiffItem =
  | {
      kind: "added" | "removed";
      displayName: string;
      transferImpact: OfflineSaveUiTransferImpact;
      changes: [];
    }
  | {
      kind: "changed";
      displayName: string;
      transferImpact: OfflineSaveUiTransferImpact;
      changes: OfflineSaveUiDiffChange[];
    };

export type OfflineSaveUiReview = {
  baselineStatus: "available" | "empty" | "unavailable";
  projectTitleChange: null | { before: string; after: string };
  settingsChanges: Array<{
    field: "transition" | "transitionStrength";
    label: string;
    before: string;
    after: string;
  }>;
  summary: null | {
    added: number;
    removed: number;
    changed: number;
    moved: number;
  };
  transferSummary: {
    reuse: number;
    download: number;
    offlineExcluded: number;
    deletePlanned: number;
  };
  items: OfflineSaveUiDiffItem[];
  currentDisplayNames: string[];
  noChanges: boolean;
};

export type OfflineSaveUiReviewResult =
  | { ok: true; review: OfflineSaveUiReview }
  | {
      ok: false;
      reason: "sourceUnavailable" | "unsafeBaseline" | "sourceChanged";
    };

export type OfflineSaveUiReviewAdapters = {
  readConfirmed: typeof readOfflineConfirmedTransferSnapshot;
  readSource: typeof readDriveOfflineSaveReviewSource;
};

const defaultAdapters: OfflineSaveUiReviewAdapters = {
  readConfirmed: readOfflineConfirmedTransferSnapshot,
  readSource: readDriveOfflineSaveReviewSource,
};

export async function prepareOfflineSaveUiReview(
  input: {
    accessToken: string;
    readyContext: DriveWorkspaceReadyContext;
    project: DriveProjectSummary;
    signal: AbortSignal;
  },
  adapters: OfflineSaveUiReviewAdapters = defaultAdapters,
): Promise<OfflineSaveUiReviewResult> {
  try {
    const [confirmed, source] = await Promise.all([
      adapters.readConfirmed(input.project.projectId),
      adapters.readSource(input),
    ]);
    if (input.signal.aborted) input.signal.throwIfAborted();
    return buildOfflineSaveUiReview({ confirmed, source });
  } catch (error) {
    if (input.signal.aborted) input.signal.throwIfAborted();
    if (isAbortError(error)) throw error;
    return { ok: false, reason: "sourceUnavailable" };
  }
}

export function buildOfflineSaveUiReview(input: {
  confirmed: OfflineConfirmedTransferSnapshot;
  source: OfflineSaveReviewSource;
}): OfflineSaveUiReviewResult {
  if (input.confirmed.projectId !== input.source.projectId) {
    return { ok: false, reason: "unsafeBaseline" };
  }
  const baseline = resolveBaseline(input.confirmed);
  const canUseConfirmedTransferState = baseline.status === "available";
  const transferPlan = planOfflineAssetTransfers({
    projectId: input.source.projectId,
    desiredAssets: input.source.slides.map((slide) => slide.transfer),
    confirmedAssets: canUseConfirmedTransferState
      ? input.confirmed.assets
      : [],
    confirmedBlobs: canUseConfirmedTransferState
      ? input.confirmed.assetBlobs
      : [],
    confirmedReady: canUseConfirmedTransferState,
  });
  if (!transferPlan.ok) {
    return { ok: false, reason: "unsafeBaseline" };
  }

  const transferByAssetId = new Map<string, OfflineSaveUiTransferImpact>([
    ...transferPlan.reuse.map(
      (item) => [item.desired.assetId, "reuse"] as const,
    ),
    ...transferPlan.download.map(
      (item) => [item.assetId, "download"] as const,
    ),
    ...transferPlan.remoteOnly.map(
      (item) => [item.assetId, "offlineExcluded"] as const,
    ),
  ]);
  const sourceBySlideId = new Map(
    input.source.slides.map((slide) => [slide.slideId, slide]),
  );

  if (baseline.status === "unavailable") {
    return {
      ok: true,
      review: {
        baselineStatus: "unavailable",
        projectTitleChange: null,
        settingsChanges: [],
        summary: null,
        transferSummary: toTransferSummary(transferPlan),
        items: [],
        currentDisplayNames: input.source.slides.map(
          (slide) => slide.displayName,
        ),
        noChanges: false,
      },
    };
  }

  const diff = planProjectDiff({
    current: baseline.state,
    next: toNextDiffState(input.source),
  });
  if (!diff.ok) {
    return { ok: false, reason: "unsafeBaseline" };
  }
  const settingsChanges = buildSettingsChanges(
    baseline.project,
    input.source,
  );
  const items = diff.diff.slides.flatMap((item) =>
    toSafeDiffItem(item, sourceBySlideId, transferByAssetId),
  );
  const transferSummary = toTransferSummary(transferPlan);
  const noChanges =
    !projectDiffHasChanges(diff.diff) &&
    settingsChanges.length === 0 &&
    transferSummary.download === 0 &&
    transferSummary.deletePlanned === 0;

  return {
    ok: true,
    review: {
      baselineStatus: baseline.status,
      projectTitleChange:
        baseline.status === "empty" ? null : diff.diff.projectTitleChange,
      settingsChanges,
      summary: {
        added: diff.diff.counts.added,
        removed: diff.diff.counts.removed,
        changed: diff.diff.counts.changed,
        moved: diff.diff.counts.moved,
      },
      transferSummary,
      items,
      currentDisplayNames: input.source.slides.map(
        (slide) => slide.displayName,
      ),
      noChanges,
    },
  };
}

type Baseline =
  | {
      status: "available" | "empty";
      state: ProjectDiffState;
      project: OfflineProject | null;
    }
  | { status: "unavailable" };

function resolveBaseline(
  confirmed: OfflineConfirmedTransferSnapshot,
): Baseline {
  if (
    !confirmed.project &&
    !confirmed.syncState &&
    confirmed.assets.length === 0 &&
    confirmed.assetBlobs.length === 0
  ) {
    return {
      status: "empty",
      state: { projectTitle: "", slides: [] },
      project: null,
    };
  }
  if (!confirmed.confirmedReady || !confirmed.project?.projectTitle) {
    return { status: "unavailable" };
  }
  const assetsById = indexAssets(confirmed.assets);
  if (
    !assetsById ||
    confirmed.assets.length !== confirmed.project.slides.length
  ) {
    return { status: "unavailable" };
  }
  const slides = [];
  const seenSlideIds = new Set<string>();
  for (const slide of confirmed.project.slides) {
    const asset = assetsById.get(slide.assetId);
    if (
      !asset ||
      seenSlideIds.has(slide.slideId) ||
      !asset.sourceName ||
      !asset.sourceDriveFileId ||
      !asset.sourceMimeType ||
      !Number.isFinite(slide.durationSeconds) ||
      slide.durationSeconds <= 0
    ) {
      return { status: "unavailable" };
    }
    seenSlideIds.add(slide.slideId);
    slides.push({
      slideId: slide.slideId,
      assetIdentity: asset.sourceDriveFileId,
      mediaKind: getOfflineMediaKind(slide.type, asset),
      displayName: asset.sourceName,
      caption: slide.caption,
      durationMs: slide.durationSeconds * 1000,
      ...(slide.imageEdit ? { imageEdit: slide.imageEdit } : {}),
    });
  }
  return {
    status: "available",
    state: {
      projectTitle: confirmed.project.projectTitle,
      slides,
    },
    project: confirmed.project,
  };
}

function indexAssets(assets: OfflineAsset[]) {
  const result = new Map<string, OfflineAsset>();
  for (const asset of assets) {
    if (result.has(asset.assetId)) return null;
    result.set(asset.assetId, asset);
  }
  return result;
}

function toNextDiffState(source: OfflineSaveReviewSource): ProjectDiffState {
  return {
    projectTitle: source.projectTitle,
    slides: source.slides.map((slide) => ({
      slideId: slide.slideId,
      assetIdentity: slide.sourceDriveFileId,
      mediaKind: slide.mediaKind,
      displayName: slide.displayName,
      caption: slide.caption,
      durationMs: slide.durationMs,
      ...(slide.imageEdit ? { imageEdit: slide.imageEdit } : {}),
    })),
  };
}

function toSafeDiffItem(
  diff: ProjectSlideDiff,
  sourceBySlideId: ReadonlyMap<string, OfflineSaveReviewSource["slides"][number]>,
  transferByAssetId: ReadonlyMap<string, OfflineSaveUiTransferImpact>,
): OfflineSaveUiDiffItem[] {
  if (diff.kind === "unchanged") return [];
  if (diff.kind === "removed") {
    return [{
      kind: "removed",
      displayName: diff.before.displayName,
      transferImpact: "deletePlanned",
      changes: [],
    }];
  }
  const source = sourceBySlideId.get(diff.slideId);
  const transferImpact = source
    ? (transferByAssetId.get(source.assetId) ?? "download")
    : "download";
  if (diff.kind === "added") {
    return [{
      kind: "added",
      displayName: diff.after.displayName,
      transferImpact,
      changes: [],
    }];
  }
  if (diff.kind === "moved") {
    return [{
      kind: "changed",
      displayName: diff.snapshot.displayName,
      transferImpact,
      changes: [formatChange("position", diff.snapshot, diff.snapshot, {
        before: diff.beforeIndex,
        after: diff.afterIndex,
      })],
    }];
  }
  return [{
    kind: "changed",
    displayName: diff.after.displayName,
    transferImpact,
    changes: diff.changes.map((field) =>
      formatChange(field, diff.before, diff.after, {
        before: diff.beforeIndex,
        after: diff.afterIndex,
      }),
    ),
  }];
}

function formatChange(
  field: SlideFieldChange,
  before: SafeSlideSnapshot,
  after: SafeSlideSnapshot,
  position: { before: number; after: number },
): OfflineSaveUiDiffChange {
  switch (field) {
    case "asset":
      return { field, before: before.displayName, after: after.displayName };
    case "caption":
      return {
        field,
        before: before.caption || "なし",
        after: after.caption || "なし",
      };
    case "duration":
      return {
        field,
        before: formatDuration(before.durationMs),
        after: formatDuration(after.durationMs),
      };
    case "imageEdit":
      return {
        field,
        before: formatImageEdit(before.imageEdit),
        after: formatImageEdit(after.imageEdit),
      };
    case "position":
      return {
        field,
        before: `${position.before + 1}番目`,
        after: `${position.after + 1}番目`,
      };
  }
}

function buildSettingsChanges(
  current: OfflineProject | null,
  next: OfflineSaveReviewSource,
): OfflineSaveUiReview["settingsChanges"] {
  if (!current) return [];
  const changes: OfflineSaveUiReview["settingsChanges"] = [];
  if (current.transition !== next.transition) {
    changes.push({
      field: "transition",
      label: "切り替え効果",
      before: transitionLabel(current.transition),
      after: transitionLabel(next.transition),
    });
  }
  if (current.transitionStrength !== next.transitionStrength) {
    changes.push({
      field: "transitionStrength",
      label: "切り替え効果の強さ",
      before: transitionStrengthLabel(current.transitionStrength),
      after: transitionStrengthLabel(next.transitionStrength),
    });
  }
  return changes;
}

function toTransferSummary(
  plan: Extract<ReturnType<typeof planOfflineAssetTransfers>, { ok: true }>,
) {
  return {
    reuse: plan.reuse.length,
    download: plan.download.length,
    offlineExcluded: plan.remoteOnly.length,
    deletePlanned: plan.obsolete.length,
  };
}

function getOfflineMediaKind(
  type: "image" | "video" | undefined,
  asset: OfflineAsset,
) {
  return type === "video" || asset.type === "video" || asset.sourceMimeType?.startsWith("video/")
    ? "video" as const
    : "image" as const;
}

function formatDuration(durationMs: number) {
  return `${Number((durationMs / 1000).toFixed(3))}秒`;
}

function formatImageEdit(edit: ProjectSlideImageEdit | undefined) {
  const rotation = edit?.rotation ?? 0;
  if (!edit?.crop) return `回転 ${rotation}°・切り抜きなし`;
  const percent = (value: number) => `${Number((value * 100).toFixed(1))}%`;
  return `回転 ${rotation}°・切り抜き 左${percent(edit.crop.x)} 上${percent(edit.crop.y)} 幅${percent(edit.crop.width)} 高さ${percent(edit.crop.height)}`;
}

function transitionLabel(value: ProjectSlideTransition | undefined) {
  if (value === undefined) return "標準";
  return PROJECT_SLIDE_TRANSITION_UI_OPTIONS.find((item) => item.value === value)?.label ?? "標準";
}

function transitionStrengthLabel(
  value: ProjectSlideTransitionStrength | undefined,
) {
  if (value === undefined) return "標準";
  return PROJECT_SLIDE_TRANSITION_STRENGTH_UI_OPTIONS.find(
    (item) => item.value === value,
  )?.label ?? "標準";
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
