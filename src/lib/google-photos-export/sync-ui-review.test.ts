import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DriveProjectSummary } from "../google-drive";
import {
  buildEmptyGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
  type GooglePhotosSyncPendingPhase,
} from "./sync-binding";
import type { GooglePhotosSyncPreparedSource } from "./sync-drive-source";
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
    const { adapters } = harness(ready(boundBinding()));
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
      FINGERPRINT,
      RENDER_KEY,
      "operation-secret",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(result).toEqual({ ok: true, review: safeReview("update") });
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
) {
  const prepareSource = vi.fn(async () => ({
    ok: true as const,
    source: preparedSource(),
  }));
  const readBinding = vi.fn(async () => bindingResult);
  return {
    prepareSource,
    readBinding,
    adapters: { prepareSource, readBinding },
  };
}

function safeReview(mode: "initial" | "update" | "continue") {
  return {
    mode,
    projectTitle: TITLE,
    targetAlbumTitle: TITLE,
    sourceSlideCount: 3,
    syncPhotoCount: 2,
    skippedVideoCount: 1,
    totalBytes: 3072,
  };
}
