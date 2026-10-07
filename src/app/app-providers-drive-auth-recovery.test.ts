import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectReadFixture, workspaceId, projectId } from "@/lib/project-read-model.test-fixtures";
import { createPrepareReviewFailure } from "@/lib/publish-history/project-publish-ui";

// Run actual Provider actions; effects/OAuth/session restoration never run.
const hooks = vi.hoisted(() => ({ names: [] as string[], cursor: 0, values: new Map<string, unknown>() }));
vi.mock("react", async importOriginal => ({
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
  getGoogleClientId: () => "fixture-client", hasGoogleClientId: () => true,
}));
vi.mock("@/lib/publish-history/project-publish-review", () => ({ prepareProjectPublishReviewInDrive: vi.fn() }));
vi.mock("@/lib/google-photos-export/sync-ui-review", () => ({ prepareGooglePhotosSyncUiReviewInDrive: vi.fn() }));

import { prepareProjectPublishReviewInDrive } from "@/lib/publish-history/project-publish-review";
import { prepareGooglePhotosSyncUiReviewInDrive } from "@/lib/google-photos-export/sync-ui-review";
import { AppProviders } from "./app-providers";
const publishRead = vi.mocked(prepareProjectPublishReviewInDrive);
const syncRead = vi.mocked(prepareGooglePhotosSyncUiReviewInDrive);
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
function render() {
  hooks.cursor = 0;
  const result = AppProviders({ children: null });
  expect(hooks.cursor).toBe(hooks.names.length);
  return result.props.value as ReturnType<typeof import("./app-providers").useAppState>;
}
function ref(name: string) { return hooks.values.get(name) as { current: unknown }; }
const session = { invalidate: vi.fn(), deleteAfterLocalDisconnect: vi.fn() };
beforeEach(() => {
  hooks.values.clear();
  vi.clearAllMocks();
  const fixture = projectReadFixture();
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No external requests allowed"); }));
  hooks.values.set("accessTokenRef", { current: "fixture-only" });
  hooks.values.set("photosSyncAccessTokenRef", { current: "fixture-photos-only" });
  hooks.values.set("googleSessionControllerRef", { current: session });
  for (const [name, value] of Object.entries({ googleStatus: "connected", driveFileGranted: true,
    driveStatus: "ready", projectStatus: "ready", selectedProjectId: projectId,
    driveProjectReadyContext: fixture.project, projectConsistency: "synced",
    workspaceReadyContext: { workspaceId, projectsRootFolderId: "fixture-projects", indexJsonFileId: "fixture-index" },
  })) hooks.values.set(name, value);
  hooks.values.set("projectConsistencyRef", { current: "synced" });
});
afterEach(() => vi.unstubAllGlobals());

function expectReset() {
  const context = render();
  expect(ref("accessTokenRef").current).toBeNull();
  expect(ref("photosSyncAccessTokenRef").current).toBeNull();
  expect(context.googleStatus).toBe("notConnected");
  expect(context.driveFileGranted).toBeNull();
  expect(context.projectStatus).toBe("idle");
  expect(hooks.values.get("workspaceReadyContext")).toBeNull();
  expect(hooks.values.get("driveProjectReadyContext")).toBeNull();
  expect(session.invalidate).toHaveBeenCalledOnce();
  expect(session.deleteAfterLocalDisconnect).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
}

describe("Provider Drive read auth recovery", () => {
  it("publish resets through existing cleanup, with no stuck publish/write state or retry", async () => {
    publishRead.mockImplementation(async () => {
      ref("projectPublicationWriteInFlightRef").current = true;
      return createPrepareReviewFailure({ code: "driveAuthRequired" });
    });
    const context = render();
    ref("pendingProjectPublishRef").current = { fixture: true };
    const result = await context.prepareProjectPublishReview(projectId);
    expect(result).toMatchObject({ ok: false, code: "driveAuthRequired" });
    expectReset();
    for (const name of ["pendingProjectPublishRef", "projectPublishAbortRef"]) expect(ref(name).current).toBeNull();
    for (const name of ["projectPublishInFlightRef", "projectPublicationWriteInFlightRef"]) expect(ref(name).current).toBe(false);
    expect(hooks.values.get("isProjectPublishInFlight")).toBe(false);
    expect(ref("projectPublishRequestSequenceRef").current).toBe(2);
    expect(publishRead).toHaveBeenCalledOnce();
    expect(syncRead).not.toHaveBeenCalled();
  });
  it("sync review resets and returns an existing safe UI result without retry/OAuth", async () => {
    syncRead.mockResolvedValue({ ok: false, reason: "driveAuthRequired" });
    await expect(render().prepareGooglePhotosSyncReview(projectId, new AbortController().signal))
      .resolves.toEqual({ ok: false, reason: "notReady" });
    expectReset();
    expect(syncRead).toHaveBeenCalledOnce();
    expect(publishRead).not.toHaveBeenCalled();
    expect(ref("tokenRequestKindRef").current).toBeNull();
  });
  it.each(["publish", "sync"] as const)("%s generic failure does not disconnect", async action => {
    publishRead.mockResolvedValue(createPrepareReviewFailure({ code: "driveReadFailed" }));
    syncRead.mockResolvedValue({ ok: false, reason: "bindingInaccessible" });
    const context = render();
    if (action === "publish") await context.prepareProjectPublishReview(projectId);
    else await context.prepareGooglePhotosSyncReview(projectId, new AbortController().signal);
    expect(render().googleStatus).toBe("connected");
    expect(ref("accessTokenRef").current).toBe("fixture-only");
    expect(session.invalidate).not.toHaveBeenCalled();
    expect(session.deleteAfterLocalDisconnect).not.toHaveBeenCalled();
  });
  it.each(["publish", "sync"] as const)("%s cancelled auth result does not disconnect", async action => {
    const controller = new AbortController();
    publishRead.mockImplementation(async ({ signal }) => {
      (ref("projectPublishAbortRef").current as AbortController).abort();
      expect(signal.aborted).toBe(true);
      return createPrepareReviewFailure({ code: "driveAuthRequired" });
    });
    syncRead.mockImplementation(async () => { controller.abort(); return { ok: false, reason: "driveAuthRequired" }; });
    const context = render();
    if (action === "publish") await context.prepareProjectPublishReview(projectId);
    else await context.prepareGooglePhotosSyncReview(projectId, controller.signal);
    expect(render().googleStatus).toBe("connected");
    expect(session.invalidate).not.toHaveBeenCalled();
  });
  it.each(["publish", "sync"] as const)("%s stale auth result cannot disconnect newer authority", async action => {
    publishRead.mockImplementation(async () => {
      ref("accessTokenRef").current = "fixture-new-authority";
      return createPrepareReviewFailure({ code: "driveAuthRequired" });
    });
    syncRead.mockImplementation(async () => {
      ref("accessTokenRef").current = "fixture-new-authority";
      return { ok: false, reason: "driveAuthRequired" };
    });
    const context = render();
    const result = action === "publish" ? await context.prepareProjectPublishReview(projectId)
      : await context.prepareGooglePhotosSyncReview(projectId, new AbortController().signal);
    expect(result).toMatchObject(action === "publish" ? { code: "stalePublishRequest" } : { reason: "notReady" });
    expect(ref("accessTokenRef").current).toBe("fixture-new-authority");
    expect(session.invalidate).not.toHaveBeenCalled();
    expect(ref("pendingProjectPublishRef").current).toBeNull();
  });
});
