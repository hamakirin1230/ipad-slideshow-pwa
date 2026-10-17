import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  projectId,
  projectReadFixture,
  workspaceId,
} from "@/lib/project-read-model.test-fixtures";

const navigation = vi.hoisted(() => ({ pathname: "/admin" }));
const pickerMocks = vi.hoisted(() => ({
  createPhotosPickerSession: vi.fn(),
  deletePhotosPickerSession: vi.fn(),
  fetchAndValidatePickedPhoto: vi.fn(),
  getPhotosPickerSession: vi.fn(),
  listPickedMediaItems: vi.fn(),
}));
const driveMocks = vi.hoisted(() => ({
  appendDriveProjectAssetsToManifest: vi.fn(),
  saveDriveProjectAsset: vi.fn(),
}));
const hooks = vi.hoisted(() => ({
  mode: "provider" as "provider" | "bridge",
  names: [] as string[],
  cursor: 0,
  values: new Map<string, unknown>(),
  bridgeValues: new Map<number, { current: unknown }>(),
  effects: [] as Array<() => void | (() => void)>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) => {
    hooks.effects.push(effect);
  },
  useState: (initial: unknown) => {
    const name = hooks.names[hooks.cursor++];
    if (!hooks.values.has(name)) {
      hooks.values.set(name, typeof initial === "function" ? initial() : initial);
    }
    return [
      hooks.values.get(name),
      (value: unknown) => {
        hooks.values.set(
          name,
          typeof value === "function"
            ? (value as (current: unknown) => unknown)(hooks.values.get(name))
            : value,
        );
      },
    ];
  },
  useRef: (initial: unknown) => {
    if (hooks.mode === "bridge") {
      const index = hooks.cursor++;
      if (!hooks.bridgeValues.has(index)) {
        hooks.bridgeValues.set(index, { current: initial });
      }
      return hooks.bridgeValues.get(index);
    }

    const name = hooks.names[hooks.cursor++];
    if (!hooks.values.has(name)) {
      hooks.values.set(name, { current: initial });
    }
    return hooks.values.get(name);
  },
}));

vi.mock("@/lib/google-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google-auth")>()),
  getGoogleClientId: () => "fixture-client",
  hasGoogleClientId: () => true,
}));

vi.mock("@/lib/google-photos-picker-availability", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/google-photos-picker-availability")
  >()),
  readGooglePhotosPickerClientPlatform: () => "web",
  shouldReuseGooglePhotosPickerOAuthToken: () => true,
}));

vi.mock("@/lib/google-photos-picker-link", () => ({
  createGooglePhotosPickerHref: () => "fixture-picker-link",
}));

vi.mock("@/lib/google-photos-picker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google-photos-picker")>()),
  createPhotosPickerSession: pickerMocks.createPhotosPickerSession,
  deletePhotosPickerSession: pickerMocks.deletePhotosPickerSession,
  fetchAndValidatePickedPhoto: pickerMocks.fetchAndValidatePickedPhoto,
  getPhotosPickerSession: pickerMocks.getPhotosPickerSession,
  listPickedMediaItems: pickerMocks.listPickedMediaItems,
}));

vi.mock("@/lib/google-drive", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google-drive")>()),
  appendDriveProjectAssetsToManifest:
    driveMocks.appendDriveProjectAssetsToManifest,
  saveDriveProjectAsset: driveMocks.saveDriveProjectAsset,
}));

import {
  AppProviders,
  AssetImportLifecycleBridge,
} from "./app-providers";

const providersSource = readFileSync(
  new URL("./app-providers.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "app-providers.tsx",
  providersSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const providerNode = ast.statements.find(
  (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "AppProviders",
);

function collectProviderHooks(node: ts.Node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.initializer &&
    ts.isCallExpression(node.initializer) &&
    ["useState", "useRef"].includes(node.initializer.expression.getText(ast))
  ) {
    hooks.names.push(
      ts.isArrayBindingPattern(node.name)
        ? node.name.elements[0].getText(ast)
        : node.name.getText(ast),
    );
  }
  ts.forEachChild(node, collectProviderHooks);
}

if (!providerNode) {
  throw new Error("AppProviders declaration was not found.");
}
collectProviderHooks(providerNode);

function ref<T>(name: string) {
  return hooks.values.get(name) as { current: T };
}

function renderProvider() {
  return renderProviderWithLifecycle().context;
}

function renderProviderWithLifecycle() {
  hooks.mode = "provider";
  hooks.cursor = 0;
  hooks.effects = [];
  const result = AppProviders({ children: null });
  expect(hooks.cursor).toBe(hooks.names.length);
  const children = Array.isArray(result.props.children)
    ? result.props.children
    : [result.props.children];
  const lifecycleBridge = children.find(
    (child) => child?.type === AssetImportLifecycleBridge,
  );
  const identityScript = children.find(
    (child) => typeof child?.props?.onReady === "function",
  );

  expect(lifecycleBridge).toBeDefined();

  return {
    context: result.props.value as ReturnType<
      typeof import("./app-providers").useAppState
    >,
    lifecycle: lifecycleBridge.props as Parameters<
      typeof AssetImportLifecycleBridge
    >[0],
    identityScriptProps: identityScript?.props as
      | { onReady: () => void }
      | undefined,
  };
}

function renderBridge(input: {
  onRouteLeave: () => void;
  onDocumentLeave: () => void;
  onPersistedPageShow: () => void;
  onUnmount: () => void;
}) {
  hooks.mode = "bridge";
  hooks.cursor = 0;
  hooks.effects = [];
  AssetImportLifecycleBridge(input);
  return [...hooks.effects];
}

function dispatchPageShow(persisted: boolean) {
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: persisted });
  window.dispatchEvent(event);
}

function createPickerSession() {
  return {
    id: "fixture-session",
    pickerUri: "fixture-picker-uri",
    mediaItemsSet: true,
    pollingTiming: {
      pollIntervalSeconds: 1,
      timeoutInSeconds: 60,
      diagnostics: [],
    },
    diagnostics: [],
  };
}

function createPickedPhoto() {
  return {
    id: "fixture-media",
    type: "PHOTO",
    mediaFile: {
      baseUrl: "fixture-media-base",
      mimeType: "image/jpeg",
      filename: "fixture-photo.jpg",
    },
    createTime: null,
  };
}

async function flushPromises() {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}

function prepareProviderState() {
  const fixture = projectReadFixture();
  hooks.values.set("photosPickerAccessTokenRef", {
    current: "fixture-credential",
  });
  hooks.values.set("projectConsistencyRef", { current: "synced" });
  hooks.values.set("googleStatus", "connected");
  hooks.values.set("driveFileGranted", true);
  hooks.values.set("driveStatus", "ready");
  hooks.values.set("projectStatus", "ready");
  hooks.values.set("projectConsistency", "synced");
  hooks.values.set("selectedProjectId", projectId);
  hooks.values.set("workspaceReadyContext", {
    workspaceId,
    projectsRootFolderId: "fixture-projects",
    indexJsonFileId: "fixture-index",
    indexJsonText: JSON.stringify(fixture.index),
  });
  hooks.values.set("driveProjectReadyContext", fixture.project);
  hooks.values.set("projectDetails", {
    slideCount: 0,
    assetCount: 0,
    slides: [],
  });
}

beforeEach(() => {
  hooks.mode = "provider";
  hooks.cursor = 0;
  hooks.values.clear();
  hooks.bridgeValues.clear();
  hooks.effects = [];
  navigation.pathname = "/admin";
  pickerMocks.createPhotosPickerSession.mockReset();
  pickerMocks.deletePhotosPickerSession.mockReset().mockResolvedValue(undefined);
  pickerMocks.fetchAndValidatePickedPhoto.mockReset();
  pickerMocks.getPhotosPickerSession.mockReset();
  pickerMocks.listPickedMediaItems.mockReset();
  driveMocks.appendDriveProjectAssetsToManifest.mockReset();
  driveMocks.saveDriveProjectAsset.mockReset();
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Photos Picker page lifecycle", () => {
  it("invalidates an admin import on SPA route leave but not on Picker-style background events or same-route return", () => {
    const onRouteLeave = vi.fn();
    const onDocumentLeave = vi.fn();
    const onPersistedPageShow = vi.fn();
    const onUnmount = vi.fn();
    const firstEffects = renderBridge({
      onRouteLeave,
      onDocumentLeave,
      onPersistedPageShow,
      onUnmount,
    });
    firstEffects[0]?.();
    firstEffects[1]?.();
    const cleanup = firstEffects[2]?.();

    window.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));
    expect(onRouteLeave).not.toHaveBeenCalled();
    expect(onDocumentLeave).not.toHaveBeenCalled();

    const sameRouteEffects = renderBridge({
      onRouteLeave,
      onDocumentLeave,
      onPersistedPageShow,
      onUnmount,
    });
    sameRouteEffects[0]?.();
    sameRouteEffects[1]?.();
    expect(onRouteLeave).not.toHaveBeenCalled();

    navigation.pathname = "/settings";
    const leaveEffects = renderBridge({
      onRouteLeave,
      onDocumentLeave,
      onPersistedPageShow,
      onUnmount,
    });
    leaveEffects[0]?.();
    leaveEffects[1]?.();
    expect(onRouteLeave).toHaveBeenCalledOnce();

    expect(cleanup).toBeTypeOf("function");
    if (typeof cleanup === "function") {
      cleanup();
    }
    expect(onUnmount).toHaveBeenCalledOnce();
  });

  it("invalidates on pagehide, only syncs persisted pageshow, and removes both listeners on unmount", () => {
    const onRouteLeave = vi.fn();
    const onDocumentLeave = vi.fn();
    const onPersistedPageShow = vi.fn();
    const onUnmount = vi.fn();
    const effects = renderBridge({
      onRouteLeave,
      onDocumentLeave,
      onPersistedPageShow,
      onUnmount,
    });
    effects[0]?.();
    effects[1]?.();
    const cleanup = effects[2]?.();

    window.dispatchEvent(new Event("pagehide"));
    expect(onDocumentLeave).toHaveBeenCalledOnce();
    expect(onRouteLeave).not.toHaveBeenCalled();
    dispatchPageShow(false);
    expect(onPersistedPageShow).not.toHaveBeenCalled();
    dispatchPageShow(true);
    expect(onPersistedPageShow).toHaveBeenCalledOnce();

    if (typeof cleanup === "function") {
      cleanup();
    }
    window.dispatchEvent(new Event("pagehide"));
    dispatchPageShow(true);
    expect(onDocumentLeave).toHaveBeenCalledOnce();
    expect(onPersistedPageShow).toHaveBeenCalledOnce();
    expect(onUnmount).toHaveBeenCalledOnce();
  });

  it("wires route leave to visible cancellation and document leave/unmount to state-free invalidation", () => {
    expect(providersSource).toContain(
      "onRouteLeave={cancelAssetImport}",
    );
    expect(providersSource).toContain(
      "onDocumentLeave={invalidateAssetImportRuntimeForDocumentLeave}",
    );
    expect(providersSource).toContain(
      "onPersistedPageShow={syncAssetImportStateAfterPersistedPageShow}",
    );
    expect(providersSource).toContain(
      "onUnmount={invalidateAssetImportRuntimeWithoutStateUpdate}",
    );
    expect(providersSource).not.toContain(
      'addEventListener("visibilitychange"',
    );
    expect(providersSource).not.toContain('addEventListener("blur"');
  });
});

describe("Photos Picker bfcache recovery", () => {
  it("keeps pagehide state-free, then clears stale UI with a possible Drive-write warning on persisted restore", () => {
    const controller = new AbortController();
    hooks.values.set("assetImportAbortRef", { current: controller });
    hooks.values.set("assetImportRequestIdRef", { current: 7 });
    hooks.values.set("assetImportInFlightRef", { current: true });
    hooks.values.set("assetImportExternalWritePossiblyStartedRef", {
      current: true,
    });
    hooks.values.set("isAssetImportInFlight", true);
    hooks.values.set("assetImportPickerHref", "fixture-picker-link");
    hooks.values.set("assetImportStatus", "waitingForSelection");
    const { lifecycle } = renderProviderWithLifecycle();

    lifecycle.onDocumentLeave();

    expect(controller.signal.aborted).toBe(true);
    expect(ref<boolean>("assetImportInFlightRef").current).toBe(false);
    expect(
      ref<boolean>("assetImportExternalWritePossiblyStartedRef").current,
    ).toBe(false);
    expect(hooks.values.get("isAssetImportInFlight")).toBe(true);
    expect(hooks.values.get("assetImportPickerHref")).toBe(
      "fixture-picker-link",
    );

    lifecycle.onPersistedPageShow();

    expect(hooks.values.get("isAssetImportInFlight")).toBe(false);
    expect(hooks.values.get("assetImportPickerHref")).toBeNull();
    expect(hooks.values.get("assetImportStatus")).toBe("cancelled");
    expect(hooks.values.get("assetImportBatch")).toEqual([]);
    expect(hooks.values.get("assetImportMessage")).toContain(
      "Drive状態を再確認",
    );
    expect(hooks.values.get("assetImportDiagnostics")).toEqual(
      expect.arrayContaining([
        "Drive上に素材ファイルが作成済みの可能性があります。",
        "自動削除・自動修復は行いません。",
      ]),
    );
  });

  it("does not let an old persisted restore clear a newer import", () => {
    const oldController = new AbortController();
    hooks.values.set("assetImportAbortRef", { current: oldController });
    hooks.values.set("assetImportRequestIdRef", { current: 11 });
    hooks.values.set("assetImportInFlightRef", { current: true });
    hooks.values.set("isAssetImportInFlight", true);
    hooks.values.set("assetImportPickerHref", "old-picker-link");
    const { lifecycle } = renderProviderWithLifecycle();

    lifecycle.onDocumentLeave();

    const newController = new AbortController();
    ref<number>("assetImportRequestIdRef").current += 1;
    ref<AbortController | null>("assetImportAbortRef").current = newController;
    ref<boolean>("assetImportInFlightRef").current = true;
    hooks.values.set("isAssetImportInFlight", true);
    hooks.values.set("assetImportPickerHref", "new-picker-link");

    lifecycle.onPersistedPageShow();

    expect(ref<AbortController | null>("assetImportAbortRef").current).toBe(
      newController,
    );
    expect(newController.signal.aborted).toBe(false);
    expect(hooks.values.get("isAssetImportInFlight")).toBe(true);
    expect(hooks.values.get("assetImportPickerHref")).toBe("new-picker-link");
  });

  it("releases a cancelled Photos OAuth request and lets a restart await its detached callback without a duplicate request", async () => {
    prepareProviderState();
    hooks.values.set("photosPickerAccessTokenRef", { current: null });
    hooks.values.set("accessTokenRef", { current: "fixture-drive-credential" });
    hooks.values.set("photosExportAccessTokenRef", {
      current: "fixture-export-credential",
    });
    const requestAccessToken = vi.fn();
    let sharedTokenConfig:
      | {
          error_callback: (error: { type?: string }) => void;
        }
      | undefined;
    const initTokenClient = vi.fn((config) => {
      if (!sharedTokenConfig) {
        sharedTokenConfig = config;
        return { requestAccessToken };
      }
      return { requestAccessToken: vi.fn() };
    });
    Object.assign(window, {
      google: { accounts: { oauth2: { initTokenClient } } },
    });
    const { context, lifecycle, identityScriptProps } =
      renderProviderWithLifecycle();
    expect(identityScriptProps).toBeDefined();
    identityScriptProps?.onReady();

    const cancelledRun = context.startAssetImport();
    await flushPromises();
    expect(requestAccessToken).toHaveBeenCalledOnce();
    expect(ref<string | null>("tokenRequestKindRef").current).toBe("photos");

    lifecycle.onDocumentLeave();
    await cancelledRun;

    expect(ref<string | null>("tokenRequestKindRef").current).toBeNull();
    expect(ref<unknown>("pendingPhotosTokenRequestRef").current).toBeNull();

    const restartedRun = context.startAssetImport();
    await flushPromises();
    expect(requestAccessToken).toHaveBeenCalledOnce();
    expect(ref<string | null>("tokenRequestKindRef").current).toBe("photos");
    sharedTokenConfig?.error_callback({ type: "popup_closed" });
    await restartedRun;

    expect(hooks.values.get("googleStatus")).toBe("connected");
    expect(ref<string | null>("accessTokenRef").current).toBe(
      "fixture-drive-credential",
    );
    expect(ref<string | null>("photosExportAccessTokenRef").current).toBe(
      "fixture-export-credential",
    );
    expect(ref<string | null>("tokenRequestKindRef").current).toBeNull();
    expect(hooks.values.get("assetImportStatus")).toBe("cancelled");

    const freshRun = context.startAssetImport();
    await flushPromises();
    expect(requestAccessToken).toHaveBeenCalledTimes(2);
    expect(ref<string | null>("tokenRequestKindRef").current).toBe("photos");
    sharedTokenConfig?.error_callback({ type: "popup_closed" });
    await freshRun;

    expect(ref<string | null>("tokenRequestKindRef").current).toBeNull();
  });
});

describe("Photos Picker stale request guards", () => {
  it("does not start a Drive write when a cancelled download resolves late", async () => {
    prepareProviderState();
    pickerMocks.createPhotosPickerSession.mockResolvedValue(createPickerSession());
    pickerMocks.listPickedMediaItems.mockResolvedValue({
      mediaItems: [createPickedPhoto()],
      nextPageToken: null,
      diagnostics: [],
    });
    let resolveDownload: ((value: unknown) => void) | null = null;
    pickerMocks.fetchAndValidatePickedPhoto.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDownload = resolve;
        }),
    );
    const context = renderProvider();

    const importRun = context.startAssetImport();
    await flushPromises();
    expect(pickerMocks.fetchAndValidatePickedPhoto).toHaveBeenCalledOnce();

    context.cancelAssetImport();
    resolveDownload?.({
      blob: new Blob(["fixture"]),
      downloadedContentType: "image/jpeg",
      downloadedSizeBytes: 7,
      sizeLimitBytes: 1024,
      diagnostics: [],
    });
    await importRun;

    expect(driveMocks.saveDriveProjectAsset).not.toHaveBeenCalled();
    expect(driveMocks.appendDriveProjectAssetsToManifest).not.toHaveBeenCalled();
    expect(hooks.values.get("assetImportBatch")).toEqual([]);
  });

  it("does not start manifest work or mutate cleared UI when a cancelled Drive write resolves late", async () => {
    prepareProviderState();
    pickerMocks.createPhotosPickerSession.mockResolvedValue(createPickerSession());
    pickerMocks.listPickedMediaItems.mockResolvedValue({
      mediaItems: [createPickedPhoto()],
      nextPageToken: null,
      diagnostics: [],
    });
    pickerMocks.fetchAndValidatePickedPhoto.mockResolvedValue({
      blob: new Blob(["fixture"]),
      downloadedContentType: "image/jpeg",
      downloadedSizeBytes: 7,
      sizeLimitBytes: 1024,
      diagnostics: [],
    });
    let resolveSave: ((value: unknown) => void) | null = null;
    driveMocks.saveDriveProjectAsset.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const context = renderProvider();

    const importRun = context.startAssetImport();
    await flushPromises();
    expect(driveMocks.saveDriveProjectAsset).toHaveBeenCalledOnce();

    context.cancelAssetImport();
    resolveSave?.({});
    await importRun;

    expect(driveMocks.appendDriveProjectAssetsToManifest).not.toHaveBeenCalled();
    expect(hooks.values.get("assetImportBatch")).toEqual([]);
  });

  it("prevents an old finally block from clearing a newer request", async () => {
    prepareProviderState();
    let resolveOldDownload: ((value: unknown) => void) | null = null;
    let resolveNewSession: ((value: unknown) => void) | null = null;
    pickerMocks.createPhotosPickerSession
      .mockResolvedValueOnce(createPickerSession())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNewSession = resolve;
          }),
      );
    pickerMocks.listPickedMediaItems.mockResolvedValue({
      mediaItems: [createPickedPhoto()],
      nextPageToken: null,
      diagnostics: [],
    });
    pickerMocks.fetchAndValidatePickedPhoto.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOldDownload = resolve;
        }),
    );
    const context = renderProvider();

    const oldRun = context.startAssetImport();
    await flushPromises();
    context.cancelAssetImport();
    const newRun = context.startAssetImport();
    await flushPromises();
    expect(pickerMocks.createPhotosPickerSession).toHaveBeenCalledTimes(2);
    const newController = ref<AbortController | null>(
      "assetImportAbortRef",
    ).current;
    const newRequestId = ref<number>("assetImportRequestIdRef").current;

    resolveOldDownload?.({
      blob: new Blob(["fixture"]),
      downloadedContentType: "image/jpeg",
      downloadedSizeBytes: 7,
      sizeLimitBytes: 1024,
      diagnostics: [],
    });
    await oldRun;

    expect(ref<number>("assetImportRequestIdRef").current).toBe(newRequestId);
    expect(ref<AbortController | null>("assetImportAbortRef").current).toBe(
      newController,
    );
    expect(ref<boolean>("assetImportInFlightRef").current).toBe(true);
    expect(driveMocks.saveDriveProjectAsset).not.toHaveBeenCalled();
    expect(driveMocks.appendDriveProjectAssetsToManifest).not.toHaveBeenCalled();

    context.cancelAssetImport();
    resolveNewSession?.(createPickerSession());
    await newRun;
  });
});
