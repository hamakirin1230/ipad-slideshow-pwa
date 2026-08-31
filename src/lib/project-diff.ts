import {
  normalizeProjectSlideImageEditForWrite,
  parseProjectSlideImageEdit,
  type ProjectSlideImageEdit,
} from "./project-slide-image-edit";

export type ProjectDiffMediaKind = "image" | "video";

export type ProjectDiffInputSlide = {
  slideId: string;
  assetIdentity: string;
  mediaKind: ProjectDiffMediaKind;
  displayName: string;
  caption: string;
  durationMs: number;
  imageEdit?: ProjectSlideImageEdit;
};

export type ProjectDiffState = {
  projectTitle: string;
  slides: ProjectDiffInputSlide[];
};

export type ProjectDiffInput = {
  current: ProjectDiffState;
  next: ProjectDiffState;
};

export type SafeSlideSnapshot = {
  mediaKind: ProjectDiffMediaKind;
  displayName: string;
  caption: string;
  durationMs: number;
  imageEdit?: ProjectSlideImageEdit;
};

export type SlideFieldChange =
  | "asset"
  | "caption"
  | "duration"
  | "imageEdit"
  | "position";

export type ProjectSlideDiff =
  | {
      kind: "added";
      slideId: string;
      afterIndex: number;
      after: SafeSlideSnapshot;
    }
  | {
      kind: "removed";
      slideId: string;
      beforeIndex: number;
      before: SafeSlideSnapshot;
    }
  | {
      kind: "changed";
      slideId: string;
      beforeIndex: number;
      afterIndex: number;
      before: SafeSlideSnapshot;
      after: SafeSlideSnapshot;
      changes: SlideFieldChange[];
    }
  | {
      kind: "moved";
      slideId: string;
      beforeIndex: number;
      afterIndex: number;
      snapshot: SafeSlideSnapshot;
    }
  | {
      kind: "unchanged";
      slideId: string;
      index: number;
      snapshot: SafeSlideSnapshot;
    };

export type ProjectDiffSummary = {
  projectTitleChange: null | { before: string; after: string };
  slides: ProjectSlideDiff[];
  counts: {
    added: number;
    removed: number;
    changed: number;
    moved: number;
    unchanged: number;
  };
};

export type ProjectDiffFailureReason =
  | "invalidCurrentProject"
  | "invalidNextProject"
  | "duplicateCurrentSlideId"
  | "duplicateNextSlideId";

export type ProjectDiffResult =
  | { ok: true; diff: ProjectDiffSummary }
  | { ok: false; reason: ProjectDiffFailureReason };

type ValidatedSlide = ProjectDiffInputSlide & {
  imageEdit?: ProjectSlideImageEdit;
};

const FIELD_CHANGE_ORDER: SlideFieldChange[] = [
  "asset",
  "caption",
  "duration",
  "imageEdit",
  "position",
];

export function planProjectDiff(input: ProjectDiffInput): ProjectDiffResult {
  const current = validateState(input?.current);
  if (!current.ok) {
    return { ok: false, reason: "invalidCurrentProject" };
  }
  if (hasDuplicateSlideIds(current.value.slides)) {
    return { ok: false, reason: "duplicateCurrentSlideId" };
  }

  const next = validateState(input?.next);
  if (!next.ok) {
    return { ok: false, reason: "invalidNextProject" };
  }
  if (hasDuplicateSlideIds(next.value.slides)) {
    return { ok: false, reason: "duplicateNextSlideId" };
  }

  const currentBySlideId = new Map(
    current.value.slides.map((slide, index) => [slide.slideId, { slide, index }]),
  );
  const nextSlideIds = new Set(next.value.slides.map((slide) => slide.slideId));
  const slides: ProjectSlideDiff[] = [];

  for (const [afterIndex, afterSlide] of next.value.slides.entries()) {
    const currentEntry = currentBySlideId.get(afterSlide.slideId);
    if (!currentEntry) {
      slides.push({
        kind: "added",
        slideId: afterSlide.slideId,
        afterIndex,
        after: toSafeSnapshot(afterSlide),
      });
      continue;
    }

    const changes = collectChanges(
      currentEntry.slide,
      afterSlide,
      currentEntry.index,
      afterIndex,
    );
    if (changes.length === 0) {
      slides.push({
        kind: "unchanged",
        slideId: afterSlide.slideId,
        index: afterIndex,
        snapshot: toSafeSnapshot(afterSlide),
      });
    } else if (changes.length === 1 && changes[0] === "position") {
      slides.push({
        kind: "moved",
        slideId: afterSlide.slideId,
        beforeIndex: currentEntry.index,
        afterIndex,
        snapshot: toSafeSnapshot(afterSlide),
      });
    } else {
      slides.push({
        kind: "changed",
        slideId: afterSlide.slideId,
        beforeIndex: currentEntry.index,
        afterIndex,
        before: toSafeSnapshot(currentEntry.slide),
        after: toSafeSnapshot(afterSlide),
        changes,
      });
    }
  }

  for (const [beforeIndex, beforeSlide] of current.value.slides.entries()) {
    if (!nextSlideIds.has(beforeSlide.slideId)) {
      slides.push({
        kind: "removed",
        slideId: beforeSlide.slideId,
        beforeIndex,
        before: toSafeSnapshot(beforeSlide),
      });
    }
  }

  return {
    ok: true,
    diff: {
      projectTitleChange:
        current.value.projectTitle === next.value.projectTitle
          ? null
          : {
              before: current.value.projectTitle,
              after: next.value.projectTitle,
            },
      slides,
      counts: {
        added: slides.filter((slide) => slide.kind === "added").length,
        removed: slides.filter((slide) => slide.kind === "removed").length,
        changed: slides.filter((slide) => slide.kind === "changed").length,
        moved: slides.filter(projectSlideDiffHasPositionChange).length,
        unchanged: slides.filter((slide) => slide.kind === "unchanged").length,
      },
    },
  };
}

export function projectDiffHasChanges(diff: ProjectDiffSummary) {
  return (
    diff.projectTitleChange !== null ||
    diff.counts.added > 0 ||
    diff.counts.removed > 0 ||
    diff.counts.changed > 0 ||
    diff.counts.moved > 0
  );
}

export function projectDiffRequiresGooglePhotosTitleUpdate(
  diff: ProjectDiffSummary,
) {
  return diff.projectTitleChange !== null;
}

export function projectSlideDiffRequiresGooglePhotosMediaCreate(
  diff: ProjectSlideDiff,
) {
  return (
    (diff.kind === "added" && diff.after.mediaKind === "image") ||
    projectSlideDiffRequiresGooglePhotosMediaRecreate(diff)
  );
}

export function projectSlideDiffRequiresGooglePhotosMediaRecreate(
  diff: ProjectSlideDiff,
) {
  return (
    diff.kind === "changed" &&
    diff.after.mediaKind === "image" &&
    diff.changes.some((change) =>
      change === "asset" || change === "caption" || change === "imageEdit",
    )
  );
}

export function projectSlideDiffRequiresGooglePhotosMembershipRebuild(
  diff: ProjectSlideDiff,
) {
  if (
    projectSlideDiffRequiresGooglePhotosMediaCreate(diff) ||
    projectSlideDiffRequiresGooglePhotosManagedMembershipRemoval(diff)
  ) {
    return true;
  }
  if (diff.kind === "moved") return diff.snapshot.mediaKind === "image";
  return (
    diff.kind === "changed" &&
    (diff.before.mediaKind === "image" || diff.after.mediaKind === "image") &&
    diff.changes.includes("position")
  );
}

export function projectSlideDiffRequiresGooglePhotosManagedMembershipRemoval(
  diff: ProjectSlideDiff,
) {
  return (
    (diff.kind === "removed" && diff.before.mediaKind === "image") ||
    (diff.kind === "changed" &&
      diff.before.mediaKind === "image" &&
      diff.changes.some((change) =>
        change === "asset" || change === "caption" || change === "imageEdit",
      ))
  );
}

export function projectSlideDiffRequiresOfflineBlobRefresh(
  diff: ProjectSlideDiff,
) {
  return (
    diff.kind === "added" ||
    (diff.kind === "changed" && diff.changes.includes("asset"))
  );
}

export function projectSlideDiffRequiresOfflineObsoleteRemoval(
  diff: ProjectSlideDiff,
) {
  return diff.kind === "removed";
}

export function projectSlideDiffIsMetadataOnly(diff: ProjectSlideDiff) {
  if (diff.kind === "moved") return true;
  return (
    diff.kind === "changed" &&
    diff.changes.every((change) => change !== "asset")
  );
}

function projectSlideDiffHasPositionChange(diff: ProjectSlideDiff) {
  return (
    diff.kind === "moved" ||
    (diff.kind === "changed" && diff.changes.includes("position"))
  );
}

function collectChanges(
  before: ValidatedSlide,
  after: ValidatedSlide,
  beforeIndex: number,
  afterIndex: number,
) {
  const changes = new Set<SlideFieldChange>();
  if (before.assetIdentity !== after.assetIdentity) changes.add("asset");
  if (before.caption !== after.caption) changes.add("caption");
  if (before.durationMs !== after.durationMs) changes.add("duration");
  if (!imageEditsEqual(before.imageEdit, after.imageEdit)) changes.add("imageEdit");
  if (beforeIndex !== afterIndex) changes.add("position");
  return FIELD_CHANGE_ORDER.filter((change) => changes.has(change));
}

function imageEditsEqual(
  before: ProjectSlideImageEdit | undefined,
  after: ProjectSlideImageEdit | undefined,
) {
  return JSON.stringify(before) === JSON.stringify(after);
}

function toSafeSnapshot(slide: ValidatedSlide): SafeSlideSnapshot {
  return {
    mediaKind: slide.mediaKind,
    displayName: slide.displayName,
    caption: slide.caption,
    durationMs: slide.durationMs,
    ...(slide.imageEdit ? { imageEdit: cloneImageEdit(slide.imageEdit) } : {}),
  };
}

function cloneImageEdit(edit: ProjectSlideImageEdit): ProjectSlideImageEdit {
  return {
    rotation: edit.rotation,
    ...(edit.crop ? { crop: { ...edit.crop } } : {}),
  };
}

function validateState(
  value: unknown,
): { ok: true; value: ProjectDiffState & { slides: ValidatedSlide[] } } | { ok: false } {
  if (!isRecord(value) || typeof value.projectTitle !== "string" || !Array.isArray(value.slides)) {
    return { ok: false };
  }

  const slides: ValidatedSlide[] = [];
  for (const valueSlide of value.slides) {
    const slide = validateSlide(valueSlide);
    if (!slide) return { ok: false };
    slides.push(slide);
  }
  return { ok: true, value: { projectTitle: value.projectTitle, slides } };
}

function validateSlide(value: unknown): ValidatedSlide | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.slideId) ||
    !isNonEmptyString(value.assetIdentity) ||
    (value.mediaKind !== "image" && value.mediaKind !== "video") ||
    !isNonEmptyString(value.displayName) ||
    typeof value.caption !== "string" ||
    typeof value.durationMs !== "number" ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs <= 0
  ) {
    return null;
  }

  let imageEdit: ProjectSlideImageEdit | undefined;
  if (Object.prototype.hasOwnProperty.call(value, "imageEdit")) {
    const parsed = parseProjectSlideImageEdit(value.imageEdit);
    if (!parsed.ok || value.mediaKind !== "image") return null;
    imageEdit = normalizeProjectSlideImageEditForWrite(parsed.value);
  }

  return {
    slideId: value.slideId,
    assetIdentity: value.assetIdentity,
    mediaKind: value.mediaKind,
    displayName: value.displayName,
    caption: value.caption,
    durationMs: value.durationMs,
    ...(imageEdit ? { imageEdit } : {}),
  };
}

function hasDuplicateSlideIds(slides: ValidatedSlide[]) {
  return new Set(slides.map((slide) => slide.slideId)).size !== slides.length;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
