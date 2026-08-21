import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const providers = readFileSync(new URL("./app-providers.tsx", import.meta.url), "utf8");
const restoreHelper = readFileSync(
  new URL("../lib/google-connection-restore.ts", import.meta.url),
  "utf8",
);
const photosExportPanel = readFileSync(
  new URL("./admin/google-photos-export-panel.tsx", import.meta.url),
  "utf8",
);

function extractFunction(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\n  function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("google connection restore wiring", () => {
  it("starts a restore window only after manual Drive connect success", () => {
    expect(providers).toContain('tokenRequestKindRef.current = "drive"');
    expect(providers).toContain("writeGoogleConnectionRestoreMarker(");
    expect(providers).toContain(
      "createGoogleConnectionRestoreExpiry(\n            Date.now(),\n            tokenResponse.expires_in,",
    );

    const silentApply = extractFunction(providers, "applySilentDriveRestoreResponse");
    expect(silentApply).toContain("accessTokenRef.current = tokenResponse.access_token");
    expect(silentApply).not.toContain("writeGoogleConnectionRestoreMarker");
    expect(silentApply).not.toContain("photosExportAccessTokenRef");
  });

  it("attempts one silent Drive restore after the token client is ready", () => {
    const restore = extractFunction(providers, "trySilentDriveRestore");
    expect(restore).toContain("silentDriveRestoreAttemptedRef.current");
    expect(restore).toContain("readActiveGoogleConnectionRestoreMarker(Date.now())");
    expect(restore).toContain("if (!marker)");
    expect(restore).toContain('tokenRequestKindRef.current = "driveRestore"');
    expect(restore).toContain("scope: DRIVE_FILE_SCOPE");
    expect(restore).toContain("include_granted_scopes: false");
    expect(restore).toContain('prompt: "none"');
    expect(restore).not.toContain('prompt: ""');
    expect(restore).not.toContain("DRIVE_AND_PHOTOS_PICKER_SCOPES");
    expect(restore).not.toContain("PHOTOS_LIBRARY_APPENDONLY_SCOPE");
    expect(restore).not.toContain("GOOGLE_PHOTOS_EXPORT_SCOPE");
    expect(restore).not.toContain("photospicker");
    expect(restore).not.toContain("photoslibrary.appendonly");
    expect(restore).not.toContain("select_account");
    expect(restore).not.toContain("consent");
    expect(providers).toContain("trySilentDriveRestore()");
  });

  it("returns to a reconnectable disconnected state on silent restore failure", () => {
    const fail = extractFunction(providers, "failSilentDriveRestore");
    expect(fail).toContain("clearGoogleConnectionRestoreMarker()");
    expect(fail).toContain('setGoogleStatus(hasClientId ? "notConnected"');
    expect(fail).not.toContain("connectGoogle(");
    expect(fail).not.toContain('prompt: "select_account"');
    expect(fail).not.toContain("requestAccessToken");
  });

  it("keeps visible account selection on the manual connect path only", () => {
    const restore = extractFunction(providers, "trySilentDriveRestore");
    const connect = extractFunction(providers, "connectGoogle");
    const exportInitStart = providers.indexOf(
      "photosExportTokenClientRef.current = oauth2.initTokenClient({",
    );
    const exportInitEnd = providers.indexOf(
      'setGoogleStatus("notConnected")',
      exportInitStart,
    );
    const exportInit = providers.slice(exportInitStart, exportInitEnd);

    expect(restore.match(/requestAccessToken/g)).toHaveLength(1);
    expect(connect).toContain('prompt: "select_account"');
    expect(connect).not.toContain('prompt: "none"');
    expect(exportInit).toContain('prompt: "consent"');
    expect(exportInit).toContain("scope: GOOGLE_PHOTOS_EXPORT_SCOPE");
    expect(exportInit).toContain("include_granted_scopes: false");
  });

  it("clears the restore marker on disconnect, reset, and Drive auth failure", () => {
    expect(extractFunction(providers, "disconnectGoogle")).toContain(
      "clearGoogleConnectionRestoreMarker()",
    );
    expect(extractFunction(providers, "resetGoogleAuthFlow")).toContain(
      "clearGoogleConnectionRestoreMarker()",
    );
    expect(extractFunction(providers, "resetGoogleAfterDriveAuthFailure")).toContain(
      "clearGoogleConnectionRestoreMarker()",
    );
  });

  it("does not persist access tokens in storage or Photos export restore", () => {
    expect(providers).not.toContain("localStorage");
    expect(providers).not.toContain("sessionStorage");
    expect(providers).not.toContain("document.cookie");
    expect(restoreHelper).toContain('JSON.stringify({ expiresAt })');
    expect(restoreHelper).not.toContain("access_token");
    expect(restoreHelper).not.toContain("refresh_token");
    expect(restoreHelper).not.toContain("id_token");
    expect(providers).not.toContain("photosExportAccessTokenRef.current = tokenResponse.access_token;\n    writeGoogleConnectionRestoreMarker");
    expect(photosExportPanel).not.toContain("writeGoogleConnectionRestoreMarker");
    expect(photosExportPanel).not.toContain("trySilentDriveRestore");
  });
});
