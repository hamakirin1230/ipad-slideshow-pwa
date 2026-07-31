import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn((value: unknown) => ({ result: value })),
}));

vi.mock("./offline-db", () => ({
  requestToPromise: async (request: { result: unknown }) => request.result,
  runOfflineTransaction: async (
    _stores: string[],
    _mode: string,
    operation: (input: { stores: Record<string, unknown> }) => unknown,
  ) =>
    operation({
      stores: {
        offlineStagingProjects: { put: mocks.put },
      },
    }),
}));

import { putOfflineStagingProject } from "./offline-staging-write";

describe("offline staging write provenance", () => {
  it("stores provenance on the staging project", async () => {
    const publicationProvenance = {
      status: "unpublished" as const,
      checkedAt: "2026-07-31T01:00:00.000Z",
    };
    await putOfflineStagingProject({
      syncRunId: "dummy-run",
      project: {
        schemaVersion: 1,
        projectId: "dummy-project",
        slides: [],
        sourceManifestFileId: "dummy-manifest",
        syncedAt: "2026-07-31T01:00:00.000Z",
        publicationProvenance,
      },
    });
    expect(mocks.put).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationProvenance,
        stagingId: "dummy-run:project:dummy-project",
      }),
    );
  });
});
