import { describe, expect, it } from "vitest";
import type { OfflineProject, OfflineSyncState } from "./offline-schema";
import {
  buildConfirmedProvenanceDiagnostics,
  toOfflineConfirmedProjectSummary,
} from "./offline-confirmed-store-snapshot";

const checkedAt = "2026-07-31T01:00:00.000Z";
const provenance = { status: "unpublished" as const, checkedAt };

function project(
  publicationProvenance?: OfflineProject["publicationProvenance"],
): OfflineProject {
  return {
    schemaVersion: 1,
    projectId: "dummy-project",
    slides: [],
    sourceManifestFileId: "dummy-manifest",
    syncedAt: checkedAt,
    ...(publicationProvenance ? { publicationProvenance } : {}),
  };
}

function state(
  publicationProvenance?: OfflineSyncState["publicationProvenance"],
): OfflineSyncState {
  return {
    schemaVersion: 1,
    projectId: "dummy-project",
    status: "ready",
    rootFolderId: "dummy-root",
    workspaceFileId: "dummy-workspace",
    indexFileId: "dummy-index",
    manifestFileId: "dummy-manifest",
    slideCount: 0,
    assetCount: 0,
    ...(publicationProvenance ? { publicationProvenance } : {}),
  };
}

describe("offline confirmed store publication provenance", () => {
  it("returns a sanitized project provenance view", () => {
    expect(
      toOfflineConfirmedProjectSummary(project(provenance))
        .publicationProvenance,
    ).toMatchObject({
      status: "unpublished",
      label: "未公開project",
    });
  });

  it("normalizes legacy records without rewriting them", () => {
    const legacy = project();
    expect(
      toOfflineConfirmedProjectSummary(legacy).publicationProvenance.status,
    ).toBe("legacyUnknown");
    expect(legacy).not.toHaveProperty("publicationProvenance");
  });

  it("diagnoses a confirmed project/ready state mismatch", () => {
    expect(
      buildConfirmedProvenanceDiagnostics(
        [project(provenance)],
        [
          state({
            status: "needsInspection",
            checkedAt,
            needsInspectionReason: "historyUnavailable",
          }),
        ],
      ).join(" "),
    ).toContain("publication provenance");
  });
});
