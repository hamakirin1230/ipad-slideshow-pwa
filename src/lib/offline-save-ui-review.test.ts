import { describe, expect, it, vi } from "vitest";
import type { OfflineConfirmedTransferSnapshot } from "./offline-confirmed-transfer-snapshot";
import type { OfflineSaveReviewSource } from "./drive-offline-save-review-source";
import {
  buildOfflineSaveUiReview,
  prepareOfflineSaveUiReview,
} from "./offline-save-ui-review";

const PROJECT_ID = "project-secret";
const SYNCED_AT = "2026-08-31T00:00:00.000Z";

function sourceSlide(
  override: Partial<OfflineSaveReviewSource["slides"][number]> = {},
): OfflineSaveReviewSource["slides"][number] {
  return {
    slideId: "slide-secret-a",
    assetId: "asset-secret-a",
    sourceDriveFileId: "drive-secret-a",
    displayName: "photo-a.jpg",
    mediaKind: "image",
    caption: "before",
    durationMs: 10_000,
    transfer: {
      projectId: PROJECT_ID,
      assetId: "asset-secret-a",
      sourceDriveFileId: "drive-secret-a",
      sourceMimeType: "image/jpeg",
      sourceSizeBytes: 4,
      sourceUpdatedAt: "2026-08-30T00:00:00.000Z",
      checksum: "checksum-secret-a",
      blobVariant: "original",
      requiresBlob: true,
    },
    ...override,
  };
}

function source(
  slides: OfflineSaveReviewSource["slides"] = [sourceSlide()],
  override: Partial<OfflineSaveReviewSource> = {},
): OfflineSaveReviewSource {
  return {
    projectId: PROJECT_ID,
    projectTitle: "Album",
    slides,
    ...override,
  };
}

function emptyConfirmed(): OfflineConfirmedTransferSnapshot {
  return {
    projectId: PROJECT_ID,
    confirmedReady: false,
    project: null,
    syncState: null,
    assets: [],
    assetBlobs: [],
  };
}

function confirmed(
  slides: OfflineSaveReviewSource["slides"] = [sourceSlide()],
): OfflineConfirmedTransferSnapshot {
  const localSlides = slides.filter((slide) => slide.transfer.requiresBlob);
  return {
    projectId: PROJECT_ID,
    confirmedReady: true,
    project: {
      schemaVersion: 1,
      projectId: PROJECT_ID,
      projectTitle: "Album",
      sourceManifestFileId: "manifest-secret",
      syncedAt: SYNCED_AT,
      slides: slides.map((slide, order) => ({
        slideId: slide.slideId,
        assetId: slide.assetId,
        type: slide.mediaKind,
        caption: slide.caption,
        durationSeconds: slide.durationMs / 1000,
        ...(slide.imageEdit ? { imageEdit: slide.imageEdit } : {}),
        order,
      })),
    },
    syncState: {
      schemaVersion: 1,
      projectId: PROJECT_ID,
      status: "ready",
      rootFolderId: "root-secret",
      workspaceFileId: "workspace-secret",
      indexFileId: "index-secret",
      manifestFileId: "manifest-secret",
      slideCount: slides.length,
      assetCount: slides.length,
      syncedAt: SYNCED_AT,
    },
    assets: slides.map((slide) => ({
      schemaVersion: 1,
      assetId: slide.assetId,
      projectId: PROJECT_ID,
      sourceDriveFileId: slide.sourceDriveFileId,
      sourceName: slide.displayName,
      sourceMimeType: slide.transfer.sourceMimeType,
      sourceSizeBytes: slide.transfer.sourceSizeBytes,
      sourceUpdatedAt: slide.transfer.sourceUpdatedAt,
      checksum: slide.transfer.checksum,
      type: slide.mediaKind,
      blobMimeType: slide.transfer.sourceMimeType,
      blobSizeBytes: slide.transfer.requiresBlob
        ? (slide.transfer.sourceSizeBytes ?? 0)
        : 0,
      blobVariant: "original",
      blobStatus: slide.transfer.requiresBlob ? "ready" : "missing",
      syncedAt: SYNCED_AT,
    })),
    assetBlobs: localSlides.map((slide) => ({
      schemaVersion: 1,
      assetId: slide.assetId,
      projectId: PROJECT_ID,
      blob: new Blob([new Uint8Array(slide.transfer.sourceSizeBytes)], {
        type: slide.transfer.sourceMimeType,
      }),
      blobMimeType: slide.transfer.sourceMimeType,
      blobSizeBytes: slide.transfer.sourceSizeBytes!,
      blobVariant: "original",
      syncedAt: SYNCED_AT,
    })),
  };
}

function review(
  next: OfflineSaveReviewSource,
  before: OfflineConfirmedTransferSnapshot = confirmed(),
) {
  const result = buildOfflineSaveUiReview({ confirmed: before, source: next });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("review failed");
  return result.review;
}

describe("offline save UI review", () => {
  it("shows every first-save item as added and separates download from remoteOnly", () => {
    const largeVideo = sourceSlide({
      slideId: "slide-secret-video",
      assetId: "asset-secret-video",
      sourceDriveFileId: "drive-secret-video",
      displayName: "large.mov",
      mediaKind: "video",
      transfer: {
        ...sourceSlide().transfer,
        assetId: "asset-secret-video",
        sourceDriveFileId: "drive-secret-video",
        sourceMimeType: "video/quicktime",
        sourceSizeBytes: 60 * 1024 * 1024,
        checksum: "checksum-secret-video",
        requiresBlob: false,
      },
    });

    const value = review(source([sourceSlide(), largeVideo]), emptyConfirmed());

    expect(value.baselineStatus).toBe("empty");
    expect(value.summary).toMatchObject({ added: 2, removed: 0 });
    expect(value.transferSummary).toEqual({
      reuse: 0,
      download: 1,
      offlineExcluded: 1,
      deletePlanned: 0,
    });
    expect(value.items.map((item) => item.transferImpact)).toEqual([
      "download",
      "offlineExcluded",
    ]);
  });

  it("reports exact noChanges with reuse and no visible unchanged item", () => {
    const value = review(source());
    expect(value.noChanges).toBe(true);
    expect(value.items).toEqual([]);
    expect(value.transferSummary).toMatchObject({ reuse: 1, download: 0 });
  });

  it.each([
    ["caption", { caption: "after" }, "caption"],
    ["duration", { durationMs: 12_000 }, "duration"],
    ["imageEdit", { imageEdit: { rotation: 90 as const } }, "imageEdit"],
  ] as const)(
    "shows %s before/after without redownloading",
    (_label, override, field) => {
      const value = review(source([sourceSlide(override)]));
      expect(value.transferSummary).toMatchObject({ reuse: 1, download: 0 });
      expect(value.items).toHaveLength(1);
      expect(value.items[0]).toMatchObject({
        kind: "changed",
        transferImpact: "reuse",
        changes: [expect.objectContaining({ field })],
      });
    },
  );

  it("merges a position change into the same slide item without download", () => {
    const first = sourceSlide();
    const second = sourceSlide({
      slideId: "slide-secret-b",
      assetId: "asset-secret-b",
      sourceDriveFileId: "drive-secret-b",
      displayName: "photo-b.jpg",
      transfer: {
        ...sourceSlide().transfer,
        assetId: "asset-secret-b",
        sourceDriveFileId: "drive-secret-b",
        checksum: "checksum-secret-b",
      },
    });
    const before = confirmed([first, second]);
    const moved = { ...first, caption: "after" };
    const value = review(source([second, moved]), before);

    expect(value.transferSummary).toMatchObject({ reuse: 2, download: 0 });
    expect(value.items.find((item) => item.displayName === "photo-a.jpg")).toMatchObject({
      kind: "changed",
      changes: [
        expect.objectContaining({ field: "caption" }),
        expect.objectContaining({ field: "position" }),
      ],
    });
  });

  it("shows project title and transition changes without download", () => {
    const before = confirmed();
    before.project!.transition = "fade";
    const value = review(
      source(undefined, { projectTitle: "Renamed", transition: "wipe" }),
      before,
    );
    expect(value.projectTitleChange).toEqual({
      before: "Album",
      after: "Renamed",
    });
    expect(value.settingsChanges).toEqual([
      expect.objectContaining({ label: "切り替え効果", before: "フェード", after: "ワイプ" }),
    ]);
    expect(value.transferSummary.download).toBe(0);
  });

  it("shows added, removed, and replacement transfer effects", () => {
    const beforeSlide = sourceSlide();
    const replacement = sourceSlide({
      assetId: "asset-secret-new",
      sourceDriveFileId: "drive-secret-new",
      displayName: "replacement.jpg",
      transfer: {
        ...sourceSlide().transfer,
        assetId: "asset-secret-new",
        sourceDriveFileId: "drive-secret-new",
        checksum: "checksum-secret-new",
      },
    });
    const added = sourceSlide({
      slideId: "slide-secret-added",
      assetId: "asset-secret-added",
      sourceDriveFileId: "drive-secret-added",
      displayName: "added.jpg",
      transfer: {
        ...sourceSlide().transfer,
        assetId: "asset-secret-added",
        sourceDriveFileId: "drive-secret-added",
        checksum: "checksum-secret-added",
      },
    });
    const removed = sourceSlide({
      slideId: "slide-secret-removed",
      assetId: "asset-secret-removed",
      sourceDriveFileId: "drive-secret-removed",
      displayName: "removed.jpg",
      transfer: {
        ...sourceSlide().transfer,
        assetId: "asset-secret-removed",
        sourceDriveFileId: "drive-secret-removed",
        checksum: "checksum-secret-removed",
      },
    });
    const value = review(
      source([replacement, added]),
      confirmed([beforeSlide, removed]),
    );

    expect(value.summary).toMatchObject({ added: 1, removed: 1, changed: 1 });
    expect(value.transferSummary).toEqual({
      reuse: 0,
      download: 2,
      offlineExcluded: 0,
      deletePlanned: 2,
    });
    expect(value.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: "replacement.jpg", transferImpact: "download" }),
        expect.objectContaining({ displayName: "added.jpg", transferImpact: "download" }),
        expect.objectContaining({ displayName: "removed.jpg", transferImpact: "deletePlanned" }),
      ]),
    );
  });

  it("shows a removed asset with zero downloads and deferred deletion", () => {
    const value = review(source([]), confirmed());
    expect(value.summary).toMatchObject({ removed: 1 });
    expect(value.transferSummary).toEqual({
      reuse: 0,
      download: 0,
      offlineExcluded: 0,
      deletePlanned: 1,
    });
    expect(value.items).toEqual([
      expect.objectContaining({
        kind: "removed",
        displayName: "photo-a.jpg",
        transferImpact: "deletePlanned",
      }),
    ]);
  });

  it("summarizes mixed reuse, download, remoteOnly, and obsolete assets", () => {
    const unchanged = sourceSlide();
    const changedBefore = sourceSlide({
      slideId: "slide-secret-b",
      assetId: "asset-secret-b",
      sourceDriveFileId: "drive-secret-b",
      displayName: "photo-b.jpg",
      transfer: {
        ...sourceSlide().transfer,
        assetId: "asset-secret-b",
        sourceDriveFileId: "drive-secret-b",
        checksum: "checksum-secret-b-old",
      },
    });
    const removed = sourceSlide({
      slideId: "slide-secret-removed",
      assetId: "asset-secret-removed",
      sourceDriveFileId: "drive-secret-removed",
      displayName: "removed.jpg",
      transfer: {
        ...sourceSlide().transfer,
        assetId: "asset-secret-removed",
        sourceDriveFileId: "drive-secret-removed",
        checksum: "checksum-secret-removed",
      },
    });
    const changedAfter = {
      ...changedBefore,
      transfer: {
        ...changedBefore.transfer,
        checksum: "checksum-secret-b-new",
      },
    };
    const remote = sourceSlide({
      slideId: "slide-secret-video",
      assetId: "asset-secret-video",
      sourceDriveFileId: "drive-secret-video",
      displayName: "large.mp4",
      mediaKind: "video",
      transfer: {
        ...sourceSlide().transfer,
        assetId: "asset-secret-video",
        sourceDriveFileId: "drive-secret-video",
        sourceMimeType: "video/mp4",
        sourceSizeBytes: 60 * 1024 * 1024,
        checksum: "checksum-secret-video",
        requiresBlob: false,
      },
    });

    const value = review(
      source([unchanged, changedAfter, remote]),
      confirmed([unchanged, changedBefore, removed]),
    );

    expect(value.transferSummary).toEqual({
      reuse: 1,
      download: 1,
      offlineExcluded: 1,
      deletePlanned: 1,
    });
  });

  it("requires download for a checksum mismatch without exposing checksum values", () => {
    const changed = sourceSlide({
      transfer: { ...sourceSlide().transfer, checksum: "checksum-secret-next" },
    });
    const value = review(source([changed]));
    expect(value.transferSummary).toMatchObject({ reuse: 0, download: 1 });
    expect(value.noChanges).toBe(false);
    expect(JSON.stringify(value)).not.toContain("checksum-secret");
  });

  it("does not infer a diff from a non-ready confirmed baseline", () => {
    const before = confirmed();
    before.confirmedReady = false;
    before.syncState!.status = "failed";
    const value = review(source(), before);
    expect(value.baselineStatus).toBe("unavailable");
    expect(value.summary).toBeNull();
    expect(value.items).toEqual([]);
    expect(value.currentDisplayNames).toEqual(["photo-a.jpg"]);
    expect(value.transferSummary).toEqual({
      reuse: 0,
      download: 1,
      offlineExcluded: 0,
      deletePlanned: 0,
    });
  });

  it("keeps the public review free of internal IDs, revisions, tokens, URLs, and checksums", () => {
    const serialized = JSON.stringify(review(source(), confirmed()));
    expect(serialized).not.toMatch(
      /project-secret|slide-secret|asset-secret|drive-secret|manifest-secret|root-secret|workspace-secret|index-secret|checksum-secret|token-secret|https?:\/\//,
    );
  });

  it("prepares review through read-only source adapters only", async () => {
    const readConfirmed = vi.fn(async () => emptyConfirmed());
    const readSource = vi.fn(async () => source());
    const result = await prepareOfflineSaveUiReview(
      {
        accessToken: "token-secret",
        readyContext: {} as never,
        project: { projectId: PROJECT_ID } as never,
        signal: new AbortController().signal,
      },
      { readConfirmed, readSource },
    );
    expect(result.ok).toBe(true);
    expect(readConfirmed).toHaveBeenCalledOnce();
    expect(readSource).toHaveBeenCalledOnce();
  });
});
