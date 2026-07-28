import { describe, expect, it, vi } from "vitest";
import type {
  DriveFileCandidate,
  DriveProjectSummary,
  ProjectManifest,
} from "../google-drive";
import {
  getProjectManifestContentCanonicalHash,
  getProjectManifestPublishableContent,
  type ProjectPublishRevision,
} from "./project-publish-revision";
import {
  loadProjectPublishHistoryOverviewWithAdapter,
  type ProjectPublishHistoryOverviewAdapter,
} from "./project-publish-history-overview";
import type {
  ListProjectPublishRevisionsResult,
  LoadProjectPublishRevisionResult,
} from "./project-publish-revision-loader";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const MANIFEST_FILE_ID = "manifest-drive-file-sensitive";
const PROJECT_FOLDER_ID = "project-folder-sensitive";
const CURRENT_REVISION_ID = "rev_20260728T123456789Z_a1b2c3d4";
const OPERATION_ID = "pubop_20260728T123456789Z_1234abcd";
const RAW_ERROR = "raw-error-sensitive";

const project: DriveProjectSummary = {
  projectId: PROJECT_ID,
  title: "Overview fixture",
  projectFolderId: PROJECT_FOLDER_ID,
  manifestFileId: MANIFEST_FILE_ID,
  assetsFolderId: "assets-folder-sensitive",
  manifestPath: `projects/${PROJECT_ID}/manifest.json`,
  createdAt: "2026-07-28T10:00:00.000Z",
  updatedAt: "2026-07-28T12:00:00.000Z",
};

function buildManifest(): ProjectManifest {
  return {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: project.title,
    slides: [
      {
        slideId: "33333333-3333-4333-8333-333333333333",
        assetId: "44444444-4444-4444-8444-444444444444",
        assetFileId: "asset-file-sensitive",
        assetName: "slide.jpg",
        type: "image",
        mimeType: "image/jpeg",
        source: "localFile",
        sourceMimeType: "image/jpeg",
        sourceMediaItemId: "source-a",
        fileSize: 1200,
        durationSeconds: 10,
        caption: "Published caption",
        createdAt: "2026-07-28T10:00:00.000Z",
        updatedAt: "2026-07-28T12:00:00.000Z",
      },
    ],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function withPublication(manifest = buildManifest()) {
  const contentHash = getProjectManifestContentCanonicalHash(manifest);
  return {
    ...manifest,
    publication: {
      schemaVersion: 1 as const,
      currentRevisionId: CURRENT_REVISION_ID,
      publishedAt: "2026-07-28T12:34:56.789Z",
      operation: "publish" as const,
      operationId: OPERATION_ID,
      contentCanonicalHash: contentHash,
    },
  };
}

function buildRevision(manifest = withPublication()): ProjectPublishRevision {
  return {
    schemaVersion: 1,
    revisionId: manifest.publication.currentRevisionId,
    projectId: PROJECT_ID,
    publishedAt: manifest.publication.publishedAt,
    operation: manifest.publication.operation,
    sourceManifestModifiedTime: "2026-07-28T12:00:01.000Z",
    sourceManifestCanonicalHash: manifest.publication.contentCanonicalHash,
    previousRevisionId: null,
    summary: { slideCount: 1, assetCount: 1, remoteOnlyAssetCount: 0 },
    assets: [
      {
        assetId: manifest.slides[0].assetId,
        driveFileId: manifest.slides[0].assetFileId,
        mimeType: manifest.slides[0].mimeType,
        sizeBytes: 1200,
        modifiedTime: "2026-07-28T11:00:00.000Z",
        checksum: "asset-checksum-sensitive",
        remoteOnly: false,
      },
    ],
    manifest: getProjectManifestPublishableContent(manifest),
  };
}

function manifestMetadata(
  override: Partial<DriveFileCandidate> = {},
): DriveFileCandidate {
  return {
    id: MANIFEST_FILE_ID,
    name: "manifest.json",
    mimeType: "application/json",
    modifiedTime: "2026-07-28T12:00:01.000Z",
    parents: [PROJECT_FOLDER_ID],
    trashed: false,
    appProperties: {
      app: "ipad-slideshow-pwa",
      role: "projectManifest",
      schemaVersion: "1",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    },
    ...override,
  };
}

function listItem(revisionId = CURRENT_REVISION_ID) {
  return {
    revisionId,
    operation: "publish" as const,
    publishedAt: "2026-07-28T12:34:56.789Z",
    schemaVersion: 1,
    modifiedTime: "2026-07-28T12:35:00.000Z",
    metadataStatus: "ready" as const,
  };
}

function readyHistory(
  items = [listItem()],
  override: Partial<
    Extract<ListProjectPublishRevisionsResult, { ok: true; status: "ready" }>
  > = {},
): Extract<ListProjectPublishRevisionsResult, { ok: true; status: "ready" }> {
  return {
    ok: true,
    status: "ready",
    items,
    invalidMetadataCount: 0,
    ignoredFileCount: 0,
    duplicateRevisionIdCount: 0,
    ...override,
  };
}

function adapter(input?: {
  manifest?: ProjectManifest;
  metadata?: DriveFileCandidate;
  history?: ListProjectPublishRevisionsResult;
  exact?: LoadProjectPublishRevisionResult;
}): ProjectPublishHistoryOverviewAdapter {
  const manifest = input?.manifest ?? withPublication();
  return {
    readMetadata: vi.fn(async () => input?.metadata ?? manifestMetadata()),
    readText: vi.fn(async () => JSON.stringify(manifest)),
    listRevisions: vi.fn(async () => input?.history ?? readyHistory()),
    loadRevision: vi.fn(async () => input?.exact ?? {
      ok: true,
      revision: buildRevision(manifest as ReturnType<typeof withPublication>),
    }),
  };
}

async function load(input?: Parameters<typeof adapter>[0], signal?: AbortSignal) {
  return loadProjectPublishHistoryOverviewWithAdapter(
    {
      accessToken: "access-token-sensitive",
      workspaceId: WORKSPACE_ID,
      project,
      signal: signal ?? new AbortController().signal,
    },
    adapter(input),
  );
}

describe("publication absent", () => {
  it("reports unpublished when history is not configured", async () => {
    const result = await load({
      manifest: buildManifest(),
      history: { ok: true, status: "notConfigured" },
    });
    expect(result).toMatchObject({
      ok: true,
      overview: { publication: { status: "unpublished" } },
    });
  });

  it("reports unpublished when ready history has zero revisions", async () => {
    const result = await load({
      manifest: buildManifest(),
      history: readyHistory([]),
    });
    expect(result).toMatchObject({
      ok: true,
      overview: { publication: { status: "unpublished" } },
    });
  });

  it("reports history without publication when valid revisions remain", async () => {
    const result = await load({ manifest: buildManifest() });
    expect(result).toMatchObject({
      ok: true,
      overview: {
        publication: {
          status: "noPublicationWithHistory",
          currentRevisionMarker: null,
        },
      },
    });
  });

  it("does not auto-select invalid revision metadata", async () => {
    const result = await load({
      manifest: buildManifest(),
      history: readyHistory([], { invalidMetadataCount: 1 }),
    });
    expect(result).toMatchObject({
      ok: true,
      overview: {
        publication: {
          status: "noPublicationWithHistory",
          currentRevisionId: null,
        },
      },
    });
  });

  it("does not exact-load a revision without publication", async () => {
    const source = adapter({
      manifest: buildManifest(),
      history: readyHistory([]),
    });
    await loadProjectPublishHistoryOverviewWithAdapter(
      {
        accessToken: "token",
        workspaceId: WORKSPACE_ID,
        project,
        signal: new AbortController().signal,
      },
      source,
    );
    expect(source.loadRevision).not.toHaveBeenCalled();
  });
});

describe("publication current resolution", () => {
  it("verifies a current revision within the displayed list", async () => {
    const result = await load();
    expect(result).toMatchObject({
      ok: true,
      overview: {
        publication: {
          status: "current",
          currentRevisionId: CURRENT_REVISION_ID,
          currentRevisionInList: true,
          currentRevisionMarker: "verified",
          hasUnpublishedChanges: false,
        },
      },
    });
  });

  it("exact-loads and verifies a current revision outside the list", async () => {
    const source = adapter({ history: readyHistory([listItem("rev_20260729T123456789Z_ffffffff")]) });
    const result = await loadProjectPublishHistoryOverviewWithAdapter(
      {
        accessToken: "token",
        workspaceId: WORKSPACE_ID,
        project,
        signal: new AbortController().signal,
      },
      source,
    );
    expect(result).toMatchObject({
      ok: true,
      overview: {
        publication: {
          status: "current",
          currentRevisionInList: false,
          currentRevisionMarker: "verified",
        },
      },
    });
    expect(source.loadRevision).toHaveBeenCalledWith(
      expect.objectContaining({ revisionId: CURRENT_REVISION_ID }),
    );
  });

  it("reports a missing current revision", async () => {
    const result = await load({
      exact: { ok: false, code: "notFound", message: RAW_ERROR },
    });
    expect(result).toMatchObject({
      ok: true,
      overview: {
        publication: {
          status: "missingCurrentRevision",
          currentRevisionMarker: "needsInspection",
        },
      },
    });
  });

  it.each([
    "duplicateRevision",
    "invalidMetadata",
    "invalidJson",
    "invalidRevision",
    "metadataBodyMismatch",
  ] as const)("reports %s as inconsistent", async (code) => {
    const result = await load({
      exact: { ok: false, code, message: RAW_ERROR },
    });
    expect(result).toMatchObject({
      ok: true,
      overview: {
        publication: {
          status: "inconsistent",
          currentRevisionMarker: "needsInspection",
        },
      },
    });
  });

  it("reports exact Drive read failure as unavailable", async () => {
    const result = await load({
      exact: { ok: false, code: "driveReadFailed", message: RAW_ERROR },
    });
    expect(result).toMatchObject({
      ok: true,
      overview: { publication: { status: "unavailable" } },
    });
  });

  it("rejects publication publishedAt mismatch", async () => {
    const revision = buildRevision();
    revision.publishedAt = "2026-07-27T12:34:56.789Z";
    const result = await load({ exact: { ok: true, revision } });
    expect(result).toMatchObject({
      ok: true,
      overview: { publication: { status: "inconsistent" } },
    });
  });

  it("rejects publication operation mismatch", async () => {
    const revision = buildRevision();
    revision.operation = "rollback";
    revision.restoredFromRevisionId = "rev_20260727T123456789Z_ffffffff";
    const result = await load({ exact: { ok: true, revision } });
    expect(result).toMatchObject({
      ok: true,
      overview: { publication: { status: "inconsistent" } },
    });
  });

  it("rejects publication content hash mismatch", async () => {
    const revision = buildRevision();
    revision.sourceManifestCanonicalHash = "fnv1a64:0000000000000000";
    const result = await load({ exact: { ok: true, revision } });
    expect(result).toMatchObject({
      ok: true,
      overview: { publication: { status: "inconsistent" } },
    });
  });

  it("distinguishes unpublished current manifest edits from corruption", async () => {
    const published = withPublication();
    const revision = buildRevision(published);
    const edited = structuredClone(published);
    edited.slides[0].caption = "Saved after publish";
    const result = await load({
      manifest: edited,
      exact: { ok: true, revision },
    });
    expect(result).toMatchObject({
      ok: true,
      overview: {
        publication: {
          status: "currentWithUnpublishedChanges",
          currentRevisionMarker: "verified",
          hasUnpublishedChanges: true,
        },
      },
    });
  });

  it("does not classify non-current revisions as orphan", async () => {
    const result = await load({
      history: readyHistory([
        listItem(),
        listItem("rev_20260727T123456789Z_ffffffff"),
      ]),
    });
    expect(JSON.stringify(result)).not.toMatch(/orphan|過去の公開版|未使用revision/);
  });
});

describe("fresh manifest validation", () => {
  it("rejects malformed JSON", async () => {
    const source = adapter();
    source.readText = vi.fn(async () => "{");
    const result = await loadProjectPublishHistoryOverviewWithAdapter(
      {
        accessToken: "token",
        workspaceId: WORKSPACE_ID,
        project,
        signal: new AbortController().signal,
      },
      source,
    );
    expect(result).toMatchObject({ ok: false, code: "invalidManifest" });
  });

  it("rejects formal manifest parser failure", async () => {
    const result = await load({
      manifest: { ...buildManifest(), schemaVersion: 2 } as unknown as ProjectManifest,
    });
    expect(result).toMatchObject({ ok: false, code: "invalidManifest" });
  });

  it("rejects workspace mismatch", async () => {
    const result = await load({
      manifest: {
        ...buildManifest(),
        workspaceId: "99999999-9999-4999-8999-999999999999",
      },
    });
    expect(result).toMatchObject({ ok: false, code: "invalidManifest" });
  });

  it("rejects project mismatch", async () => {
    const result = await load({
      manifest: {
        ...buildManifest(),
        projectId: "99999999-9999-4999-8999-999999999999",
      },
    });
    expect(result).toMatchObject({ ok: false, code: "invalidManifest" });
  });

  it("accepts fresh display fields that differ from the provider summary", async () => {
    const manifest = withPublication({
      ...buildManifest(),
      title: "Fresh title",
      updatedAt: "2026-07-28T13:00:00.000Z",
    });
    const result = await load({
      manifest,
      exact: { ok: true, revision: buildRevision(manifest) },
    });
    expect(result).toMatchObject({
      ok: true,
      overview: { publication: { status: "current" } },
    });
  });

  it.each([
    ["id", { id: "wrong-manifest-file" }],
    ["name", { name: "renamed.json" }],
    ["mime", { mimeType: "text/plain" }],
    ["parent", { parents: ["wrong-parent"] }],
    ["trashed", { trashed: true }],
    ["missing trashed status", { trashed: undefined }],
    ["role", { appProperties: { ...manifestMetadata().appProperties, role: "wrong" } }],
    ["app", { appProperties: { ...manifestMetadata().appProperties, app: "wrong" } }],
    ["schema", { appProperties: { ...manifestMetadata().appProperties, schemaVersion: "2" } }],
    ["workspace", { appProperties: { ...manifestMetadata().appProperties, workspaceId: "wrong" } }],
    ["project", { appProperties: { ...manifestMetadata().appProperties, projectId: "wrong" } }],
  ])("rejects manifest metadata %s mismatch", async (_label, override) => {
    const result = await load({
      metadata: manifestMetadata(override as Partial<DriveFileCandidate>),
    });
    expect(result).toMatchObject({
      ok: false,
      code: "invalidManifestMetadata",
    });
  });

  it("sanitizes Drive read failure", async () => {
    const source = adapter();
    source.readMetadata = vi.fn(async () => {
      throw new Error(RAW_ERROR);
    });
    const result = await loadProjectPublishHistoryOverviewWithAdapter(
      {
        accessToken: "token",
        workspaceId: WORKSPACE_ID,
        project,
        signal: new AbortController().signal,
      },
      source,
    );
    expect(result).toMatchObject({ ok: false, code: "driveReadFailed" });
    expect(JSON.stringify(result)).not.toContain(RAW_ERROR);
  });

  it("returns aborted without leaking a raw error", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await load(undefined, controller.signal);
    expect(result).toMatchObject({ ok: false, code: "aborted" });
  });
});

describe("sanitized public result", () => {
  it("does not expose sensitive internals", async () => {
    const result = await load();
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "access-token-sensitive",
      "Authorization",
      "Bearer",
      "https://www.googleapis.com",
      MANIFEST_FILE_ID,
      PROJECT_FOLDER_ID,
      RAW_ERROR,
      OPERATION_ID,
      "fnv1a64:",
      "asset-checksum-sensitive",
      '"manifest"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("retains only public current identifiers and display fields", async () => {
    const result = await load();
    expect(result).toMatchObject({
      ok: true,
      overview: {
        publication: {
          currentRevisionId: CURRENT_REVISION_ID,
          publishedAt: "2026-07-28T12:34:56.789Z",
          operation: "publish",
        },
      },
    });
  });

  it("emits no console output", async () => {
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    await load();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
