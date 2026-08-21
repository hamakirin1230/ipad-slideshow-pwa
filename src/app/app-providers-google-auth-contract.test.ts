import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const providers = readFileSync(new URL("./app-providers.tsx", import.meta.url), "utf8");
const photosExportPanel = readFileSync(
  new URL("./admin/google-photos-export-panel.tsx", import.meta.url),
  "utf8",
);
const driveSettingsPanel = readFileSync(
  new URL("./settings/drive-settings-panel.tsx", import.meta.url),
  "utf8",
);

function extractFunction(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\n  function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("google auth does not auto-restore after refresh", () => {
  it("does not request a token on GIS ready or page load", () => {
    const scriptReadyStart = providers.indexOf("function handleScriptReady(");
    const connectStart = providers.indexOf("function connectGoogle(");
    expect(scriptReadyStart).toBeGreaterThan(-1);
    expect(connectStart).toBeGreaterThan(scriptReadyStart);
    const scriptReady = providers.slice(scriptReadyStart, connectStart);
    expect(scriptReady).toContain("oauth2.initTokenClient({");
    expect(scriptReady).toContain('setGoogleStatus("notConnected")');
    expect(scriptReady).not.toContain("requestAccessToken");
    expect(providers).not.toContain("trySilentDriveRestore");
    expect(providers).not.toContain("driveRestore");
    expect(providers).not.toContain('prompt: "none"');
    expect(providers).not.toContain("google-connection-restore");
    expect(providers).toContain("restoreOnPageLoad()");
    expect(providers).not.toContain("restoreOnPageLoad(abort.signal)");
    expect(providers).toContain("controller.dispose()");
    expect(providers).toContain("setDriveFileGranted(true)");
    expect(providers).not.toContain("/api/google-session/restore\"");
  });

  it("starts visible Drive authorization only from manual connect", () => {
    const connect = extractFunction(providers, "connectGoogle");
    expect(connect).toContain('tokenRequestKindRef.current = "drive"');
    expect(connect).toContain("requestAccessToken({");
    expect(connect).toContain('prompt: "select_account"');
    expect(connect).not.toContain('prompt: "none"');
    expect(connect).not.toContain("DRIVE_AND_PHOTOS_PICKER_SCOPES");
    expect(connect).not.toContain("GOOGLE_PHOTOS_EXPORT_SCOPE");
  });

  it("keeps Drive token client on drive.file without Photos scopes", () => {
    const driveInitStart = providers.indexOf(
      "tokenClientRef.current = oauth2.initTokenClient({",
    );
    const exportInitStart = providers.indexOf(
      "photosExportTokenClientRef.current = oauth2.initTokenClient({",
    );
    const driveInit = providers.slice(driveInitStart, exportInitStart);
    expect(driveInit).toContain("scope: DRIVE_FILE_SCOPE");
    expect(driveInit).toContain("include_granted_scopes: false");
    expect(driveInit).not.toContain("GOOGLE_PHOTOS_EXPORT_SCOPE");
    expect(driveInit).not.toContain("photospicker");
    expect(driveInit).not.toContain("photoslibrary.appendonly");
  });

  it("keeps Photos Picker and Photos export on their own user-started clients", () => {
    expect(providers).toContain("tokenRequestKindRef.current = \"photos\"");
    expect(providers).toContain("scope: DRIVE_AND_PHOTOS_PICKER_SCOPES");
    expect(providers).toContain(
      "photosExportTokenClientRef.current = oauth2.initTokenClient({",
    );
    expect(providers).toContain("scope: GOOGLE_PHOTOS_EXPORT_SCOPE");
    expect(providers).toContain(
      "scope: GOOGLE_PHOTOS_EXPORT_SCOPE,\n          include_granted_scopes: false,",
    );
    expect(photosExportPanel).not.toContain("trySilentDriveRestore");
  });

  it("does not persist Google tokens or restore markers", () => {
    expect(providers).not.toContain("localStorage");
    expect(providers).not.toContain("sessionStorage");
    expect(providers).not.toContain("document.cookie");
    expect(providers).not.toContain("ipad-slideshow:google-connection-restore");
    expect(providers).toContain("accessTokenRef.current = tokenResponse.access_token");
    expect(providers).toContain("accessTokenRef.current = accessToken");
    expect(providers).not.toContain("setAccessToken");
  });

  it("connects Drive GIS success to session create and keeps Photos OAuth isolated", () => {
    expect(providers).toContain("persistAfterManualConnect");
    expect(providers).toContain("deleteAfterLocalDisconnect");
    expect(providers).toContain('from "@/lib/google-session/browser-session"');
    const photosResponse = extractFunction(providers, "handlePhotosTokenResponse");
    const photosExport = extractFunction(
      providers,
      "handlePhotosExportTokenResponse",
    );
    const photosRequest = extractFunction(providers, "requestPhotosAccessToken");
    const photosExportRequest = extractFunction(
      providers,
      "requestPhotosExportAccessToken",
    );
    for (const photosFn of [
      photosResponse,
      photosExport,
      photosRequest,
      photosExportRequest,
    ]) {
      expect(photosFn).not.toContain("persistAfterManualConnect");
      expect(photosFn).not.toContain("invalidate");
      expect(photosFn).not.toContain("dispose");
      expect(photosFn).not.toContain("deleteAfterLocalDisconnect");
      expect(photosFn).not.toContain("queueDriveWorkspaceAutoCheck");
      expect(photosFn).not.toContain("checkDriveWorkspace");
      expect(photosFn).not.toContain("googleConnectionGenerationRef");
      expect(photosFn).not.toContain("/api/google-session/");
    }
    const driveCallback = providers.slice(
      providers.indexOf("accessTokenRef.current = tokenResponse.access_token"),
      providers.indexOf("error_callback: (error) => {"),
    );
    expect(driveCallback).toContain("persistAfterManualConnect");
    expect(driveCallback).toContain("queueDriveWorkspaceAutoCheckRef.current()");
  });
});

describe("restored google session auto-checks drive workspace", () => {
  it("does not auto-check Drive or call GIS when restore is notConnected", () => {
    const restoredCallback = extractFunction(providers, "AppProviders").includes(
      "onRestored",
    );
    expect(restoredCallback).toBe(true);
    expect(providers).toContain("queueDriveWorkspaceAutoCheckRef.current()");
    expect(providers).toContain("void controller.restoreOnPageLoad();");
    const restoreEffectStart = providers.indexOf(
      "void controller.restoreOnPageLoad();",
    );
    const restoreEffect = providers.slice(
      restoreEffectStart,
      providers.indexOf("}, []);", restoreEffectStart),
    );
    expect(restoreEffect).not.toContain("checkDriveWorkspace");
    expect(restoreEffect).not.toContain("queueDriveWorkspaceAutoCheck");
    expect(restoreEffect).not.toContain("requestAccessToken");
  });

  it("auto-checks Drive once after restore success without GIS", () => {
    const onRestoredStart = providers.indexOf("onRestored(accessToken) {");
    const onRestored = providers.slice(
      onRestoredStart,
      providers.indexOf("onCreateFailed()", onRestoredStart),
    );
    expect(onRestored).toContain("accessTokenRef.current = accessToken");
    expect(onRestored).toContain('setGoogleStatus("connected")');
    expect(onRestored).toContain("setDriveFileGranted(true)");
    expect(onRestored).toContain("queueDriveWorkspaceAutoCheckRef.current()");
    expect(onRestored).not.toContain("requestAccessToken");
    expect(onRestored).not.toContain("createWorkspace");
  });

  it("auto-checks Drive once after manual connect without waiting for session create", () => {
    const driveCallback = providers.slice(
      providers.indexOf("accessTokenRef.current = tokenResponse.access_token"),
      providers.indexOf("error_callback: (error) => {"),
    );
    const driveSuccess = providers.slice(
      providers.indexOf("const granted = hasGrantedDriveFileScope(tokenResponse);"),
      providers.indexOf("error_callback: (error) => {"),
    );
    expect(driveSuccess.indexOf("hasGrantedDriveFileScope")).toBeLessThan(
      driveSuccess.indexOf("accessTokenRef.current = tokenResponse.access_token"),
    );
    expect(driveSuccess.indexOf("accessTokenRef.current = tokenResponse.access_token")).toBeLessThan(
      driveSuccess.indexOf('setGoogleStatus("connected")'),
    );
    const connectedAt = driveSuccess.indexOf('setGoogleStatus("connected")');
    expect(connectedAt).toBeLessThan(
      driveSuccess.indexOf("abortDriveOperation()", connectedAt),
    );
    expect(driveSuccess.indexOf("persistAfterManualConnect")).toBeLessThan(
      driveSuccess.indexOf("queueDriveWorkspaceAutoCheckRef.current()"),
    );
    expect(driveCallback).not.toContain("await googleSessionControllerRef");
    expect(driveCallback).not.toContain("createWorkspace");
    expect(driveCallback).toContain("void googleSessionControllerRef.current?.persistAfterManualConnect");
    expect(driveCallback.indexOf("abortDriveOperation()")).toBeLessThan(
      driveCallback.indexOf("queueDriveWorkspaceAutoCheckRef.current()"),
    );
  });

  it("keeps connected and still auto-checks when session create fails, without retry", () => {
    const onCreateFailedStart = providers.indexOf("onCreateFailed() {");
    const onCreateFailed = providers.slice(
      onCreateFailedStart,
      providers.indexOf("});", onCreateFailedStart),
    );
    expect(onCreateFailed).not.toContain("checkDriveWorkspace");
    expect(onCreateFailed).not.toContain("queueDriveWorkspaceAutoCheck");
    expect(onCreateFailed).not.toContain("requestAccessToken");
    expect(onCreateFailed).not.toContain('setGoogleStatus("notConnected")');
    const autoCheckStart = providers.indexOf(
      "function queueDriveWorkspaceAutoCheck(",
    );
    const autoCheck = providers.slice(
      autoCheckStart,
      providers.indexOf("async function createWorkspace(", autoCheckStart),
    );
    expect(autoCheck).toContain("void checkDriveWorkspace()");
    expect(autoCheck.split("void checkDriveWorkspace()").length - 1).toBe(1);
    expect(autoCheck.indexOf("!accessTokenRef.current")).toBeLessThan(
      autoCheck.indexOf("driveWorkspaceAutoCheckGenerationRef.current = generation"),
    );
    expect(autoCheck.indexOf("driveOperationInFlightRef.current")).toBeLessThan(
      autoCheck.indexOf("driveWorkspaceAutoCheckGenerationRef.current = generation"),
    );
  });

  it("does not let GIS script ready abort or reset a restored Drive check", () => {
    const scriptReadyStart = providers.indexOf("function handleScriptReady(");
    const connectStart = providers.indexOf("function connectGoogle(");
    const scriptReady = providers.slice(scriptReadyStart, connectStart);
    expect(scriptReady).not.toContain("checkDriveWorkspace");
    expect(scriptReady).not.toContain("requestAccessToken");
    expect(scriptReady).toContain(`if (accessTokenRef.current) {
      setDriveFileGranted(true);
      setGoogleStatus("connected");`);
    expect(scriptReady).toContain(`} else {
      abortDriveOperation();
      resetDriveState();`);
    const tokenPresent = scriptReady.slice(
      scriptReady.lastIndexOf("if (accessTokenRef.current)"),
      scriptReady.lastIndexOf("} else {"),
    );
    expect(tokenPresent).not.toContain("abortDriveOperation()");
    expect(tokenPresent).not.toContain("resetDriveState()");
    expect(tokenPresent).not.toContain("queueDriveWorkspaceAutoCheck");
    expect(tokenPresent).not.toContain("checkDriveWorkspace");
  });

  it("clears the session on auto workspace authRequired without GIS", () => {
    const applyResult = extractFunction(providers, "applyDriveCheckResult");
    expect(applyResult).toContain('result.status === "authRequired"');
    expect(applyResult).toContain("resetGoogleAfterDriveAuthFailure()");
    const authFailure = extractFunction(
      providers,
      "resetGoogleAfterDriveAuthFailure",
    );
    expect(authFailure).toContain("invalidateGoogleSessionForConnectionChange()");
    expect(authFailure).toContain("accessTokenRef.current = null");
    expect(authFailure).toContain("deleteAfterLocalDisconnect()");
    expect(authFailure).not.toContain("requestAccessToken");
    expect(authFailure).not.toContain("queueDriveWorkspaceAutoCheck");
    expect(authFailure).not.toContain("checkDriveWorkspace");
  });

  it("keeps Google connected after workspace operationFailed and does not retry", () => {
    const checkDrive = extractFunction(providers, "checkDriveWorkspace");
    expect(checkDrive).toContain('setDriveStatus("operationFailed")');
    expect(checkDrive).not.toContain("queueDriveWorkspaceAutoCheck");
    expect(checkDrive).not.toContain('setGoogleStatus("notConnected")');
    expect(checkDrive).not.toContain("requestAccessToken");
    expect(checkDrive).not.toContain("createWorkspace");
    expect(driveSettingsPanel).toContain("onClick={checkDriveWorkspace}");
    const autoCheckStart = providers.indexOf(
      "function queueDriveWorkspaceAutoCheck(",
    );
    const autoCheck = providers.slice(
      autoCheckStart,
      providers.indexOf("async function createWorkspace(", autoCheckStart),
    );
    expect(autoCheck).toContain(
      "driveWorkspaceAutoCheckGenerationRef.current === generation",
    );
    expect(autoCheck).not.toContain("createWorkspace");
  });

  it("does not auto-check Drive after disconnect", () => {
    const disconnect = extractFunction(providers, "disconnectGoogle");
    expect(disconnect).toContain("invalidateGoogleSessionForConnectionChange()");
    expect(disconnect).not.toContain("queueDriveWorkspaceAutoCheck");
    expect(disconnect).not.toContain("checkDriveWorkspace");
    expect(disconnect).toContain("deleteAfterLocalDisconnect()");
  });

  it("drops stale auto-check results after connect or disconnect abort", () => {
    const abort = extractFunction(providers, "abortDriveOperation");
    expect(abort).toContain("driveOperationRequestIdRef.current += 1");
    expect(abort).toContain("driveOperationAbortRef.current.abort()");
    const checkDrive = extractFunction(providers, "checkDriveWorkspace");
    expect(checkDrive).toContain(
      "if (requestId !== driveOperationRequestIdRef.current)",
    );
    expect(
      checkDrive.indexOf("if (requestId !== driveOperationRequestIdRef.current)"),
    ).toBeLessThan(checkDrive.indexOf("applyDriveCheckResult(result)"));
    expect(
      checkDrive.indexOf("if (requestId !== driveOperationRequestIdRef.current)"),
    ).toBeLessThan(checkDrive.indexOf('setDriveStatus("operationFailed")'));
    const connect = extractFunction(providers, "connectGoogle");
    expect(connect.indexOf("abortDriveOperation()")).toBeLessThan(
      connect.indexOf("invalidateGoogleSessionForConnectionChange()"),
    );
    const disconnect = extractFunction(providers, "disconnectGoogle");
    expect(disconnect).toContain("abortDriveOperation()");
    expect(disconnect.indexOf("abortDriveOperation()")).toBeLessThan(
      disconnect.indexOf("resetDriveState()"),
    );
  });
});
