import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  createDriveProject,
  DriveProjectCreateError,
  DriveProjectTitleUpdateError,
  updateDriveProjectTitle,
  validateIndexJsonProjects,
  type DriveProjectSummary,
  type DriveWorkspaceReadyContext,
} from "./google-drive";
import {
  DUPLICATE_PROJECT_TITLE_MESSAGE,
  hasConflictingProjectTitle,
  normalizeProjectTitleForComparison,
} from "./project-title-uniqueness";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const CREATED_AT = "2026-08-22T00:00:00.000Z";
const UPDATED_AT = "2026-08-22T01:00:00.000Z";

const PROJECT: DriveProjectSummary = {
  projectId: PROJECT_ID,
  title: "Demo",
  projectFolderId: "project-folder-id-fixture",
  manifestFileId: "manifest-file-id-fixture",
  assetsFolderId: "assets-folder-id-fixture",
  manifestPath: `projects/${PROJECT_ID}/manifest.json`,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

const OTHER_PROJECT: DriveProjectSummary = {
  projectId: OTHER_PROJECT_ID,
  title: "Album B",
  projectFolderId: "other-project-folder-id-fixture",
  manifestFileId: "other-manifest-file-id-fixture",
  assetsFolderId: "other-assets-folder-id-fixture",
  manifestPath: `projects/${OTHER_PROJECT_ID}/manifest.json`,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

const READY_CONTEXT: DriveWorkspaceReadyContext = {
  workspaceId: WORKSPACE_ID,
  workspaceRootFolderId: "workspace-root-id-fixture",
  workspaceJsonFileId: "workspace-json-id-fixture",
  indexJsonFileId: "index-file-id-fixture",
  projectsRootFolderId: "projects-root-id-fixture",
  indexJsonText: "",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("project title comparison", () => {
  it("treats trim and ASCII case as the same title", () => {
    expect(normalizeProjectTitleForComparison(" Demo ")).toBe("demo");
    expect(normalizeProjectTitleForComparison("DEMO")).toBe("demo");
    expect(normalizeProjectTitleForComparison("Demo　")).toBe("demo");
    expect(
      hasConflictingProjectTitle({
        title: " demo",
        projects: [PROJECT],
      }),
    ).toBe(true);
  });

  it("allows a different title and ignores the current project on rename", () => {
    expect(
      hasConflictingProjectTitle({
        title: "Album B",
        projects: [PROJECT],
      }),
    ).toBe(false);
    expect(
      hasConflictingProjectTitle({
        title: "demo",
        projects: [PROJECT, OTHER_PROJECT],
        ignoreProjectId: PROJECT_ID,
      }),
    ).toBe(false);
    expect(
      hasConflictingProjectTitle({
        title: "Demo",
        projects: [PROJECT, OTHER_PROJECT],
        ignoreProjectId: OTHER_PROJECT_ID,
      }),
    ).toBe(true);
  });
});

describe("createDriveProject title uniqueness", () => {
  it.each([
    ["Demo", "exact same title"],
    ["DEMO", "ASCII case"],
  ])("rejects %s before any Drive write (%s)", async (title) => {
    const fetchMock = stubIndexRead([PROJECT]);

    await expect(
      createDriveProject({
        accessToken: "access-token",
        readyContext: READY_CONTEXT,
        title,
        runStep: (operation) => operation(new AbortController().signal),
      }),
    ).rejects.toMatchObject({
      name: "DriveProjectCreateError",
      status: "duplicateTitle",
    });

    expect(recordedMethods(fetchMock).every((method) => method === "GET")).toBe(
      true,
    );
    expect(recordedMethods(fetchMock)).not.toContain("POST");
    expect(recordedMethods(fetchMock)).not.toContain("PATCH");
  });

  it("rejects exact duplicate and does not create Drive files", async () => {
    const fetchMock = stubIndexRead([PROJECT]);

    try {
      await createDriveProject({
        accessToken: "access-token",
        readyContext: READY_CONTEXT,
        title: "Demo",
        runStep: (operation) => operation(new AbortController().signal),
      });
      throw new Error("expected duplicateTitle");
    } catch (error) {
      expect(error).toBeInstanceOf(DriveProjectCreateError);
      if (!(error instanceof DriveProjectCreateError)) {
        return;
      }
      expect(error.status).toBe("duplicateTitle");
      expect(error.diagnostics).toContain(DUPLICATE_PROJECT_TITLE_MESSAGE);
      expect(error.diagnostics.join("\n")).not.toContain(PROJECT_ID);
      expect(error.diagnostics.join("\n")).not.toContain("project-folder");
      expect(error.projectId).toBeNull();
      expect(error.possibleChangedItems).toEqual([]);
    }

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(recordedMethods(fetchMock)).toEqual(["GET"]);
  });

  it("does not treat a different title as a conflict at uniqueness check", () => {
    expect(
      hasConflictingProjectTitle({
        title: "Album B",
        projects: [PROJECT],
      }),
    ).toBe(false);
  });

  it("lets a different title proceed past uniqueness to Drive write", async () => {
    const fetchMock = stubIndexRead([PROJECT]);

    await expect(
      createDriveProject({
        accessToken: "access-token",
        readyContext: READY_CONTEXT,
        title: "Album B",
        runStep: (operation) => operation(new AbortController().signal),
      }),
    ).rejects.toBeInstanceOf(DriveProjectCreateError);

    expect(recordedMethods(fetchMock)).toContain("POST");
  });
});

describe("updateDriveProjectTitle uniqueness", () => {
  it("rejects another project's title before Drive write", async () => {
    const fetchMock = stubRenameReads({
      projects: [PROJECT, OTHER_PROJECT],
    });

    try {
      await updateDriveProjectTitle({
        accessToken: "access-token",
        workspaceId: WORKSPACE_ID,
        indexJsonFileId: READY_CONTEXT.indexJsonFileId,
        projectsRootFolderId: READY_CONTEXT.projectsRootFolderId,
        project: PROJECT,
        title: "Album B",
        runStep: (operation) => operation(new AbortController().signal),
      });
      throw new Error("expected duplicateTitle");
    } catch (error) {
      expect(error).toBeInstanceOf(DriveProjectTitleUpdateError);
      if (!(error instanceof DriveProjectTitleUpdateError)) {
        return;
      }
      expect(error.status).toBe("duplicateTitle");
      expect(error.diagnostics).toContain(DUPLICATE_PROJECT_TITLE_MESSAGE);
      expect(error.diagnostics.join("\n")).not.toContain(OTHER_PROJECT_ID);
      expect(error.possibleChangedItems).toEqual([]);
    }

    expect(recordedMethods(fetchMock).every((method) => method === "GET")).toBe(
      true,
    );
    expect(recordedMethods(fetchMock)).not.toContain("PATCH");
    expect(recordedMethods(fetchMock)).not.toContain("POST");
  });

  it.each(["album b", "ALBUM B"])(
    "rejects case variants of another title (%s)",
    async (title) => {
      stubRenameReads({
        projects: [PROJECT, OTHER_PROJECT],
      });

      await expect(
        updateDriveProjectTitle({
          accessToken: "access-token",
          workspaceId: WORKSPACE_ID,
          indexJsonFileId: READY_CONTEXT.indexJsonFileId,
          projectsRootFolderId: READY_CONTEXT.projectsRootFolderId,
          project: PROJECT,
          title,
          runStep: (operation) => operation(new AbortController().signal),
        }),
      ).rejects.toMatchObject({ status: "duplicateTitle" });
    },
  );

  it("rejects whitespace variants before Drive write using the shared comparison", () => {
    expect(
      hasConflictingProjectTitle({
        title: " Album B ",
        projects: [PROJECT, OTHER_PROJECT],
        ignoreProjectId: PROJECT_ID,
      }),
    ).toBe(true);
  });

  it("allows keeping the current project's own title", () => {
    expect(
      hasConflictingProjectTitle({
        title: "Demo",
        projects: [PROJECT, OTHER_PROJECT],
        ignoreProjectId: PROJECT_ID,
      }),
    ).toBe(false);
    expect(
      hasConflictingProjectTitle({
        title: "demo",
        projects: [PROJECT, OTHER_PROJECT],
        ignoreProjectId: PROJECT_ID,
      }),
    ).toBe(false);
  });

  it("does not reject a self-title rename as duplicateTitle", async () => {
    stubRenameReads({
      projects: [PROJECT, OTHER_PROJECT],
    });

    await expect(
      updateDriveProjectTitle({
        accessToken: "access-token",
        workspaceId: WORKSPACE_ID,
        indexJsonFileId: READY_CONTEXT.indexJsonFileId,
        projectsRootFolderId: READY_CONTEXT.projectsRootFolderId,
        project: PROJECT,
        title: "Demo",
        runStep: (operation) => operation(new AbortController().signal),
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof DriveProjectTitleUpdateError &&
        error.status !== "duplicateTitle"
      );
    });
  });
});

describe("existing duplicate titles remain readable", () => {
  it("keeps index.json readable when two projects already share a title", () => {
    const duplicate = { ...OTHER_PROJECT, title: "Demo" };
    const result = validateIndexJsonProjects(
      indexJsonText([PROJECT, duplicate]),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.projects).toHaveLength(2);
    expect(result.projects.map((project) => project.title)).toEqual([
      "Demo",
      "Demo",
    ]);
  });
});

describe("title uniqueness wiring", () => {
  it("checks uniqueness before Drive writes in create and rename", () => {
    const drive = readFileSync(new URL("./google-drive.ts", import.meta.url), "utf8");
    const providers = readFileSync(
      new URL("../app/app-providers.tsx", import.meta.url),
      "utf8",
    );
    const create = drive.slice(
      drive.indexOf("export async function createDriveProject("),
      drive.indexOf("async function createProjectRootFolder("),
    );
    const rename = drive.slice(
      drive.indexOf("export async function updateDriveProjectTitle("),
      drive.indexOf("export async function updateDriveProjectSlideCaption("),
    );

    expect(create).toContain("hasConflictingProjectTitle");
    expect(create.indexOf("hasConflictingProjectTitle")).toBeLessThan(
      create.indexOf("crypto.randomUUID()"),
    );
    expect(rename).toContain("hasConflictingProjectTitle");
    expect(rename.indexOf("hasConflictingProjectTitle")).toBeLessThan(
      rename.indexOf("updateDriveMultipartJsonFileContent("),
    );
    expect(providers).toContain("DUPLICATE_PROJECT_TITLE_MESSAGE");
    expect(providers).toContain('error.status === "duplicateTitle"');
    const createProject = providers.slice(
      providers.indexOf("async function createProject("),
      providers.indexOf("async function registerDriveVideoPlaybackSession("),
    );
    const renameProject = providers.slice(
      providers.indexOf("async function updateSelectedProjectTitle("),
      providers.indexOf("async function updateProjectSlideCaption("),
    );
    expect(createProject.indexOf("normalizeProjectTitleInput")).toBeLessThan(
      createProject.indexOf("createDriveProject"),
    );
    expect(renameProject.indexOf("normalizeProjectTitleInput")).toBeLessThan(
      renameProject.indexOf("updateDriveProjectTitle"),
    );
    expect(createProject).toContain("DUPLICATE_PROJECT_TITLE_MESSAGE");
    expect(renameProject).toContain("DUPLICATE_PROJECT_TITLE_MESSAGE");
    expect(createProject).not.toContain(PROJECT_ID);
    expect(renameProject).not.toContain(PROJECT_ID);
    const panel = readFileSync(
      new URL("../app/admin/project-status-panel.tsx", import.meta.url),
      "utf8",
    );
    expect(panel).toContain("<ProjectTitleDuplicateAlert projectMessage={projectMessage} />");
    expect(panel).toContain('role="alert"');
    expect(panel).not.toContain("window.alert");
  });
});

function stubIndexRead(projects: DriveProjectSummary[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    expect(url).toContain("/drive/v3/files/");
    return new Response(indexJsonText(projects), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubRenameReads(input: { projects: DriveProjectSummary[] }) {
  const fetchMock = vi.fn(async () => {
    return new Response(indexJsonText(input.projects), { status: 200 });
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
