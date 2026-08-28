import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  DRIVE_AND_PHOTOS_PICKER_SCOPES,
  DRIVE_FILE_SCOPE,
  PHOTOS_LIBRARY_APPENDONLY_SCOPE,
} from "../google-auth";
import {
  createGooglePhotosPickerSessionClientController,
  GOOGLE_PHOTOS_PICKER_SESSION_CREATE_PATH,
  GOOGLE_PHOTOS_PICKER_SESSION_DELETE_PATH,
  GOOGLE_PHOTOS_PICKER_SESSION_RESTORE_PATH,
} from "./browser-session";

const source = readFileSync(
  new URL("./browser-session.ts", import.meta.url),
  "utf8",
);

const RESTORED_TOKEN = "ya29.restored-photos-picker-token";
const MANUAL_TOKEN = "ya29.manual-photos-picker-token";

describe("google photos picker session browser client", () => {
  it("restores a valid session without GIS", async () => {
    const { controller, accessToken, fetchMock, gisCalls } = createHarness();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        kind: "restored",
        accessToken: RESTORED_TOKEN,
        expiresAtMs: 1_700_000_000_000,
      }),
    );

    await controller.restoreOnPageLoad();

    expect(accessToken.current).toBe(RESTORED_TOKEN);
    expect(gisCalls).toHaveLength(0);
    expect(fetchUrls(fetchMock)).toEqual([
      GOOGLE_PHOTOS_PICKER_SESSION_RESTORE_PATH,
    ]);
  });

  it("treats expired restore as unavailable without GIS", async () => {
    const { controller, accessToken, fetchMock, gisCalls } = createHarness();
    fetchMock.mockResolvedValueOnce(jsonResponse({ kind: "notConnected" }));

    await controller.restoreOnPageLoad();

    expect(accessToken.current).toBeNull();
    expect(gisCalls).toHaveLength(0);
  });

  it("persists Photos Picker OAuth into the Photos session path only", async () => {
    const { controller, fetchMock } = createHarness();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ kind: "created", expiresAtMs: 1_700_000_000_000 }),
    );

    await controller.persistAfterPhotosPickerConnect({
      access_token: MANUAL_TOKEN,
      expires_in: 1200,
      scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
    });

    expect(fetchUrls(fetchMock)).toEqual([
      GOOGLE_PHOTOS_PICKER_SESSION_CREATE_PATH,
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      accessToken: MANUAL_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
    });
  });

  it("does not persist Drive-only or Photos export scopes", async () => {
    const { controller, fetchMock } = createHarness();

    await controller.persistAfterPhotosPickerConnect({
      access_token: MANUAL_TOKEN,
      expires_in: 1200,
      scope: DRIVE_FILE_SCOPE,
    });
    await controller.persistAfterPhotosPickerConnect({
      access_token: MANUAL_TOKEN,
      expires_in: 1200,
      scope: `${DRIVE_AND_PHOTOS_PICKER_SCOPES} ${PHOTOS_LIBRARY_APPENDONLY_SCOPE}`,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call Drive session endpoints", async () => {
    const { controller, fetchMock } = createHarness();
    fetchMock.mockResolvedValue(jsonResponse({ kind: "notConnected" }));
    await controller.restoreOnPageLoad();
    await controller.persistAfterPhotosPickerConnect({
      access_token: MANUAL_TOKEN,
      expires_in: 900,
      scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
    });
    controller.deleteAfterLocalDisconnect();
    await Promise.resolve();

    for (const url of fetchUrls(fetchMock)) {
      expect(url).toContain("/api/google-photos-picker-session/");
      expect(url).not.toContain("/api/google-session/");
    }
    expect(fetchUrls(fetchMock)).toContain(
      GOOGLE_PHOTOS_PICKER_SESSION_DELETE_PATH,
    );
  });

  it("does not keep tokens in storage helpers or Drive cookie names", () => {
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("indexedDB");
    expect(source).not.toContain("document.cookie");
    expect(source).not.toContain("__Host-google-session");
    expect(source).not.toContain("/api/google-session/");
    expect(source).not.toContain("persistAfterManualConnect");
    expect(source).toContain("persistAfterPhotosPickerConnect");
    expect(source).not.toContain("console.log");
  });
});

function createHarness() {
  const accessToken = { current: null as string | null };
  const gisCalls: unknown[] = [];
  const fetchMock = vi.fn();
  const controller = createGooglePhotosPickerSessionClientController({
    fetch: fetchMock as typeof fetch,
    onRestored(token) {
      accessToken.current = token;
    },
  });
  return { controller, accessToken, fetchMock, gisCalls };
}

function fetchUrls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
