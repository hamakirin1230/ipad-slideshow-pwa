import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DRIVE_AND_PHOTOS_PICKER_SCOPES, DRIVE_FILE_SCOPE } from "../google-auth";
import { generateGoogleSessionId, GOOGLE_SESSION_AES_KEY_BYTES } from "../google-session/server-primitives";
import type { GoogleSessionStore } from "../google-session/server-session-service";
import {
  GOOGLE_PHOTOS_PICKER_SESSION_COOKIE_NAME,
  handleGooglePhotosPickerSessionCreate,
  handleGooglePhotosPickerSessionDelete,
  handleGooglePhotosPickerSessionRestore,
  type GooglePhotosPickerSessionHttpRuntime,
} from "./server-http";

const httpSource = readFileSync(new URL("./server-http.ts", import.meta.url), "utf8");
const createRouteSource = readFileSync(
  new URL("../../app/api/google-photos-picker-session/create/route.ts", import.meta.url),
  "utf8",
);
const restoreRouteSource = readFileSync(
  new URL("../../app/api/google-photos-picker-session/restore/route.ts", import.meta.url),
  "utf8",
);
const deleteRouteSource = readFileSync(
  new URL("../../app/api/google-photos-picker-session/delete/route.ts", import.meta.url),
  "utf8",
);

const ORIGIN = "https://app.example";
const ACCESS_TOKEN = "ya29.photos-picker-access-token-secret";
const NOW_MS = 1_700_000_000_000;
const VENDOR_MESSAGE =
  "WRONGPASS redis://default:super-secret@host:6379 token=ya29.leaked";

class FakeStore implements GoogleSessionStore {
  records = new Map<string, { value: string; ttlSeconds: number }>();
  writes: Array<{ lookupKey: string; value: string; ttlSeconds: number }> = [];
  reads: string[] = [];
  deletes: string[] = [];
  writeError: Error | null = null;

  async write(input: {
    lookupKey: string;
    value: string;
    ttlSeconds: number;
  }) {
    this.writes.push(input);
    if (this.writeError) {
      throw this.writeError;
    }
    this.records.set(input.lookupKey, {
      value: input.value,
      ttlSeconds: input.ttlSeconds,
    });
  }

  async read(lookupKey: string) {
    this.reads.push(lookupKey);
    return this.records.get(lookupKey)?.value ?? null;
  }

  async delete(lookupKey: string) {
    this.deletes.push(lookupKey);
    this.records.delete(lookupKey);
  }
}

describe("google photos picker session HTTP boundary", () => {
  it("sets an opaque Photos cookie after create and omits the token from JSON", async () => {
    const { runtime, store } = createTrackedRuntime();
    const response = await handleGooglePhotosPickerSessionCreate(
      createJsonRequest("/api/google-photos-picker-session/create", {
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1200,
        scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
      }),
      runtime,
    );

    expect(response.status).toBe(200);
    await expectSecurityHeaders(response);
    const body = await response.json();
    expect(body).toEqual({
      kind: "created",
      expiresAtMs: NOW_MS + 1200 * 1000,
    });
    expect(JSON.stringify(body)).not.toContain(ACCESS_TOKEN);
    expect(body).not.toHaveProperty("sessionId");
    expect(body).not.toHaveProperty("accessToken");
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expectHostSessionCookie(setCookie!, 1200);
    expect(setCookie).not.toContain(ACCESS_TOKEN);
    expect(store.writes).toHaveLength(1);
  });

  it("caps create cookie Max-Age at 3600 seconds", async () => {
    const { runtime } = createTrackedRuntime();
    const response = await handleGooglePhotosPickerSessionCreate(
      createJsonRequest("/api/google-photos-picker-session/create", {
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 7200,
        scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
      }),
      runtime,
    );
    expect(response.status).toBe(200);
    expectHostSessionCookie(response.headers.get("set-cookie")!, 3600);
  });

  it("rejects Drive-only scope without writing", async () => {
    const tracked = createTrackedRuntime();
    const response = await handleGooglePhotosPickerSessionCreate(
      createJsonRequest("/api/google-photos-picker-session/create", {
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1200,
        scope: DRIVE_FILE_SCOPE,
      }),
      tracked.runtime,
    );
    expect(response.status).toBe(400);
    expect(tracked.store.writes).toHaveLength(0);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("restores without extending the cookie Max-Age", async () => {
    const tracked = createTrackedRuntime();
    const created = await handleGooglePhotosPickerSessionCreate(
      createJsonRequest("/api/google-photos-picker-session/create", {
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1800,
        scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
      }),
      tracked.runtime,
    );
    const sessionCookie = created.headers.get("set-cookie")!;

    const response = await handleGooglePhotosPickerSessionRestore(
      createPostRequest("/api/google-photos-picker-session/restore", {
        cookie: `${GOOGLE_PHOTOS_PICKER_SESSION_COOKIE_NAME}=${cookieValue(sessionCookie)}`,
      }),
      tracked.runtime,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: "restored",
      accessToken: ACCESS_TOKEN,
      expiresAtMs: NOW_MS + 1800 * 1000,
    });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(tracked.store.writes).toHaveLength(1);
  });

  it("returns notConnected after expiry", async () => {
    const store = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    let nowMs = NOW_MS;
    const runtime: GooglePhotosPickerSessionHttpRuntime = {
      createStore: () => store,
      readEncryptionKey: () => encryptionKey,
      nowMs: () => nowMs,
    };
    const created = await handleGooglePhotosPickerSessionCreate(
      createJsonRequest("/api/google-photos-picker-session/create", {
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1200,
        scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
      }),
      runtime,
    );
    nowMs = NOW_MS + 1200 * 1000;
    const response = await handleGooglePhotosPickerSessionRestore(
      createPostRequest("/api/google-photos-picker-session/restore", {
        cookie: `${GOOGLE_PHOTOS_PICKER_SESSION_COOKIE_NAME}=${cookieValue(created.headers.get("set-cookie")!)}`,
      }),
      runtime,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ kind: "notConnected" });
  });

  it("does not set a cookie when store write fails and hides vendor errors", async () => {
    const store = new FakeStore();
    store.writeError = new Error(VENDOR_MESSAGE);
    const tracked = createTrackedRuntime(store);
    const response = await handleGooglePhotosPickerSessionCreate(
      createJsonRequest("/api/google-photos-picker-session/create", {
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1200,
        scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
      }),
      tracked.runtime,
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ kind: "unavailable" });
    expect(JSON.stringify(body)).not.toContain(VENDOR_MESSAGE);
    expect(JSON.stringify(body)).not.toContain(ACCESS_TOKEN);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("ignores a Drive session cookie on Photos restore", async () => {
    const tracked = createTrackedRuntime();
    const response = await handleGooglePhotosPickerSessionRestore(
      createPostRequest("/api/google-photos-picker-session/restore", {
        cookie: `__Host-google-session=${generateGoogleSessionId()}`,
      }),
      tracked.runtime,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ kind: "notConnected" });
    expect(tracked.store.reads).toHaveLength(0);
  });

  it("deletes the Photos cookie namespace only", async () => {
    const tracked = createTrackedRuntime();
    const created = await handleGooglePhotosPickerSessionCreate(
      createJsonRequest("/api/google-photos-picker-session/create", {
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1200,
        scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
      }),
      tracked.runtime,
    );
    const response = await handleGooglePhotosPickerSessionDelete(
      createPostRequest("/api/google-photos-picker-session/delete", {
        cookie: `${GOOGLE_PHOTOS_PICKER_SESSION_COOKIE_NAME}=${cookieValue(created.headers.get("set-cookie")!)}`,
      }),
      tracked.runtime,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ kind: "disconnected" });
    expectHostSessionCookie(response.headers.get("set-cookie")!, 0);
    expect(tracked.store.deletes).toHaveLength(1);
  });

  it("rejects cross-origin create without touching the store", async () => {
    const tracked = createTrackedRuntime();
    const response = await handleGooglePhotosPickerSessionCreate(
      new Request(`${ORIGIN}/api/google-photos-picker-session/create`, {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          accessToken: ACCESS_TOKEN,
          expiresInSeconds: 1200,
          scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
        }),
      }),
      tracked.runtime,
    );
    expect(response.status).toBe(403);
    expect(tracked.store.writes).toHaveLength(0);
  });

  it("keeps Photos HTTP handlers on POST same-origin with no-store", () => {
    expect(httpSource).toContain('method !== "POST"');
    expect(httpSource).toContain("isSameOriginRequest");
    expect(httpSource).toContain('"Cache-Control": "no-store"');
    expect(httpSource).toContain("HttpOnly; Secure; SameSite=Strict");
    expect(httpSource).toContain("__Host-google-photos-picker-session");
    expect(httpSource).not.toContain("__Host-google-session=");
    expect(httpSource).not.toContain("/api/google-session/");
    for (const source of [createRouteSource, restoreRouteSource, deleteRouteSource]) {
      expect(source).toContain('export const runtime = "nodejs"');
      expect(source).toContain('export const dynamic = "force-dynamic"');
      expect(source).toContain("export function POST(");
      expect(source).not.toContain("export function GET(");
    }
  });
});

function createTrackedRuntime(store = new FakeStore()) {
  const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
  const tracked = {
    store,
    runtime: {
      createStore() {
        return store;
      },
      readEncryptionKey() {
        return encryptionKey;
      },
      nowMs() {
        return NOW_MS;
      },
    } satisfies GooglePhotosPickerSessionHttpRuntime,
  };
  return tracked;
}

function createJsonRequest(
  path: string,
  body: Record<string, unknown>,
  extraHeaders?: HeadersInit,
) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function createPostRequest(path: string, extraHeaders?: HeadersInit) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      ...extraHeaders,
    },
  });
}

async function expectSecurityHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
}

function expectHostSessionCookie(setCookie: string, maxAgeSeconds: number) {
  expect(setCookie.startsWith(`${GOOGLE_PHOTOS_PICKER_SESSION_COOKIE_NAME}=`)).toBe(
    true,
  );
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("Secure");
  expect(setCookie).toContain("SameSite=Strict");
  expect(setCookie).toContain("Path=/");
  expect(setCookie).toContain(`Max-Age=${maxAgeSeconds}`);
  expect(setCookie).not.toMatch(/domain=/i);
  const value = cookieValue(setCookie);
  if (maxAgeSeconds > 0) {
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(value).not.toContain(ACCESS_TOKEN);
    expect(value).not.toContain(".");
  }
}

function cookieValue(setCookie: string) {
  return setCookie.split(";", 1)[0].slice(setCookie.indexOf("=") + 1);
}
