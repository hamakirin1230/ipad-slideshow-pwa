import { describe, expect, it } from "vitest";
import type { OfflineStagingProject } from "./offline-schema";
import { validateOfflineStagingRecordsForSyncRun } from "./offline-staging-validation";

const checkedAt = "2026-07-31T01:00:00.000Z";

function stagingProject(
  publicationProvenance: OfflineStagingProject["publicationProvenance"],
): OfflineStagingProject {
  return {
    schemaVersion: 1,
    projectId: "dummy-project",
    slides: [],
    sourceManifestFileId: "dummy-manifest",
    syncedAt: checkedAt,
    stagingId: "dummy-run:project:dummy-project",
    syncRunId: "dummy-run",
    ...(publicationProvenance ? { publicationProvenance } : {}),
  };
}

describe("offline staging publication provenance validation", () => {
  it("accepts valid provenance on a new staging project", () => {
    expect(
      validateOfflineStagingRecordsForSyncRun({
        projects: [
          stagingProject({ status: "unpublished", checkedAt }),
        ],
        assets: [],
        assetBlobRecords: [],
      }),
    ).toEqual({ ok: true });
  });

  it("allows a legacy staging fixture with no field", () => {
    expect(
      validateOfflineStagingRecordsForSyncRun({
        projects: [stagingProject(undefined)],
        assets: [],
        assetBlobRecords: [],
      }),
    ).toEqual({ ok: true });
  });

  it("rejects invalid present provenance", () => {
    expect(
      validateOfflineStagingRecordsForSyncRun({
        projects: [
          stagingProject({
            status: "needsInspection",
            checkedAt,
          } as never),
        ],
        assets: [],
        assetBlobRecords: [],
      }),
    ).toEqual({
      ok: false,
      reason: "publication-provenance-invalid",
    });
  });
});
