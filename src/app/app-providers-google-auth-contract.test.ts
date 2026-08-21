import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const providers = readFileSync(new URL("./app-providers.tsx", import.meta.url), "utf8");
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
    expect(providers).not.toContain("setAccessToken");
  });
});
