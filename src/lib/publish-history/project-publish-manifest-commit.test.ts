import { describe, expect, it, vi } from "vitest";
import type { ProjectManifest } from "../google-drive";
import type { ProjectPublishRevisionDriveItem } from "./project-publish-drive-adapter";
import type { ProjectPublishManifestCommitAdapter } from "./project-publish-manifest-commit-adapter";
import {
  commitProjectPublishManifestInDrive,
  commitProjectPublishManifestWithAdapter,
  type CommitProjectPublishManifestErrorCode,
} from "./project-publish-manifest-commit";
import {
  getProjectManifestContentCanonicalHash,
  type ProjectPublishRevision,
} from "./project-publish-revision";
import {
  buildProjectPublishWritePlan,
  type ProjectPublishWritePlan,
} from "./project-publish-write-plan";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_FOLDER_ID = "project-folder-internal-a";
const HISTORY_FOLDER_ID = "history-folder-internal-a";
const REVISIONS_FOLDER_ID = "revisions-folder-internal-a";
const REVISION_FILE_ID = "revision-file-internal-a";
const MANIFEST_FILE_ID = "manifest-file-internal-a";
const REVISION_ID = "rev_20260713T123456789Z_ab12cd34";
const OTHER_REVISION_ID = "rev_20260712T123456789Z_cd34ef56";
const OPERATION_ID = "pubop_20260713T123300000Z_1234abcd";
const OTHER_OPERATION_ID = "pubop_20260712T123300000Z_8765dcba";
const MODIFIED_TIME = "2026-07-13T12:30:00.000Z";
const TOKEN_FIXTURE = "token-fixture-must-not-leak";

function buildManifest(): ProjectManifest {
  return {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: "Commit fixture",
    slides: [
      {
        slideId: "33333333-3333-4333-8333-333333333333",
        assetId: "44444444-4444-4444-8444-444444444444",
        assetFileId: "asset-file-internal-a",
        assetName: "fixture.jpg",
        type: "image",
        mimeType: "image/jpeg",
        source: "localFile",
        sourceMimeType: "image/jpeg",
        sourceMediaItemId: "source-a",
        fileSize: 1200,
        durationSeconds: 10,
        caption: "Opening",
        createdAt: "2026-07-13T12:00:00.000Z",
        updatedAt: MODIFIED_TIME,
      },
    ],
    createdAt: "2026-07-13T12:00:00.000Z",
    updatedAt: MODIFIED_TIME,
  };
}

function buildRevision(manifest = buildManifest()): ProjectPublishRevision {
  const contentHash = getProjectManifestContentCanonicalHash(manifest);
  return {
    schemaVersion: 1,
    revisionId: REVISION_ID,
    projectId: PROJECT_ID,
    publishedAt: "2026-07-13T12:34:56.789Z",
    operation: "publish",
    sourceManifestModifiedTime: MODIFIED_TIME,
    sourceManifestCanonicalHash: contentHash,
    previousRevisionId: null,
    summary: { slideCount: 1, assetCount: 1, remoteOnlyAssetCount: 0 },
    assets: [
      {
        assetId: manifest.slides[0].assetId,
        driveFileId: manifest.slides[0].assetFileId,
        mimeType: manifest.slides[0].mimeType,
        sizeBytes: 1200,
        modifiedTime: MODIFIED_TIME,
        checksum: "fixture-checksum",
        remoteOnly: false,
      },
    ],
    manifest: structuredClone(manifest),
  };
}

function buildPlan(manifest = buildManifest()): ProjectPublishWritePlan {
  const revision = buildRevision(manifest);
  return buildProjectPublishWritePlan({
    operationId: OPERATION_ID,
    workspaceId: WORKSPACE_ID,
    checkedAt: "2026-07-13T12:33:00.000Z",
    historyStatus: { status: "ready", validRevisionCount: 0 },
    expectedCurrent: {
      manifestModifiedTime: MODIFIED_TIME,
      manifestCanonicalHash: revision.sourceManifestCanonicalHash,
      currentRevisionId: null,
    },
    revision,
  });
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

function projectFolder(
  override: Partial<ProjectPublishRevisionDriveItem> = {},
): ProjectPublishRevisionDriveItem {
  return {
    id: PROJECT_FOLDER_ID,
    name: PROJECT_ID,
    mimeType: "application/vnd.google-apps.folder",
    appProperties: appProperties("projectRoot"),
    parents: ["projects-root-internal-a"],
    trashed: false,
    ...override,
  };
}

function historyFolder(
  override: Partial<ProjectPublishRevisionDriveItem> = {},
): ProjectPublishRevisionDriveItem {
  return {
    id: HISTORY_FOLDER_ID,
    name: "history",
    mimeType: "application/vnd.google-apps.folder",
    appProperties: appProperties("projectHistory"),
    parents: [PROJECT_FOLDER_ID],
    trashed: false,
    ...override,
  };
}

function revisionsFolder(
  override: Partial<ProjectPublishRevisionDriveItem> = {},
): ProjectPublishRevisionDriveItem {
  return {
    id: REVISIONS_FOLDER_ID,
    name: "revisions",
    mimeType: "application/vnd.google-apps.folder",
    appProperties: appProperties("projectPublishRevisions"),
    parents: [HISTORY_FOLDER_ID],
    trashed: false,
    ...override,
  };
}

function revisionFile(
  plan = buildPlan(),
  override: Partial<ProjectPublishRevisionDriveItem> = {},
): ProjectPublishRevisionDriveItem {
  return {
    id: REVISION_FILE_ID,
    name: plan.revisionFile.filename,
    mimeType: "application/json",
    appProperties: { ...plan.revisionFile.appProperties },
    parents: [REVISIONS_FOLDER_ID],
    trashed: false,
    ...override,
  };
}

function manifestFile(
  override: Partial<ProjectPublishRevisionDriveItem> = {},
): ProjectPublishRevisionDriveItem {
  return {
    id: MANIFEST_FILE_ID,
    name: "manifest.json",
    mimeType: "application/json",
    modifiedTime: MODIFIED_TIME,
    appProperties: appProperties("projectManifest"),
    parents: [PROJECT_FOLDER_ID],
    trashed: false,
    ...override,
  };
}

function buildAdapter(
  plan = buildPlan(),
  initialManifest = buildManifest(),
): ProjectPublishManifestCommitAdapter {
  let currentText = JSON.stringify(initialManifest);
  return {
    findProjectFolders: vi.fn(async () => [projectFolder()]),
    findHistoryFolders: vi.fn(async () => [historyFolder()]),
    findRevisionsFolders: vi.fn(async () => [revisionsFolder()]),
    findRevisionFiles: vi.fn(async () => [revisionFile(plan)]),
    readRevisionFile: vi.fn(async () => plan.revisionFile.canonicalBody),
    findCurrentManifestFiles: vi.fn(async () => [manifestFile()]),
    readCurrentManifest: vi.fn(async () => currentText),
    updateCurrentManifest: vi.fn(async (input) => {
      currentText = input.jsonText;
    }),
  };
}

async function expectCode(
  code: CommitProjectPublishManifestErrorCode,
  input: {
    plan?: ProjectPublishWritePlan;
    adapter?: ProjectPublishManifestCommitAdapter;
    signal?: AbortSignal;
  } = {},
) {
  const plan = input.plan ?? buildPlan();
  const result = await commitProjectPublishManifestWithAdapter(
    { plan, signal: input.signal },
    input.adapter ?? buildAdapter(plan),
  );
  expect(result).toMatchObject({ ok: false, code });
  return result;
}

function committedManifest(plan: ProjectPublishWritePlan, manifest = buildManifest()) {
  return {
    ...structuredClone(manifest),
    publication: structuredClone(plan.currentManifestUpdate.publication),
  } satisfies ProjectManifest;
}

describe("successful commit", () => {
  it("rejects an invalid write plan before adapter access", async () => {
    const plan = buildPlan();
    plan.operationId = "bad";
    const adapter = buildAdapter(plan);
    await expectCode("invalidWritePlan", { plan, adapter });
    expect(adapter.findProjectFolders).not.toHaveBeenCalled();
  });

  it("commits publication metadata after all verification steps", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    await expect(
      commitProjectPublishManifestWithAdapter({ plan }, adapter),
    ).resolves.toEqual({
      ok: true,
      status: "committed",
      revisionId: REVISION_ID,
      operationId: OPERATION_ID,
      committed: true,
    });
  });

  it("updates the existing manifest exactly once", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    await commitProjectPublishManifestWithAdapter({ plan }, adapter);
    expect(adapter.updateCurrentManifest).toHaveBeenCalledOnce();
  });

  it("preserves fresh playback content and adds only publication", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    await commitProjectPublishManifestWithAdapter({ plan }, adapter);
    const update = vi.mocked(adapter.updateCurrentManifest).mock.calls[0][0];
    const body = JSON.parse(update.jsonText) as ProjectManifest;
    expect({ ...body, publication: undefined }).toEqual({
      ...buildManifest(),
      publication: undefined,
    });
    expect(body.publication).toEqual(plan.currentManifestUpdate.publication);
  });

  it("does not mutate the plan or fresh manifest fixture", async () => {
    const plan = buildPlan();
    const manifest = buildManifest();
    const beforePlan = structuredClone(plan);
    const beforeManifest = structuredClone(manifest);
    await commitProjectPublishManifestWithAdapter(
      { plan },
      buildAdapter(plan, manifest),
    );
    expect(plan).toEqual(beforePlan);
    expect(manifest).toEqual(beforeManifest);
  });

  it("adapter exposes no create, revision update, index update, or delete method", () => {
    expect(Object.keys(buildAdapter()).some((key) => /create|delete|index/i.test(key))).toBe(false);
    expect(Object.keys(buildAdapter()).filter((key) => /update/i.test(key))).toEqual([
      "updateCurrentManifest",
    ]);
  });
});

describe("prepared revision verification", () => {
  it("fails when the project folder is missing", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findProjectFolders).mockResolvedValue([]);
    await expectCode("preparedRevisionNotFound", { adapter });
  });

  it("fails when project folders are duplicated", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findProjectFolders).mockResolvedValue([
      projectFolder(),
      projectFolder({ id: "project-folder-internal-b" }),
    ]);
    await expectCode("duplicatePreparedRevision", { adapter });
  });

  it("fails for invalid project folder metadata", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findProjectFolders).mockResolvedValue([
      projectFolder({ mimeType: "application/json" }),
    ]);
    await expectCode("preparedRevisionConflict", { adapter });
  });

  it.each([
    ["history", "findHistoryFolders"],
    ["revisions", "findRevisionsFolders"],
    ["revision", "findRevisionFiles"],
  ] as const)("fails when prepared %s is missing", async (_label, key) => {
    const adapter = buildAdapter();
    vi.mocked(adapter[key]).mockResolvedValue([]);
    await expectCode("preparedRevisionNotFound", { adapter });
  });

  it.each([
    ["history", "findHistoryFolders", historyFolder({ id: "history-b" })],
    ["revisions", "findRevisionsFolders", revisionsFolder({ id: "revisions-b" })],
    ["revision", "findRevisionFiles", revisionFile(buildPlan(), { id: "revision-b" })],
  ] as const)("fails when prepared %s is duplicated", async (_label, key, duplicate) => {
    const adapter = buildAdapter();
    const first =
      key === "findHistoryFolders"
        ? historyFolder()
        : key === "findRevisionsFolders"
          ? revisionsFolder()
          : revisionFile();
    vi.mocked(adapter[key]).mockResolvedValue([first, duplicate]);
    await expectCode("duplicatePreparedRevision", { adapter });
  });

  it.each([
    ["history name", "findHistoryFolders", historyFolder({ name: "wrong" })],
    ["history parent", "findHistoryFolders", historyFolder({ parents: ["wrong"] })],
    ["revisions role", "findRevisionsFolders", revisionsFolder({ appProperties: appProperties("wrong") })],
    ["revision filename", "findRevisionFiles", revisionFile(buildPlan(), { name: "wrong.json" })],
    ["revision MIME", "findRevisionFiles", revisionFile(buildPlan(), { mimeType: "text/plain" })],
    ["revision parent", "findRevisionFiles", revisionFile(buildPlan(), { parents: ["wrong"] })],
    ["revision metadata", "findRevisionFiles", revisionFile(buildPlan(), { appProperties: appProperties("projectPublishRevision") })],
    ["revision trashed", "findRevisionFiles", revisionFile(buildPlan(), { trashed: true })],
  ] as const)("rejects prepared %s mismatch", async (_label, key, file) => {
    const adapter = buildAdapter();
    vi.mocked(adapter[key]).mockResolvedValue([file]);
    await expectCode("preparedRevisionConflict", { adapter });
  });

  it.each([
    ["invalid JSON", "{"],
    ["invalid schema", "{}"],
    ["different body", JSON.stringify({ ...buildRevision(), publishedAt: "2026-07-14T12:34:56.789Z" })],
  ])("rejects prepared revision %s", async (_label, text) => {
    const adapter = buildAdapter();
    vi.mocked(adapter.readRevisionFile).mockResolvedValue(text);
    await expectCode("preparedRevisionConflict", { adapter });
  });

  it("maps prepared revision read failure without raw error", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.readRevisionFile).mockRejectedValue(new Error("raw revision"));
    const result = await expectCode("driveReadFailed", { adapter });
    expect(JSON.stringify(result)).not.toContain("raw revision");
  });

  it("accepts one fully matching prepared revision", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    const result = await commitProjectPublishManifestWithAdapter({ plan }, adapter);
    expect(result.ok).toBe(true);
    expect(adapter.readRevisionFile).toHaveBeenCalledOnce();
  });
});

describe("current manifest validation and concurrency", () => {
  it("fails when current manifest is missing", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findCurrentManifestFiles).mockResolvedValue([]);
    await expectCode("currentManifestNotFound", { adapter });
  });

  it("fails when current manifests are duplicated", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findCurrentManifestFiles).mockResolvedValue([
      manifestFile(),
      manifestFile({ id: "manifest-file-internal-b" }),
    ]);
    await expectCode("duplicateCurrentManifest", { adapter });
  });

  it.each([
    ["name", { name: "wrong.json" }],
    ["MIME", { mimeType: "text/plain" }],
    ["parent", { parents: ["wrong"] }],
    ["trashed", { trashed: true }],
    ["modifiedTime", { modifiedTime: undefined }],
    ["app", { appProperties: appProperties("projectManifest", { app: "wrong" }) }],
    ["role", { appProperties: appProperties("wrong") }],
    ["schema", { appProperties: appProperties("projectManifest", { schemaVersion: "2" }) }],
    ["workspace", { appProperties: appProperties("projectManifest", { workspaceId: "wrong" }) }],
    ["project", { appProperties: appProperties("projectManifest", { projectId: "wrong" }) }],
  ])("rejects invalid current manifest %s metadata", async (_label, override) => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findCurrentManifestFiles).mockResolvedValue([
      manifestFile(override),
    ]);
    await expectCode("invalidCurrentManifestMetadata", { adapter });
  });

  it("maps current manifest read failure", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.readCurrentManifest).mockRejectedValue(new Error("raw read"));
    await expectCode("currentManifestReadFailed", { adapter });
  });

  it.each([
    ["invalid JSON", "{"],
    ["invalid schema", "{}"],
    ["wrong project", JSON.stringify({ ...buildManifest(), projectId: "33333333-3333-4333-8333-333333333333" })],
  ])("rejects %s current manifest", async (_label, text) => {
    const adapter = buildAdapter();
    vi.mocked(adapter.readCurrentManifest).mockResolvedValue(text);
    await expectCode("currentManifestInvalid", { adapter });
  });

  it("blocks modifiedTime changes before update", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findCurrentManifestFiles).mockResolvedValue([
      manifestFile({ modifiedTime: "2026-07-13T12:31:00.000Z" }),
    ]);
    await expectCode("currentManifestModified", { adapter });
    expect(adapter.updateCurrentManifest).not.toHaveBeenCalled();
  });

  it("blocks playback content changes before update", async () => {
    const adapter = buildAdapter();
    const changed = buildManifest();
    changed.slides[0].caption = "Changed";
    vi.mocked(adapter.readCurrentManifest).mockResolvedValue(JSON.stringify(changed));
    await expectCode("currentManifestContentChanged", { adapter });
    expect(adapter.updateCurrentManifest).not.toHaveBeenCalled();
  });

  it("blocks current revision changes before update", async () => {
    const plan = buildPlan();
    const current = buildManifest();
    current.publication = {
      ...plan.currentManifestUpdate.publication,
      currentRevisionId: OTHER_REVISION_ID,
      operationId: OTHER_OPERATION_ID,
    };
    const adapter = buildAdapter(plan, current);
    await expectCode("currentRevisionChanged", { plan, adapter });
  });

  it("accepts publication absence when expected revision is null", async () => {
    const plan = buildPlan();
    const result = await commitProjectPublishManifestWithAdapter(
      { plan },
      buildAdapter(plan),
    );
    expect(result.ok).toBe(true);
  });
});

describe("idempotent retry and publication conflicts", () => {
  it("returns alreadyCommitted for the exact target publication and content", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan, committedManifest(plan));
    const result = await commitProjectPublishManifestWithAdapter({ plan }, adapter);
    expect(result).toMatchObject({ ok: true, status: "alreadyCommitted" });
    expect(adapter.updateCurrentManifest).not.toHaveBeenCalled();
  });

  it("conflicts when target revision is the same but operation differs", async () => {
    const plan = buildPlan();
    const current = committedManifest(plan);
    if (current.publication) current.publication.operationId = OTHER_OPERATION_ID;
    await expectCode("publicationConflict", {
      plan,
      adapter: buildAdapter(plan, current),
    });
  });

  it("conflicts when operation ID is the same but revision differs", async () => {
    const plan = buildPlan();
    const current = committedManifest(plan);
    if (current.publication) current.publication.currentRevisionId = OTHER_REVISION_ID;
    await expectCode("publicationConflict", {
      plan,
      adapter: buildAdapter(plan, current),
    });
  });

  it("conflicts when target publication hash differs", async () => {
    const plan = buildPlan();
    const current = committedManifest(plan);
    if (current.publication) current.publication.contentCanonicalHash = "fnv1a64:0000000000000000";
    await expectCode("publicationConflict", {
      plan,
      adapter: buildAdapter(plan, current),
    });
  });

  it("conflicts when exact publication points at changed playback content", async () => {
    const plan = buildPlan();
    const current = committedManifest(plan);
    current.slides[0].caption = "Changed after commit";
    await expectCode("publicationConflict", {
      plan,
      adapter: buildAdapter(plan, current),
    });
  });
});

describe("update and read-back failures", () => {
  it("maps update failure and does not retry automatically", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.updateCurrentManifest).mockRejectedValue(new Error("raw update"));
    await expectCode("currentManifestUpdateFailed", { adapter });
    expect(adapter.updateCurrentManifest).toHaveBeenCalledOnce();
  });

  it("fails when post-update manifest disappears", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findCurrentManifestFiles)
      .mockResolvedValueOnce([manifestFile()])
      .mockResolvedValue([]);
    await expectCode("currentManifestVerificationFailed", { adapter });
  });

  it("fails when post-update manifest is replaced", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findCurrentManifestFiles)
      .mockResolvedValueOnce([manifestFile()])
      .mockResolvedValue([manifestFile({ id: "manifest-file-internal-b" })]);
    await expectCode("currentManifestVerificationFailed", { adapter });
  });

  it.each([
    ["invalid JSON", "{"],
    ["invalid publication", JSON.stringify({ ...buildManifest(), publication: {} })],
  ])("fails post-update read-back for %s", async (_label, text) => {
    const adapter = buildAdapter();
    vi.mocked(adapter.readCurrentManifest)
      .mockResolvedValueOnce(JSON.stringify(buildManifest()))
      .mockResolvedValue(text);
    await expectCode("currentManifestVerificationFailed", { adapter });
  });

  it.each([
    ["revision ID", { currentRevisionId: OTHER_REVISION_ID }],
    ["operation ID", { operationId: OTHER_OPERATION_ID }],
    ["publishedAt", { publishedAt: "2026-07-14T12:34:56.789Z" }],
    ["content hash", { contentCanonicalHash: "fnv1a64:0000000000000000" }],
  ])("fails post-update %s mismatch", async (_label, publicationOverride) => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    vi.mocked(adapter.readCurrentManifest)
      .mockResolvedValueOnce(JSON.stringify(buildManifest()))
      .mockResolvedValue(
        JSON.stringify({
          ...buildManifest(),
          publication: {
            ...plan.currentManifestUpdate.publication,
            ...publicationOverride,
          },
        }),
      );
    await expectCode("currentManifestVerificationFailed", { plan, adapter });
  });

  it("does not rollback or delete after read-back failure", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.readCurrentManifest)
      .mockResolvedValueOnce(JSON.stringify(buildManifest()))
      .mockResolvedValue("{");
    await expectCode("currentManifestVerificationFailed", { adapter });
    expect(Object.keys(adapter).some((key) => /rollback|delete/i.test(key))).toBe(false);
    expect(adapter.updateCurrentManifest).toHaveBeenCalledOnce();
  });
});

describe("abort and sanitization", () => {
  it("aborts before revision verification", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = buildAdapter();
    await expectCode("aborted", { adapter, signal: controller.signal });
    expect(adapter.findProjectFolders).not.toHaveBeenCalled();
  });

  it.each([
    ["revision read", "readRevisionFile"],
    ["manifest find", "findCurrentManifestFiles"],
    ["manifest read", "readCurrentManifest"],
    ["manifest update", "updateCurrentManifest"],
  ] as const)("stops after abort during %s", async (_label, key) => {
    const controller = new AbortController();
    const adapter = buildAdapter();
    if (key === "readRevisionFile") {
      vi.mocked(adapter.readRevisionFile).mockImplementation(async () => {
        controller.abort();
        return buildPlan().revisionFile.canonicalBody;
      });
    } else if (key === "findCurrentManifestFiles") {
      vi.mocked(adapter.findCurrentManifestFiles).mockImplementation(async () => {
        controller.abort();
        return [manifestFile()];
      });
    } else if (key === "readCurrentManifest") {
      vi.mocked(adapter.readCurrentManifest).mockImplementation(async () => {
        controller.abort();
        return JSON.stringify(buildManifest());
      });
    } else {
      vi.mocked(adapter.updateCurrentManifest).mockImplementation(async () => {
        controller.abort();
      });
    }
    await expectCode("aborted", { adapter, signal: controller.signal });
  });

  it("returns a sanitized AbortError", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findProjectFolders).mockRejectedValue(
      new DOMException("raw abort", "AbortError"),
    );
    const result = await expectCode("aborted", { adapter });
    expect(JSON.stringify(result)).not.toContain("raw abort");
  });

  it("returns no token, Drive ID, URL, raw body, or raw exception", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.updateCurrentManifest).mockRejectedValue(
      new Error(`${TOKEN_FIXTURE} ${MANIFEST_FILE_ID} https://example.invalid raw-body`),
    );
    const serialized = JSON.stringify(
      await expectCode("currentManifestUpdateFailed", { adapter }),
    );
    for (const forbidden of [
      TOKEN_FIXTURE,
      MANIFEST_FILE_ID,
      REVISION_FILE_ID,
      HISTORY_FOLDER_ID,
      "https://",
      "raw-body",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("returns sanitized failure for empty token", async () => {
    const result = await commitProjectPublishManifestInDrive({
      accessToken: "",
      plan: buildPlan(),
    });
    expect(result).toMatchObject({ ok: false, code: "driveReadFailed" });
    expect(JSON.stringify(result)).not.toContain("accessToken");
  });

  it("does not write to console", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await commitProjectPublishManifestWithAdapter(
      { plan: buildPlan() },
      buildAdapter(),
    );
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
  });
});
