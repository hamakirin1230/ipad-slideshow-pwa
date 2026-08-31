import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const providers = readFileSync(
  new URL("./app-providers.tsx", import.meta.url),
  "utf8",
);
const coordinator = readFileSync(
  new URL(
    "../lib/google-photos-export/sync-coordinator.ts",
    import.meta.url,
  ),
  "utf8",
);
const photosExportPanel = readFileSync(
  new URL("./admin/google-photos-export-panel.tsx", import.meta.url),
  "utf8",
);

function extractFunction(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const syncNext = source.indexOf("\n  function ", start + 1);
  const asyncNext = source.indexOf("\n  async function ", start + 1);
  const candidates = [syncNext, asyncNext].filter((index) => index !== -1);
  const end = candidates.length === 0 ? undefined : Math.min(...candidates);
  return source.slice(start, end);
}

function extractType(source: string, name: string) {
  const start = source.indexOf(`type ${name} =`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(";\n", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 1);
}

describe("AppProviders Google Photos same-album sync action", () => {
  it("starts the dedicated sync OAuth request before the first await", () => {
    const action = extractFunction(
      providers,
      "syncSelectedProjectToGooglePhotos",
    );
    const requestStart = action.indexOf(
      "requestPhotosSyncAccessToken(requestSequence)",
    );
    const firstAwait = action.indexOf("await ");
    const tokenAwait = action.indexOf("await photosAccessTokenPromise");
    const coordinatorCall = action.indexOf(
      "await executeGooglePhotosSameAlbumSync({",
    );

    expect(requestStart).toBeGreaterThan(-1);
    expect(firstAwait).toBeGreaterThan(requestStart);
    expect(tokenAwait).toBe(firstAwait);
    expect(coordinatorCall).toBeGreaterThan(tokenAwait);
    expect(action).not.toContain("requestPhotosExportAccessToken");
    expect(action).not.toContain("photosExportAccessTokenRef");
    expect(action).not.toContain("photosPickerAccessTokenRef");
  });

  it("fails synchronously for missing or conflicting Drive authority", () => {
    const action = extractFunction(
      providers,
      "syncSelectedProjectToGooglePhotos",
    );
    const requestStart = action.indexOf(
      "requestPhotosSyncAccessToken(requestSequence)",
    );
    const readiness = action.slice(0, requestStart);

    for (const contract of [
      'googleStatus !== "connected"',
      "driveFileGranted !== true",
      'driveStatus !== "ready"',
      'projectStatus !== "ready"',
      "!driveAccessToken",
      "!workspace",
      "!project",
      "project.projectId !== projectId",
      "selectedProjectId !== projectId",
      "driveOperationInFlightRef.current",
      "assetImportInFlightRef.current",
      "projectPublicationWriteInFlightRef.current",
    ]) {
      expect(readiness).toContain(contract);
    }
    expect(readiness).toContain('return { status: "notReady" }');
    expect(readiness).not.toContain("executeGooglePhotosSameAlbumSync");
  });

  it("guards duplicate sync and one-shot export before OAuth", () => {
    const action = extractFunction(
      providers,
      "syncSelectedProjectToGooglePhotos",
    );
    const requestStart = action.indexOf(
      "requestPhotosSyncAccessToken(requestSequence)",
    );
    const beforeOAuth = action.slice(0, requestStart);

    expect(beforeOAuth).toContain("googlePhotosSyncInFlightRef.current");
    expect(beforeOAuth).toContain("googlePhotosExportInFlightRef.current");
    expect(beforeOAuth.match(/status: "alreadyRunning"/g)).toHaveLength(2);
  });

  it("captures and revalidates Drive authority around coordinator execution", () => {
    const action = extractFunction(
      providers,
      "syncSelectedProjectToGooglePhotos",
    );
    const authority = extractFunction(
      providers,
      "googlePhotosSyncAuthorityIsCurrent",
    );

    expect(action).toContain("const authoritySnapshot:");
    expect(action).toContain("driveAccessToken,");
    expect(action).toContain("workspaceId: workspace.workspaceId");
    expect(action).toContain(
      "projectsRootFolderId: workspace.projectsRootFolderId",
    );
    expect(action).toContain("projectFolderId: project.projectFolderId");
    expect(action).toContain(
      "!googlePhotosSyncAuthorityIsCurrent(authoritySnapshot)",
    );
    expect(authority).toContain(
      "accessTokenRef.current === snapshot.driveAccessToken",
    );
    expect(authority).toContain(
      "current.selectedProjectId === snapshot.projectId",
    );
    expect(authority).toContain(
      "current.project.projectFolderId === snapshot.projectFolderId",
    );
  });

  it("invokes only the coordinator with local Drive and sync tokens", () => {
    const action = extractFunction(
      providers,
      "syncSelectedProjectToGooglePhotos",
    );

    expect(action.match(/executeGooglePhotosSameAlbumSync\(\{/g)).toHaveLength(1);
    expect(action).toContain("photosAccessToken = await photosAccessTokenPromise");
    expect(action).toContain("driveAccessToken,");
    expect(action).toContain("photosAccessToken,");
    for (const directEngine of [
      "createGooglePhotosAlbum",
      "createGooglePhotosSyncMediaItemsAfterAlbumBound",
      "reconcileGooglePhotosSyncMembership",
      "updateGooglePhotosSyncAlbumTitle",
      "finalizeGooglePhotosSameAlbumSync",
    ]) {
      expect(providers).not.toContain(directEngine);
    }
  });
});

describe("AppProviders Google Photos same-album runtime boundary", () => {
  it("keeps resumable media runtime and ownership in private refs", () => {
    const action = extractFunction(
      providers,
      "syncSelectedProjectToGooglePhotos",
    );
    const clearRuntime = extractFunction(
      providers,
      "clearGooglePhotosSyncMediaRuntime",
    );

    expect(providers).toContain(
      "useRef<GooglePhotosSyncMediaRuntime | null>(null)",
    );
    expect(providers).toContain(
      "useRef<GooglePhotosSyncMediaRuntimeOwner | null>(null)",
    );
    expect(action).toContain("!googlePhotosSyncOwnerMatches(");
    expect(action).toContain("clearGooglePhotosSyncMediaRuntime()");
    expect(action).toContain("onMediaRuntime(runtime)");
    expect(action).toContain(
      "googlePhotosSyncMediaRuntimeRef.current = runtime",
    );
    expect(action).toContain(
      "googlePhotosSyncMediaRuntimeOwnerRef.current = owner",
    );
    expect(clearRuntime).toContain(
      "googlePhotosSyncMediaRuntimeRef.current = null",
    );
    expect(clearRuntime).toContain(
      "googlePhotosSyncMediaRuntimeOwnerRef.current = null",
    );
    expect(providers).not.toContain("setGooglePhotosSyncMediaRuntime");
  });

  it("retains runtime only for a media-stage interrupted result", () => {
    const retain = extractFunction(
      providers,
      "shouldRetainGooglePhotosSyncMediaRuntime",
    );
    const action = extractFunction(
      providers,
      "syncSelectedProjectToGooglePhotos",
    );

    expect(retain).toContain('result.status === "interrupted"');
    expect(retain).toContain('result.stage === "media"');
    expect(action).toContain(
      "if (!shouldRetainGooglePhotosSyncMediaRuntime(result))",
    );
    expect(action).toContain("clearGooglePhotosSyncMediaRuntime()");
    expect(action).not.toContain("executeGooglePhotosSameAlbumSync({\n        driveAccessToken,\n        photosAccessToken,\n        selectedProjectId: project.projectId,\n        retry");
  });

  it("publishes only sanitized progress for the current request and authority", () => {
    const action = extractFunction(
      providers,
      "syncSelectedProjectToGooglePhotos",
    );
    const progressStart = action.indexOf("onProgress(progress)");
    const progress = action.slice(progressStart);

    expect(progressStart).toBeGreaterThan(-1);
    expect(progress).toContain(
      "requestSequence === googlePhotosSyncRequestSequenceRef.current",
    );
    expect(progress).toContain("!controller.signal.aborted");
    expect(progress).toContain(
      "googlePhotosSyncAuthorityIsCurrent(authoritySnapshot)",
    );
    expect(progress).toContain("setGooglePhotosSyncProgress(progress)");
  });

  it("does not persist or expose tokens and runtime", () => {
    const context = providers.slice(
      providers.indexOf("type AppContextValue ="),
      providers.indexOf("const AppContext ="),
    );

    expect(context).toContain("syncSelectedProjectToGooglePhotos:");
    expect(context).toContain("abortGooglePhotosSync: () => void");
    expect(context).toContain("isGooglePhotosSyncInFlight: boolean");
    expect(context).toContain("googlePhotosSyncProgress:");
    expect(context).toContain("googlePhotosSyncResult:");
    expect(context).not.toContain("photosSyncAccessToken");
    expect(context).not.toContain("getPhotosSyncAccessToken");
    expect(context).not.toContain("photosSyncMediaRuntime");
    expect(providers).not.toContain("setPhotosSyncAccessToken");
    expect(providers).not.toContain("localStorage");
    expect(providers).not.toContain("sessionStorage");
    expect(providers).not.toContain("indexedDB");
    expect(providers).not.toContain("document.cookie");
  });
});

describe("AppProviders Google Photos same-album safe completion", () => {
  it("maps authorization and abort failures without raw error data", () => {
    const mapping = extractFunction(
      providers,
      "mapPhotosSyncAuthorizationError",
    );
    const action = extractFunction(
      providers,
      "syncSelectedProjectToGooglePhotos",
    );

    expect(mapping).toContain('error.category === "popupBlocked"');
    expect(mapping).toContain('status: "authorizationRequired"');
    expect(mapping).toContain('error.status === "cancelled"');
    expect(mapping).toContain('status: "authorizationDenied"');
    expect(mapping).not.toContain("error.message");
    expect(mapping).not.toContain("error.diagnostics");
    expect(action).toContain("isAbortError(error)");
    expect(action).toContain('status: "cancelled"');
    expect(action).not.toContain("AbortSignal.reason");
    expect(action).not.toContain("console.");
  });

  it("invalidates explicit abort and prevents stale finalization", () => {
    const abort = extractFunction(providers, "abortGooglePhotosSync");
    const action = extractFunction(
      providers,
      "syncSelectedProjectToGooglePhotos",
    );

    expect(abort).toContain("googlePhotosSyncRequestSequenceRef.current += 1");
    expect(abort).toContain("googlePhotosSyncAbortRef.current?.abort()");
    expect(abort).toContain("clearPhotosSyncAuthorization()");
    expect(abort).toContain("setGooglePhotosSyncProgress(null)");
    expect(abort).toContain('setGooglePhotosSyncResult({ status: "cancelled" })');
    expect(action).toContain(
      "if (requestSequence === googlePhotosSyncRequestSequenceRef.current)",
    );
    expect(action.match(/executeGooglePhotosSameAlbumSync\(\{/g)).toHaveLength(1);
    expect(abort).not.toContain("rollback");
    expect(abort).not.toContain("retry");
  });

  it("clears execution, runtime, and authorization on authority reset paths", () => {
    const clearExecution = extractFunction(
      providers,
      "clearGooglePhotosSyncExecution",
    );
    const resetProject = extractFunction(providers, "resetProjectState");
    const connect = extractFunction(providers, "connectGoogle");
    const resetAuth = extractFunction(providers, "resetGoogleAuthFlow");
    const disconnect = extractFunction(providers, "disconnectGoogle");

    expect(clearExecution).toContain("googlePhotosSyncAbortRef.current?.abort()");
    expect(clearExecution).toContain("clearGooglePhotosSyncMediaRuntime()");
    expect(clearExecution).toContain("setGooglePhotosSyncProgress(null)");
    expect(resetProject).toContain("clearGooglePhotosSyncExecution()");
    expect(connect).toContain("clearPhotosSyncAuthorization()");
    expect(connect).toContain("resetDriveState()");
    expect(resetAuth).toContain("clearPhotosSyncAuthorization()");
    expect(resetAuth).toContain("resetDriveState()");
    expect(disconnect).toContain("clearPhotosSyncAuthorization()");
    expect(disconnect).toContain("resetDriveState()");
    expect(providers).toContain(`clearPhotosSyncAuthorization();
      photosSyncTokenClientRef.current = null;`);
  });

  it("keeps public results categorical and free of internal identifiers", () => {
    const publicResult = extractType(providers, "GooglePhotosSyncActionResult");
    const coordinatorResult = extractType(
      coordinator,
      "GooglePhotosSameAlbumSyncCoordinatorResult",
    );
    const serializedContract = `${publicResult}\n${coordinatorResult}`;

    for (const unsafeField of [
      "accessToken",
      "operationId",
      "albumId",
      "mediaItemId",
      "fileId",
      "fingerprint",
      "runtime",
      "sessionUrl",
      "uploadToken",
      "preparedSource",
      "binding",
      "plan",
    ]) {
      expect(serializedContract).not.toContain(unsafeField);
    }
    expect(publicResult).toContain('status: "notReady"');
    expect(publicResult).toContain('status: "alreadyRunning"');
    expect(publicResult).toContain('status: "authorizationRequired"');
    expect(publicResult).toContain('status: "authorizationDenied"');
    expect(publicResult).toContain('status: "cancelled"');
  });

  it("leaves the current one-shot export UI and sync UI unwired", () => {
    expect(photosExportPanel).not.toContain("syncSelectedProjectToGooglePhotos");
    expect(photosExportPanel).not.toContain("abortGooglePhotosSync");
    expect(photosExportPanel).not.toContain("Googleフォトを更新");
    expect(photosExportPanel).toContain("commitPreparedGooglePhotosExport");
  });
});
