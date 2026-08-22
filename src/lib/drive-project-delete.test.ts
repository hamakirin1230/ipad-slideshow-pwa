import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDriveProjectDeleteOwner,
  executeDriveProjectDeletion,
  prepareDriveProjectDeletion,
} from "./drive-project-delete";
import {
  buildDriveProjectIndexJsonWithoutProject,
  DriveApiError,
  DriveProjectDeleteRequestError,
  preflightDriveProjectDeletion,
  trashDriveProjectRootFolder,
  verifyDriveProjectIndexAfterRemoval,
  type DriveFileCandidate,
  type DriveProjectDeletePreflightReady,
  type DriveProjectSummary,
} from "./google-drive";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ACCESS_TOKEN = "access-token-project-delete-fixture";
const INDEX_FILE_ID = "index-file-id-fixture";
const PROJECTS_ROOT_ID = "projects-root-id-fixture";
const CREATED_AT = "2026-08-22T00:00:00.000Z";
const UPDATED_AT = "2026-08-22T01:00:00.000Z";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

const PROJECT: DriveProjectSummary = {
  projectId: PROJECT_ID,
  title: "削除対象",
  projectFolderId: "project-folder-id-fixture",
  manifestFileId: "manifest-file-id-fixture",
  assetsFolderId: "assets-folder-id-fixture",
  manifestPath: `projects/${PROJECT_ID}/manifest.json`,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

const OTHER_PROJECT: DriveProjectSummary = {
  projectId: OTHER_PROJECT_ID,
  title: "残す作品",
  projectFolderId: "other-project-folder-id-fixture",
  manifestFileId: "other-manifest-file-id-fixture",
  assetsFolderId: "other-assets-folder-id-fixture",
  manifestPath: `projects/${OTHER_PROJECT_ID}/manifest.json`,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

const OWNER = buildDriveProjectDeleteOwner({
  workspaceId: WORKSPACE_ID,
  indexJsonFileId: INDEX_FILE_ID,
  projectsRootFolderId: PROJECTS_ROOT_ID,
  project: PROJECT,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preflightDriveProjectDeletion", () => {
  it("accepts a fresh matching index, project root, manifest, and assets folder", async () => {
    const fetchMock = mockPreflightFetch();
    const result = await runPreflight();

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.project).toEqual(PROJECT);
    expect(result.remainingProjects).toEqual([OTHER_PROJECT]);
    expect(fetchMock).toHaveBeenCalled();
    expect(recordedMethods(fetchMock)).toEqual([
      "GET",
      "GET",
      "GET",
      "GET",
      "GET",
      "GET",
    ]);
    expect(recordedMethods(fetchMock)).not.toContain("PATCH");
    expect(recordedMethods(fetchMock)).not.toContain("DELETE");
  });

  it("blocks when the target project is missing from fresh index and does not write", async () => {
    const fetchMock = mockPreflightFetch({
      projects: [OTHER_PROJECT],
    });
    const result = await runPreflight();

    expect(result).toMatchObject({
      status: "blocked",
      reason: "projectNotFoundInIndex",
    });
    expect(recordedMethods(fetchMock)).toEqual(["GET"]);
    expect(recordedUrls(fetchMock).every((url) => url.includes("alt=media"))).toBe(
      true,
    );
  });

  it("blocks duplicate active project roots before any write", async () => {
    const fetchMock = mockPreflightFetch({
      activeRoots: [
        projectRootMetadata(),
        projectRootMetadata({ id: "duplicate-root-id-fixture" }),
      ],
    });
    const result = await runPreflight();

    expect(result).toMatchObject({
      status: "blocked",
      reason: "duplicateProjectRoot",
    });
    expect(recordedMethods(fetchMock)).not.toContain("PATCH");
    expect(recordedMethods(fetchMock)).not.toContain("DELETE");
  });

  it("blocks when the current project summary does not match fresh index", async () => {
    mockPreflightFetch();
    const result = await runPreflight({
      ...PROJECT,
      title: "別タイトル",
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "indexMismatch",
    });
  });

  it("blocks project root metadata mismatch", async () => {
    mockPreflightFetch({
      projectRoot: projectRootMetadata({
        appProperties: projectAppProperties("projectRoot", { role: "assetsRoot" }),
      }),
    });
    const result = await runPreflight();

    expect(result).toMatchObject({
      status: "blocked",
      reason: "projectRootMetadataMismatch",
    });
  });

  it("blocks a project root with the wrong parent", async () => {
    mockPreflightFetch({
      projectRoot: projectRootMetadata({ parents: ["other-parent"] }),
    });
    const result = await runPreflight();

    expect(result).toMatchObject({
      status: "blocked",
      reason: "projectRootWrongParent",
    });
  });

  it("blocks an already trashed project root", async () => {
    mockPreflightFetch({
      projectRoot: projectRootMetadata({ trashed: true }),
    });
    const result = await runPreflight();

    expect(result).toMatchObject({
      status: "blocked",
      reason: "projectRootTrashed",
    });
  });

  it("blocks manifest metadata mismatch", async () => {
    mockPreflightFetch({
      manifest: manifestMetadata({
        appProperties: projectAppProperties("projectManifest", {
          role: "projectRoot",
        }),
      }),
    });
    const result = await runPreflight();

    expect(result).toMatchObject({
      status: "blocked",
      reason: "manifestMetadataMismatch",
    });
  });

  it("blocks manifest content mismatch", async () => {
    mockPreflightFetch({
      manifestBody: {
        ...manifestBody(),
        title: "別の本文タイトル",
      },
    });
    const result = await runPreflight();

    expect(result).toMatchObject({
      status: "blocked",
      reason: "manifestContentMismatch",
    });
  });

  it("blocks assets folder metadata mismatch", async () => {
    mockPreflightFetch({
      assets: assetsMetadata({
        appProperties: projectAppProperties("assetsRoot", { role: "projectRoot" }),
      }),
    });
    const result = await runPreflight();

    expect(result).toMatchObject({
      status: "blocked",
      reason: "assetsFolderMetadataMismatch",
    });
  });

  it("preserves DriveApiError for 401 and 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    await expect(runPreflight()).rejects.toBeInstanceOf(DriveApiError);
    await expect(runPreflight()).rejects.toMatchObject({ status: 401 });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    await expect(runPreflight()).rejects.toMatchObject({
      name: "DriveApiError",
      status: 403,
    });
  });
});

describe("buildDriveProjectIndexJsonWithoutProject", () => {
  it("removes only the target project and keeps the other project summary", () => {
    const result = buildDriveProjectIndexJsonWithoutProject({
      indexJsonText: indexJsonText([PROJECT, OTHER_PROJECT]),
      expectedWorkspaceId: WORKSPACE_ID,
      removedProject: PROJECT,
      expectedRemainingProjects: [OTHER_PROJECT],
      indexUpdatedAt: "2026-08-22T02:00:00.000Z",
    });

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;

    const parsed = JSON.parse(result.indexJsonText) as {
      projects: DriveProjectSummary[];
    };
    expect(parsed.projects).toEqual([OTHER_PROJECT]);
    expect(parsed.projects).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ projectId: PROJECT_ID })]),
    );
  });
});

describe("verifyDriveProjectIndexAfterRemoval", () => {
  it("accepts an index that dropped only the target project", () => {
    const result = verifyDriveProjectIndexAfterRemoval({
      indexJsonText: indexJsonText([OTHER_PROJECT]),
      expectedWorkspaceId: WORKSPACE_ID,
      removedProjectId: PROJECT_ID,
      expectedRemainingProjects: [OTHER_PROJECT],
    });

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.remainingProjects).toEqual([OTHER_PROJECT]);
  });

  it("rejects an index that still contains the target or mutated another project", () => {
    expect(
      verifyDriveProjectIndexAfterRemoval({
        indexJsonText: indexJsonText([PROJECT, OTHER_PROJECT]),
        expectedWorkspaceId: WORKSPACE_ID,
        removedProjectId: PROJECT_ID,
        expectedRemainingProjects: [OTHER_PROJECT],
      }).status,
    ).toBe("invalid");

    expect(
      verifyDriveProjectIndexAfterRemoval({
        indexJsonText: indexJsonText([
          { ...OTHER_PROJECT, title: "書き換え" },
        ]),
        expectedWorkspaceId: WORKSPACE_ID,
        removedProjectId: PROJECT_ID,
        expectedRemainingProjects: [OTHER_PROJECT],
      }).status,
    ).toBe("invalid");
  });
});

describe("trashDriveProjectRootFolder", () => {
  it("uses PATCH with trashed true and never DELETE", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: PROJECT.projectFolderId, trashed: true }), {
          status: 200,
        }),
    );

    const result = await trashDriveProjectRootFolder({
      accessToken: ACCESS_TOKEN,
      projectFolderId: PROJECT.projectFolderId,
      signal: new AbortController().signal,
      fetchImpl,
    });

    expect(result).toEqual({ status: "patched", trashed: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      `${DRIVE_FILES_URL}/${PROJECT.projectFolderId}?fields=id%2Ctrashed`,
    );
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ trashed: true }),
    });
    expect(fetchImpl.mock.calls[0][1]?.method).not.toBe("DELETE");
  });

  it("does not retry a rejected trash PATCH", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));

    await expect(
      trashDriveProjectRootFolder({
        accessToken: ACCESS_TOKEN,
        projectFolderId: PROJECT.projectFolderId,
        signal: new AbortController().signal,
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(DriveProjectDeleteRequestError);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("returns unconfirmed for an ambiguous network error without retrying", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(
      trashDriveProjectRootFolder({
        accessToken: ACCESS_TOKEN,
        projectFolderId: PROJECT.projectFolderId,
        signal: new AbortController().signal,
        fetchImpl,
      }),
    ).resolves.toEqual({ status: "unconfirmed" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("keeps DriveApiError for 401 and 403", async () => {
    await expect(
      trashDriveProjectRootFolder({
        accessToken: ACCESS_TOKEN,
        projectFolderId: PROJECT.projectFolderId,
        signal: new AbortController().signal,
        fetchImpl: async () => new Response(null, { status: 401 }),
      }),
    ).rejects.toMatchObject({ name: "DriveApiError", status: 401 });

    await expect(
      trashDriveProjectRootFolder({
        accessToken: ACCESS_TOKEN,
        projectFolderId: PROJECT.projectFolderId,
        signal: new AbortController().signal,
        fetchImpl: async () => new Response(null, { status: 403 }),
      }),
    ).rejects.toMatchObject({ name: "DriveApiError", status: 403 });
  });
});

describe("prepareDriveProjectDeletion", () => {
  it("keeps identifiers in the plan but not in the review", async () => {
    mockPreflightFetch();
    const preflight = await runPreflight();
    const prepared = prepareDriveProjectDeletion({
      preflightResult: preflight,
      currentOwner: OWNER,
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(JSON.stringify(prepared.plan)).toContain(PROJECT.projectFolderId);
    const serializedReview = JSON.stringify(prepared.review);
    expect(serializedReview).toContain("削除対象");
    expect(serializedReview).not.toContain(ACCESS_TOKEN);
    expect(serializedReview).not.toContain(PROJECT.projectFolderId);
    expect(serializedReview).not.toContain(INDEX_FILE_ID);
    expect(serializedReview).not.toContain(DRIVE_FILES_URL);
  });
});

describe("executeDriveProjectDeletion", () => {
  it("writes index without the target, then trashes the project root", async () => {
    const ready = await readyPreflight();
    const prepared = prepareFromReady(ready);
    const deps = successfulExecuteDeps(ready);

    const result = await executeDriveProjectDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      now: () => "2026-08-22T03:00:00.000Z",
      ...deps,
    });

    expect(result).toMatchObject({
      status: "completed",
      indexRemoved: true,
      projectRootTrashed: true,
    });
    expect(deps.writeIndexJson).toHaveBeenCalledOnce();
    const written = JSON.parse(deps.writeIndexJson.mock.calls[0][0]) as {
      projects: DriveProjectSummary[];
    };
    expect(written.projects).toEqual([OTHER_PROJECT]);
    expect(deps.trashProjectRoot).toHaveBeenCalledOnce();
    expect(deps.readProjectRootMetadata).toHaveBeenCalledOnce();
    expect(deps.listActiveProjectRoots).toHaveBeenCalledOnce();
  });

  it("blocks before write when the index changed after prepare", async () => {
    const ready = await readyPreflight();
    const prepared = prepareFromReady(ready);
    const changed = {
      ...ready,
      indexFingerprint: "changed-index",
      indexJsonText: indexJsonText([
        { ...PROJECT, updatedAt: "2026-08-22T09:00:00.000Z" },
        OTHER_PROJECT,
      ]),
    };
    const deps = successfulExecuteDeps(ready);
    deps.runFreshPreflight.mockResolvedValueOnce(changed);

    const result = await executeDriveProjectDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      ...deps,
    });

    expect(result).toMatchObject({
      status: "blocked",
      blockedReason: "planStale",
      indexRemoved: false,
      projectRootTrashed: false,
    });
    expect(deps.writeIndexJson).not.toHaveBeenCalled();
    expect(deps.trashProjectRoot).not.toHaveBeenCalled();
  });

  it("blocks before write when project metadata changed after prepare", async () => {
    const ready = await readyPreflight();
    const prepared = prepareFromReady(ready);
    const changed = {
      ...ready,
      projectRootFingerprint: "changed-root",
    };
    const deps = successfulExecuteDeps(changed);

    const result = await executeDriveProjectDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      ...deps,
    });

    expect(result.status).toBe("blocked");
    expect(deps.writeIndexJson).not.toHaveBeenCalled();
    expect(deps.trashProjectRoot).not.toHaveBeenCalled();
  });

  it("does not trash when index write fails", async () => {
    const ready = await readyPreflight();
    const prepared = prepareFromReady(ready);
    const deps = successfulExecuteDeps(ready);
    deps.writeIndexJson.mockRejectedValueOnce(new Error("write failed"));

    const result = await executeDriveProjectDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      ...deps,
    });

    expect(result).toMatchObject({
      status: "failed",
      indexRemoved: false,
      projectRootTrashed: false,
    });
    expect(deps.trashProjectRoot).not.toHaveBeenCalled();
  });

  it("does not trash when index post verification fails", async () => {
    const ready = await readyPreflight();
    const prepared = prepareFromReady(ready);
    const deps = successfulExecuteDeps(ready);
    deps.readIndexJson.mockResolvedValueOnce(indexJsonText([PROJECT, OTHER_PROJECT]));

    const result = await executeDriveProjectDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      ...deps,
    });

    expect(result).toMatchObject({
      status: "failed",
      indexRemoved: false,
      projectRootTrashed: false,
    });
    expect(deps.trashProjectRoot).not.toHaveBeenCalled();
  });

  it("returns partialFailure when trash fails after verified index removal", async () => {
    const ready = await readyPreflight();
    const prepared = prepareFromReady(ready);
    const deps = successfulExecuteDeps(ready);
    deps.trashProjectRoot.mockRejectedValueOnce(
      new DriveProjectDeleteRequestError("trashRejected"),
    );

    const result = await executeDriveProjectDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      ...deps,
    });

    expect(result).toMatchObject({
      status: "partialFailure",
      indexRemoved: true,
      projectRootTrashed: false,
    });
    expect(deps.trashProjectRoot).toHaveBeenCalledOnce();
    expect(deps.readProjectRootMetadata).not.toHaveBeenCalled();
  });

  it("does not complete when trash is unconfirmed and fresh metadata is not trashed", async () => {
    const ready = await readyPreflight();
    const prepared = prepareFromReady(ready);
    const deps = successfulExecuteDeps(ready);
    deps.trashProjectRoot.mockResolvedValueOnce({ status: "unconfirmed" });
    deps.readProjectRootMetadata.mockResolvedValueOnce(
      projectRootCandidate({ trashed: false }),
    );

    const result = await executeDriveProjectDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      ...deps,
    });

    expect(result).toMatchObject({
      status: "partialFailure",
      indexRemoved: true,
      projectRootTrashed: false,
    });
    expect(deps.trashProjectRoot).toHaveBeenCalledOnce();
  });

  it("does not complete when an active project root remains after trash", async () => {
    const ready = await readyPreflight();
    const prepared = prepareFromReady(ready);
    const deps = successfulExecuteDeps(ready);
    deps.listActiveProjectRoots.mockResolvedValueOnce([
      projectRootCandidate({ trashed: false }),
    ]);

    const result = await executeDriveProjectDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      ...deps,
    });

    expect(result).toMatchObject({
      status: "partialFailure",
      indexRemoved: true,
      projectRootTrashed: true,
    });
    expect(result.status).not.toBe("completed");
  });

  it("rethrows DriveApiError 401/403 from execute preflight", async () => {
    const ready = await readyPreflight();
    const prepared = prepareFromReady(ready);
    const deps = successfulExecuteDeps(ready);
    deps.runFreshPreflight.mockRejectedValueOnce(new DriveApiError(401));

    await expect(
      executeDriveProjectDeletion({
        plan: prepared.plan,
        currentOwner: OWNER,
        ...deps,
      }),
    ).rejects.toMatchObject({ name: "DriveApiError", status: 401 });
    expect(deps.writeIndexJson).not.toHaveBeenCalled();
  });

  it("does not put token, raw URL, or raw API response into result diagnostics", async () => {
    const ready = await readyPreflight();
    const prepared = prepareFromReady(ready);
    const deps = successfulExecuteDeps(ready);
    deps.writeIndexJson.mockRejectedValueOnce(
      new Error(`${ACCESS_TOKEN} ${DRIVE_FILES_URL} {"error":{"message":"raw"}}`),
    );

    const result = await executeDriveProjectDeletion({
      plan: prepared.plan,
      currentOwner: OWNER,
      ...deps,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain(DRIVE_FILES_URL);
    expect(serialized).not.toContain("raw");
    expect(serialized).not.toContain(PROJECT.projectFolderId);
  });
});

async function runPreflight(project: DriveProjectSummary = PROJECT) {
  return preflightDriveProjectDeletion({
    accessToken: ACCESS_TOKEN,
    workspaceId: WORKSPACE_ID,
    indexJsonFileId: INDEX_FILE_ID,
    projectsRootFolderId: PROJECTS_ROOT_ID,
    project,
    signal: new AbortController().signal,
  });
}

async function readyPreflight(): Promise<DriveProjectDeletePreflightReady> {
  mockPreflightFetch();
  const result = await runPreflight();
  if (result.status !== "ready") {
    throw new Error("test preflight was not ready");
  }
  return result;
}

function prepareFromReady(ready: DriveProjectDeletePreflightReady) {
  const prepared = prepareDriveProjectDeletion({
    preflightResult: ready,
    currentOwner: OWNER,
  });
  if (!prepared.ok) {
    throw new Error("test plan preparation failed");
  }
  return prepared;
}

function successfulExecuteDeps(ready: DriveProjectDeletePreflightReady) {
  const nextIndex = buildDriveProjectIndexJsonWithoutProject({
    indexJsonText: ready.indexJsonText,
    expectedWorkspaceId: WORKSPACE_ID,
    removedProject: PROJECT,
    expectedRemainingProjects: [OTHER_PROJECT],
    indexUpdatedAt: "2026-08-22T03:00:00.000Z",
  });
  if (nextIndex.status !== "valid") {
    throw new Error("test next index was invalid");
  }

  return {
    runFreshPreflight: vi.fn(async () => ready),
    writeIndexJson: vi.fn(async () => undefined),
    readIndexJson: vi.fn(async () => nextIndex.indexJsonText),
    trashProjectRoot: vi.fn(async () => ({
      status: "patched" as const,
      trashed: true,
    })),
    readProjectRootMetadata: vi.fn(async () =>
      projectRootCandidate({ trashed: true }),
    ),
    listActiveProjectRoots: vi.fn(async () => []),
  };
}

function mockPreflightFetch(input: {
  projects?: DriveProjectSummary[];
  projectRoot?: ReturnType<typeof projectRootMetadata>;
  manifest?: ReturnType<typeof manifestMetadata>;
  assets?: ReturnType<typeof assetsMetadata>;
  manifestBody?: ReturnType<typeof manifestBody>;
  activeRoots?: Array<ReturnType<typeof projectRootMetadata>>;
} = {}) {
  const fetchMock = vi.fn(async (request: string | URL | Request) => {
    const url = String(request);
    if (url.includes("/files?")) {
      return jsonResponse({ files: input.activeRoots ?? [projectRootMetadata()] });
    }
    if (url.includes("alt=media")) {
      if (url.includes(INDEX_FILE_ID)) {
        return textResponse(indexJsonText(input.projects ?? [PROJECT, OTHER_PROJECT]));
      }
      return jsonResponse(input.manifestBody ?? manifestBody());
    }
    if (url.includes(PROJECT.projectFolderId)) {
      return jsonResponse(input.projectRoot ?? projectRootMetadata());
    }
    if (url.includes(PROJECT.manifestFileId)) {
      return jsonResponse(input.manifest ?? manifestMetadata());
    }
    if (url.includes(PROJECT.assetsFolderId)) {
      return jsonResponse(input.assets ?? assetsMetadata());
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function recordedMethods(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((call) => {
    const init = call[1] as RequestInit | undefined;
    return init?.method ?? "GET";
  });
}

function recordedUrls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

function indexJsonText(projects: DriveProjectSummary[]) {
  return `${JSON.stringify(
    {
      app: "ipad-slideshow-pwa",
      role: "index",
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      projects,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    },
    null,
    2,
  )}\n`;
}

function manifestBody() {
  return {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: PROJECT.title,
    slides: [],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function projectAppProperties(
  role: "projectRoot" | "projectManifest" | "assetsRoot",
  override: Record<string, string> = {},
) {
  return {
    app: "ipad-slideshow-pwa",
    role,
    schemaVersion: "1",
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    ...override,
  };
}

function projectRootMetadata(
  override: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: PROJECT.projectFolderId,
    name: PROJECT_ID,
    mimeType: "application/vnd.google-apps.folder",
    createdTime: CREATED_AT,
    modifiedTime: UPDATED_AT,
    appProperties: projectAppProperties("projectRoot"),
    parents: [PROJECTS_ROOT_ID],
    trashed: false,
    ...override,
  };
}

function manifestMetadata(override: Record<string, unknown> = {}) {
  return {
    id: PROJECT.manifestFileId,
    name: "manifest.json",
    mimeType: "application/json",
    createdTime: CREATED_AT,
    modifiedTime: UPDATED_AT,
    appProperties: projectAppProperties("projectManifest"),
    parents: [PROJECT.projectFolderId],
    trashed: false,
    size: "120",
    ...override,
  };
}

function assetsMetadata(override: Record<string, unknown> = {}) {
  return {
    id: PROJECT.assetsFolderId,
    name: "assets",
    mimeType: "application/vnd.google-apps.folder",
    createdTime: CREATED_AT,
    modifiedTime: UPDATED_AT,
    appProperties: projectAppProperties("assetsRoot"),
    parents: [PROJECT.projectFolderId],
    trashed: false,
    ...override,
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function textResponse(text: string) {
  return new Response(text, { status: 200 });
}

function projectRootCandidate(
  override: Partial<DriveFileCandidate> = {},
): DriveFileCandidate {
  return {
    id: PROJECT.projectFolderId,
    name: PROJECT_ID,
    mimeType: "application/vnd.google-apps.folder",
    appProperties: projectAppProperties("projectRoot"),
    parents: [PROJECTS_ROOT_ID],
    trashed: false,
    ...override,
  };
}
