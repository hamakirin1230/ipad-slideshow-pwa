import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DriveProjectSummary } from "../google-drive";
import type { SafeSlideSnapshot } from "../project-diff";
import {
  buildEmptyGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
  type GooglePhotosSyncPendingPhase,
} from "./sync-binding";
import type { GooglePhotosSyncPreparedSource } from "./sync-drive-source";
import { createGooglePhotosSyncRenderIdentity } from "./render-key";
import {
  prepareGooglePhotosSyncUiReviewInDrive,
  type GooglePhotosSyncUiReviewAdapters,
} from "./sync-ui-review";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
const FINGERPRINT = `sha256:${"a".repeat(64)}`;
const OTHER_FINGERPRINT = `sha256:${"b".repeat(64)}`;
const RENDER_KEY = `sha256:${"c".repeat(64)}`;
const TITLE = "夏のアルバム";
const sourceText = readFileSync(
  new URL("./sync-ui-review.ts", import.meta.url),
  "utf8",
);

const project: DriveProjectSummary = {
  projectId: PROJECT_ID,
  title: TITLE,
  projectFolderId: "project-folder-secret",
  manifestFileId: "manifest-secret",
  assetsFolderId: "assets-secret",
  manifestPath: "projects/secret/manifest.json",
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-31T00:00:00.000Z",
};

describe("Google Photos sync Drive-only UI review", () => {
  it("classifies an unbound project as an initial sync", async () => {
    const { adapters, readBinding } = harness({ status: "unbound" });
    const result = await prepareGooglePhotosSyncUiReviewInDrive(
      input(),
      adapters,
    );

    expect(result).toEqual({ ok: true, review: safeReview("initial") });
    expect(readBinding).toHaveBeenCalledOnce();
  });

  it("classifies a ready empty binding as an initial sync", async () => {
    const { adapters } = harness(ready(emptyBinding()));
    await expect(
      prepareGooglePhotosSyncUiReviewInDrive(input(), adapters),
    ).resolves.toEqual({ ok: true, review: safeReview("initial") });
  });

  it("classifies a bound project without pending work as an update", async () => {
    const { adapters } = harness(ready(boundBinding()));
    await expect(
      prepareGooglePhotosSyncUiReviewInDrive(input(), adapters),
    ).resolves.toEqual({ ok: true, review: safeReview("update") });
  });

  it("shows exact title, caption, duration, image edit, and asset before/after", async () => {
    const source = preparedSource();
    source.projectTitle = "変更後のアルバム";
    source.targetAlbumTitle = "変更後のアルバム";
    source.items[0]!.snapshot = {
      ...source.items[0]!.snapshot,
      displayName: "新しい素材.jpg",
      caption: "変更後",
      durationMs: 12_000,
      imageEdit: { rotation: 90 },
    };
    const binding = exactBinding(source, "変更前のアルバム");
    binding.stable!.items[0] = {
      ...binding.stable!.items[0]!,
      renderKey: `sha256:${"e".repeat(64)}`,
      snapshot: {
        mediaKind: "image",
        displayName: "古い素材.jpg",
        caption: "変更前",
        durationMs: 10_000,
      },
    };
    const { adapters } = harness(ready(binding), source);

    const result = await prepareGooglePhotosSyncUiReviewInDrive(input(), adapters);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.diff.albumTitleChange).toEqual({
      before: "変更前のアルバム",
      after: "変更後のアルバム",
    });
    expect(result.review.diff.items[0]).toEqual({
      kind: "changed",
      displayName: "新しい素材.jpg",
      changes: [
        {
          field: "asset",
          before: "古い素材.jpg",
          after: "新しい素材.jpg",
          affectsGooglePhotos: true,
        },
        {
          field: "caption",
          before: "変更前",
          after: "変更後",
          affectsGooglePhotos: true,
        },
        {
          field: "duration",
          before: "10秒",
          after: "12秒",
          affectsGooglePhotos: false,
        },
        {
          field: "imageEdit",
          before: "回転 0°・切り抜きなし",
          after: "回転 90°・切り抜きなし",
          affectsGooglePhotos: true,
        },
      ],
    });
  });

  it("summarizes crop changes in safe Japanese", async () => {
    const source = preparedSource();
    source.items[0]!.snapshot = {
      ...source.items[0]!.snapshot,
      imageEdit: {
        rotation: 0,
        crop: { x: 0.1, y: 0.2, width: 0.8, height: 0.7 },
      },
    };
    const binding = exactBinding(source);
    binding.stable!.items[0]!.snapshot = {
      ...source.items[0]!.snapshot,
      imageEdit: { rotation: 0 },
    };
    const { adapters } = harness(ready(binding), source);

    const result = await prepareGooglePhotosSyncUiReviewInDrive(input(), adapters);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.diff.items[0]).toMatchObject({
      kind: "changed",
      changes: [
        {
          field: "imageEdit",
          before: "回転 0°・切り抜きなし",
          after: "回転 0°・切り抜き 左10% 上20% 幅80% 高さ70%",
        },
      ],
    });
  });

  it("distinguishes a caption render change from an asset replacement", async () => {
    const source = preparedSource();
    const item = source.items[0]!;
    item.snapshot = { ...item.snapshot, caption: "変更後" };
    const oldIdentity = await createGooglePhotosSyncRenderIdentity({
      slideId: item.slideId,
      assetFileId: item.assetFileId,
      sourceChecksum: item.sourceChecksum,
      sourceModifiedTime: item.sourceModifiedTime,
      sourceSizeBytes: item.sizeBytes,
      sourceMimeType: item.mimeType,
      caption: "変更前",
      outputMimeType: item.outputMimeType,
    });
    expect(oldIdentity.ok).toBe(true);
    if (!oldIdentity.ok) return;
    const binding = exactBinding(source);
    binding.stable!.items[0] = {
      ...binding.stable!.items[0]!,
      renderKey: oldIdentity.renderKey,
      snapshot: { ...item.snapshot, caption: "変更前" },
    };
    const { adapters } = harness(ready(binding), source);

    const result = await prepareGooglePhotosSyncUiReviewInDrive(input(), adapters);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.diff.items[0]).toMatchObject({
      kind: "changed",
      changes: [
        { field: "caption", before: "変更前", after: "変更後" },
      ],
    });
  });

  it("reports an asset replacement even when the display name is unchanged", async () => {
    const source = preparedSource();
    const binding = exactBinding(source);
    binding.stable!.items[0]!.renderKey = `sha256:${"9".repeat(64)}`;
    const { adapters } = harness(ready(binding), source);

    const result = await prepareGooglePhotosSyncUiReviewInDrive(input(), adapters);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.diff.items[0]).toMatchObject({
      kind: "changed",
      displayName: "元素材.jpg",
      changes: [
        {
          field: "asset",
          before: "元素材.jpg",
          after: "元素材.jpg",
        },
      ],
    });
  });

  it("keeps move and caption changes for one slide in one item", async () => {
    const source = preparedSource();
    const binding = exactBinding(source);
    binding.stable!.items.reverse();
    binding.stable!.items[0]!.snapshot = {
      ...(binding.stable!.items[0]!.snapshot as SafeSlideSnapshot),
      caption: "変更前",
    };
    source.items[1]!.snapshot = {
      ...source.items[1]!.snapshot,
      caption: "変更後",
    };
    const { adapters } = harness(ready(binding), source);

    const result = await prepareGooglePhotosSyncUiReviewInDrive(input(), adapters);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const target = result.review.diff.items.filter(
      (item) => item.displayName === "元素材.png",
    );
    expect(target).toHaveLength(1);
    expect(target[0]).toMatchObject({
      kind: "changed",
      changes: [
        { field: "caption", before: "変更前", after: "変更後" },
        { field: "position", before: "1番目", after: "2番目" },
      ],
    });
  });

  it("builds mixed added, removed, changed, moved, and unchanged summaries without unchanged items", async () => {
    const source = preparedSource();
    const binding = exactBinding(source);
    binding.stable!.items[0]!.snapshot = {
      ...(binding.stable!.items[0]!.snapshot as SafeSlideSnapshot),
      caption: "変更前",
    };
    binding.stable!.items[1] = {
      slideId: "removed-slide",
      renderKey: `sha256:${"f".repeat(64)}`,
      mediaItemId: "removed-media",
      snapshot: snapshot("削除素材.jpg"),
    };
    source.items[1] = {
      ...source.items[1]!,
      slideId: "added-slide",
      renderKey: `sha256:${"1".repeat(64)}`,
      snapshot: snapshot("追加素材.jpg"),
    };
    const { adapters } = harness(ready(binding), source);

    const result = await prepareGooglePhotosSyncUiReviewInDrive(input(), adapters);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.diff.summary).toEqual({
      added: 1,
      removed: 1,
      changed: 1,
      moved: 0,
      unchanged: 0,
    });
    expect(result.review.diff.items.map((item) => item.kind)).toEqual([
      "changed",
      "added",
      "removed",
    ]);
  });

  it("hides unchanged slides and separates duration-only metadata changes", async () => {
    const unchangedSource = preparedSource();
    const unchanged = await prepareGooglePhotosSyncUiReviewInDrive(
      input(),
      harness(ready(exactBinding(unchangedSource)), unchangedSource).adapters,
    );
    expect(unchanged.ok).toBe(true);
    if (!unchanged.ok) return;
    expect(unchanged.review.diff.items).toEqual([]);
    expect(unchanged.review.diff.summary?.unchanged).toBe(2);
    expect(unchanged.review.diff.hasGooglePhotosChanges).toBe(false);

    const durationSource = preparedSource();
    const durationBinding = exactBinding(durationSource);
    durationBinding.stable!.items[0]!.snapshot = {
      ...(durationBinding.stable!.items[0]!.snapshot as SafeSlideSnapshot),
      durationMs: 5_000,
    };
    const duration = await prepareGooglePhotosSyncUiReviewInDrive(
      input(),
      harness(ready(durationBinding), durationSource).adapters,
    );
    expect(duration.ok).toBe(true);
    if (!duration.ok) return;
    expect(duration.review.diff).toMatchObject({
      hasGooglePhotosChanges: false,
      metadataOnlyChangeCount: 1,
      items: [
        {
          kind: "changed",
          changes: [
            {
              field: "duration",
              before: "5秒",
              after: "10秒",
              affectsGooglePhotos: false,
            },
          ],
        },
      ],
    });
  });

  it("fails safe when any legacy stable snapshot is unavailable", async () => {
    const source = preparedSource();
    const binding = exactBinding(source);
    binding.stable!.items[0]!.snapshot = null;
    const { adapters } = harness(ready(binding), source);

    const result = await prepareGooglePhotosSyncUiReviewInDrive(input(), adapters);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.diff).toMatchObject({
      baselineStatus: "unavailable",
      items: [],
      summary: null,
      hasGooglePhotosChanges: null,
      currentDisplayNames: ["元素材.jpg", "元素材.png"],
    });
  });

  it.each([
    "albumBound",
    "mediaPrepared",
    "membershipRemoving",
    "membershipAdding",
    "titleUpdating",
    "finalizing",
  ] satisfies GooglePhotosSyncPendingPhase[])(
    "classifies safe pending phase %s as an explicit continuation",
    async (phase) => {
      const { adapters } = harness(ready(pendingBinding(phase)));
      await expect(
        prepareGooglePhotosSyncUiReviewInDrive(input(), adapters),
      ).resolves.toEqual({ ok: true, review: safeReview("continue") });
    },
  );

  it("uses the stable baseline during a safe continuation", async () => {
    const source = preparedSource();
    const binding = exactBinding(source);
    binding.stable!.items[0]!.snapshot = {
      ...(binding.stable!.items[0]!.snapshot as SafeSlideSnapshot),
      caption: "更新前",
    };
    binding.pending = {
      operationId: "operation-secret",
      startedAt: "2026-08-31T01:00:00.000Z",
      phase: "finalizing",
      sourceFingerprint: source.sourceFingerprint,
      targetTitle: source.targetAlbumTitle,
      previousManagedMediaItemIds: binding.stable!.items.map(
        (item) => item.mediaItemId,
      ),
      targetItems: source.items.map((item, index) => ({
        slideId: item.slideId,
        renderKey: item.renderKey,
        mediaItemId: `target-media-${index}`,
        snapshot: { ...item.snapshot },
      })),
    };
    source.items[0]!.snapshot = {
      ...source.items[0]!.snapshot,
      durationMs: 99_000,
    };
    const { adapters } = harness(ready(binding), source);

    const result = await prepareGooglePhotosSyncUiReviewInDrive(input(), adapters);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.mode).toBe("continue");
    expect(result.review.diff.items[0]).toMatchObject({
      kind: "changed",
      displayName: "元素材.jpg",
      changes: [
        { field: "caption", before: "更新前", after: "caption" },
      ],
    });
  });

  it.each([
    "creatingAlbum",
    "mediaCreating",
  ] satisfies GooglePhotosSyncPendingPhase[])(
    "fails closed for ambiguous pending phase %s",
    async (phase) => {
      const { adapters } = harness(ready(pendingBinding(phase)));
      await expect(
        prepareGooglePhotosSyncUiReviewInDrive(input(), adapters),
      ).resolves.toEqual({
        ok: false,
        reason: "manualRecoveryRequired",
      });
    },
  );

  it("fails closed when pending source identity changed", async () => {
    const binding = pendingBinding("albumBound");
    binding.pending!.sourceFingerprint = OTHER_FINGERPRINT;
    const { adapters } = harness(ready(binding));

    await expect(
      prepareGooglePhotosSyncUiReviewInDrive(input(), adapters),
    ).resolves.toEqual({ ok: false, reason: "sourceChanged" });
  });

  it("fails closed when the pending target title changed", async () => {
    const binding = pendingBinding("albumBound");
    binding.pending!.targetTitle = "以前のアルバム名";
    const { adapters } = harness(ready(binding));

    await expect(
      prepareGooglePhotosSyncUiReviewInDrive(input(), adapters),
    ).resolves.toEqual({ ok: false, reason: "sourceChanged" });
  });

  it.each([
    [{ status: "duplicate" } as const, "bindingDuplicate"],
    [{ status: "invalid", reason: "metadata" } as const, "bindingInvalid"],
    [{ status: "inaccessible" } as const, "bindingInaccessible"],
  ])("maps binding read failure %# without details", async (bindingResult, reason) => {
    const { adapters } = harness(bindingResult);
    await expect(
      prepareGooglePhotosSyncUiReviewInDrive(input(), adapters),
    ).resolves.toEqual({ ok: false, reason });
  });

  it("revalidates ready binding ownership", async () => {
    const foreign = buildEmptyGooglePhotosSyncBinding({
      workspaceId: OTHER_WORKSPACE_ID,
      projectId: PROJECT_ID,
    });
    const { adapters } = harness(ready(foreign));

    await expect(
      prepareGooglePhotosSyncUiReviewInDrive(input(), adapters),
    ).resolves.toEqual({ ok: false, reason: "bindingInvalid" });
  });

  it("maps source preparation rejection or failure without raw diagnostics", async () => {
    const rejected = harness({ status: "unbound" });
    rejected.prepareSource.mockRejectedValueOnce(new Error("raw secret"));
    await expect(
      prepareGooglePhotosSyncUiReviewInDrive(input(), rejected.adapters),
    ).resolves.toEqual({ ok: false, reason: "sourcePreparationFailed" });

    const failed = harness({ status: "unbound" });
    failed.prepareSource.mockResolvedValueOnce({
      ok: false,
      error: { kind: "drivePreflightFailed", message: "raw detail" },
      diagnostics: { issues: ["private detail"] },
    });
    await expect(
      prepareGooglePhotosSyncUiReviewInDrive(input(), failed.adapters),
    ).resolves.toEqual({ ok: false, reason: "sourcePreparationFailed" });
  });

  it("propagates abort without converting it to a Drive failure", async () => {
    const controller = new AbortController();
    const test = harness({ status: "unbound" });
    test.prepareSource.mockImplementationOnce(async () => {
      controller.abort();
      return { ok: true, source: preparedSource() };
    });

    await expect(
      prepareGooglePhotosSyncUiReviewInDrive(
        input(controller.signal),
        test.adapters,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(test.readBinding).not.toHaveBeenCalled();
  });

  it("returns no internal identifiers, fingerprints, or binding bodies", async () => {
    const source = preparedSource();
    const { adapters } = harness(ready(exactBinding(source)), source);
    const result = await prepareGooglePhotosSyncUiReviewInDrive(
      input(),
      adapters,
    );
    const serialized = JSON.stringify(result);

    for (const secret of [
      WORKSPACE_ID,
      PROJECT_ID,
      "project-folder-secret",
      "binding-file-secret",
      "album-secret",
      "asset-secret",
      "media-secret",
      FINGERPRINT,
      RENDER_KEY,
      "operation-secret",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.diff.items).toEqual([]);
    expect(result.review.diff.summary?.unchanged).toBe(2);
  });

  it("contains only Drive read adapters and no Photos or write operations", () => {
    expect(sourceText).toContain("prepareGooglePhotosSyncSourceWithAdapter");
    expect(sourceText).toContain("readDrivePhotosSyncBinding");
    for (const forbidden of [
      "photosAccessToken",
      "getGooglePhotosSyncAlbum",
      "searchGooglePhotosSyncAlbumMediaItemsPage",
      "createGooglePhotosAlbum",
      "upload",
      "batchCreate",
      "batchAdd",
      "batchRemove",
      "updateDrivePhotosSyncBinding",
      "createDrivePhotosSyncBinding",
      "requestAccessToken",
    ]) {
      expect(sourceText).not.toContain(forbidden);
    }
  });
});

function input(signal = new AbortController().signal) {
  return {
    accessToken: "drive-token-secret",
    selectedProjectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    projectsRootFolderId: "projects-root-secret",
    project,
    signal,
  };
}

function preparedSource(): GooglePhotosSyncPreparedSource {
  return {
    projectId: PROJECT_ID,
    projectTitle: TITLE,
    targetAlbumTitle: TITLE,
    sourceSlideCount: 3,
    skippedVideoCount: 1,
    totalBytes: 3072,
    rendererVersion: 1,
    items: [
      {
        slideIndex: 0,
        mediaKind: "image",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        description: "caption",
        fileName: "photo.jpg",
        slideId: "slide-1",
        assetFileId: "asset-secret",
        sourceChecksum: null,
        sourceModifiedTime: null,
        outputMimeType: "image/jpeg",
        renderKey: RENDER_KEY,
        reuseEligible: false,
        snapshot: {
          mediaKind: "image",
          displayName: "元素材.jpg",
          caption: "caption",
          durationMs: 10_000,
        },
      },
      {
        slideIndex: 1,
        mediaKind: "image",
        mimeType: "image/png",
        sizeBytes: 2048,
        description: "",
        fileName: "photo.png",
        slideId: "slide-2",
        assetFileId: "asset-secret-2",
        sourceChecksum: null,
        sourceModifiedTime: null,
        outputMimeType: "image/png",
        renderKey: `sha256:${"d".repeat(64)}`,
        reuseEligible: false,
        snapshot: {
          mediaKind: "image",
          displayName: "元素材.png",
          caption: "",
          durationMs: 8_000,
        },
      },
    ],
    desiredSlides: [
      { slideId: "slide-1", renderKey: RENDER_KEY, reuseEligible: false },
      {
        slideId: "slide-2",
        renderKey: `sha256:${"d".repeat(64)}`,
        reuseEligible: false,
      },
    ],
    sourceFingerprint: FINGERPRINT,
  };
}

function emptyBinding() {
  return buildEmptyGooglePhotosSyncBinding({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
  });
}

function boundBinding(): GooglePhotosSyncBinding {
  return {
    ...emptyBinding(),
    album: {
      albumId: "album-secret",
      createdAt: "2026-08-30T01:00:00.000Z",
      lastKnownTitle: TITLE,
    },
  };
}

function exactBinding(
  source: GooglePhotosSyncPreparedSource,
  albumTitle = source.targetAlbumTitle,
): GooglePhotosSyncBinding {
  return {
    ...emptyBinding(),
    album: {
      albumId: "album-secret",
      createdAt: "2026-08-30T01:00:00.000Z",
      lastKnownTitle: albumTitle,
    },
    stable: {
      generation: 1,
      completedAt: "2026-08-30T01:00:00.000Z",
      rendererVersion: 1,
      items: source.items.map((item, index) => ({
        slideId: item.slideId,
        renderKey: item.renderKey,
        mediaItemId: `media-secret-${index}`,
        snapshot: { ...item.snapshot },
      })),
    },
  };
}

function snapshot(displayName: string): SafeSlideSnapshot {
  return {
    mediaKind: "image",
    displayName,
    caption: "",
    durationMs: 10_000,
  };
}

function pendingBinding(
  phase: GooglePhotosSyncPendingPhase,
): GooglePhotosSyncBinding {
  const ambiguousAlbumCreation = phase === "creatingAlbum";
  const targetItems = [
    "mediaPrepared",
    "membershipRemoving",
    "membershipAdding",
    "titleUpdating",
    "finalizing",
  ].includes(phase)
    ? [
        {
          slideId: "slide-1",
          renderKey: RENDER_KEY,
          mediaItemId: "media-secret",
          snapshot: {
            mediaKind: "image" as const,
            displayName: "元素材.jpg",
            caption: "caption",
            durationMs: 10_000,
          },
        },
        {
          slideId: "slide-2",
          renderKey: `sha256:${"d".repeat(64)}`,
          mediaItemId: "media-secret-2",
          snapshot: {
            mediaKind: "image" as const,
            displayName: "元素材.png",
            caption: "",
            durationMs: 8_000,
          },
        },
      ]
    : [];
  return {
    ...emptyBinding(),
    album: ambiguousAlbumCreation
      ? null
      : {
          albumId: "album-secret",
          createdAt: "2026-08-30T01:00:00.000Z",
          lastKnownTitle: TITLE,
        },
    pending: {
      operationId: "operation-secret",
      startedAt: "2026-08-31T01:00:00.000Z",
      phase,
      sourceFingerprint: FINGERPRINT,
      targetTitle: TITLE,
      previousManagedMediaItemIds: [],
      targetItems,
    },
  };
}

function ready(binding: GooglePhotosSyncBinding) {
  return {
    status: "ready" as const,
    fileId: "binding-file-secret",
    binding,
  };
}

function harness(
  bindingResult: Awaited<ReturnType<GooglePhotosSyncUiReviewAdapters["readBinding"]>>,
  source = preparedSource(),
) {
  const prepareSource = vi.fn(async () => ({
    ok: true as const,
    source,
  }));
  const readBinding = vi.fn(async () => bindingResult);
  return {
    prepareSource,
    readBinding,
    adapters: { prepareSource, readBinding },
  };
}

function safeReview(mode: "initial" | "update" | "continue") {
  const initialDiff = {
    baselineStatus: "available" as const,
    albumTitleChange: null,
    items: [
      { kind: "added" as const, displayName: "元素材.jpg", changes: [] },
      { kind: "added" as const, displayName: "元素材.png", changes: [] },
    ],
    currentDisplayNames: ["元素材.jpg", "元素材.png"],
    summary: {
      added: 2,
      removed: 0,
      changed: 0,
      moved: 0,
      unchanged: 0,
    },
    hasGooglePhotosChanges: true,
    metadataOnlyChangeCount: 0,
  };
  const unavailableDiff = {
    baselineStatus: "unavailable" as const,
    albumTitleChange: null,
    items: [],
    currentDisplayNames: ["元素材.jpg", "元素材.png"],
    summary: null,
    hasGooglePhotosChanges: null,
    metadataOnlyChangeCount: 0,
  };
  return {
    mode,
    projectTitle: TITLE,
    targetAlbumTitle: TITLE,
    sourceSlideCount: 3,
    syncPhotoCount: 2,
    skippedVideoCount: 1,
    totalBytes: 3072,
    diff: mode === "update" ? unavailableDiff : initialDiff,
  };
}
