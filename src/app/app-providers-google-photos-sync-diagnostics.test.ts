import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectReadFixture, workspaceId, projectId } from "@/lib/project-read-model.test-fixtures";
import type { GooglePhotosSyncDiagnosticsResult } from "@/lib/google-photos-export/sync-pending-diagnostics";

// Exercise the actual Provider action with inert effects and private fake refs.
const hooks = vi.hoisted(() => ({ names: [] as string[], cursor: 0, values: new Map<string, unknown>() }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const name = hooks.names[hooks.cursor++];
    if (!hooks.values.has(name)) hooks.values.set(name, typeof initial === "function" ? initial() : initial);
    return [hooks.values.get(name), (value: unknown) => hooks.values.set(name, typeof value === "function" ? value(hooks.values.get(name)) : value)];
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
vi.mock("@/lib/google-photos-export/sync-pending-diagnostics", () => ({ diagnoseGooglePhotosSyncPending: vi.fn() }));
vi.mock("@/lib/google-photos-export/sync-coordinator", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/google-photos-export/sync-coordinator")>(), runGooglePhotosSameAlbumSync: vi.fn(),
}));

import { diagnoseGooglePhotosSyncPending } from "@/lib/google-photos-export/sync-pending-diagnostics";
import { runGooglePhotosSameAlbumSync } from "@/lib/google-photos-export/sync-coordinator";
import { AppProviders } from "./app-providers";
const read = vi.mocked(diagnoseGooglePhotosSyncPending);
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
const safe: GooglePhotosSyncDiagnosticsResult = { ok: true, diagnostics: {
  hasPending: true, phase: "finalizing", phaseExplanation: "最終確認の途中の可能性があります。", sourceChanged: true,
  targetCount: 13, previousManagedCount: 13, stableManagedCount: 13,
  membership: { status: "unavailable", explanation: "写真構成は確認していません。", comparable: false,
    missingCount: null, extraCount: null, unmanagedCount: null }, manualConfirmationRequired: true, autoResume: false,
} };
const oauth = vi.fn();
beforeEach(() => {
  hooks.values.clear(); vi.clearAllMocks();
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No real Google access"); }));
  hooks.values.set("accessTokenRef", { current: "fixture-drive-token" });
  hooks.values.set("photosSyncAccessTokenRef", { current: "fixture-photos-token" });
  hooks.values.set("photosSyncTokenClientRef", { current: { requestAccessToken: oauth } });
  const fixture = projectReadFixture();
  for (const [name, value] of Object.entries({ googleStatus: "connected", driveFileGranted: true, driveStatus: "ready",
    projectStatus: "ready", selectedProjectId: projectId, driveProjectReadyContext: fixture.project, projectConsistency: "synced",
    workspaceReadyContext: { workspaceId, projectsRootFolderId: "fixture-projects", indexJsonFileId: "fixture-index" },
  })) hooks.values.set(name, value);
  hooks.values.set("projectConsistencyRef", { current: "synced" });
  read.mockResolvedValue(safe);
});
afterEach(() => {
  expect(oauth).not.toHaveBeenCalled(); expect(runGooglePhotosSameAlbumSync).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
describe("Provider read-only Photos diagnostics", () => {
  it("uses private existing tokens and returns only the safe DTO", async () => {
    const context = render();
    const result = await context.diagnoseGooglePhotosSync(projectId, new AbortController().signal);
    expect(result).toEqual(safe);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "fixture-drive-token", photosAccessToken: "fixture-photos-token" }));
    for (const text of ["fixture-drive-token", "fixture-photos-token", projectId, workspaceId]) expect(JSON.stringify(result)).not.toContain(text);
    expect(ref("googlePhotosSyncInFlightRef").current).toBe(false);
    expect(ref("pendingPhotosSyncTokenRequestRef").current).toBeNull();
    expect(ref("photosSyncAccessTokenRef").current).toBe("fixture-photos-token");
  });
  it("passes null Photos token without requesting one", async () => {
    const context = render(); ref("photosSyncAccessTokenRef").current = null;
    expect(await context.diagnoseGooglePhotosSync(projectId, new AbortController().signal)).toEqual(safe);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ photosAccessToken: null }));
  });
  it.each(["googlePhotosSyncInFlightRef", "googlePhotosExportInFlightRef", "driveOperationInFlightRef", "assetImportInFlightRef",
    "offlineSyncInFlightRef", "projectPublishInFlightRef", "projectRollbackInFlightRef", "projectPublicationWriteInFlightRef", "projectDeleteInFlightRef"])("blocks concurrent %s", async name => {
    const context = render(); ref(name).current = true;
    expect(await context.diagnoseGooglePhotosSync(projectId, new AbortController().signal)).toEqual({ ok: false, reason: "notReady" });
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects stale project consistency before reading", async () => {
    const context = render(); ref("projectConsistencyRef").current = "summaryStale";
    expect(await context.diagnoseGooglePhotosSync(projectId, new AbortController().signal)).toEqual({ ok: false, reason: "notReady" });
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects a non-selected project before reading", async () => {
    expect(await render().diagnoseGooglePhotosSync("fixture-other-project", new AbortController().signal)).toEqual({ ok: false, reason: "notReady" });
    expect(read).not.toHaveBeenCalled();
  });
  it.each(["owner", "Drive token", "Photos token", "write", "sequence"])("discards a result after %s changes", async kind => {
    const context = render();
    read.mockImplementation(async input => {
      if (kind === "owner") ref("googlePhotosSyncDriveAuthorityRef").current = {};
      if (kind === "Drive token") ref("accessTokenRef").current = "fixture-new-token";
      if (kind === "Photos token") ref("photosSyncAccessTokenRef").current = null;
      if (kind === "write") ref("driveOperationInFlightRef").current = true;
      if (kind === "sequence") ref("googlePhotosDiagnosticsSequenceRef").current = 99;
      expect(input.isCurrent()).toBe(false);
      return safe;
    });
    expect(await context.diagnoseGooglePhotosSync(projectId, new AbortController().signal)).toEqual({ ok: false, reason: "cancelled" });
  });
  it("forwards Abort and discards the late result", async () => {
    const controller = new AbortController();
    read.mockImplementation(async input => { controller.abort(); expect(input.signal.aborted).toBe(true); return safe; });
    expect(await render().diagnoseGooglePhotosSync(projectId, controller.signal)).toEqual({ ok: false, reason: "cancelled" });
  });
  it("supersedes an earlier request without publishing its late result", async () => {
    const context = render(); let resolve!: (value: GooglePhotosSyncDiagnosticsResult) => void;
    read.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const first = context.diagnoseGooglePhotosSync(projectId, new AbortController().signal);
    expect(await context.diagnoseGooglePhotosSync(projectId, new AbortController().signal)).toEqual(safe);
    resolve(safe);
    expect(await first).toEqual({ ok: false, reason: "cancelled" });
  });
  it("sanitizes failure and preserves connection and existing runtime", async () => {
    const context = render(); const runtime = { fixture: "existing runtime" };
    ref("googlePhotosSyncMediaRuntimeRef").current = runtime;
    read.mockRejectedValue(new Error("raw fixture token error"));
    expect(await context.diagnoseGooglePhotosSync(projectId, new AbortController().signal)).toEqual({ ok: false, reason: "bindingUnavailable" });
    expect(ref("googlePhotosSyncMediaRuntimeRef").current).toBe(runtime);
    expect(ref("photosSyncAccessTokenRef").current).toBe("fixture-photos-token");
    expect(render().googleStatus).toBe("connected");
  });
  it("does not reset auth, write, persist, or log in the diagnostics action", () => {
    const action = source.slice(source.indexOf("async function diagnoseGooglePhotosSync("), source.indexOf("async function prepareGooglePhotosSyncReview("));
    for (const forbidden of ["requestPhotosSyncAccessToken", "requestAccessToken", "resetGoogleAfterDriveAuthFailure", "executeGooglePhotosSameAlbumSync", "updateBinding", "console.", "localStorage", "indexedDB"])
      expect(action).not.toContain(forbidden);
  });
});
