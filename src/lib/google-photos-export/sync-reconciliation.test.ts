import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DriveProjectSummary } from "../google-drive";
import {
  beginGooglePhotosSyncPending,
  transitionGooglePhotosSyncToMediaCreating,
} from "./sync-pending";
import {
  GOOGLE_PHOTOS_SYNC_MEDIA_PAGE_LIMIT,
  prepareGooglePhotosSyncReconciliation,
  type GooglePhotosSyncReconciliationAdapters,
} from "./sync-reconciliation";
import {
  buildEmptyGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
} from "./sync-binding";
import type { GooglePhotosSyncPreparedSource } from "./sync-drive-source";
import { planGooglePhotosIncrementalSync } from "./sync-plan";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const DRIVE_TOKEN = "private-drive-token";
const PHOTOS_TOKEN = "private-photos-token";
const FINGERPRINT = `sha256:${"a".repeat(64)}`;
const OTHER_FINGERPRINT = `sha256:${"b".repeat(64)}`;
const KEY_A = `sha256:${"c".repeat(64)}`;
const KEY_B = `sha256:${"d".repeat(64)}`;
const KEY_C = `sha256:${"e".repeat(64)}`;
const TITLE = "夏の作品";

const PROJECT: DriveProjectSummary = {
  projectId: PROJECT_ID,
  title: TITLE,
  projectFolderId: "project-root",
  manifestFileId: "manifest-file",
  assetsFolderId: "assets-folder",
  manifestPath: "projects/project/manifest.json",
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-31T00:00:00.000Z",
};

function input(signal = new AbortController().signal) {
  return {
    driveAccessToken: DRIVE_TOKEN,
    photosAccessToken: PHOTOS_TOKEN,
    selectedProjectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    projectsRootFolderId: "projects-root",
    project: PROJECT,
    signal,
  };
}

function source(
  desiredSlides = [
    { slideId: "slide-1", renderKey: KEY_A, reuseEligible: true },
    { slideId: "slide-2", renderKey: KEY_B, reuseEligible: true },
  ],
  targetAlbumTitle = TITLE,
): GooglePhotosSyncPreparedSource {
  return {
    projectId: PROJECT_ID,
    projectTitle: targetAlbumTitle,
    targetAlbumTitle,
    sourceSlideCount: desiredSlides.length,
    skippedVideoCount: 0,
    totalBytes: 2000,
    rendererVersion: 1,
    items: [],
    desiredSlides,
    sourceFingerprint: FINGERPRINT,
  };
}

function binding(input: {
  stable?: GooglePhotosSyncBinding["stable"];
  album?: GooglePhotosSyncBinding["album"];
} = {}): GooglePhotosSyncBinding {
  return {
    ...buildEmptyGooglePhotosSyncBinding({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    }),
    album:
      input.album === undefined
        ? {
            albumId: "album-bound",
            createdAt: "2026-08-30T01:00:00.000Z",
            lastKnownTitle: TITLE,
          }
        : input.album,
    stable:
      input.stable === undefined
        ? {
            generation: 2,
            completedAt: "2026-08-30T01:30:00.000Z",
            rendererVersion: 1,
            items: [
              { slideId: "slide-1", renderKey: KEY_A, mediaItemId: "media-1" },
              { slideId: "slide-2", renderKey: KEY_B, mediaItemId: "media-2" },
            ],
          }
        : input.stable,
  };
}

function adapters(overrides: {
  preparedSource?: GooglePhotosSyncPreparedSource;
  bindingResult?: Awaited<ReturnType<GooglePhotosSyncReconciliationAdapters["readBinding"]>>;
  albumResult?: Awaited<ReturnType<GooglePhotosSyncReconciliationAdapters["getAlbum"]>>;
  pages?: Array<
    Awaited<
      ReturnType<GooglePhotosSyncReconciliationAdapters["searchAlbumMediaItemsPage"]>
    >
  >;
} = {}) {
  const pages = [
    ...(overrides.pages ?? [
      {
        status: "ready" as const,
        mediaItemIds: ["media-1", "media-2"],
        nextPageToken: null,
      },
    ]),
  ];
  const preparedSource = overrides.preparedSource ?? source();
  const result: GooglePhotosSyncReconciliationAdapters & {
    prepareSource: ReturnType<typeof vi.fn>;
    readBinding: ReturnType<typeof vi.fn>;
    getAlbum: ReturnType<typeof vi.fn>;
    searchAlbumMediaItemsPage: ReturnType<typeof vi.fn>;
    planSync: ReturnType<typeof vi.fn>;
  } = {
    prepareSource: vi.fn(async () => ({ ok: true, source: preparedSource })),
    readBinding: vi.fn(async () =>
      overrides.bindingResult ?? {
        status: "ready",
        fileId: "binding-file",
        binding: binding(),
      },
    ),
    getAlbum: vi.fn(async () =>
      overrides.albumResult ?? {
        status: "ready",
        album: {
          id: "album-bound",
          title: TITLE,
          isWriteable: true,
          mediaItemsCount: "2",
        },
      },
    ),
    searchAlbumMediaItemsPage: vi.fn(async () =>
      pages.shift() ?? { status: "invalidResponse" },
    ),
    planSync: vi.fn(async (planInput) => {
      const planned = await planGooglePhotosIncrementalSync(planInput);
      return planned.ok
        ? {
            ok: true as const,
            plan: { ...planned.plan, sourceFingerprint: preparedSource.sourceFingerprint },
          }
        : planned;
    }),
  };
  return result;
}

describe("Google Photos reconciliation source and binding classification", () => {
  it("preserves a sanitized source preparation failure and stops", async () => {
    const deps = adapters();
    deps.prepareSource.mockResolvedValueOnce({
      ok: false,
      error: { kind: "drivePreflightFailed", message: "保存内容を確認できませんでした。" },
      reason: "sourceMetadataUnavailable",
      diagnostics: { kind: "driveReadFailed" },
    });

    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toEqual({
      status: "sourcePreparationFailed",
      error: { kind: "drivePreflightFailed", message: "保存内容を確認できませんでした。" },
      reason: "sourceMetadataUnavailable",
      diagnostics: { kind: "driveReadFailed" },
    });
    expect(deps.readBinding).not.toHaveBeenCalled();
  });

  it("returns initialSyncRequired for an unbound project without Photos reads", async () => {
    const deps = adapters({ bindingResult: { status: "unbound" } });
    const result = await prepareGooglePhotosSyncReconciliation(input(), deps);

    expect(result).toMatchObject({
      status: "initialSyncRequired",
      bindingFileId: null,
      binding: null,
    });
    expect(deps.getAlbum).not.toHaveBeenCalled();
    expect(deps.searchAlbumMediaItemsPage).not.toHaveBeenCalled();
    expect(deps.planSync).not.toHaveBeenCalled();
  });

  it("returns initialSyncRequired for a valid empty binding", async () => {
    const empty = binding({ album: null, stable: null });
    const deps = adapters({
      bindingResult: { status: "ready", fileId: "binding-file", binding: empty },
    });
    const result = await prepareGooglePhotosSyncReconciliation(input(), deps);

    expect(result).toMatchObject({
      status: "initialSyncRequired",
      bindingFileId: "binding-file",
      binding: empty,
    });
    expect(deps.getAlbum).not.toHaveBeenCalled();
  });

  it.each([
    ["duplicate", "bindingDuplicate"],
    ["invalid", "bindingInvalid"],
    ["inaccessible", "bindingInaccessible"],
  ] as const)("classifies %s binding reads as %s", async (bindingStatus, status) => {
    const bindingResult =
      bindingStatus === "invalid"
        ? ({ status: bindingStatus, reason: "metadata" } as const)
        : ({ status: bindingStatus } as const);
    const deps = adapters({ bindingResult });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({ status });
    expect(deps.getAlbum).not.toHaveBeenCalled();
  });

  it("fails closed for album-null stable state even if an adapter claims ready", async () => {
    const invalid = binding();
    invalid.album = null;
    const deps = adapters({
      bindingResult: { status: "ready", fileId: "binding-file", binding: invalid },
    });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({ status: "bindingInvalid" });
  });

  it("does not expose either access token in any result", async () => {
    const result = await prepareGooglePhotosSyncReconciliation(input(), adapters());
    expect(JSON.stringify(result)).not.toContain(DRIVE_TOKEN);
    expect(JSON.stringify(result)).not.toContain(PHOTOS_TOKEN);
  });

  it("sanitizes thrown adapter errors without retaining raw details", async () => {
    const deps = adapters();
    deps.prepareSource.mockRejectedValueOnce(
      new Error("raw token URL and internal identifier"),
    );
    const result = await prepareGooglePhotosSyncReconciliation(input(), deps);
    expect(result).toEqual({ status: "sourcePreparationFailed" });
    expect(JSON.stringify(result)).not.toMatch(/raw token|URL|identifier/);
  });
});

describe("Google Photos reconciliation pending continuation", () => {
  function pendingBinding(fingerprint = FINGERPRINT, title = TITLE) {
    const result = beginGooglePhotosSyncPending({
      binding: binding(),
      operationId: "pending-operation",
      startedAt: "2026-08-31T02:00:00.000Z",
      sourceFingerprint: fingerprint,
      targetTitle: title,
    });
    if (!result.ok) throw new Error("pending fixture failed");
    return result.binding;
  }

  it("requires continuation when the fresh source still matches", async () => {
    const pending = pendingBinding();
    const before = structuredClone(pending);
    const deps = adapters({
      bindingResult: { status: "ready", fileId: "binding-file", binding: pending },
    });
    const result = await prepareGooglePhotosSyncReconciliation(input(), deps);

    expect(result).toMatchObject({ status: "continuationRequired", binding: pending });
    expect(pending).toEqual(before);
    expect(deps.getAlbum).not.toHaveBeenCalled();
    expect(deps.planSync).not.toHaveBeenCalled();
  });

  it("classifies changed source fingerprint without clearing pending", async () => {
    const pending = pendingBinding(OTHER_FINGERPRINT);
    const deps = adapters({
      bindingResult: { status: "ready", fileId: "binding-file", binding: pending },
    });
    const result = await prepareGooglePhotosSyncReconciliation(input(), deps);
    expect(result).toMatchObject({ status: "continuationSourceChanged" });
    if (result.status === "continuationSourceChanged") {
      expect(result.binding.pending).not.toBeNull();
    }
  });

  it("classifies a changed target title as source changed", async () => {
    const pending = pendingBinding(FINGERPRINT, "以前のタイトル");
    const deps = adapters({
      bindingResult: { status: "ready", fileId: "binding-file", binding: pending },
    });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({ status: "continuationSourceChanged" });
  });

  it("classifies mediaCreating as continuation-only without Photos reads", async () => {
    const started = pendingBinding();
    const transitioned = transitionGooglePhotosSyncToMediaCreating({
      binding: started,
      expectedOperationId: "pending-operation",
      expectedSourceFingerprint: FINGERPRINT,
    });
    expect(transitioned.ok).toBe(true);
    if (!transitioned.ok) return;
    const deps = adapters({
      bindingResult: {
        status: "ready",
        fileId: "binding-file",
        binding: transitioned.binding,
      },
    });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({
      status: "continuationRequired",
      binding: { pending: { phase: "mediaCreating" } },
    });
    expect(deps.getAlbum).not.toHaveBeenCalled();
    expect(deps.searchAlbumMediaItemsPage).not.toHaveBeenCalled();
    expect(deps.planSync).not.toHaveBeenCalled();
  });

  it.each([
    [OTHER_FINGERPRINT, TITLE],
    [FINGERPRINT, "変更前タイトル"],
  ])("keeps mediaCreating pending when fresh source changed", async (fingerprint, title) => {
    const started = pendingBinding(fingerprint, title);
    const transitioned = transitionGooglePhotosSyncToMediaCreating({
      binding: started,
      expectedOperationId: "pending-operation",
      expectedSourceFingerprint: fingerprint,
    });
    expect(transitioned.ok).toBe(true);
    if (!transitioned.ok) return;
    const deps = adapters({
      bindingResult: {
        status: "ready",
        fileId: "binding-file",
        binding: transitioned.binding,
      },
    });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({
      status: "continuationSourceChanged",
      binding: { pending: { phase: "mediaCreating" } },
    });
    expect(deps.getAlbum).not.toHaveBeenCalled();
    expect(deps.planSync).not.toHaveBeenCalled();
  });
});

describe("Google Photos reconciliation album verification", () => {
  it("reads the bound album and uses its actual title for planning", async () => {
    const deps = adapters({
      albumResult: {
        status: "ready",
        album: {
          id: "album-bound",
          title: "Photos側の変更タイトル",
          isWriteable: true,
          mediaItemsCount: "2",
        },
      },
    });
    const request = input();
    const result = await prepareGooglePhotosSyncReconciliation(request, deps);

    expect(deps.getAlbum).toHaveBeenCalledWith({
      accessToken: PHOTOS_TOKEN,
      albumId: "album-bound",
      signal: request.signal,
    });
    expect(deps.planSync).toHaveBeenCalledWith(
      expect.objectContaining({ currentGoogleAlbumTitle: "Photos側の変更タイトル" }),
    );
    expect(result).toMatchObject({ status: "ready", plan: { titleNeedsUpdate: true } });
  });

  it.each([
    [{ status: "notFound" } as const, "targetMissing"],
    [{ status: "inaccessible" } as const, "photosReadFailed"],
    [{ status: "invalidResponse" } as const, "photosInvalidResponse"],
  ])("classifies album read failure as %s", async (albumResult, status) => {
    const deps = adapters({ albumResult });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({ status });
    expect(deps.searchAlbumMediaItemsPage).not.toHaveBeenCalled();
  });

  it("rejects an album response whose ID differs from the binding", async () => {
    const deps = adapters({
      albumResult: {
        status: "ready",
        album: { id: "other-album", title: TITLE, isWriteable: true, mediaItemsCount: "2" },
      },
    });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({ status: "photosInvalidResponse" });
  });

  it.each([false, null])("requires affirmative writability when isWriteable is %s", async (isWriteable) => {
    const deps = adapters({
      albumResult: {
        status: "ready",
        album: { id: "album-bound", title: TITLE, isWriteable, mediaItemsCount: "2" },
      },
    });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({ status: "targetNotWritable" });
    expect(deps.searchAlbumMediaItemsPage).not.toHaveBeenCalled();
  });
});

describe("Google Photos reconciliation membership pagination", () => {
  it("reads one page with pageSize 100 and preserves exact membership", async () => {
    const deps = adapters();
    const request = input();
    const result = await prepareGooglePhotosSyncReconciliation(request, deps);

    expect(deps.searchAlbumMediaItemsPage).toHaveBeenCalledWith({
      accessToken: PHOTOS_TOKEN,
      albumId: "album-bound",
      pageSize: 100,
      signal: request.signal,
    });
    expect(result).toMatchObject({
      status: "noChanges",
      currentAlbumMediaItemIds: ["media-1", "media-2"],
    });
  });

  it("reads multiple pages in order without exposing page tokens", async () => {
    const deps = adapters({
      pages: [
        { status: "ready", mediaItemIds: ["media-1"], nextPageToken: "page-2" },
        { status: "ready", mediaItemIds: ["media-2"], nextPageToken: null },
      ],
    });
    const result = await prepareGooglePhotosSyncReconciliation(input(), deps);

    expect(deps.searchAlbumMediaItemsPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageToken: "page-2", pageSize: 100 }),
    );
    expect(result).toMatchObject({
      status: "noChanges",
      currentAlbumMediaItemIds: ["media-1", "media-2"],
    });
    expect(JSON.stringify(result)).not.toContain("page-2");
  });

  it("rejects duplicate media IDs across pages", async () => {
    const deps = adapters({
      pages: [
        { status: "ready", mediaItemIds: ["media-1"], nextPageToken: "next" },
        { status: "ready", mediaItemIds: ["media-1"], nextPageToken: null },
      ],
    });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({ status: "paginationInvalid" });
    expect(deps.planSync).not.toHaveBeenCalled();
  });

  it("rejects repeated page tokens before looping", async () => {
    const deps = adapters({
      pages: [
        { status: "ready", mediaItemIds: [], nextPageToken: "same" },
        { status: "ready", mediaItemIds: [], nextPageToken: "same" },
      ],
    });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({ status: "paginationInvalid" });
    expect(deps.searchAlbumMediaItemsPage).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the hard page cap still has a continuation", async () => {
    const pages = Array.from(
      { length: GOOGLE_PHOTOS_SYNC_MEDIA_PAGE_LIMIT },
      (_, index) => ({
        status: "ready" as const,
        mediaItemIds: [],
        nextPageToken: `page-${index + 1}`,
      }),
    );
    const deps = adapters({ pages });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({ status: "paginationLimitExceeded" });
    expect(deps.searchAlbumMediaItemsPage).toHaveBeenCalledTimes(
      GOOGLE_PHOTOS_SYNC_MEDIA_PAGE_LIMIT,
    );
  });

  it.each(["invalidInput", "invalidResponse"] as const)(
    "classifies %s pages as paginationInvalid",
    async (status) => {
      const deps = adapters({ pages: [{ status }] });
      await expect(
        prepareGooglePhotosSyncReconciliation(input(), deps),
      ).resolves.toMatchObject({ status: "paginationInvalid" });
    },
  );

  it("propagates AbortError and does not retry", async () => {
    const deps = adapters();
    deps.searchAlbumMediaItemsPage.mockRejectedValueOnce(
      new DOMException("raw abort", "AbortError"),
    );
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(deps.searchAlbumMediaItemsPage).toHaveBeenCalledTimes(1);
  });

  it("preserves caller cancellation even when an adapter returns a safe failure", async () => {
    const controller = new AbortController();
    const deps = adapters();
    deps.searchAlbumMediaItemsPage.mockImplementationOnce(async () => {
      controller.abort(new DOMException("caller cancelled", "AbortError"));
      return { status: "inaccessible" };
    });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(controller.signal), deps),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(deps.searchAlbumMediaItemsPage).toHaveBeenCalledTimes(1);
  });
});

describe("Google Photos reconciliation planner integration", () => {
  it("classifies a full match as noChanges without altering generation", async () => {
    const current = binding();
    const deps = adapters({
      bindingResult: { status: "ready", fileId: "binding-file", binding: current },
    });
    const result = await prepareGooglePhotosSyncReconciliation(input(), deps);
    expect(result).toMatchObject({ status: "noChanges" });
    expect(current.stable?.generation).toBe(2);
    expect(current.pending).toBeNull();
  });

  it("produces a rename-only ready plan from the actual Photos title", async () => {
    const deps = adapters({
      albumResult: {
        status: "ready",
        album: { id: "album-bound", title: "旧名", isWriteable: true, mediaItemsCount: "2" },
      },
    });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({
      status: "ready",
      plan: {
        createItems: [],
        membershipNeedsRebuild: false,
        titleNeedsUpdate: true,
      },
    });
  });

  it("plans append/create without uploading", async () => {
    const preparedSource = source([
      { slideId: "slide-1", renderKey: KEY_A, reuseEligible: true },
      { slideId: "slide-2", renderKey: KEY_B, reuseEligible: true },
      { slideId: "slide-3", renderKey: KEY_C, reuseEligible: true },
    ]);
    const result = await prepareGooglePhotosSyncReconciliation(
      input(),
      adapters({ preparedSource }),
    );
    expect(result).toMatchObject({
      status: "ready",
      plan: {
        createItems: [{ kind: "create", slideId: "slide-3", renderKey: KEY_C }],
        membershipNeedsRebuild: true,
      },
    });
  });

  it("plans delete and reorder using the existing planner", async () => {
    const deleted = await prepareGooglePhotosSyncReconciliation(
      input(),
      adapters({
        preparedSource: source([
          { slideId: "slide-1", renderKey: KEY_A, reuseEligible: true },
        ]),
      }),
    );
    expect(deleted).toMatchObject({
      status: "ready",
      plan: { createItems: [], membershipNeedsRebuild: true },
    });

    const reordered = await prepareGooglePhotosSyncReconciliation(
      input(),
      adapters({
        preparedSource: source([
          { slideId: "slide-2", renderKey: KEY_B, reuseEligible: true },
          { slideId: "slide-1", renderKey: KEY_A, reuseEligible: true },
        ]),
      }),
    );
    expect(reordered).toMatchObject({
      status: "ready",
      plan: { createItems: [], membershipNeedsRebuild: true },
    });
  });

  it("recreates an externally missing managed item", async () => {
    const deps = adapters({
      pages: [{ status: "ready", mediaItemIds: ["media-1"], nextPageToken: null }],
    });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({
      status: "ready",
      plan: {
        createItems: [{ kind: "create", slideId: "slide-2", renderKey: KEY_B }],
      },
    });
  });

  it("preserves unmanaged membership in the snapshot and does not remove it", async () => {
    const deps = adapters({
      pages: [
        {
          status: "ready",
          mediaItemIds: ["media-1", "user-added", "media-2"],
          nextPageToken: null,
        },
      ],
    });
    const result = await prepareGooglePhotosSyncReconciliation(input(), deps);
    expect(result).toMatchObject({
      status: "noChanges",
      currentAlbumMediaItemIds: ["media-1", "user-added", "media-2"],
      plan: { removeManagedMediaItemIds: [] },
    });
  });

  it("allows an album-bound stable-null snapshot and plans every slide as create", async () => {
    const current = binding({ stable: null });
    const deps = adapters({
      bindingResult: { status: "ready", fileId: "binding-file", binding: current },
      pages: [{ status: "ready", mediaItemIds: [], nextPageToken: null }],
    });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), deps),
    ).resolves.toMatchObject({
      status: "ready",
      plan: {
        createItems: [
          { kind: "create", slideId: "slide-1", renderKey: KEY_A },
          { kind: "create", slideId: "slide-2", renderKey: KEY_B },
        ],
      },
    });
  });

  it("fails closed when the existing planner rejects or returns a stale fingerprint", async () => {
    const rejected = adapters();
    rejected.planSync.mockResolvedValueOnce({ ok: false, reason: "invalidDesiredItems" });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), rejected),
    ).resolves.toMatchObject({ status: "planningFailed" });

    const stale = adapters();
    stale.planSync.mockResolvedValueOnce({
      ok: true,
      plan: {
        targetItems: [],
        createItems: [],
        removeManagedMediaItemIds: [],
        membershipNeedsRebuild: false,
        titleNeedsUpdate: false,
        sourceFingerprint: OTHER_FINGERPRINT,
      },
    });
    await expect(
      prepareGooglePhotosSyncReconciliation(input(), stale),
    ).resolves.toMatchObject({ status: "planningFailed" });
  });
});

describe("Google Photos reconciliation read-only and security contract", () => {
  it("contains no remote write, upload, retry, storage, logging, or direct fetch code", () => {
    const sourceText = readFileSync(
      new URL("./sync-reconciliation.ts", import.meta.url),
      "utf8",
    );
    for (const forbidden of [
      /createDrivePhotosSyncBinding/,
      /updateDrivePhotosSyncBindingBestEffort/,
      /createGooglePhotosAlbum/,
      /updateGooglePhotosSyncAlbumTitle/,
      /batchAddGooglePhotosSyncMediaItems/,
      /batchRemoveGooglePhotosSyncMediaItems/,
      /batchCreateGooglePhotosMediaItems/,
      /resumable/i,
      /\bfetch\s*\(/,
      /setTimeout/,
      /localStorage/,
      /sessionStorage/,
      /indexedDB/,
      /document\.cookie/,
      /console\.(?:log|error|warn)/,
    ]) {
      expect(sourceText).not.toMatch(forbidden);
    }
  });

  it("does not expose raw thrown Photos errors", async () => {
    const deps = adapters();
    deps.getAlbum.mockRejectedValueOnce(
      new Error("raw response body URL token and album identifier"),
    );
    const result = await prepareGooglePhotosSyncReconciliation(input(), deps);
    expect(result).toMatchObject({ status: "photosReadFailed" });
    expect(JSON.stringify(result)).not.toMatch(/raw response|URL token/);
  });
});
