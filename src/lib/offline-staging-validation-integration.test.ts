import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
}));

vi.mock("./offline-staging-read", () => ({
  getOfflineStagingRecordsBySyncRunId: mocks.read,
  getOfflineStagingRecordsBySyncRunIdInTransaction: mocks.read,
}));

import { validateOfflineStagingForSyncRun } from "./offline-staging-validation-integration";

describe("offline staging validation integration", () => {
  it("returns the provenance-bearing validated project", async () => {
    const publicationProvenance = {
      status: "unpublished" as const,
      checkedAt: "2026-07-31T01:00:00.000Z",
    };
    mocks.read.mockResolvedValue({
      projects: [
        {
          schemaVersion: 1,
          projectId: "dummy-project",
          slides: [],
          sourceManifestFileId: "dummy-manifest",
          syncedAt: "2026-07-31T01:00:00.000Z",
          stagingId: "dummy-staging",
          syncRunId: "dummy-run",
          publicationProvenance,
        },
      ],
      assets: [],
      assetBlobRecords: [],
    });
    const result = await validateOfflineStagingForSyncRun("dummy-run");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.publicationProvenance).toEqual(
      publicationProvenance,
    );
  });
});
