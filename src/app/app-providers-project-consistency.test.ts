import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectReadFixture, workspaceId, projectId } from "@/lib/project-read-model.test-fixtures";
import { PROJECT_SUMMARY_STALE_REASON } from "@/lib/project-consistency";

// Execute the real Provider action closures with a deterministic hook store.
// Effects (including OAuth/session restoration) never run in this harness.
const hooks = vi.hoisted(() => ({
  names: [] as string[], cursor: 0, values: new Map<string, unknown>(),
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const name = hooks.names[hooks.cursor++];
    if (!hooks.values.has(name)) hooks.values.set(name, typeof initial === "function" ? initial() : initial);
    return [hooks.values.get(name), (value: unknown) => {
      hooks.values.set(name, typeof value === "function" ? value(hooks.values.get(name)) : value);
    }];
  },
  useRef: (initial: unknown) => {
    const name = hooks.names[hooks.cursor++];
    if (!hooks.values.has(name)) hooks.values.set(name, { current: initial });
    return hooks.values.get(name);
  },
}));
vi.mock("@/lib/google-auth", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/google-auth")>(),
  getGoogleClientId: () => "", hasGoogleClientId: () => false,
}));

import { AppProviders } from "./app-providers";
const source = readFileSync(new URL("./app-providers.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("provider.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "AppProviders")!;
function collect(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer) &&
      ["useState", "useRef"].includes(node.initializer.expression.getText(ast))) {
    hooks.names.push(ts.isArrayBindingPattern(node.name) ? node.name.elements[0].getText(ast) : node.name.getText(ast));
  }
  ts.forEachChild(node, collect);
}
collect(provider);

function renderProvider() {
  hooks.cursor = 0;
  const result = AppProviders({ children: null });
  expect(hooks.cursor).toBe(hooks.names.length);
  return result.props.value as ReturnType<typeof import("./app-providers").useAppState>;
}

let fixture: ReturnType<typeof projectReadFixture>;
let fetchMock: ReturnType<typeof vi.fn<typeof fixture.fetchFixture>>;
beforeEach(() => {
  hooks.values.clear();
  fixture = projectReadFixture();
  fetchMock = vi.fn(fixture.fetchFixture);
  vi.stubGlobal("fetch", fetchMock);
  hooks.values.set("accessTokenRef", { current: "fixture-only" });
  hooks.values.set("googleStatus", "connected");
  hooks.values.set("driveFileGranted", true);
  hooks.values.set("driveStatus", "ready");
  hooks.values.set("workspaceReadyContext", {
    workspaceId, projectsRootFolderId: "fixture-projects", indexJsonFileId: "fixture-index",
    indexJsonText: JSON.stringify(fixture.index),
  });
});
afterEach(() => vi.unstubAllGlobals());

async function load(stale = true, action: "checkProject" | "selectProject" = "checkProject") {
  if (stale) fixture.manifest.title = "内容の作品";
  const context = renderProvider();
  if (action === "checkProject") await context.checkProject();
  else await context.selectProject(projectId);
  return renderProvider();
}

describe("Provider project read model", () => {
  it.each(["checkProject", "selectProject"] as const)("%s retains stale ready content and actual catalog separately", async action => {
    const context = await load(true, action);
    expect(context.projectStatus).toBe("ready");
    expect(context.projectConsistency).toBe("summaryStale");
    expect(context.projectSummary?.title).toBe("内容の作品");
    expect(context.projectDetails?.slides).toHaveLength(1);
    expect(hooks.values.get("driveProjectReadyContext")).toEqual(fixture.project);
    expect(context.slideEditBlockedReason).toBe(PROJECT_SUMMARY_STALE_REASON);
    expect(context.projectDeleteBlockedReason).toBe(PROJECT_SUMMARY_STALE_REASON);
    expect(context.offlineSyncBlockedReason).toBe(PROJECT_SUMMARY_STALE_REASON);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("synced continues to the existing guards", async () => {
    const context = await load(false);
    expect(context.projectConsistency).toBe("synced");
    expect(context.slideEditBlockedReason).toBeNull();
    fetchMock.mockClear();
    await context.updateProjectSlideEdits({ slideId: fixture.manifest.slides[0].slideId, caption: "changed", durationSeconds: 10, imageEdit: undefined });
    // The real writer was reached; this read-only fixture rejects its PATCH.
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true);
  });

  it("uses manifest updatedAt in the selected summary without replacing catalog updatedAt", async () => {
    fixture.manifest.updatedAt = "2026-08-22T02:00:00.000Z";
    const context = await load(false);
    expect(context.projectConsistency).toBe("summaryStale");
    expect(context.projectSummary?.updatedAt).toBe(fixture.manifest.updatedAt);
    expect(hooks.values.get("driveProjectReadyContext")).toEqual(fixture.project);
  });

  it.each(["checkProject", "selectProject"] as const)("%s rejects disappeared membership", async action => {
    hooks.values.set("selectedProjectId", projectId);
    fixture.index.projects = [];
    const context = await load(false, action);
    expect(context.projectStatus).toBe("invalid");
    expect(context.projectConsistency).toBeNull();
    expect(context.projectSummary).toBeNull();
  });

  it("does not switch silently when the selected registration is missing", async () => {
    hooks.values.set("selectedProjectId", "99999999-9999-4999-8999-999999999999");
    const context = await load(false);
    expect(context.projectStatus).toBe("invalid");
    expect(context.projectSummary).toBeNull();
  });

  it.each(["invalid", "error"])("keeps %s separate from stale", async status => {
    if (status === "invalid") fixture.metadata[0].parents = ["wrong"];
    else fetchMock.mockRejectedValue(new Error("fixture failure"));
    const context = await load();
    expect(context.projectStatus).toBe(status);
    expect(context.projectConsistency).toBeNull();
    expect(context.projectDetails).toBeNull();
  });
});

type Context = ReturnType<typeof renderProvider>;
// Public project mutation inventory; each entry invokes an actual Provider API.
const mutations: [string, (c: Context) => unknown][] = [
  ["title", c => c.updateSelectedProjectTitle("changed")],
  ["transition and strength", c => c.updateSelectedProjectTransitionSettings({ transition: undefined, transitionStrength: "standard" })],
  ["captionStyle", c => c.updateSelectedProjectCaptionStyle(undefined)],
  ["caption", c => c.updateProjectSlideCaption("slide", "changed")],
  ["duration", c => c.updateProjectSlideDuration("slide", 15)],
  ["image edit", c => c.updateProjectSlideImageEdit("slide", undefined)],
  ["unified edit", c => c.updateProjectSlideEdits({ slideId: "slide", caption: "changed", durationSeconds: 10, imageEdit: undefined })],
  ["move", c => c.moveProjectSlide("slide", "up")],
  ["reorder", c => c.reorderProjectSlidesByDrag(["slide"])],
  ["slide delete", c => c.deleteProjectSlides(["slide"])],
  ["duplicate", c => c.duplicateProjectSlide("slide")],
  ["picker import / batch append", c => c.startAssetImport()],
  ["local image import / batch append", c => c.startLocalImageFileImport([])],
  ["local video import / append", c => c.startLocalVideoFileImport([])],
  ["offline save/update", c => c.startOfflineSync()],
  ["unused asset deletion", c => c.confirmUnusedAssetDeletion()],
  ["project deletion", c => c.confirmProjectDeletion()],
  ["publish", c => c.commitPreparedProjectPublish({ projectId, revisionId: "fixture-revision" })],
  ["rollback", c => c.commitPreparedProjectRollback({ projectId, targetRevisionId: "fixture-target", revisionId: "fixture-revision" })],
  ["Photos export", c => c.commitPreparedGooglePhotosExport()],
  ["Photos sync", c => c.syncSelectedProjectToGooglePhotos(projectId)],
  ["create project", c => c.createProject("new")],
];
describe("stale mutation boundary", () => {
  it.each(mutations)("blocks %s without Drive/Photos requests", async (_, invoke) => {
    const context = await load();
    fetchMock.mockClear();
    await invoke(context);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(renderProvider().projectConsistency).toBe("summaryStale");
  });

  it("rejects a previously captured synced callback after stale read", async () => {
    const oldContext = await load(false);
    await load(true, "selectProject");
    fetchMock.mockClear();
    await oldContext.deleteProjectSlides([fixture.manifest.slides[0].slideId]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the entire public mutation inventory reaches the shared consistency guard", () => {
    const calls = new Map<string, Set<string>>();
    function collectCalls(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        const names = new Set<string>();
        function visit(child: ts.Node) {
          if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) names.add(child.expression.text);
          ts.forEachChild(child, visit);
        }
        visit(node.body);
        calls.set(node.name.text, names);
      }
      ts.forEachChild(node, collectCalls);
    }
    collectCalls(provider);
    function guarded(name: string, seen = new Set<string>()): boolean {
      if (name === "getProjectConsistencyBlockedReason") return true;
      if (seen.has(name)) return false;
      seen.add(name);
      return [...(calls.get(name) ?? [])].some(called => guarded(called, seen));
    }
    for (const [label, invoke] of mutations) {
      const name = invoke.toString().match(/c\.(\w+)\(/)?.[1];
      expect(name, label).toBeDefined();
      expect(guarded(name!), label).toBe(true);
    }
  });
});
