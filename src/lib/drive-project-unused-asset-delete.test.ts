import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDriveProjectUnusedAssetDeleteOwner,
  deleteDriveProjectAssetFile,
  DriveProjectUnusedAssetDeleteRequestError,
  executeDriveProjectUnusedAssetDeletion,
  prepareDriveProjectUnusedAssetDeletion,
} from "./drive-project-unused-asset-delete";
import {
  preflightDriveProjectUnusedAssetDeletion,
  type DriveProjectSummary,
  type DriveProjectUnusedAssetDeletePreflightAsset,
  type DriveProjectUnusedAssetDeletePreflightResult,
} from "./google-drive";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const ACCESS_TOKEN = "access-token-delete-fixture";
const PROJECT: DriveProjectSummary = {
  projectId: PROJECT_ID,
  title: "Delete test",
  projectFolderId: "project-folder-id-fixture",
  manifestFileId: "manifest-file-id-fixture",
  assetsFolderId: "assets-folder-id-fixture",
  manifestPath: "projects/delete-test/manifest.json",
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
};
const OWNER = buildDriveProjectUnusedAssetDeleteOwner({
  workspaceId: WORKSPACE_ID,
  project: PROJECT,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prepareDriveProjectUnusedAssetDeletion", () => {
  it("rejects missing preflight, zero eligible, blocked, and changed selection", () => {
    expect(
      prepareDriveProjectUnusedAssetDeletion({
        selectedAssetFileIds: ["asset-file-a"],
        preflightResult: null,
        preflightOwner: null,
        currentOwner: OWNER,
      }),
    ).toEqual({ ok: false, reason: "preflightMissing" });
    expect(
      prepareDriveProjectUnusedAssetDeletion({
        selectedAssetFileIds: [],
        preflightResult: makePreflight([]),
        preflightOwner: OWNER,
        currentOwner: OWNER,
      }),
    ).toEqual({ ok: false, reason: "eligibleAssetRequired" });
    expect(
      prepareDriveProjectUnusedAssetDeletion({
        selectedAssetFileIds: ["asset-file-a"],
        preflightResult: makePreflight([
          makeAsset({
            status: "blocked",
            blockedReasons: ["stillReferenced"],
          }),
        ]),
        preflightOwner: OWNER,
        currentOwner: OWNER,
      }),
    ).toEqual({ ok: false, reason: "blockedAssetPresent" });
    expect(
      prepareDriveProjectUnusedAssetDeletion({
        selectedAssetFileIds: ["asset-file-b"],
        preflightResult: makePreflight([makeAsset()]),
        preflightOwner: OWNER,
        currentOwner: OWNER,
      }),
    ).toEqual({ ok: false, reason: "selectionChanged" });
  });

  it("keeps identifiers in the internal plan but not in the review", () => {
    const prepared = preparePlan([makeAsset()]);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    expect(JSON.stringify(prepared.plan)).toContain("asset-file-a");
    const serializedReview = JSON.stringify(prepared.review);
    expect(serializedReview).not.toContain("asset-file-a");
    expect(serializedReview).not.toContain(WORKSPACE_ID);
    expect(serializedReview).not.toContain(PROJECT_ID);
    expect(serializedReview).not.toContain(ASSET_ID);
    expect(serializedReview).not.toContain(ACCESS_TOKEN);
  });
});

describe("executeDriveProjectUnusedAssetDeletion", () => {
  it("runs a fresh all-item preflight and a fresh per-item preflight before sequential deletes", async () => {
    const assets = [
      makeAsset(),
      makeAsset({
        assetFileId: "asset-file-b",
        assetFileIdPart: "…file-b",
        assetName: "b.png",
      }),
    ];
    const prepared = preparePlan(assets);
    if (!prepared.ok) throw new Error("test plan preparation failed");
    const runFreshPreflight = vi.fn(async (assetFileIds: string[]) =>
      makePreflight(
        assetFileIds.map((assetFileId) =>
          assets.find((asset) => asset.assetFileId === assetFileId)!,
        ),
      ),
    );
    const deleteAssetFile = vi.fn(async () => undefined);

    const result = await executeDriveProjectUnusedAssetDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      runFreshPreflight,
      deleteAssetFile,
    });

    expect(runFreshPreflight.mock.calls).toEqual([
      [["asset-file-a", "asset-file-b"]],
      [["asset-file-a"]],
      [["asset-file-b"]],
    ]);
    expect(deleteAssetFile.mock.calls).toEqual([
      ["asset-file-a"],
      ["asset-file-b"],
    ]);
    expect(result).toMatchObject({
      status: "completed",
      requestedCount: 2,
      deletedCount: 2,
      deletedTotalSizeBytes: 200,
    });
  });

  it.each([
    ["stillReferenced", "stillReferenced"],
    ["wrongProject", "wrongProject"],
    ["wrongParent", "wrongParent"],
    ["notAppManagedAsset", "notAppManagedAsset"],
  ] as const)(
    "stops before DELETE when execute preflight reports %s",
    async (blockedReason, expectedReason) => {
      const asset = makeAsset();
      const prepared = preparePlan([asset]);
      if (!prepared.ok) throw new Error("test plan preparation failed");
      const deleteAssetFile = vi.fn(async () => undefined);

      const result = await executeDriveProjectUnusedAssetDeletion({
        plan: prepared.plan,
        currentOwner: OWNER,
        runFreshPreflight: async () =>
          makePreflight([
            makeAsset({
              status: "blocked",
              blockedReasons: [blockedReason],
              referenceSlideCount:
                blockedReason === "stillReferenced" ? 1 : 0,
            }),
          ]),
        deleteAssetFile,
      });

      expect(deleteAssetFile).not.toHaveBeenCalled();
      expect(result.status).toBe("blocked");
      expect(result.items[0]).toMatchObject({
        status: "blocked",
        reason: expectedReason,
      });
    },
  );

  it("blocks all DELETE calls when the metadata fingerprint changed", async () => {
    const asset = makeAsset();
    const prepared = preparePlan([asset]);
    if (!prepared.ok) throw new Error("test plan preparation failed");
    const deleteAssetFile = vi.fn(async () => undefined);

    const result = await executeDriveProjectUnusedAssetDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      runFreshPreflight: async () =>
        makePreflight([
          makeAsset({ modifiedTime: "2026-08-05T00:01:00.000Z" }),
        ]),
      deleteAssetFile,
    });

    expect(deleteAssetFile).not.toHaveBeenCalled();
    expect(result.items[0]).toMatchObject({
      status: "blocked",
      reason: "metadataChanged",
    });
  });

  it("revalidates each item and stops later deletes when a reference is added", async () => {
    const assets = [
      makeAsset(),
      makeAsset({ assetFileId: "asset-file-b", assetFileIdPart: "…file-b" }),
    ];
    const prepared = preparePlan(assets);
    if (!prepared.ok) throw new Error("test plan preparation failed");
    const deleteAssetFile = vi.fn(async () => undefined);
    let preflightCall = 0;

    const result = await executeDriveProjectUnusedAssetDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      runFreshPreflight: async (assetFileIds) => {
        preflightCall += 1;
        if (preflightCall === 2) {
          return makePreflight([
            makeAsset({
              status: "blocked",
              blockedReasons: ["stillReferenced"],
              referenceSlideCount: 1,
            }),
          ]);
        }
        return makePreflight(
          assetFileIds.map((assetFileId) =>
            assets.find((asset) => asset.assetFileId === assetFileId)!,
          ),
        );
      },
      deleteAssetFile,
    });

    expect(deleteAssetFile).not.toHaveBeenCalled();
    expect(result.items.map((item) => item.status)).toEqual([
      "blocked",
      "notAttempted",
    ]);
  });

  it.each([
    ["notFound", "notFound"],
    ["deleteRejected", "deleteRejected"],
    ["aborted", "aborted"],
  ] as const)(
    "stops after a %s delete failure without retrying",
    async (failureReason, expectedReason) => {
      const assets = [
        makeAsset(),
        makeAsset({ assetFileId: "asset-file-b", assetFileIdPart: "…file-b" }),
        makeAsset({ assetFileId: "asset-file-c", assetFileIdPart: "…file-c" }),
      ];
      const prepared = preparePlan(assets);
      if (!prepared.ok) throw new Error("test plan preparation failed");
      const deleteAssetFile = vi.fn(async (assetFileId: string) => {
        if (assetFileId === "asset-file-b") {
          throw new DriveProjectUnusedAssetDeleteRequestError(failureReason);
        }
      });

      const result = await executeDriveProjectUnusedAssetDeletion({
        plan: prepared.plan,
        currentOwner: OWNER,
        runFreshPreflight: async (assetFileIds) =>
          makePreflight(
            assetFileIds.map((assetFileId) =>
              assets.find((asset) => asset.assetFileId === assetFileId)!,
            ),
          ),
        deleteAssetFile,
      });

      expect(deleteAssetFile.mock.calls).toEqual([
        ["asset-file-a"],
        ["asset-file-b"],
      ]);
      expect(result.status).toBe("partialFailure");
      expect(result.items).toMatchObject([
        { status: "deleted" },
        { status: "failed", reason: expectedReason },
        { status: "notAttempted" },
      ]);
    },
  );

  it("marks the first rejected DELETE as failed and leaves later items not attempted", async () => {
    const assets = [
      makeAsset(),
      makeAsset({ assetFileId: "asset-file-b", assetFileIdPart: "…file-b" }),
    ];
    const prepared = preparePlan(assets);
    if (!prepared.ok) throw new Error("test plan preparation failed");
    const deleteAssetFile = vi.fn(async () => {
      throw new DriveProjectUnusedAssetDeleteRequestError("deleteRejected");
    });

    const result = await executeDriveProjectUnusedAssetDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      runFreshPreflight: async (assetFileIds) =>
        makePreflight(
          assetFileIds.map((assetFileId) =>
            assets.find((asset) => asset.assetFileId === assetFileId)!,
          ),
        ),
      deleteAssetFile,
    });

    expect(deleteAssetFile).toHaveBeenCalledOnce();
    expect(result.status).toBe("failed");
    expect(result.items).toMatchObject([
      { status: "failed", reason: "deleteRejected" },
      { status: "notAttempted" },
    ]);
  });

  it("blocks owner changes before fresh preflight or DELETE", async () => {
    const prepared = preparePlan([makeAsset()]);
    if (!prepared.ok) throw new Error("test plan preparation failed");
    const runFreshPreflight = vi.fn();
    const deleteAssetFile = vi.fn();

    const result = await executeDriveProjectUnusedAssetDeletion({
      plan: prepared.plan,
      currentOwner: { ...OWNER, projectId: "other-project" },
      runFreshPreflight,
      deleteAssetFile,
    });

    expect(runFreshPreflight).not.toHaveBeenCalled();
    expect(deleteAssetFile).not.toHaveBeenCalled();
    expect(result.status).toBe("blocked");
  });

  it("returns only sanitized item summaries", async () => {
    const prepared = preparePlan([makeAsset()]);
    if (!prepared.ok) throw new Error("test plan preparation failed");
    const result = await executeDriveProjectUnusedAssetDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      runFreshPreflight: async () => makePreflight([makeAsset()]),
      deleteAssetFile: async () => undefined,
    });
    const serialized = JSON.stringify(result);

    for (const forbidden of [
      ACCESS_TOKEN,
      "Authorization",
      "Bearer",
      "https://www.googleapis.com/drive/v3/files",
      "asset-file-a",
      WORKSPACE_ID,
      PROJECT_ID,
      ASSET_ID,
      PROJECT.manifestFileId,
      PROJECT.assetsFolderId,
      "appProperties",
      "parents",
      "checksum",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("deleteDriveProjectAssetFile", () => {
  it("uses an encoded Drive files.delete request and accepts only 204", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

    await deleteDriveProjectAssetFile({
      accessToken: ACCESS_TOKEN,
      assetFileId: "folder/file id",
      signal: new AbortController().signal,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://www.googleapis.com/drive/v3/files/folder%2Ffile%20id",
    );
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      method: "DELETE",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
  });

  it.each([
    [404, "notFound"],
    [403, "deleteRejected"],
    [500, "deleteRejected"],
    [200, "deleteRejected"],
  ] as const)("rejects status %s without reading the body", async (status, reason) => {
    const text = vi.fn();
    const fetchImpl = vi.fn(async () => ({ status, text }) as unknown as Response);

    await expect(
      deleteDriveProjectAssetFile({
        accessToken: ACCESS_TOKEN,
        assetFileId: "asset-file-a",
        signal: new AbortController().signal,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ reason });
    expect(text).not.toHaveBeenCalled();
  });
});

describe("unused asset delete preflight MIME and ownership boundary", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])(
    "keeps %s eligible",
    async (mimeType) => {
      mockPreflightFetch({ mimeType });
      const result = await runRealPreflight();
      expect(result.eligibleAssetCount).toBe(1);
      expect(result.blockedAssetCount).toBe(0);
    },
  );

  it.each(["video/mp4", "video/quicktime"])(
    "keeps %s blocked from physical deletion",
    async (mimeType) => {
      mockPreflightFetch({ mimeType });
      const result = await runRealPreflight();
      expect(result.blockedAssets[0].blockedReasons).toContain(
        "unsupportedMimeType",
      );
    },
  );

  it.each([
    [
      "wrong role",
      { role: "projectManifest" },
      "notAppManagedAsset",
    ],
    ["wrong workspace", { workspaceId: "other" }, "wrongProject"],
    ["wrong project", { projectId: "other" }, "wrongProject"],
    ["wrong schema", { schemaVersion: "2" }, "missingRequiredMetadata"],
  ] as const)("blocks %s", async (_label, appPropertyOverride, reason) => {
    mockPreflightFetch({ appPropertyOverride });
    const result = await runRealPreflight();
    expect(result.blockedAssets[0].blockedReasons).toContain(reason);
  });

  it.each([
    [[], "wrongParent"],
    [[PROJECT.assetsFolderId, "second-parent"], "wrongParent"],
    [["other-parent"], "wrongParent"],
  ] as const)("requires one exact parent", async (parents, reason) => {
    mockPreflightFetch({ parents: [...parents] });
    const result = await runRealPreflight();
    expect(result.blockedAssets[0].blockedReasons).toContain(reason);
  });
});

function preparePlan(assets: DriveProjectUnusedAssetDeletePreflightAsset[]) {
  return prepareDriveProjectUnusedAssetDeletion({
    selectedAssetFileIds: assets.map((asset) => asset.assetFileId),
    preflightResult: makePreflight(assets),
    preflightOwner: OWNER,
    currentOwner: OWNER,
  });
}

function makeAsset(
  overrides: Partial<DriveProjectUnusedAssetDeletePreflightAsset> = {},
): DriveProjectUnusedAssetDeletePreflightAsset {
  return {
    assetFileId: "asset-file-a",
    assetFileIdPart: "…file-a",
    assetId: ASSET_ID,
    assetIdPart: "…333333",
    assetName: "a.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 100,
    createdTime: "2026-08-05T00:00:00.000Z",
    modifiedTime: "2026-08-05T00:00:00.000Z",
    referenceSlideCount: 0,
    status: "eligible",
    blockedReasons: [],
    ...overrides,
  };
}

function makePreflight(
  assets: DriveProjectUnusedAssetDeletePreflightAsset[],
): DriveProjectUnusedAssetDeletePreflightResult {
  const eligibleAssets = assets.filter((asset) => asset.status === "eligible");
  const blockedAssets = assets.filter((asset) => asset.status === "blocked");
  return {
    checkedAssetCount: assets.length,
    eligibleAssetCount: eligibleAssets.length,
    blockedAssetCount: blockedAssets.length,
    selectedAssetFileIds: assets.map((asset) => asset.assetFileId),
    eligibleAssets,
    blockedAssets,
    allAssets: assets,
    freshManifestSlideCount: 0,
    eligibleTotalSizeBytes: eligibleAssets.reduce(
      (total, asset) => total + (asset.sizeBytes ?? 0),
      0,
    ),
    diagnostics: [],
  };
}

function mockPreflightFetch(input: {
  mimeType?: string;
  parents?: string[];
  appPropertyOverride?: Record<string, string>;
}) {
  const manifest = {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: PROJECT.title,
    slides: [],
    createdAt: PROJECT.createdAt,
    updatedAt: PROJECT.updatedAt,
  };
  const metadata = {
    id: "asset-file-a",
    name: "a.jpg",
    mimeType: input.mimeType ?? "image/jpeg",
    createdTime: "2026-08-05T00:00:00.000Z",
    modifiedTime: "2026-08-05T00:00:00.000Z",
    appProperties: {
      app: "ipad-slideshow-pwa",
      role: "asset",
      schemaVersion: "1",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      assetId: ASSET_ID,
      ...input.appPropertyOverride,
    },
    size: "100",
    parents: input.parents ?? [PROJECT.assetsFolderId],
    trashed: false,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: string | URL | Request) =>
      String(request).includes("alt=media")
        ? new Response(JSON.stringify(manifest), { status: 200 })
        : new Response(JSON.stringify(metadata), { status: 200 }),
    ),
  );
}

function runRealPreflight() {
  return preflightDriveProjectUnusedAssetDeletion({
    accessToken: ACCESS_TOKEN,
    workspaceId: WORKSPACE_ID,
    project: PROJECT,
    assetFileIds: ["asset-file-a"],
  });
}
