import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadProjectPublishHistoryLocation,
  loadProjectPublishRevision,
  listProjectPublishRevisions,
  PROJECT_HISTORY_FOLDER_ROLE,
  PROJECT_PUBLISH_REVISION_FILE_ROLE,
  PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE,
} from "./project-publish-revision-loader";
import {
  deriveProjectPublishRevisionSummary,
  getProjectManifestCanonicalHash,
  type ProjectPublishRevision,
} from "./project-publish-revision";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_FOLDER_ID = "project-folder-internal-a";
const HISTORY_FOLDER_ID = "history-folder-internal-a";
const REVISIONS_FOLDER_ID = "revisions-folder-internal-a";
const REVISION_FILE_ID = "revision-file-internal-a";
const REVISION_ID = "rev_20260712T123456789Z_ab12cd34";
const OLDER_REVISION_ID = "rev_20260711T123456789Z_cd34ef56";
const TOKEN_FIXTURE = "token-fixture-must-not-leak";

const baseInput = {
  accessToken: TOKEN_FIXTURE,
  workspaceId: WORKSPACE_ID,
  projectId: PROJECT_ID,
  projectFolderId: PROJECT_FOLDER_ID,
  signal: new AbortController().signal,
};

type QueuedResponse =
  | { type: "json"; body: unknown; ok?: boolean; status?: number }
  | { type: "text"; body: string; ok?: boolean; status?: number };

function installFetchQueue(queue: QueuedResponse[]) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(new Headers(init?.headers).has("Authorization")).toBe(true);
    const next = queue.shift();
    if (!next) throw new Error("unexpected fetch");
    return new Response(
      next.type === "json" ? JSON.stringify(next.body) : next.body,
      {
        status: next.status ?? (next.ok === false ? 500 : 200),
        headers:
          next.type === "json" ? { "Content-Type": "application/json" } : undefined,
      },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function appProperties(role: string, extra: Record<string, string> = {}) {
  return {
    app: "ipad-slideshow-pwa",
    role,
    schemaVersion: "1",
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    ...extra,
  };
}

function folder(input: {
  id: string;
  name: string;
  role: string;
  parent: string;
  override?: Record<string, unknown>;
}) {
  return {
    id: input.id,
    name: input.name,
    mimeType: "application/vnd.google-apps.folder",
    parents: [input.parent],
    trashed: false,
    appProperties: appProperties(input.role),
    ...input.override,
  };
}

function historyFolder(override?: Record<string, unknown>) {
  return folder({
    id: HISTORY_FOLDER_ID,
    name: "history",
    role: PROJECT_HISTORY_FOLDER_ROLE,
    parent: PROJECT_FOLDER_ID,
    override,
  });
}

function revisionsFolder(override?: Record<string, unknown>) {
  return folder({
    id: REVISIONS_FOLDER_ID,
    name: "revisions",
    role: PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE,
    parent: HISTORY_FOLDER_ID,
    override,
  });
}

function revisionFile(input: {
  revisionId?: string;
  operation?: string;
  publishedAt?: string;
  id?: string;
  override?: Record<string, unknown>;
  propertiesOverride?: Record<string, string>;
}) {
  const revisionId = input.revisionId ?? REVISION_ID;
  return {
    id: input.id ?? REVISION_FILE_ID,
    name: `${revisionId}.json`,
    mimeType: "application/json",
    modifiedTime: "2026-07-12T12:35:00.000Z",
    parents: [REVISIONS_FOLDER_ID],
    trashed: false,
    appProperties: appProperties(PROJECT_PUBLISH_REVISION_FILE_ROLE, {
      revisionId,
      operation: input.operation ?? "publish",
      publishedAt: input.publishedAt ?? "2026-07-12T12:34:56.789Z",
      ...input.propertiesOverride,
    }),
    ...input.override,
  };
}

function buildRevision(operation: "publish" | "rollback" = "publish") {
  const manifest = {
    app: "ipad-slideshow-pwa" as const,
    role: "projectManifest" as const,
    schemaVersion: 1 as const,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: "Fixture project",
    slides: [
      {
        slideId: "33333333-3333-4333-8333-333333333333",
        assetId: "44444444-4444-4444-8444-444444444444",
        assetFileId: "drive-file-a",
        assetName: "image-a.jpg",
        type: "image" as const,
        mimeType: "image/jpeg",
        source: "localFile" as const,
        sourceMimeType: "image/jpeg",
        sourceMediaItemId: "source-image-a",
        fileSize: 1200,
        durationSeconds: 10,
        caption: "Fixture caption",
        createdAt: "2026-07-12T12:00:00.000Z",
        updatedAt: "2026-07-12T12:34:56.789Z",
      },
    ],
    createdAt: "2026-07-12T12:00:00.000Z",
    updatedAt: "2026-07-12T12:34:56.789Z",
  };
  const assets = [
    {
      assetId: manifest.slides[0].assetId,
      driveFileId: manifest.slides[0].assetFileId,
      mimeType: "image/jpeg",
      sizeBytes: 1200,
      modifiedTime: "2026-07-12T12:00:00Z",
      checksum: "checksum-a",
      remoteOnly: false,
    },
  ];
  return {
    schemaVersion: 1,
    revisionId: REVISION_ID,
    projectId: PROJECT_ID,
    publishedAt: "2026-07-12T12:34:56.789Z",
    operation,
    ...(operation === "rollback" ? { restoredFromRevisionId: OLDER_REVISION_ID } : {}),
    sourceManifestModifiedTime: "2026-07-12T12:34:56.789Z",
    sourceManifestCanonicalHash: getProjectManifestCanonicalHash(manifest),
    previousRevisionId: OLDER_REVISION_ID,
    summary: deriveProjectPublishRevisionSummary(manifest, assets),
    assets,
    manifest,
  } satisfies ProjectPublishRevision;
}

function queueReadyLocation(extra: QueuedResponse[] = []) {
  return [
    { type: "json" as const, body: { files: [historyFolder()] } },
    { type: "json" as const, body: { files: [revisionsFolder()] } },
    ...extra,
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("history location discovery", () => {
  it("returns notConfigured when history is absent", async () => {
    installFetchQueue([{ type: "json", body: { files: [] } }]);
    await expect(loadProjectPublishHistoryLocation(baseInput)).resolves.toEqual({
      ok: true,
      status: "notConfigured",
    });
  });

  it("accepts one valid history/revisions hierarchy", async () => {
    installFetchQueue(queueReadyLocation());
    await expect(loadProjectPublishHistoryLocation(baseInput)).resolves.toEqual({
      ok: true,
      status: "ready",
    });
  });

  it("rejects duplicate history folders", async () => {
    installFetchQueue([
      { type: "json", body: { files: [historyFolder(), historyFolder({ id: "history-b" })] } },
    ]);
    const result = await loadProjectPublishHistoryLocation(baseInput);
    expect(result).toMatchObject({ ok: false, code: "duplicateHistoryFolder" });
  });

  it.each([
    ["projectId", { appProperties: appProperties(PROJECT_HISTORY_FOLDER_ROLE, { projectId: "wrong" }) }],
    ["role", { appProperties: appProperties("wrongRole") }],
    ["MIME", { mimeType: "application/json" }],
    ["parent", { parents: ["wrong-parent"] }],
    ["name", { name: "renamed-history" }],
  ])("rejects invalid history %s", async (_label, override) => {
    installFetchQueue([{ type: "json", body: { files: [historyFolder(override)] } }]);
    const result = await loadProjectPublishHistoryLocation(baseInput);
    expect(result).toMatchObject({ ok: false, code: "invalidHistoryFolder" });
  });

  it("rejects a missing revisions folder", async () => {
    installFetchQueue([
      { type: "json", body: { files: [historyFolder()] } },
      { type: "json", body: { files: [] } },
    ]);
    const result = await loadProjectPublishHistoryLocation(baseInput);
    expect(result).toMatchObject({ ok: false, code: "invalidRevisionsFolder" });
  });

  it("rejects duplicate revisions folders", async () => {
    installFetchQueue([
      { type: "json", body: { files: [historyFolder()] } },
      {
        type: "json",
        body: {
          files: [
            revisionsFolder(),
            revisionsFolder({ id: "revisions-b" }),
          ],
        },
      },
    ]);
    const result = await loadProjectPublishHistoryLocation(baseInput);
    expect(result).toMatchObject({ ok: false, code: "duplicateRevisionsFolder" });
  });

  it("sanitizes Drive discovery failures", async () => {
    installFetchQueue([{ type: "json", body: {}, ok: false }]);
    const result = await loadProjectPublishHistoryLocation(baseInput);
    expect(result).toMatchObject({ ok: false, code: "driveReadFailed" });
    expect(JSON.stringify(result)).not.toContain(TOKEN_FIXTURE);
    expect(JSON.stringify(result)).not.toContain(PROJECT_FOLDER_ID);
  });
});

describe("revision metadata list", () => {
  it("returns an empty list without loading bodies", async () => {
    const fetchMock = installFetchQueue(
      queueReadyLocation([{ type: "json", body: { files: [] } }]),
    );
    const result = await listProjectPublishRevisions(baseInput);
    expect(result).toMatchObject({ ok: true, status: "ready", items: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sorts metadata by publishedAt descending", async () => {
    const newer = revisionFile({});
    const older = revisionFile({
      revisionId: OLDER_REVISION_ID,
      id: "revision-file-b",
      publishedAt: "2026-07-11T12:34:56.789Z",
    });
    installFetchQueue(queueReadyLocation([{ type: "json", body: { files: [older, newer] } }]));
    const result = await listProjectPublishRevisions(baseInput);
    expect(result.ok && result.status === "ready" ? result.items.map((item) => item.revisionId) : []).toEqual([
      REVISION_ID,
      OLDER_REVISION_ID,
    ]);
  });

  it("sorts offset datetimes by instant rather than text", async () => {
    const later = revisionFile({
      publishedAt: "2026-07-12T09:00:00-04:00",
    });
    const earlier = revisionFile({
      revisionId: OLDER_REVISION_ID,
      id: "revision-file-b",
      publishedAt: "2026-07-12T12:00:00Z",
    });
    installFetchQueue(queueReadyLocation([{ type: "json", body: { files: [earlier, later] } }]));
    const result = await listProjectPublishRevisions(baseInput);
    expect(result.ok && result.status === "ready" ? result.items[0].revisionId : null).toBe(
      REVISION_ID,
    );
  });

  it("applies the requested limit", async () => {
    installFetchQueue(
      queueReadyLocation([
        {
          type: "json",
          body: {
            files: [
              revisionFile({}),
              revisionFile({ revisionId: OLDER_REVISION_ID, id: "revision-file-b" }),
            ],
          },
        },
      ]),
    );
    const result = await listProjectPublishRevisions({ ...baseInput, limit: 1 });
    expect(result.ok && result.status === "ready" ? result.items : []).toHaveLength(1);
  });

  it("supports pagination", async () => {
    installFetchQueue(
      queueReadyLocation([
        { type: "json", body: { files: [revisionFile({})], nextPageToken: "page-b" } },
        {
          type: "json",
          body: {
            files: [revisionFile({ revisionId: OLDER_REVISION_ID, id: "revision-file-b" })],
          },
        },
      ]),
    );
    const result = await listProjectPublishRevisions(baseInput);
    expect(result.ok && result.status === "ready" ? result.items : []).toHaveLength(2);
  });

  it("marks duplicate revision IDs invalid without choosing one", async () => {
    installFetchQueue(
      queueReadyLocation([
        {
          type: "json",
          body: { files: [revisionFile({}), revisionFile({ id: "revision-file-b" })] },
        },
      ]),
    );
    const result = await listProjectPublishRevisions(baseInput);
    expect(result).toMatchObject({ ok: true, duplicateRevisionIdCount: 1 });
    if (result.ok && result.status === "ready") {
      expect(result.items.every((item) => item.metadataStatus === "invalid")).toBe(true);
    }
  });

  it("counts role-less JSON as ignored", async () => {
    const roleless = revisionFile({
      override: { appProperties: {} },
      id: "ignored-file",
    });
    installFetchQueue(queueReadyLocation([{ type: "json", body: { files: [roleless] } }]));
    const result = await listProjectPublishRevisions(baseInput);
    expect(result).toMatchObject({ ok: true, ignoredFileCount: 1 });
  });

  it("counts an explicit wrong role as invalid metadata", async () => {
    const wrongRole = revisionFile({
      propertiesOverride: { role: "wrongRole" },
    });
    installFetchQueue(queueReadyLocation([{ type: "json", body: { files: [wrongRole] } }]));
    const result = await listProjectPublishRevisions(baseInput);
    expect(result).toMatchObject({ ok: true, invalidMetadataCount: 1, ignoredFileCount: 0 });
  });

  it.each([
    ["missing revisionId", { propertiesOverride: { revisionId: "" } }],
    ["schemaVersion", { propertiesOverride: { schemaVersion: "2" } }],
    ["operation", { operation: "replace" }],
    ["publishedAt", { publishedAt: "not-a-date" }],
    ["filename", { override: { name: "renamed.json" } }],
    ["MIME", { override: { mimeType: "text/plain" } }],
    ["parent", { override: { parents: ["wrong-parent"] } }],
  ])("counts invalid %s metadata", async (_label, change) => {
    installFetchQueue(
      queueReadyLocation([{ type: "json", body: { files: [revisionFile(change)] } }]),
    );
    const result = await listProjectPublishRevisions(baseInput);
    expect(result).toMatchObject({ ok: true, invalidMetadataCount: 1 });
  });

  it("does not expose raw Drive file IDs", async () => {
    installFetchQueue(
      queueReadyLocation([{ type: "json", body: { files: [revisionFile({})] } }]),
    );
    const result = await listProjectPublishRevisions(baseInput);
    expect(JSON.stringify(result)).not.toContain(REVISION_FILE_ID);
    expect(JSON.stringify(result)).not.toContain(REVISIONS_FOLDER_ID);
    expect(JSON.stringify(result)).not.toContain(TOKEN_FIXTURE);
  });
});

describe("revision detail loader", () => {
  function detailQueue(revision: ProjectPublishRevision, file = revisionFile({})) {
    return queueReadyLocation([
      { type: "json", body: { files: [file] } },
      { type: "text", body: JSON.stringify(revision) },
    ]);
  }

  it.each(["publish", "rollback"] as const)("loads a valid %s revision", async (operation) => {
    const revision = buildRevision(operation);
    const file = revisionFile({ operation });
    installFetchQueue(detailQueue(revision, file));
    const result = await loadProjectPublishRevision({ ...baseInput, revisionId: REVISION_ID });
    expect(result).toMatchObject({ ok: true, revision: { operation } });
  });

  it("returns notFound", async () => {
    installFetchQueue(queueReadyLocation([{ type: "json", body: { files: [] } }]));
    const result = await loadProjectPublishRevision({ ...baseInput, revisionId: REVISION_ID });
    expect(result).toMatchObject({ ok: false, code: "notFound" });
  });

  it("returns duplicateRevision without reading a body", async () => {
    installFetchQueue(
      queueReadyLocation([
        {
          type: "json",
          body: { files: [revisionFile({}), revisionFile({ id: "revision-file-b" })] },
        },
      ]),
    );
    const result = await loadProjectPublishRevision({ ...baseInput, revisionId: REVISION_ID });
    expect(result).toMatchObject({ ok: false, code: "duplicateRevision" });
  });

  it("rejects invalid JSON", async () => {
    installFetchQueue(
      queueReadyLocation([
        { type: "json", body: { files: [revisionFile({})] } },
        { type: "text", body: "{" },
      ]),
    );
    const result = await loadProjectPublishRevision({ ...baseInput, revisionId: REVISION_ID });
    expect(result).toMatchObject({ ok: false, code: "invalidJson" });
  });

  it("returns sanitized schema validation errors", async () => {
    const invalid = { ...buildRevision(), schemaVersion: 2 };
    installFetchQueue(detailQueue(invalid as unknown as ProjectPublishRevision));
    const result = await loadProjectPublishRevision({ ...baseInput, revisionId: REVISION_ID });
    expect(result).toMatchObject({ ok: false, code: "invalidRevision" });
    expect(JSON.stringify(result)).not.toContain(REVISION_FILE_ID);
  });

  it.each([
    ["projectId", (revision: Record<string, unknown>) => {
      const otherProjectId = "99999999-9999-4999-8999-999999999999";
      revision.projectId = otherProjectId;
      const manifest = revision.manifest as ProjectPublishRevision["manifest"];
      manifest.projectId = otherProjectId;
      revision.sourceManifestCanonicalHash = getProjectManifestCanonicalHash(manifest);
    }],
    ["revisionId", (revision: Record<string, unknown>) => {
      revision.revisionId = OLDER_REVISION_ID;
      revision.previousRevisionId = null;
    }],
    ["operation", (revision: Record<string, unknown>) => { revision.operation = "rollback"; revision.restoredFromRevisionId = OLDER_REVISION_ID; }],
    ["publishedAt", (revision: Record<string, unknown>) => { revision.publishedAt = "2026-07-11T12:34:56.789Z"; }],
  ])("rejects metadata/body %s mismatch", async (_label, mutate) => {
    const revision = buildRevision() as unknown as Record<string, unknown>;
    mutate(revision);
    installFetchQueue(detailQueue(revision as unknown as ProjectPublishRevision));
    const result = await loadProjectPublishRevision({ ...baseInput, revisionId: REVISION_ID });
    expect(result).toMatchObject({ ok: false, code: "metadataBodyMismatch" });
  });

  it("rejects metadata schema mismatch before reading the body", async () => {
    installFetchQueue(
      queueReadyLocation([
        {
          type: "json",
          body: { files: [revisionFile({ propertiesOverride: { schemaVersion: "2" } })] },
        },
      ]),
    );
    const result = await loadProjectPublishRevision({ ...baseInput, revisionId: REVISION_ID });
    expect(result).toMatchObject({ ok: false, code: "invalidMetadata" });
  });

  it("sanitizes body read failures and emits no console output", async () => {
    const consoleSpy = vi.spyOn(console, "error");
    installFetchQueue(
      queueReadyLocation([
        { type: "json", body: { files: [revisionFile({})] } },
        { type: "text", body: "raw-sensitive-error", ok: false },
      ]),
    );
    const result = await loadProjectPublishRevision({ ...baseInput, revisionId: REVISION_ID });
    expect(result).toMatchObject({ ok: false, code: "driveReadFailed" });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("raw-sensitive-error");
    expect(serialized).not.toContain(TOKEN_FIXTURE);
    expect(serialized).not.toContain(REVISION_FILE_ID);
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
