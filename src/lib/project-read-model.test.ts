import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDriveProjectReadModel, validateDriveProjectDetails } from "./google-drive";
import { projectReadFixture, workspaceId } from "./project-read-model.test-fixtures";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const fixture = projectReadFixture();
  const fetch = vi.fn(fixture.fetchFixture);
  vi.stubGlobal("fetch", fetch);
  const input = () => ({
    indexJsonText: JSON.stringify(fixture.index), accessToken: "fixture-only",
    expectedWorkspaceId: workspaceId, expectedProjectsRootFolderId: "fixture-projects",
    project: fixture.project, signal: new AbortController().signal,
  });
  return { ...fixture, fetch, input };
}

describe("read-only project authority", () => {
  it.each([
    [false, false, "synced"], [false, true, "summaryStale"],
    [true, false, "summaryStale"], [true, true, "summaryStale"],
  ] as const)("title mismatch %s / date mismatch %s", async (title, date, consistency) => {
    const f = setup();
    const original = JSON.stringify(f.index);
    if (title) f.manifest.title = "内容の作品";
    // An OLDER manifest date is also stale: never infer authority by ordering.
    if (date) f.manifest.updatedAt = "2026-08-22T00:30:00.000Z";
    const result = await resolveDriveProjectReadModel(f.input());
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected ready fixture");
    expect(result.projectConsistency).toBe(consistency);
    expect(result.catalogEntry).toEqual(f.project);
    expect(result.resolvedProject).not.toBe(result.catalogEntry);
    expect(result.resolvedProject).toEqual({ ...f.project, title: f.manifest.title, updatedAt: f.manifest.updatedAt });
    expect(result.details.slides).toHaveLength(1);
    expect(result.details.project).toEqual(result.resolvedProject);
    expect(JSON.stringify(f.index)).toBe(original);
    expect(f.fetch).toHaveBeenCalledTimes(4);
    expect(f.fetch.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    if (consistency === "summaryStale") {
      expect((await validateDriveProjectDetails(f.input())).status).toBe("invalid");
    }
  });

  const invalidCases: [string, (f: ReturnType<typeof setup>) => void][] = [
    ["workspace", f => { f.manifest.workspaceId = "99999999-9999-4999-8999-999999999999"; }],
    ["project", f => { f.manifest.projectId = "99999999-9999-4999-8999-999999999999"; }],
    ["createdAt", f => { f.manifest.createdAt = "2026-08-21T00:00:00.000Z"; }],
    ["missing membership", f => { f.index.projects = []; }],
    ["duplicate membership", f => { f.index.projects.push({ ...f.project }); }],
    ["manifest schema", f => { Object.assign(f.manifest, { schemaVersion: 99 }); }],
    ["manifest role", f => { Object.assign(f.manifest, { role: "index" }); }],
    ["invalid slide", f => { f.manifest.slides[0].durationSeconds = -1; }],
    ["index schema", f => { f.index.schemaVersion = 99; }],
    ["index workspace", f => { f.index.workspaceId = "99999999-9999-4999-8999-999999999999"; }],
    ["index role", f => { f.index.role = "workspace"; }],
    ["manifestPath", f => { f.project.manifestPath = "wrong"; }],
    ["file reference", f => { f.metadata[1].id = "wrong"; f.project.manifestFileId = "wrong"; f.metadata[1].name = "wrong"; }],
    ["metadata app", f => { f.metadata[1].appProperties.app = "wrong"; }],
    ["metadata role", f => { f.metadata[1].appProperties.role = "wrong"; }],
    ["metadata schema", f => { f.metadata[1].appProperties.schemaVersion = "99"; }],
    ["metadata identity", f => { f.metadata[1].appProperties.projectId = workspaceId; }],
    ["project parent", f => { f.metadata[0].parents = ["wrong"]; }],
    ["manifest parent", f => { f.metadata[1].parents = ["wrong"]; }],
    ["assets parent", f => { f.metadata[2].parents = ["wrong"]; }],
    ["trashed", f => { f.metadata[0].trashed = true; }],
  ];
  it.each(invalidCases)("keeps %s strict even with stale summary", async (_, mutate) => {
    const f = setup();
    f.manifest.title = "内容の作品";
    mutate(f);
    expect((await resolveDriveProjectReadModel(f.input())).status).toBe("invalid");
    expect(f.fetch.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("does not classify read failure as summaryStale", async () => {
    const f = setup();
    f.fetch.mockRejectedValue(new Error("fixture network failure"));
    await expect(resolveDriveProjectReadModel(f.input())).rejects.toThrow("fixture network failure");
  });

  it("accepts legacy schema 1 without optional settings or migration", async () => {
    const f = setup();
    const before = JSON.stringify(f.manifest);
    expect((await resolveDriveProjectReadModel(f.input())).status).toBe("ready");
    expect(JSON.stringify(f.manifest)).toBe(before);
    expect(f.manifest).not.toHaveProperty("captionStyle");
  });
});
