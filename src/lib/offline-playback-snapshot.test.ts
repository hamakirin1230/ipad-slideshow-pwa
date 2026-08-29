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

  it("copies album transition onto the ready playback snapshot", () => {
    const snapshot = build({
      project: { ...project(), transition: "slideLeft" },
    });
    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.transition).toBe("slideLeft");
  });

  it("copies album transitionStrength onto the ready playback snapshot", () => {
    const snapshot = build({
      project: {
        ...project(),
        transition: "wipe",
        transitionStrength: "subtle",
      },
    });
    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.transition).toBe("wipe");
    expect(snapshot.transitionStrength).toBe("subtle");
  });

  it("keeps a first-phase OfflineProject without strength valid", () => {
    const snapshot = build({
      project: { ...project(), transition: "fade" },
    });
    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.transition).toBe("fade");
    expect(snapshot.transitionStrength).toBeUndefined();
    expect(snapshot).not.toHaveProperty("transitionStrength");
  });

  it("keeps a legacy OfflineProject without transition valid", () => {
    const snapshot = build({
      project: project(),
    });
    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.transition).toBeUndefined();
    expect(snapshot).not.toHaveProperty("transition");
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

  it("keeps the restored previous snapshot selectable and playable after staleManifest", () => {
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
    expect(snapshot.availableProjects).toHaveLength(1);
    expect(snapshot.availableProjects[0]).toMatchObject({
      projectId: PROJECT_ID,
      publicationProvenance: { status: "publishedMatch" },
    });
    expect(snapshot.publicationProvenance.status).toBe("publishedMatch");
    expect(snapshot.slides.map((slide) => slide.offlineAvailability)).toEqual([
      "remoteOnly",
      "offline",
    ]);
  });
});

describe("explicit offline playback project selection", () => {
  const OTHER_PROJECT_ID = "33333333-3333-4333-8333-333333333333";

  function projectFor(projectId: string, projectTitle: string): OfflineProject {
    return {
      ...project(),
      projectId,
      projectTitle,
      sourceManifestFileId: `manifest-${projectId}`,
    };
  }

  function stateFor(projectId: string): OfflineSyncState {
    return {
      ...state(),
      projectId,
      manifestFileId: `manifest-${projectId}`,
    };
  }

  it("selects the explicitly requested project when it is confirmed", () => {
    const snapshot = buildOfflinePlaybackSnapshot({
      checkedAt,
      selectedProjectId: OTHER_PROJECT_ID,
      projects: [
        projectFor(PROJECT_ID, "Previous"),
        projectFor(OTHER_PROJECT_ID, "Selected"),
      ],
      assets: [],
      assetBlobs: [],
      syncStates: [stateFor(PROJECT_ID), stateFor(OTHER_PROJECT_ID)],
    });

    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.projectId).toBe(OTHER_PROJECT_ID);
    expect(snapshot.projectTitle).toBe("Selected");
  });

  it("does not fall back to another confirmed project when the request is unavailable", () => {
    const requestedProjectId = "44444444-4444-4444-8444-444444444444";
    const snapshot = buildOfflinePlaybackSnapshot({
      checkedAt,
      selectedProjectId: requestedProjectId,
      projects: [
        projectFor(PROJECT_ID, "Previous"),
        projectFor(OTHER_PROJECT_ID, "Other"),
      ],
      assets: [],
      assetBlobs: [],
      syncStates: [stateFor(PROJECT_ID), stateFor(OTHER_PROJECT_ID)],
    });

    expect(snapshot.status).toBe("projectSelectionRequired");
    if (snapshot.status !== "projectSelectionRequired") return;
    expect(snapshot.selectedProjectId).toBe(requestedProjectId);
    expect(snapshot.availableProjects.map((item) => item.projectId)).toEqual([
      PROJECT_ID,
      OTHER_PROJECT_ID,
    ]);
  });
});

describe("offline playback MP4/MOV availability", () => {
  function videoProject(): OfflineProject {
    return {
      ...project(),
      slides: [
        {
          slideId: "video-slide",
          assetId: "video-asset",
          type: "video",
          caption: "",
          durationSeconds: 10,
          order: 0,
        },
      ],
    };
  }

  function videoAsset(
    mimeType: string,
    override: Partial<OfflineAsset> = {},
  ): OfflineAsset {
    return {
      schemaVersion: 1,
      assetId: "video-asset",
      projectId: PROJECT_ID,
      sourceDriveFileId: "dummy-video-file",
      sourceSizeBytes: 80 * 1024 * 1024,
      type: "video",
      blobMimeType: mimeType,
      blobSizeBytes: 0,
      blobVariant: "original",
      blobStatus: "missing",
      syncedAt: checkedAt,
      ...override,
    };
  }

  it.each(["video/mp4", "video/quicktime"] as const)(
    "keeps metadata-only %s playable online as remoteOnly",
    (mimeType) => {
      const snapshot = build({
        project: videoProject(),
        state: { ...state(), slideCount: 1, assetCount: 1 },
        assets: [videoAsset(mimeType)],
      });

      expect(snapshot.status).toBe("ready");
      if (snapshot.status !== "ready") return;
      expect(snapshot.slides[0]).toMatchObject({
        type: "video",
        mimeType,
        offlineAvailability: "remoteOnly",
      });
    },
  );

  it("keeps an offline MOV Blob and its actual MIME", () => {
    const blob = new Blob(["movie"], { type: "video/quicktime" });
    const asset = videoAsset("video/quicktime", {
      sourceSizeBytes: blob.size,
      blobSizeBytes: blob.size,
      blobStatus: "ready",
    });
    const blobRecord: OfflineAssetBlobRecord = {
      schemaVersion: 1,
      assetId: asset.assetId,
      projectId: PROJECT_ID,
      blob,
      blobMimeType: "video/quicktime",
      blobSizeBytes: blob.size,
      blobVariant: "original",
      syncedAt: checkedAt,
    };
    const snapshot = build({
      project: videoProject(),
      state: { ...state(), slideCount: 1, assetCount: 1 },
      assets: [asset],
      blobs: [blobRecord],
    });

    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.slides[0]).toMatchObject({
      mimeType: "video/quicktime",
      offlineAvailability: "offline",
      blobMimeType: "video/quicktime",
    });
  });

  it("plays a legacy metadata-only MOV confirmed snapshot as remoteOnly", () => {
    const legacyProject = videoProject();
    legacyProject.slides[0]!.unsupportedReason = "unsupportedVideoMimeType";
    const snapshot = build({
      project: legacyProject,
      state: { ...state(), slideCount: 1, assetCount: 1 },
      assets: [
        videoAsset("video/quicktime", {
          unsupportedReason: "unsupportedVideoMimeType",
        }),
      ],
    });

    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.slides[0]).toMatchObject({
      type: "video",
      mimeType: "video/quicktime",
      offlineAvailability: "remoteOnly",
    });
    expect(snapshot.slides[0]?.unsupportedReason).toBeUndefined();
  });

  it("plays a legacy offline MOV confirmed snapshot without the obsolete marker", () => {
    const legacyProject = videoProject();
    legacyProject.slides[0]!.unsupportedReason = "unsupportedVideoMimeType";
    const blob = new Blob(["movie"], { type: "video/quicktime" });
    const asset = videoAsset("video/quicktime", {
      sourceSizeBytes: blob.size,
      blobSizeBytes: blob.size,
      blobStatus: "ready",
      unsupportedReason: "unsupportedVideoMimeType",
    });
    const snapshot = build({
      project: legacyProject,
      state: { ...state(), slideCount: 1, assetCount: 1 },
      assets: [asset],
      blobs: [
        {
          schemaVersion: 1,
          assetId: asset.assetId,
          projectId: PROJECT_ID,
          blob,
          blobMimeType: "video/quicktime",
          blobSizeBytes: blob.size,
          blobVariant: "original",
          syncedAt: checkedAt,
        },
      ],
    });

    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.slides[0]).toMatchObject({
      type: "video",
      mimeType: "video/quicktime",
      offlineAvailability: "offline",
    });
    expect(snapshot.slides[0]?.unsupportedReason).toBeUndefined();
  });

  it("keeps an unsupported WebM confirmed snapshot unavailable", () => {
    const unsupportedProject = videoProject();
    unsupportedProject.slides[0]!.unsupportedReason =
      "unsupportedVideoMimeType";
    const snapshot = build({
      project: unsupportedProject,
      state: { ...state(), slideCount: 1, assetCount: 1 },
      assets: [
        videoAsset("video/webm", {
          unsupportedReason: "unsupportedVideoMimeType",
        }),
      ],
    });

    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.slides[0]).toMatchObject({
      mimeType: "video/webm",
      offlineAvailability: "unsupported",
      unsupportedReason: "unsupportedVideoMimeType",
    });
  });

  it.each(["unsupportedMimeType", "videoPlaybackNotImplemented"] as const)(
    "keeps a QuickTime %s marker effective in old confirmed snapshots",
    (unsupportedReason) => {
      const legacyProject = videoProject();
      legacyProject.slides[0]!.unsupportedReason = unsupportedReason;
      const snapshot = build({
        project: legacyProject,
        state: { ...state(), slideCount: 1, assetCount: 1 },
        assets: [videoAsset("video/quicktime", { unsupportedReason })],
      });

      expect(snapshot.status).toBe("ready");
      if (snapshot.status !== "ready") return;
      expect(snapshot.slides[0]).toMatchObject({
        offlineAvailability: "unsupported",
        unsupportedReason,
      });
    },
  );

  it.each(["video/mp4", "video/quicktime"] as const)(
    "keeps over-limit %s unavailable rather than remoteOnly",
    (mimeType) => {
      const snapshot = build({
        project: videoProject(),
        state: { ...state(), slideCount: 1, assetCount: 1 },
        assets: [
          videoAsset(mimeType, {
            unsupportedReason: "videoOfflineTooLarge",
          }),
        ],
      });

      expect(snapshot.status).toBe("ready");
      if (snapshot.status !== "ready") return;
      expect(snapshot.slides[0]).toMatchObject({
        offlineAvailability: "unsupported",
        unsupportedReason: "videoOfflineTooLarge",
      });
    },
  );
});
