import { afterEach, describe, expect, it, vi } from "vitest";
import type { DriveSlideSummary } from "./google-drive";
import { DRIVE_VIDEO_OFFLINE_MAX_BYTES } from "./drive-video-policy";
import type { OfflineSyncProgress } from "./offline-sync-progress";
import {
  getProjectManifestContentCanonicalHash,
} from "./publish-history/project-publish-revision";

const mocks = vi.hoisted(() => ({
  readDriveTextFile: vi.fn(),
  fetchAssetBlob: vi.fn(),
  resolveProvenance: vi.fn(async (input: { manifest: { publication?: unknown }; checkedAt: string }) => ({
    provenance: input.manifest.publication
      ? {
          status: "needsInspection" as const,
          checkedAt: input.checkedAt,
          needsInspectionReason: "historyUnavailable" as const,
        }
      : { status: "unpublished" as const, checkedAt: input.checkedAt },
  })),
}));

vi.mock("./google-drive", async (importOriginal) => {
  const original = await importOriginal<typeof import("./google-drive")>();
  return {
    ...original,
    readDriveTextFile: mocks.readDriveTextFile,
    fetchDriveProjectAssetBlob: mocks.fetchAssetBlob,
  };
});

vi.mock("./drive-offline-publication-provenance", () => ({
  resolveDriveOfflinePublicationProvenance: mocks.resolveProvenance,
}));

import {
  fetchDriveOfflineStagingSnapshot,
} from "./drive-offline-staging-snapshot";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const REVISION_ID = "rev_20260731T010203000Z_ab12cd34";
const MODIFIED_TIME = "2026-07-31T01:00:00.000Z";

const project = {
  projectId: PROJECT_ID,
  title: "Fixture",
  projectFolderId: "dummy-project-folder",
  manifestFileId: "dummy-manifest-file",
  assetsFolderId: "dummy-assets-folder",
  manifestPath: "manifest.json",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-31T00:59:00.000Z",
};

const readyContext = {
  workspaceId: WORKSPACE_ID,
  workspaceRootFolderId: "dummy-workspace-root",
  workspaceJsonFileId: "dummy-workspace-json",
  indexJsonFileId: "dummy-index-json",
  projectsRootFolderId: "dummy-projects-root",
  indexJsonText: "{}",
};

function manifest(title = "Fixture") {
  return {
    app: "ipad-slideshow-pwa" as const,
    role: "projectManifest" as const,
    schemaVersion: 1 as const,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title,
    slides: [],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function withPublication(
  value: ReturnType<typeof manifest>,
  override: Partial<{
    currentRevisionId: string;
    publishedAt: string;
    operation: "publish" | "rollback";
    contentCanonicalHash: string;
  }> = {},
) {
  return {
    ...value,
    publication: {
      schemaVersion: 1 as const,
      currentRevisionId: override.currentRevisionId ?? REVISION_ID,
      publishedAt: override.publishedAt ?? "2026-07-31T00:58:00.000Z",
      operation: override.operation ?? ("publish" as const),
      operationId:
        override.operation === "rollback"
          ? "rbop_20260731T005800000Z_ab12cd34"
          : "pubop_20260731T005800000Z_ab12cd34",
      contentCanonicalHash:
        override.contentCanonicalHash ??
        getProjectManifestContentCanonicalHash(value),
    },
  };
}

function metadata(modifiedTime = MODIFIED_TIME) {
  return {
    id: project.manifestFileId,
    name: "manifest.json",
    mimeType: "application/json",
    modifiedTime,
    parents: [project.projectFolderId],
    appProperties: {
      app: "ipad-slideshow-pwa",
      role: "projectManifest",
      schemaVersion: "1",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    },
  };
}

function installInitialMetadata(value: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(value))),
  );
}

function installManifestPhases(input: {
  initial: unknown;
  final?: unknown;
  initialModifiedTime?: string;
  finalModifiedTime?: string;
}) {
  mocks.readDriveTextFile
    .mockResolvedValueOnce(JSON.stringify(input.initial))
    .mockResolvedValueOnce(JSON.stringify(input.final ?? input.initial));
  const responses = [
    metadata(input.initialModifiedTime),
    metadata(input.initialModifiedTime),
    metadata(input.finalModifiedTime ?? input.initialModifiedTime),
    metadata(input.finalModifiedTime ?? input.initialModifiedTime),
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(responses.shift()))),
  );
}

async function fetchSnapshot() {
  return fetchDriveOfflineStagingSnapshot({
    accessToken: "dummy-token",
    readyContext,
    project,
    syncedAt: "2026-07-31T01:02:03.000Z",
    signal: new AbortController().signal,
  });
}

function slide(input: {
  assetId: string;
  assetFileId: string;
  mimeType: string;
  type?: "image" | "video";
  unsupportedReason?: "unsupportedVideoMimeType";
}): DriveSlideSummary {
  return {
    slideId: input.assetId.replace(/^./, "5"),
    assetId: input.assetId,
    assetFileId: input.assetFileId,
    assetName: "display-name",
    ...(input.type ? { type: input.type } : {}),
    mimeType: input.mimeType,
    source: "localFile",
    sourceMimeType: input.mimeType,
    sourceMediaItemId: `source-${input.assetId}`,
    ...(input.unsupportedReason
      ? { unsupportedReason: input.unsupportedReason }
      : {}),
    durationSeconds: 10,
    caption: "",
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-31T00:59:00.000Z",
  };
}

function assetMetadata(value: DriveSlideSummary, sizeBytes: number) {
  return {
    id: value.assetFileId,
    name: "stored-name",
    mimeType: value.mimeType,
    modifiedTime: MODIFIED_TIME,
    size: String(sizeBytes),
    parents: [project.assetsFolderId],
    appProperties: {
      app: "ipad-slideshow-pwa",
      role: "asset",
      schemaVersion: "1",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      assetId: value.assetId,
    },
  };
}

function installAssetManifestPhases(input: {
  slides: DriveSlideSummary[];
  assetMetadata: unknown[];
}) {
  const value = { ...manifest(), slides: input.slides };
  mocks.readDriveTextFile
    .mockResolvedValueOnce(JSON.stringify(value))
    .mockResolvedValueOnce(JSON.stringify(value));
  const responses = [
    metadata(),
    metadata(),
    ...input.assetMetadata,
    metadata(),
    metadata(),
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(responses.shift()))),
  );
}

async function fetchSnapshotWithProgress(onProgress: (progress: OfflineSyncProgress) => void) {
  return fetchDriveOfflineStagingSnapshot({
    accessToken: "dummy-token",
    readyContext,
    project,
    syncedAt: "2026-07-31T01:02:03.000Z",
    signal: new AbortController().signal,
    onProgress,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mocks.fetchAssetBlob.mockReset();
});

describe("Drive offline staging manifest guard", () => {
  it("continues to staging snapshot when the manifest is unchanged", async () => {
    installManifestPhases({ initial: manifest() });
    const snapshot = await fetchSnapshot();
    expect(snapshot.project.publicationProvenance).toEqual({
      status: "unpublished",
      checkedAt: "2026-07-31T01:02:03.000Z",
    });
    expect(snapshot.assetPairs).toEqual([]);
  });

  it.each([
    ["parents is missing", { parents: undefined }],
    ["parents is empty", { parents: [] }],
    ["parent is different", { parents: ["different-project-folder"] }],
    [
      "an additional parent exists",
      { parents: [project.projectFolderId, "additional-folder"] },
    ],
    [
      "the project parent is duplicated",
      { parents: [project.projectFolderId, project.projectFolderId] },
    ],
  ])("rejects manifest metadata when %s", async (_label, override) => {
    const value: Record<string, unknown> = { ...metadata(), ...override };
    if (override.parents === undefined) {
      delete value.parents;
    }
    installInitialMetadata(value);

    await expect(fetchSnapshot()).rejects.toMatchObject({
      diagnostics: ["Drive manifest metadata の正式検証に失敗しました。"],
    });
    expect(mocks.readDriveTextFile).not.toHaveBeenCalled();
  });

  it("stops on modifiedTime-only changes", async () => {
    installManifestPhases({
      initial: manifest(),
      initialModifiedTime: MODIFIED_TIME,
      finalModifiedTime: "2026-07-31T01:00:01.000Z",
    });
    await expect(fetchSnapshot()).rejects.toMatchObject({
      code: "staleManifest",
    });
  });

  it("stops on current manifest content changes", async () => {
    installManifestPhases({
      initial: manifest(),
      final: manifest("Changed"),
    });
    await expect(fetchSnapshot()).rejects.toMatchObject({
      code: "staleManifest",
    });
  });

  it.each([
    ["publication added", manifest(), withPublication(manifest())],
    [
      "currentRevisionId changed",
      withPublication(manifest()),
      withPublication(manifest(), {
        currentRevisionId: "rev_20260731T010204000Z_cd34ef56",
      }),
    ],
    [
      "publishedAt changed",
      withPublication(manifest()),
      withPublication(manifest(), {
        publishedAt: "2026-07-31T00:58:01.000Z",
      }),
    ],
    [
      "operation changed",
      withPublication(manifest()),
      withPublication(manifest(), { operation: "rollback" }),
    ],
    [
      "publication content hash changed",
      withPublication(manifest()),
      withPublication(manifest(), {
        contentCanonicalHash: "fnv1a64:0000000000000000",
      }),
    ],
  ])("stops when %s", async (_label, initial, final) => {
    installManifestPhases({ initial, final });
    await expect(fetchSnapshot()).rejects.toMatchObject({
      code: "staleManifest",
      diagnostics: expect.not.arrayContaining([
        expect.stringMatching(/fnv1a64|dummy-manifest-file/),
      ]),
    });
  });
});

describe("Drive offline staging asset progress", () => {
  it("counts remoteOnly and unsupported entries exactly once", async () => {
    const remoteOnly = slide({
      assetId: "33333333-3333-4333-8333-333333333333",
      assetFileId: "remote-video-file",
      mimeType: "video/mp4",
      type: "video",
    });
    const unsupported = slide({
      assetId: "44444444-4444-4444-8444-444444444444",
      assetFileId: "unsupported-video-file",
      mimeType: "video/quicktime",
      type: "video",
      unsupportedReason: "unsupportedVideoMimeType",
    });
    installAssetManifestPhases({
      slides: [remoteOnly, unsupported],
      assetMetadata: [
        assetMetadata(remoteOnly, DRIVE_VIDEO_OFFLINE_MAX_BYTES + 1),
        assetMetadata(unsupported, 1200),
      ],
    });
    const progress: OfflineSyncProgress[] = [];

    await fetchSnapshotWithProgress((value) => progress.push(value));

    expect(
      progress
        .filter((value) => value.phase === "assetSaving")
        .map((value) => value.processedAssetCount),
    ).toEqual([1, 2]);
    expect(mocks.fetchAssetBlob).not.toHaveBeenCalled();
  });

  it("counts a successful Blob and a non-abort video skip as terminal", async () => {
    const image = slide({
      assetId: "33333333-3333-4333-8333-333333333333",
      assetFileId: "image-file",
      mimeType: "image/jpeg",
      type: "image",
    });
    const video = slide({
      assetId: "44444444-4444-4444-8444-444444444444",
      assetFileId: "video-file",
      mimeType: "video/mp4",
      type: "video",
    });
    installAssetManifestPhases({
      slides: [image, video],
      assetMetadata: [assetMetadata(image, 5), assetMetadata(video, 5)],
    });
    mocks.fetchAssetBlob
      .mockResolvedValueOnce(new Blob(["image"], { type: "image/jpeg" }))
      .mockRejectedValueOnce(new Error("video fetch failed"));
    const progress: OfflineSyncProgress[] = [];

    await fetchSnapshotWithProgress((value) => progress.push(value));

    expect(
      progress
        .filter((value) => value.phase === "assetSaving")
        .map((value) => value.processedAssetCount),
    ).toEqual([1, 2]);
  });

  it("does not count an aborted unfinished entry", async () => {
    const video = slide({
      assetId: "33333333-3333-4333-8333-333333333333",
      assetFileId: "video-file",
      mimeType: "video/mp4",
      type: "video",
    });
    installAssetManifestPhases({
      slides: [video],
      assetMetadata: [assetMetadata(video, 5)],
    });
    mocks.fetchAssetBlob.mockRejectedValueOnce(
      new DOMException("aborted", "AbortError"),
    );
    const progress: OfflineSyncProgress[] = [];

    await expect(
      fetchSnapshotWithProgress((value) => progress.push(value)),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(
      progress.filter((value) => value.phase === "assetSaving"),
    ).toEqual([]);
  });
});
