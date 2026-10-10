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
  const result = renderProvider();
  return result.props.value as ReturnType<typeof import("./app-providers").useAppState>;
}
function renderProvider() {
  hooks.cursor = 0;
  const result = AppProviders({ children: null });
  expect(hooks.cursor).toBe(hooks.names.length);
  return result;
}
function ref(name: string) { return hooks.values.get(name) as { current: unknown }; }
function initializeGoogleTokenClients() {
  const configs: Array<{
    scope: string;
    callback: (response: { access_token?: string; scope?: string; error?: string }) => void;
    error_callback?: (error?: { type?: "popup_failed_to_open" | "popup_closed" | "unknown" }) => void;
  }> = [];
  vi.stubGlobal("window", {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((config) => {
            configs.push(config);
            return { requestAccessToken: oauth };
          }),
          hasGrantedAllScopes: vi.fn(() => false),
        },
      },
    },
  });
  const result = renderProvider();
  const children = Array.isArray(result.props.children)
    ? result.props.children
    : [result.props.children];
  const script = children.find(
    (child: { props?: { onReady?: () => void } } | null) =>
      typeof child?.props?.onReady === "function",
  );
  expect(script).toBeDefined();
  script!.props.onReady!();
  return {
    context: result.props.value as ReturnType<typeof import("./app-providers").useAppState>,
    get membershipConfig() { return configs.at(-1)!; },
  };
}
const safe: GooglePhotosSyncDiagnosticsResult = { ok: true, diagnostics: {
  hasPending: true, phase: "finalizing", phaseExplanation: "最終確認の途中の可能性があります。", sourceChanged: true,
  targetCount: 13, previousManagedCount: 13, stableManagedCount: 13,
  membership: { status: "unavailable", explanation: "写真構成は確認していません。", comparable: false,
    missingCount: null, extraCount: null, unmanagedCount: null }, manualConfirmationRequired: true, autoResume: false,
} };
const oauth = vi.fn();
beforeEach(() => {
  hooks.values.clear(); vi.clearAllMocks(); oauth.mockReset();
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("window", { google: { accounts: { oauth2: {
    initTokenClient: vi.fn(() => ({ requestAccessToken: oauth })),
    hasGrantedAllScopes: vi.fn(() => false),
  } } } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No real Google access"); }));
  hooks.values.set("accessTokenRef", { current: "fixture-drive-token" });
  hooks.values.set("photosSyncAccessTokenRef", { current: "fixture-photos-token" });
  hooks.values.set("photosSyncTokenClientRef", { current: { requestAccessToken: oauth } });
  hooks.values.set("photosMembershipReadAccessTokenRef", { current: "fixture-membership-token" });
  hooks.values.set("photosMembershipReadTokenClientRef", { current: { requestAccessToken: oauth } });
  const fixture = projectReadFixture();
  for (const [name, value] of Object.entries({ googleStatus: "connected", driveFileGranted: true, driveStatus: "ready",
    projectStatus: "ready", selectedProjectId: projectId, driveProjectReadyContext: fixture.project, projectConsistency: "synced",
    workspaceReadyContext: { workspaceId, projectsRootFolderId: "fixture-projects", indexJsonFileId: "fixture-index" },
  })) hooks.values.set(name, value);
  hooks.values.set("projectConsistencyRef", { current: "synced" });
  read.mockResolvedValue(safe);
});
afterEach(() => {
  expect(runGooglePhotosSameAlbumSync).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("Provider read-only Photos diagnostics", () => {
  it("uses private existing tokens and returns only the safe DTO", async () => {
    const context = render();
    const result = await context.diagnoseGooglePhotosSync(projectId, new AbortController().signal);
    expect(result).toEqual(safe);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "fixture-drive-token", photosAccessToken: "fixture-membership-token" }));
    for (const text of ["fixture-drive-token", "fixture-membership-token", projectId, workspaceId]) expect(JSON.stringify(result)).not.toContain(text);
    expect(ref("googlePhotosSyncInFlightRef").current).toBe(false);
    expect(ref("pendingPhotosSyncTokenRequestRef").current).toBeNull();
    expect(ref("photosMembershipReadAccessTokenRef").current).toBe("fixture-membership-token");
    expect(oauth).not.toHaveBeenCalled();
  });
  it("passes null Photos token without requesting one", async () => {
    const context = render(); ref("photosMembershipReadAccessTokenRef").current = null;
    expect(await context.diagnoseGooglePhotosSync(projectId, new AbortController().signal)).toEqual(safe);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ photosAccessToken: null }));
    expect(oauth).not.toHaveBeenCalled();
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
      if (kind === "Photos token") ref("photosMembershipReadAccessTokenRef").current = null;
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
    expect(ref("photosMembershipReadAccessTokenRef").current).toBe("fixture-membership-token");
    expect(render().googleStatus).toBe("connected");
  });
  it("does not reset auth, write, persist, or log in the diagnostics action", () => {
    const action = source.slice(source.indexOf("async function diagnoseGooglePhotosSync("), source.indexOf("async function verifyGooglePhotosSyncMembership("));
    for (const forbidden of ["requestPhotosSyncAccessToken", "requestAccessToken", "resetGoogleAfterDriveAuthFailure", "executeGooglePhotosSameAlbumSync", "updateBinding", "console.", "localStorage", "indexedDB"])
      expect(action).not.toContain(forbidden);
  });

  it("starts an exact read-only membership request only from the explicit action", async () => {
    const context = render();
    oauth.mockImplementation((options: { scope?: string; include_granted_scopes?: boolean }) => {
      expect(options).toEqual({
        scope: "https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata",
        include_granted_scopes: false,
        prompt: "consent",
      });
      ref("photosMembershipReadAccessTokenRef").current = "fixture-new-membership-token";
      const pending = ref("pendingPhotosMembershipReadTokenRequestRef").current as {
        resolve: (token: string) => void;
      };
      pending.resolve("fixture-new-membership-token");
    });

    expect(
      await context.verifyGooglePhotosSyncMembership(
        projectId,
        new AbortController().signal,
      ),
    ).toEqual(safe);
    expect(oauth).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({
        photosAccessToken: "fixture-new-membership-token",
      }),
    );
  });

  it("accepts the isolated GIS callback and rejects denial or missing scope", async () => {
    const clients = initializeGoogleTokenClients();
    const { context } = clients;
    const success = context.verifyGooglePhotosSyncMembership(
      projectId,
      new AbortController().signal,
    );
    clients.membershipConfig.callback({
      access_token: "fixture-callback-token",
      scope: "https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata",
    });
    expect(await success).toEqual(safe);
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ photosAccessToken: "fixture-callback-token" }),
    );

    read.mockClear();
    const denied = context.verifyGooglePhotosSyncMembership(
      projectId,
      new AbortController().signal,
    );
    clients.membershipConfig.callback({ error: "access_denied" });
    expect(await denied).toEqual({
      ok: false,
      reason: "authorizationCancelled",
    });

    const wrongScope = context.verifyGooglePhotosSyncMembership(
      projectId,
      new AbortController().signal,
    );
    clients.membershipConfig.callback({
      access_token: "fixture-wrong-scope-token",
      scope: "https://www.googleapis.com/auth/photoslibrary.appendonly",
    });
    expect(await wrongScope).toEqual({
      ok: false,
      reason: "authorizationUnavailable",
    });
    expect(read).not.toHaveBeenCalled();

    const controller = new AbortController();
    const stale = context.verifyGooglePhotosSyncMembership(
      projectId,
      controller.signal,
    );
    const staleConfig = clients.membershipConfig;
    controller.abort();
    expect(await stale).toEqual({
      ok: false,
      reason: "authorizationCancelled",
    });
    staleConfig.callback({
      access_token: "fixture-stale-token",
      scope: "https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata",
    });
    expect(ref("photosMembershipReadAccessTokenRef").current).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("blocks a double request and discards an aborted authorization", async () => {
    const context = render();
    const controller = new AbortController();
    const first = context.verifyGooglePhotosSyncMembership(
      projectId,
      controller.signal,
    );
    expect(
      await context.verifyGooglePhotosSyncMembership(
        projectId,
        new AbortController().signal,
      ),
    ).toEqual({ ok: false, reason: "notReady" });
    controller.abort();
    expect(await first).toEqual({
      ok: false,
      reason: "authorizationCancelled",
    });
    expect(read).not.toHaveBeenCalled();
    expect(ref("photosMembershipReadAccessTokenRef").current).toBeNull();
  });

  it("ignores A's late success and popup error while B awaits its own response", async () => {
    const clients = initializeGoogleTokenClients();
    const controllerA = new AbortController();
    const a = clients.context.verifyGooglePhotosSyncMembership(projectId, controllerA.signal);
    const configA = clients.membershipConfig;
    controllerA.abort();
    expect(await a).toEqual({ ok: false, reason: "authorizationCancelled" });

    let bSettled = false;
    const b = clients.context.verifyGooglePhotosSyncMembership(projectId, new AbortController().signal);
    void b.then(() => { bSettled = true; });
    const configB = clients.membershipConfig;
    expect(configB).not.toBe(configA);
    const pendingB = ref("pendingPhotosMembershipReadTokenRequestRef").current;
    configA.callback({ access_token: "fixture-A-late-token", scope: configA.scope });
    configA.error_callback?.({ type: "popup_closed" });
    await Promise.resolve();
    expect(bSettled).toBe(false);
    expect(ref("pendingPhotosMembershipReadTokenRequestRef").current).toBe(pendingB);
    expect(ref("tokenRequestKindRef").current).toBe("photosMembershipRead");
    expect(ref("photosMembershipReadAccessTokenRef").current).toBeNull();
    expect(read).not.toHaveBeenCalled();

    configB.callback({ access_token: "fixture-B-token", scope: configB.scope });
    expect(await b).toEqual(safe);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ photosAccessToken: "fixture-B-token" }));
  });

  it("discards an OAuth result after project authority changes", async () => {
    const clients = initializeGoogleTokenClients();
    const result = clients.context.verifyGooglePhotosSyncMembership(projectId, new AbortController().signal);
    ref("googlePhotosSyncDriveAuthorityRef").current = {};
    clients.membershipConfig.callback({ access_token: "fixture-owner-stale-token", scope: clients.membershipConfig.scope });
    expect(await result).toEqual({ ok: false, reason: "authorizationCancelled" });
    expect(read).not.toHaveBeenCalled();
  });

  it("discards authorization when a Drive write starts before the callback", async () => {
    const context = render();
    const result = context.verifyGooglePhotosSyncMembership(
      projectId,
      new AbortController().signal,
    );
    ref("driveOperationInFlightRef").current = true;
    ref("photosMembershipReadAccessTokenRef").current =
      "fixture-late-membership-token";
    const pending = ref("pendingPhotosMembershipReadTokenRequestRef").current as {
      resolve: (token: string) => void;
    };
    pending.resolve("fixture-late-membership-token");

    expect(await result).toEqual({
      ok: false,
      reason: "authorizationCancelled",
    });
    expect(read).not.toHaveBeenCalled();
  });

  it("fails closed when the read-only permission request cannot start", async () => {
    const context = render();
    oauth.mockImplementation(() => {
      throw new Error("fixture popup blocked");
    });
    expect(
      await context.verifyGooglePhotosSyncMembership(
        projectId,
        new AbortController().signal,
      ),
    ).toEqual({ ok: false, reason: "authorizationUnavailable" });
    expect(read).not.toHaveBeenCalled();
    expect(ref("photosMembershipReadAccessTokenRef").current).toBeNull();
  });

  it("times out safely without reading or retaining a token", async () => {
    vi.useFakeTimers();
    const context = render();
    const result = context.verifyGooglePhotosSyncMembership(
      projectId,
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await result).toEqual({
      ok: false,
      reason: "authorizationCancelled",
    });
    expect(read).not.toHaveBeenCalled();
    expect(ref("photosMembershipReadAccessTokenRef").current).toBeNull();
  });

  it("classifies a blocked or closed GIS popup without reading", async () => {
    const clients = initializeGoogleTokenClients();
    const { context } = clients;
    const blocked = context.verifyGooglePhotosSyncMembership(
      projectId,
      new AbortController().signal,
    );
    clients.membershipConfig.error_callback?.({ type: "popup_failed_to_open" });
    expect(await blocked).toEqual({
      ok: false,
      reason: "authorizationUnavailable",
    });

    const closed = context.verifyGooglePhotosSyncMembership(
      projectId,
      new AbortController().signal,
    );
    clients.membershipConfig.error_callback?.({ type: "popup_closed" });
    expect(await closed).toEqual({
      ok: false,
      reason: "authorizationCancelled",
    });
    expect(read).not.toHaveBeenCalled();
  });
});
