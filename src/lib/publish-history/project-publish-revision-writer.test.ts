import { describe, expect, it, vi } from "vitest";
import type { ProjectManifest } from "../google-drive";
import type {
  ProjectPublishRevisionDriveItem,
  ProjectPublishRevisionWriteAdapter,
} from "./project-publish-drive-adapter";
import {
  getProjectManifestCanonicalHash,
  getProjectPublishRevisionCanonicalHash,
  stringifyProjectPublishRevisionCanonical,
  type ProjectPublishRevision,
} from "./project-publish-revision";
import {
  buildProjectPublishRevisionAppProperties,
  buildProjectPublishWritePlan,
  type ProjectPublishWritePlan,
} from "./project-publish-write-plan";
import {
  prepareProjectPublishRevisionInDrive,
  prepareProjectPublishRevisionWithAdapter,
  type PrepareProjectPublishRevisionErrorCode,
} from "./project-publish-revision-writer";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_FOLDER_ID = "project-folder-internal-a";
const HISTORY_FOLDER_ID = "history-folder-internal-a";
const REVISIONS_FOLDER_ID = "revisions-folder-internal-a";
const REVISION_FILE_ID = "revision-file-internal-a";
const REVISION_ID = "rev_20260713T123456789Z_ab12cd34";
const OPERATION_ID = "pubop_20260713T123300000Z_1234abcd";
const TOKEN_FIXTURE = "token-fixture-must-not-leak";

function buildManifest(): ProjectManifest {
  return {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: "Writer fixture",
    slides: [],
    createdAt: "2026-07-13T12:00:00.000Z",
    updatedAt: "2026-07-13T12:30:00.000Z",
  };
}

function buildRevision(): ProjectPublishRevision {
  const manifest = buildManifest();
  return {
    schemaVersion: 1,
    revisionId: REVISION_ID,
    projectId: PROJECT_ID,
    publishedAt: "2026-07-13T12:34:56.789Z",
    operation: "publish",
    sourceManifestModifiedTime: "2026-07-13T12:30:00.000Z",
    sourceManifestCanonicalHash: getProjectManifestCanonicalHash(manifest),
    previousRevisionId: null,
    summary: { slideCount: 0, assetCount: 0, remoteOnlyAssetCount: 0 },
    assets: [],
    manifest,
  };
}

function buildPlan(): ProjectPublishWritePlan {
  const revision = buildRevision();
  return buildProjectPublishWritePlan({
    operationId: OPERATION_ID,
    workspaceId: WORKSPACE_ID,
    checkedAt: "2026-07-13T12:33:00.000Z",
    historyStatus: { status: "notConfigured" },
    expectedCurrent: {
      manifestModifiedTime: "2026-07-13T12:30:00.000Z",
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

function buildAdapter(plan = buildPlan()): ProjectPublishRevisionWriteAdapter {
  return {
    findProjectFolders: vi.fn(async () => [projectFolder()]),
    findHistoryFolders: vi.fn(async () => [historyFolder()]),
    createHistoryFolder: vi.fn(async () => undefined),
    findRevisionsFolders: vi.fn(async () => [revisionsFolder()]),
    createRevisionsFolder: vi.fn(async () => undefined),
    findRevisionFiles: vi
      .fn<() => Promise<ProjectPublishRevisionDriveItem[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([revisionFile(plan)]),
    createRevisionFile: vi.fn(async () => undefined),
    readRevisionFile: vi.fn(async () => plan.revisionFile.canonicalBody),
  };
}

async function expectCode(
  code: PrepareProjectPublishRevisionErrorCode,
  input: {
    plan?: ProjectPublishWritePlan;
    adapter?: ProjectPublishRevisionWriteAdapter;
    signal?: AbortSignal;
  } = {},
) {
  const plan = input.plan ?? buildPlan();
  const result = await prepareProjectPublishRevisionWithAdapter(
    { plan, signal: input.signal },
    input.adapter ?? buildAdapter(plan),
  );
  expect(result).toMatchObject({ ok: false, code });
  return result;
}

function resealRevision(plan: ProjectPublishWritePlan) {
  plan.revisionFile.canonicalBody = stringifyProjectPublishRevisionCanonical(
    plan.revisionFile.body,
  );
  plan.revisionFile.canonicalHash = getProjectPublishRevisionCanonicalHash(
    plan.revisionFile.body,
  );
  plan.revisionFile.appProperties = buildProjectPublishRevisionAppProperties({
    workspaceId: plan.workspaceId,
    revision: plan.revisionFile.body,
  });
}

describe("write plan validation", () => {
  it("accepts a valid plan", async () => {
    const plan = buildPlan();
    const result = await prepareProjectPublishRevisionWithAdapter(
      { plan },
      buildAdapter(plan),
    );
    expect(result).toMatchObject({ ok: true, status: "created", verified: true });
  });

  it.each([
    ["operation ID", (plan: ProjectPublishWritePlan) => { plan.operationId = "bad"; }],
    ["revision ID", (plan: ProjectPublishWritePlan) => { plan.revisionFile.revisionId = "bad"; }],
    ["filename", (plan: ProjectPublishWritePlan) => { plan.revisionFile.filename = "other.json"; }],
    ["canonical body", (plan: ProjectPublishWritePlan) => { plan.revisionFile.canonicalBody += " "; }],
    ["canonical hash", (plan: ProjectPublishWritePlan) => { plan.revisionFile.canonicalHash = "fnv1a64:0000000000000000"; }],
    ["appProperties", (plan: ProjectPublishWritePlan) => { plan.revisionFile.appProperties.role = "other"; }],
    ["project ID", (plan: ProjectPublishWritePlan) => { plan.projectId = "33333333-3333-4333-8333-333333333333"; }],
    ["workspace ID", (plan: ProjectPublishWritePlan) => { plan.workspaceId = "33333333-3333-4333-8333-333333333333"; }],
    ["publication operation", (plan: ProjectPublishWritePlan) => { plan.currentManifestUpdate.publication.operationId = "bad"; }],
    ["step order", (plan: ProjectPublishWritePlan) => { [plan.steps[0], plan.steps[1]] = [plan.steps[1], plan.steps[0]]; }],
  ])("rejects invalid %s before adapter access", async (_label, mutate) => {
    const plan = buildPlan();
    mutate(plan);
    const adapter = buildAdapter(plan);
    await expectCode("invalidWritePlan", { plan, adapter });
    expect(adapter.findProjectFolders).not.toHaveBeenCalled();
  });

  it("rejects rollback content in the publish preparation executor", async () => {
    const plan = buildPlan();
    plan.revisionFile.body.operation = "rollback";
    plan.revisionFile.body.restoredFromRevisionId =
      "rev_20260712T123456789Z_cd34ef56";
    resealRevision(plan);
    await expectCode("invalidWritePlan", { plan });
  });

  it("rejects a schema-invalid revision even when canonical fields are resealed", async () => {
    const plan = buildPlan();
    plan.revisionFile.body.manifest.title = "";
    resealRevision(plan);
    await expectCode("invalidWritePlan", { plan });
  });
});

describe("project and folder resolution", () => {
  it("returns projectFolderNotFound for zero project candidates", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findProjectFolders).mockResolvedValue([]);
    await expectCode("projectFolderNotFound", { adapter });
  });

  it("rejects duplicate project candidates", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findProjectFolders).mockResolvedValue([
      projectFolder(),
      projectFolder({ id: "project-folder-internal-b" }),
    ]);
    await expectCode("duplicateProjectFolder", { adapter });
  });

  it.each([
    ["name", { name: "other" }],
    ["MIME", { mimeType: "application/json" }],
    ["trashed", { trashed: true }],
    ["app", { appProperties: appProperties("projectRoot", { app: "other" }) }],
    ["role", { appProperties: appProperties("other") }],
    ["schema", { appProperties: appProperties("projectRoot", { schemaVersion: "2" }) }],
    ["workspace", { appProperties: appProperties("projectRoot", { workspaceId: "other" }) }],
    ["project", { appProperties: appProperties("projectRoot", { projectId: "other" }) }],
  ])("rejects invalid project %s metadata", async (_label, override) => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findProjectFolders).mockResolvedValue([
      projectFolder(override),
    ]);
    await expectCode("invalidProjectFolder", { adapter });
  });

  it("reuses valid history and revisions folders", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    const result = await prepareProjectPublishRevisionWithAdapter({ plan }, adapter);
    expect(result.ok).toBe(true);
    expect(adapter.createHistoryFolder).not.toHaveBeenCalled();
    expect(adapter.createRevisionsFolder).not.toHaveBeenCalled();
  });

  it("creates and re-verifies both missing folders", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    vi.mocked(adapter.findHistoryFolders)
      .mockResolvedValueOnce([])
      .mockResolvedValue([historyFolder()]);
    vi.mocked(adapter.findRevisionsFolders)
      .mockResolvedValueOnce([])
      .mockResolvedValue([revisionsFolder()]);
    const result = await prepareProjectPublishRevisionWithAdapter({ plan }, adapter);
    expect(result.ok).toBe(true);
    expect(adapter.createHistoryFolder).toHaveBeenCalledOnce();
    expect(adapter.createRevisionsFolder).toHaveBeenCalledOnce();
  });

  it("creates only revisions when history already exists", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    vi.mocked(adapter.findRevisionsFolders)
      .mockResolvedValueOnce([])
      .mockResolvedValue([revisionsFolder()]);
    await prepareProjectPublishRevisionWithAdapter({ plan }, adapter);
    expect(adapter.createHistoryFolder).not.toHaveBeenCalled();
    expect(adapter.createRevisionsFolder).toHaveBeenCalledOnce();
  });

  it("rejects duplicate existing history folders", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findHistoryFolders).mockResolvedValue([
      historyFolder(),
      historyFolder({ id: "history-folder-internal-b" }),
    ]);
    await expectCode("duplicateHistoryFolder", { adapter });
  });

  it("rejects invalid existing history metadata", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findHistoryFolders).mockResolvedValue([
      historyFolder({ parents: ["wrong-parent"] }),
    ]);
    await expectCode("invalidHistoryFolder", { adapter });
  });

  it("does not create missing history when the plan did not authorize ensure", async () => {
    const plan = buildPlan();
    plan.folders.ensureHistoryFolder = false;
    const adapter = buildAdapter(plan);
    vi.mocked(adapter.findHistoryFolders).mockResolvedValue([]);
    await expectCode("invalidHistoryFolder", { plan, adapter });
    expect(adapter.createHistoryFolder).not.toHaveBeenCalled();
  });

  it("maps history create failure without exposing the raw error", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findHistoryFolders).mockResolvedValue([]);
    vi.mocked(adapter.createHistoryFolder).mockRejectedValue(
      new Error("raw secret failure"),
    );
    const result = await expectCode("historyFolderCreateFailed", { adapter });
    expect(JSON.stringify(result)).not.toContain("raw secret failure");
  });

  it("fails when created history cannot be found", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findHistoryFolders).mockResolvedValue([]);
    await expectCode("historyFolderVerificationFailed", { adapter });
  });

  it("stops on concurrent duplicate history creation", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findHistoryFolders)
      .mockResolvedValueOnce([])
      .mockResolvedValue([historyFolder(), historyFolder({ id: "history-b" })]);
    await expectCode("duplicateHistoryFolder", { adapter });
  });

  it("rejects duplicate existing revisions folders", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findRevisionsFolders).mockResolvedValue([
      revisionsFolder(),
      revisionsFolder({ id: "revisions-folder-internal-b" }),
    ]);
    await expectCode("duplicateRevisionsFolder", { adapter });
  });

  it("rejects invalid existing revisions metadata", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findRevisionsFolders).mockResolvedValue([
      revisionsFolder({ mimeType: "application/json" }),
    ]);
    await expectCode("invalidRevisionsFolder", { adapter });
  });

  it("maps revisions create failure", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findRevisionsFolders).mockResolvedValue([]);
    vi.mocked(adapter.createRevisionsFolder).mockRejectedValue(new Error("raw"));
    await expectCode("revisionsFolderCreateFailed", { adapter });
  });

  it("fails when created revisions folder is invalid", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findRevisionsFolders)
      .mockResolvedValueOnce([])
      .mockResolvedValue([revisionsFolder({ name: "wrong" })]);
    await expectCode("revisionsFolderVerificationFailed", { adapter });
  });

  it("stops on concurrent duplicate revisions folder creation", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findRevisionsFolders)
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        revisionsFolder(),
        revisionsFolder({ id: "revisions-folder-internal-b" }),
      ]);
    await expectCode("duplicateRevisionsFolder", { adapter });
  });
});

describe("revision idempotency and read-back verification", () => {
  it("returns created after immutable create and read-back", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    const result = await prepareProjectPublishRevisionWithAdapter({ plan }, adapter);
    expect(result).toEqual({
      ok: true,
      status: "created",
      revisionId: REVISION_ID,
      operationId: OPERATION_ID,
      initialPublish: true,
      verified: true,
    });
    expect(adapter.createRevisionFile).toHaveBeenCalledOnce();
  });

  it("returns alreadyPrepared for one identical existing revision", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    vi.mocked(adapter.findRevisionFiles).mockReset().mockResolvedValue([
      revisionFile(plan),
    ]);
    const result = await prepareProjectPublishRevisionWithAdapter({ plan }, adapter);
    expect(result).toMatchObject({ ok: true, status: "alreadyPrepared" });
    expect(adapter.createRevisionFile).not.toHaveBeenCalled();
  });

  it("returns revisionConflict for a different existing body", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    vi.mocked(adapter.findRevisionFiles).mockReset().mockResolvedValue([
      revisionFile(plan),
    ]);
    vi.mocked(adapter.readRevisionFile).mockResolvedValue("{}");
    await expectCode("revisionConflict", { plan, adapter });
    expect(adapter.createRevisionFile).not.toHaveBeenCalled();
  });

  it.each([
    ["filename", { name: "other.json" }],
    ["MIME", { mimeType: "text/plain" }],
    ["parent", { parents: ["wrong-parent"] }],
    ["metadata", { appProperties: appProperties("projectPublishRevision") }],
    ["trashed", { trashed: true }],
  ])("treats existing revision %s mismatch as conflict", async (_label, override) => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    vi.mocked(adapter.findRevisionFiles).mockReset().mockResolvedValue([
      revisionFile(plan, override),
    ]);
    await expectCode("revisionConflict", { plan, adapter });
  });

  it("rejects duplicate revision IDs", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    vi.mocked(adapter.findRevisionFiles).mockReset().mockResolvedValue([
      revisionFile(plan),
      revisionFile(plan, { id: "revision-file-internal-b" }),
    ]);
    await expectCode("duplicateRevision", { plan, adapter });
  });

  it("maps an existing revision read failure", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    vi.mocked(adapter.findRevisionFiles).mockReset().mockResolvedValue([
      revisionFile(plan),
    ]);
    vi.mocked(adapter.readRevisionFile).mockRejectedValue(new Error("raw read"));
    await expectCode("revisionReadFailed", { plan, adapter });
  });

  it("maps an immutable revision create failure", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.createRevisionFile).mockRejectedValue(new Error("raw create"));
    await expectCode("revisionCreateFailed", { adapter });
  });

  it("fails read-back when the created revision cannot be found", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findRevisionFiles).mockReset().mockResolvedValue([]);
    await expectCode("revisionVerificationFailed", { adapter });
  });

  it("stops when concurrent create produces duplicate revisions", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    vi.mocked(adapter.findRevisionFiles)
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        revisionFile(plan),
        revisionFile(plan, { id: "revision-file-internal-b" }),
      ]);
    await expectCode("duplicateRevision", { plan, adapter });
  });

  it.each([
    ["invalid JSON", "{"],
    ["schema-invalid JSON", "{}"],
    ["different canonical body", JSON.stringify({ ...buildRevision(), publishedAt: "2026-07-14T12:34:56.789Z" })],
  ])("fails created revision verification for %s", async (_label, text) => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    vi.mocked(adapter.readRevisionFile).mockResolvedValue(text);
    await expectCode("revisionVerificationFailed", { plan, adapter });
  });

  it("fails read-back for created metadata mismatch", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    vi.mocked(adapter.findRevisionFiles)
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValue([revisionFile(plan, { name: "wrong.json" })]);
    await expectCode("revisionVerificationFailed", { plan, adapter });
  });

  it("maps created revision read failure as verification failure", async () => {
    const plan = buildPlan();
    const adapter = buildAdapter(plan);
    vi.mocked(adapter.readRevisionFile).mockRejectedValue(new Error("raw read"));
    await expectCode("revisionVerificationFailed", { plan, adapter });
  });
});

describe("cancellation, immutability, and result sanitization", () => {
  it("aborts before the first adapter call", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = buildAdapter();
    await expectCode("aborted", { adapter, signal: controller.signal });
    expect(adapter.findProjectFolders).not.toHaveBeenCalled();
  });

  it("does not start history creation after abort", async () => {
    const controller = new AbortController();
    const adapter = buildAdapter();
    vi.mocked(adapter.findHistoryFolders).mockImplementation(async () => {
      controller.abort();
      return [];
    });
    await expectCode("aborted", { adapter, signal: controller.signal });
    expect(adapter.createHistoryFolder).not.toHaveBeenCalled();
  });

  it("does not start revision creation after abort", async () => {
    const controller = new AbortController();
    const adapter = buildAdapter();
    vi.mocked(adapter.findRevisionFiles).mockReset().mockImplementation(async () => {
      controller.abort();
      return [];
    });
    await expectCode("aborted", { adapter, signal: controller.signal });
    expect(adapter.createRevisionFile).not.toHaveBeenCalled();
  });

  it("does not read back after abort during create", async () => {
    const controller = new AbortController();
    const adapter = buildAdapter();
    vi.mocked(adapter.createRevisionFile).mockImplementation(async () => {
      controller.abort();
    });
    await expectCode("aborted", { adapter, signal: controller.signal });
    expect(adapter.readRevisionFile).not.toHaveBeenCalled();
  });

  it("maps an adapter AbortError without returning the exception", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.findProjectFolders).mockRejectedValue(
      new DOMException("sensitive abort detail", "AbortError"),
    );
    const result = await expectCode("aborted", { adapter });
    expect(JSON.stringify(result)).not.toContain("sensitive abort detail");
  });

  it("has no adapter update or delete operation", () => {
    const keys = Object.keys(buildAdapter());
    expect(keys.some((key) => /update|delete/i.test(key))).toBe(false);
  });

  it("does not mutate the write plan", async () => {
    const plan = buildPlan();
    const before = structuredClone(plan);
    await prepareProjectPublishRevisionWithAdapter({ plan }, buildAdapter(plan));
    expect(plan).toEqual(before);
  });

  it("never includes token, Drive IDs, URLs, or raw errors in a failure result", async () => {
    const adapter = buildAdapter();
    vi.mocked(adapter.createRevisionFile).mockRejectedValue(
      new Error(`${TOKEN_FIXTURE} ${REVISION_FILE_ID} https://example.invalid/upload`),
    );
    const result = await expectCode("revisionCreateFailed", { adapter });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TOKEN_FIXTURE);
    expect(serialized).not.toContain(REVISION_FILE_ID);
    expect(serialized).not.toContain(HISTORY_FOLDER_ID);
    expect(serialized).not.toContain(REVISIONS_FOLDER_ID);
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("example.invalid");
  });

  it("returns a sanitized failure for an empty access token", async () => {
    const result = await prepareProjectPublishRevisionInDrive({
      accessToken: "",
      plan: buildPlan(),
    });
    expect(result).toMatchObject({ ok: false, code: "driveWriteFailed" });
    expect(JSON.stringify(result)).not.toContain("accessToken");
  });

  it("does not write to console", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await prepareProjectPublishRevisionWithAdapter(
      { plan: buildPlan() },
      buildAdapter(),
    );
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
  });
});
