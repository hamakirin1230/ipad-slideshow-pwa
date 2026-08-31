import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runTransaction: vi.fn(),
}));

vi.mock("./offline-db", () => ({
  requestToPromise: async (request: { result: unknown }) => request.result,
  runOfflineTransaction: mocks.runTransaction,
}));

import { readOfflineConfirmedTransferSnapshot } from "./offline-confirmed-transfer-snapshot";

function request(result: unknown) {
  return { result };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("offline confirmed transfer snapshot", () => {
  it("reads one ready confirmed project in a single readonly transaction", async () => {
    const blob = new Blob(["same"], { type: "image/jpeg" });
    const project = {
      schemaVersion: 1,
      projectId: "project-a",
      slides: [],
      sourceManifestFileId: "manifest-a",
      syncedAt: "2026-08-31T00:00:00.000Z",
    };
    const syncState = {
      schemaVersion: 1,
      projectId: "project-a",
      status: "ready",
      rootFolderId: "root",
      workspaceFileId: "workspace",
      indexFileId: "index",
      manifestFileId: "manifest-a",
      slideCount: 1,
      assetCount: 1,
      syncedAt: "2026-08-31T00:00:00.000Z",
    };
    const ownAsset = { assetId: "asset-a", projectId: "project-a" };
    const otherAsset = { assetId: "asset-b", projectId: "project-b" };
    const ownBlob = { assetId: "asset-a", projectId: "project-a", blob };
    const otherBlob = {
      assetId: "asset-b",
      projectId: "project-b",
      blob,
    };
    const projectGet = vi.fn(() => request(project));
    const stateGet = vi.fn(() => request(syncState));
    mocks.runTransaction.mockImplementationOnce(
      async (_stores, _mode, callback) =>
        callback({
          stores: {
            offlineProjects: { get: projectGet },
            offlineAssets: {
              getAll: vi.fn(() => request([ownAsset, otherAsset])),
            },
            offlineAssetBlobs: {
              getAll: vi.fn(() => request([ownBlob, otherBlob])),
            },
            offlineSyncState: { get: stateGet },
          },
        }),
    );

    const result = await readOfflineConfirmedTransferSnapshot("project-a");

    expect(mocks.runTransaction).toHaveBeenCalledWith(
      [
        "offlineProjects",
        "offlineAssets",
        "offlineAssetBlobs",
        "offlineSyncState",
      ],
      "readonly",
      expect.any(Function),
    );
    expect(projectGet).toHaveBeenCalledWith("project-a");
    expect(stateGet).toHaveBeenCalledWith("project-a");
    expect(result).toEqual({
      projectId: "project-a",
      confirmedReady: true,
      project,
      syncState,
      assets: [ownAsset],
      assetBlobs: [ownBlob],
    });
  });

  it("rejects a blank project identity before opening a transaction", () => {
    expect(() => readOfflineConfirmedTransferSnapshot(" ")).toThrow(TypeError);
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });
});
