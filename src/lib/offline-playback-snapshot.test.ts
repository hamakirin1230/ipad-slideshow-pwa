import { describe, expect, it } from "vitest";
import type {
  OfflineAsset,
  OfflineAssetBlobRecord,
  OfflineProject,
  OfflineSyncState,
} from "./offline-schema";
import { buildOfflinePlaybackSnapshot } from "./offline-playback-snapshot";

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const checkedAt = "2026-07-31T01:00:00.000Z";
const provenance = {
  status: "publishedMatch",
  checkedAt,
  currentPublishedRevisionId: "rev_20260731T010000000Z_ab12cd34",
  publishedAt: checkedAt,
  operation: "publish",
} as const;

function project(
  publicationProvenance: OfflineProject["publicationProvenance"] | null =
    provenance,
): OfflineProject {
  return {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    projectTitle: "Fixture",
    slides: [],
    sourceManifestFileId: "dummy-manifest",
    syncedAt: checkedAt,
    ...(publicationProvenance ? { publicationProvenance } : {}),
  };
}

function state(
  publicationProvenance: OfflineSyncState["publicationProvenance"] | null =
    provenance,
): OfflineSyncState {
  return {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    status: "ready",
    rootFolderId: "dummy-root",
    workspaceFileId: "dummy-workspace",
    indexFileId: "dummy-index",
    manifestFileId: "dummy-manifest",
    slideCount: 0,
    assetCount: 0,
    syncedAt: checkedAt,
    ...(publicationProvenance ? { publicationProvenance } : {}),
  };
}

function build(input?: {
  project?: OfflineProject;
  state?: OfflineSyncState;
  assets?: OfflineAsset[];
  blobs?: OfflineAssetBlobRecord[];
}) {
  return buildOfflinePlaybackSnapshot({
    checkedAt,
    selectedProjectId: PROJECT_ID,
    projects: [input?.project ?? project()],
    assets: input?.assets ?? [],
    assetBlobs: input?.blobs ?? [],
    syncStates: [input?.state ?? state()],
  });
}

describe("offline playback publication provenance", () => {
  it("includes a sanitized view in ready snapshot and project option", () => {
    const snapshot = build();
    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.publicationProvenance.status).toBe("publishedMatch");
    expect(snapshot.availableProjects[0]?.publicationProvenance.status).toBe(
      "publishedMatch",
    );
  });

  it.each([
    { status: "unpublished", checkedAt },
    {
      ...provenance,
      status: "unpublishedChanges",
    },
    {
      status: "needsInspection",
      checkedAt,
      needsInspectionReason: "historyUnavailable",
    },
  ] as const)("does not block playback for $status", (value) => {
    expect(build({ project: project(value), state: state(value) }).status).toBe(
      "ready",
    );
  });

  it("keeps a legacy project playable and labels it legacyUnknown", () => {
    const snapshot = build({
      project: project(null),
      state: state(null),
    });
    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.publicationProvenance.status).toBe("legacyUnknown");
  });

  it("diagnoses project/sync-state provenance mismatch as invalid", () => {
    const snapshot = build({
      state: state({ status: "unpublished", checkedAt }),
    });
    expect(snapshot.status).toBe("invalid");
    expect(snapshot.diagnostics.join(" ")).toContain(
      "publication provenance",
    );
  });

  it("preserves remoteOnly and offline Blob slide construction", () => {
    const remoteProject = project();
    remoteProject.slides = [
      {
        slideId: "remote-slide",
        assetId: "remote-asset",
        type: "video",
        caption: "",
        durationSeconds: 10,
        order: 0,
      },
      {
        slideId: "offline-slide",
        assetId: "offline-asset",
        type: "image",
        caption: "",
        durationSeconds: 10,
        order: 1,
      },
    ];
    const remoteAsset: OfflineAsset = {
      schemaVersion: 1,
      assetId: "remote-asset",
      projectId: PROJECT_ID,
      sourceDriveFileId: "dummy-remote",
      type: "video",
      blobMimeType: "video/mp4",
      blobSizeBytes: 0,
      blobVariant: "original",
      blobStatus: "missing",
      syncedAt: checkedAt,
    };
    const blob = new Blob(["image"], { type: "image/jpeg" });
    const offlineAsset: OfflineAsset = {
      schemaVersion: 1,
      assetId: "offline-asset",
      projectId: PROJECT_ID,
      sourceDriveFileId: "dummy-offline",
      type: "image",
      blobMimeType: "image/jpeg",
      blobSizeBytes: blob.size,
      blobVariant: "original",
      blobStatus: "ready",
      syncedAt: checkedAt,
    };
    const blobRecord: OfflineAssetBlobRecord = {
      schemaVersion: 1,
      assetId: "offline-asset",
      projectId: PROJECT_ID,
      blob,
      blobMimeType: "image/jpeg",
      blobSizeBytes: blob.size,
      blobVariant: "original",
      syncedAt: checkedAt,
    };
    const snapshot = build({
      project: remoteProject,
      state: { ...state(), slideCount: 2, assetCount: 2 },
      assets: [remoteAsset, offlineAsset],
      blobs: [blobRecord],
    });
    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.slides.map((slide) => slide.offlineAvailability)).toEqual([
      "remoteOnly",
      "offline",
    ]);
  });
});
