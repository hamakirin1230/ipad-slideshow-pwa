import { describe, expect, it } from "vitest";
import {
  planProjectDiff,
  projectDiffHasChanges,
  projectDiffRequiresGooglePhotosTitleUpdate,
  projectSlideDiffIsMetadataOnly,
  projectSlideDiffRequiresGooglePhotosManagedMembershipRemoval,
  projectSlideDiffRequiresGooglePhotosMediaCreate,
  projectSlideDiffRequiresGooglePhotosMediaRecreate,
  projectSlideDiffRequiresGooglePhotosMembershipRebuild,
  projectSlideDiffRequiresOfflineBlobRefresh,
  projectSlideDiffRequiresOfflineObsoleteRemoval,
  type ProjectDiffInput,
  type ProjectDiffInputSlide,
  type ProjectDiffSummary,
  type ProjectSlideDiff,
} from "./project-diff";

function slide(
  slideId: string,
  overrides: Partial<ProjectDiffInputSlide> = {},
): ProjectDiffInputSlide {
  return {
    slideId,
    assetIdentity: `asset-${slideId}`,
    mediaKind: "image",
    displayName: `${slideId}.jpg`,
    caption: `caption-${slideId}`,
    durationMs: 10_000,
    ...overrides,
  };
}

function input(
  currentSlides: ProjectDiffInputSlide[],
  nextSlides: ProjectDiffInputSlide[],
  titles = { current: "作品", next: "作品" },
): ProjectDiffInput {
  return {
    current: { projectTitle: titles.current, slides: currentSlides },
    next: { projectTitle: titles.next, slides: nextSlides },
  };
}

function diffOf(value: ProjectDiffInput): ProjectDiffSummary {
  const result = planProjectDiff(value);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("invalid fixture");
  return result.diff;
}

function onlySlide(diff: ProjectDiffSummary): ProjectSlideDiff {
  expect(diff.slides).toHaveLength(1);
  return diff.slides[0]!;
}

describe("project diff planner", () => {
  it("returns a complete no-op with unchanged counts", () => {
    const source = [slide("one"), slide("two")];
    const diff = diffOf(input(source, source.map((item) => ({ ...item }))));

    expect(diff.projectTitleChange).toBeNull();
    expect(diff.slides.map((item) => item.kind)).toEqual([
      "unchanged",
      "unchanged",
    ]);
    expect(diff.counts).toEqual({
      added: 0,
      removed: 0,
      changed: 0,
      moved: 0,
      unchanged: 2,
    });
    expect(projectDiffHasChanges(diff)).toBe(false);
  });

  it("represents a project title change without a slide change", () => {
    const source = [slide("one")];
    const diff = diffOf(
      input(source, source, { current: "変更前", next: "変更後" }),
    );

    expect(diff.projectTitleChange).toEqual({ before: "変更前", after: "変更後" });
    expect(diff.counts.changed).toBe(0);
    expect(projectDiffHasChanges(diff)).toBe(true);
    expect(projectDiffRequiresGooglePhotosTitleUpdate(diff)).toBe(true);
    expect(diff.slides.some(projectSlideDiffRequiresOfflineBlobRefresh)).toBe(false);
  });

  it.each([
    ["image", true],
    ["video", false],
  ] as const)("classifies an added %s", (mediaKind, photosCreate) => {
    const added = slide("added", { mediaKind });
    const item = onlySlide(diffOf(input([], [added])));

    expect(item).toMatchObject({ kind: "added", slideId: "added", afterIndex: 0 });
    expect(projectSlideDiffRequiresGooglePhotosMediaCreate(item)).toBe(photosCreate);
    expect(projectSlideDiffRequiresGooglePhotosMembershipRebuild(item)).toBe(
      photosCreate,
    );
    expect(projectSlideDiffRequiresOfflineBlobRefresh(item)).toBe(true);
    expect(projectSlideDiffIsMetadataOnly(item)).toBe(false);
  });

  it.each([
    ["image", true],
    ["video", false],
  ] as const)("classifies a removed %s", (mediaKind, photosRemoval) => {
    const removed = slide("removed", { mediaKind });
    const item = onlySlide(diffOf(input([removed], [])));

    expect(item).toMatchObject({ kind: "removed", slideId: "removed", beforeIndex: 0 });
    expect(projectSlideDiffRequiresGooglePhotosManagedMembershipRemoval(item)).toBe(
      photosRemoval,
    );
    expect(projectSlideDiffRequiresGooglePhotosMembershipRebuild(item)).toBe(
      photosRemoval,
    );
    expect(projectSlideDiffRequiresOfflineBlobRefresh(item)).toBe(false);
    expect(projectSlideDiffRequiresOfflineObsoleteRemoval(item)).toBe(true);
  });

  it("classifies a caption-only change as Photos recreate but no blob refresh", () => {
    const before = slide("one");
    const item = onlySlide(
      diffOf(input([before], [{ ...before, caption: "変更後" }])),
    );

    expect(item).toMatchObject({ kind: "changed", changes: ["caption"] });
    expect(projectSlideDiffRequiresGooglePhotosMediaRecreate(item)).toBe(true);
    expect(projectSlideDiffRequiresOfflineBlobRefresh(item)).toBe(false);
    expect(projectSlideDiffIsMetadataOnly(item)).toBe(true);
  });

  it("classifies a duration-only change as manifest metadata", () => {
    const before = slide("one");
    const item = onlySlide(
      diffOf(input([before], [{ ...before, durationMs: 12_000 }])),
    );

    expect(item).toMatchObject({ kind: "changed", changes: ["duration"] });
    expect(projectSlideDiffRequiresGooglePhotosMediaRecreate(item)).toBe(false);
    expect(projectSlideDiffRequiresOfflineBlobRefresh(item)).toBe(false);
    expect(projectSlideDiffIsMetadataOnly(item)).toBe(true);
  });

  it.each([
    ["rotation", { rotation: 90 as const }],
    ["crop", { rotation: 0 as const, crop: { x: 0.1, y: 0.2, width: 0.8, height: 0.7 } }],
  ])("classifies an imageEdit %s change", (_label, imageEdit) => {
    const before = slide("one");
    const item = onlySlide(diffOf(input([before], [{ ...before, imageEdit }])));

    expect(item).toMatchObject({ kind: "changed", changes: ["imageEdit"] });
    expect(projectSlideDiffRequiresGooglePhotosMediaRecreate(item)).toBe(true);
    expect(projectSlideDiffRequiresOfflineBlobRefresh(item)).toBe(false);
    expect(projectSlideDiffIsMetadataOnly(item)).toBe(true);
  });

  it("normalizes identity image edits before comparison", () => {
    const before = slide("one");
    const after = {
      ...before,
      imageEdit: {
        rotation: 0 as const,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      },
    };

    expect(onlySlide(diffOf(input([before], [after]))).kind).toBe("unchanged");
  });

  it("uses stable asset identity rather than display name", () => {
    const before = slide("one", { displayName: "same-name.jpg" });
    const after = { ...before, assetIdentity: "replacement-asset" };
    const item = onlySlide(diffOf(input([before], [after])));

    expect(item).toMatchObject({ kind: "changed", changes: ["asset"] });
    expect(projectSlideDiffRequiresGooglePhotosMediaRecreate(item)).toBe(true);
    expect(projectSlideDiffRequiresOfflineBlobRefresh(item)).toBe(true);
    expect(projectSlideDiffIsMetadataOnly(item)).toBe(false);
  });

  it("represents move-only without recreating media", () => {
    const one = slide("one");
    const two = slide("two");
    const diff = diffOf(input([one, two], [two, one]));

    expect(diff.slides.map((item) => item.kind)).toEqual(["moved", "moved"]);
    expect(diff.counts).toMatchObject({ changed: 0, moved: 2 });
    for (const item of diff.slides) {
      expect(projectSlideDiffRequiresGooglePhotosMediaRecreate(item)).toBe(false);
      expect(projectSlideDiffRequiresGooglePhotosMembershipRebuild(item)).toBe(true);
      expect(projectSlideDiffRequiresOfflineBlobRefresh(item)).toBe(false);
      expect(projectSlideDiffIsMetadataOnly(item)).toBe(true);
    }
  });

  it("keeps move plus caption as one changed record counted in both categories", () => {
    const one = slide("one");
    const two = slide("two");
    const diff = diffOf(input([one, two], [{ ...two, caption: "変更後" }, one]));
    const changed = diff.slides[0]!;

    expect(changed).toMatchObject({
      kind: "changed",
      slideId: "two",
      beforeIndex: 1,
      afterIndex: 0,
      changes: ["caption", "position"],
    });
    expect(diff.slides.filter((item) => item.slideId === "two")).toHaveLength(1);
    expect(diff.counts).toMatchObject({ changed: 1, moved: 2 });
  });

  it("handles a mixed diff with deterministic next-order then removed-order output", () => {
    const removed = slide("removed");
    const changed = slide("changed");
    const moved = slide("moved");
    const unchanged = slide("unchanged");
    const added = slide("added", { mediaKind: "video" });
    const diff = diffOf(
      input(
        [removed, changed, moved, unchanged],
        [moved, { ...changed, durationMs: 11_000 }, added, unchanged],
      ),
    );

    expect(diff.slides.map((item) => [item.slideId, item.kind])).toEqual([
      ["moved", "moved"],
      ["changed", "changed"],
      ["added", "added"],
      ["unchanged", "unchanged"],
      ["removed", "removed"],
    ]);
    expect(diff.counts).toEqual({
      added: 1,
      removed: 1,
      changed: 1,
      moved: 1,
      unchanged: 1,
    });
  });
});

describe("project diff fail-closed validation", () => {
  it.each([
    ["current", "duplicateCurrentSlideId"],
    ["next", "duplicateNextSlideId"],
  ] as const)("rejects duplicate %s slide IDs", (side, reason) => {
    const duplicate = [slide("same"), slide("same")];
    const value = input(side === "current" ? duplicate : [], side === "next" ? duplicate : []);
    expect(planProjectDiff(value)).toEqual({ ok: false, reason });
  });

  it.each([
    ["missing stable identity", { assetIdentity: "" }],
    ["invalid media kind", { mediaKind: "audio" }],
    ["invalid duration", { durationMs: Number.NaN }],
    ["image edit on video", { mediaKind: "video", imageEdit: { rotation: 90 } }],
  ])("rejects %s with a safe reason", (_label, override) => {
    const malformed = { ...slide("one"), ...override } as ProjectDiffInputSlide;
    const result = planProjectDiff(input([], [malformed]));
    expect(result).toEqual({ ok: false, reason: "invalidNextProject" });
    expect(JSON.stringify(result)).not.toContain("one");
  });
});

describe("project diff safe output", () => {
  it("does not serialize internal identities, IDs, tokens, fingerprints, or URLs", () => {
    const sensitiveValues = {
      assetIdentity: "drive-file-secret",
      assetFileId: "asset-file-secret",
      projectFolderId: "project-folder-secret",
      workspaceId: "workspace-secret",
      revisionId: "revision-secret",
      operationId: "operation-secret",
      mediaItemId: "media-secret",
      renderKey: "render-secret",
      sourceFingerprint: "fingerprint-secret",
      token: "token-secret",
      rawUrl: "https://secret.invalid/media",
    };
    const current = slide("one", { assetIdentity: "old-drive-file-secret" });
    const next = Object.assign(slide("one", sensitiveValues), sensitiveValues);
    const serialized = JSON.stringify(diffOf(input([current], [next])));

    for (const [key, value] of Object.entries(sensitiveValues)) {
      expect(serialized, key).not.toContain(key);
      expect(serialized, key).not.toContain(value);
    }
    expect(serialized).toContain('"displayName"');
  });
});
