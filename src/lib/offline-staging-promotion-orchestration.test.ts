import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runTransaction: vi.fn(),
  validate: vi.fn(),
  classify: vi.fn(() => "failed" as const),
  markCorruptInTransaction: vi.fn(),
  markFailed: vi.fn(),
  markFailedInTransaction: vi.fn(),
  markReadyInTransaction: vi.fn(),
  promote: vi.fn(),
  cleanup: vi.fn(),
  compareProvenance: vi.fn(() => "match" as const),
}));

vi.mock("./offline-db", () => ({
  runOfflineTransaction: mocks.runTransaction,
}));
vi.mock("./offline-staging-validation-integration", () => ({
  validateOfflineStagingForSyncRunInTransaction: mocks.validate,
}));
vi.mock("./offline-staging-validation-failure-classification", () => ({
  classifyOfflineStagingValidationFailure: mocks.classify,
}));
vi.mock("./offline-sync-state", () => ({
  markOfflineStoreCorruptInTransaction: mocks.markCorruptInTransaction,
  markOfflineSyncFailed: mocks.markFailed,
  markOfflineSyncFailedInTransaction: mocks.markFailedInTransaction,
  markOfflineSyncReadyInTransaction: mocks.markReadyInTransaction,
}));
vi.mock("./offline-staging-promotion", () => ({
  promoteValidatedOfflineStagingToConfirmedStoresInTransaction: mocks.promote,
}));
vi.mock("./offline-staging-cleanup", () => ({
  clearOfflineStagingBySyncRunIdInTransaction: mocks.cleanup,
}));
vi.mock("./offline-publication-provenance", () => ({
  compareOfflinePublicationProvenance: mocks.compareProvenance,
}));

import { promoteOfflineStagingForSyncRun } from "./offline-staging-promotion-orchestration";

const args = {
  projectId: "same-project",
  syncRunId: "new-run",
  readyAt: "2026-07-31T01:00:00.000Z" as const,
  failedAt: "2026-07-31T01:00:00.000Z" as const,
  context: {
    rootFolderId: "root",
    workspaceFileId: "workspace",
    indexFileId: "index",
    manifestFileId: "manifest",
    sourceUpdatedAt: "2026-07-31T00:59:00.000Z" as const,
    slideCount: 1,
    assetCount: 1,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runTransaction.mockImplementation(
    async (_stores, _mode, callback) =>
      callback({ transaction: {}, stores: {} }),
  );
  mocks.markFailedInTransaction.mockResolvedValue({ updated: true });
  mocks.markReadyInTransaction.mockResolvedValue({ updated: true });
  mocks.markFailed.mockResolvedValue({ updated: true });
  mocks.cleanup.mockResolvedValue({
    deletedProjects: 1,
    deletedAssets: 1,
    deletedAssetBlobs: 1,
  });
});

describe("offline staging promotion failure contract", () => {
  it("does not touch confirmed stores when staging validation fails", async () => {
    mocks.validate.mockResolvedValue({
      ok: false,
      validation: { ok: false, reason: "missing-project" },
    });

    const result = await promoteOfflineStagingForSyncRun(args);

    expect(result).toMatchObject({
      ok: false,
      reason: "validation-failed",
    });
    expect(mocks.promote).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("keeps promotion in one readwrite transaction and reports a failed promotion", async () => {
    const project = {
      schemaVersion: 1,
      projectId: "same-project",
      slides: [],
      sourceManifestFileId: "manifest",
      syncedAt: "2026-07-31T01:00:00.000Z",
      stagingId: "staging-project",
      syncRunId: "new-run",
    };
    mocks.validate.mockResolvedValue({
      ok: true,
      project,
      records: { projects: [project], assets: [], assetBlobRecords: [] },
      validation: { ok: true },
    });
    mocks.promote.mockRejectedValue(new Error("promotion failed"));

    const result = await promoteOfflineStagingForSyncRun(args);

    expect(mocks.runTransaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        "offlineProjects",
        "offlineAssets",
        "offlineAssetBlobs",
      ]),
      "readwrite",
      expect.any(Function),
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "promotion-or-cleanup-failed",
    });
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledTimes(1);
  });
});
