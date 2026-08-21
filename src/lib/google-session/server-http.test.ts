import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DRIVE_FILE_SCOPE } from "../google-auth";
import {
  generateGoogleSessionId,
  GOOGLE_SESSION_AES_KEY_BYTES,
} from "./server-primitives";
import {
  GOOGLE_SESSION_ACCESS_TOKEN_MAX_LENGTH,
  GOOGLE_SESSION_COOKIE_NAME,
  GOOGLE_SESSION_CREATE_BODY_MAX_BYTES,
  handleGoogleSessionCreate,
  handleGoogleSessionDelete,
  handleGoogleSessionRestore,
  type GoogleSessionHttpRuntime,
} from "./server-http";
import type { GoogleSessionStore } from "./server-session-service";

const httpSource = readFileSync(
  new URL("./server-http.ts", import.meta.url),
  "utf8",
);
const createRouteSource = readFileSync(
  new URL("../../app/api/google-session/create/route.ts", import.meta.url),
  "utf8",
);
const restoreRouteSource = readFileSync(
  new URL("../../app/api/google-session/restore/route.ts", import.meta.url),
  "utf8",
);
const deleteRouteSource = readFileSync(
  new URL("../../app/api/google-session/delete/route.ts", import.meta.url),
  "utf8",
);

const ORIGIN = "https://app.example";
const ACCESS_TOKEN = "ya29.drive-access-token-secret";
const NOW_MS = 1_700_000_000_000;
const VENDOR_MESSAGE =
  "WRONGPASS redis://default:super-secret@host:6379 token=ya29.leaked";

class FakeStore implements GoogleSessionStore {
  records = new Map<string, { value: string; ttlSeconds: number }>();
  writes: Array<{ lookupKey: string; value: string; ttlSeconds: number }> = [];
  reads: string[] = [];
  deletes: string[] = [];
  writeError: Error | null = null;
  readError: Error | null = null;
  deleteError: Error | null = null;

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
    if (this.readError) {
      throw this.readError;
    }
    return this.records.get(lookupKey)?.value ?? null;
  }

  async delete(lookupKey: string) {
    this.deletes.push(lookupKey);
    if (this.deleteError) {
      throw this.deleteError;
    }
    this.records.delete(lookupKey);
  }
}

describe("google session HTTP boundary", () => {
  it("sets a __Host- session cookie after a successful create and omits secrets from JSON", async () => {
    const { runtime, store } = createTrackedRuntime();
    const response = await handleGoogleSessionCreate(
      createJsonRequest("/api/google-session/create", {
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1200,
        scope: DRIVE_FILE_SCOPE,
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
    expect(setCookie).not.toMatch(/domain=/i);
    expect(store.writes).toHaveLength(1);
  });

  it("caps create cookie Max-Age at 3600 seconds", async () => {
    const { runtime } = createTrackedRuntime();
    const response = await handleGoogleSessionCreate(
      createJsonRequest("/api/google-session/create", {
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 7200,
        scope: DRIVE_FILE_SCOPE,
      }),
      runtime,
    );
    expect(response.status).toBe(200);
    expectHostSessionCookie(response.headers.get("set-cookie")!, 3600);
  });

  it("does not set a cookie when store write fails and returns a generic 503", async () => {
    const store = new FakeStore();
    store.writeError = new Error(VENDOR_MESSAGE);
    const tracked = createTrackedRuntime(store);
    const response = await handleGoogleSessionCreate(
      createJsonRequest("/api/google-session/create", {
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1200,
        scope: DRIVE_FILE_SCOPE,
      }),
      tracked.runtime,
    );

    expect(response.status).toBe(503);
    await expectSecurityHeaders(response);
    const body = await response.json();
    expect(body).toEqual({ kind: "unavailable" });
    expect(JSON.stringify(body)).not.toContain(VENDOR_MESSAGE);
    expect(JSON.stringify(body)).not.toContain(ACCESS_TOKEN);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(store.writes).toHaveLength(1);
  });

  it("rejects missing or mismatched origin without touching runtime factories", async () => {
    const tracked = createTrackedRuntime();
    for (const headers of [
      { "content-type": "application/json" },
      {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
    ]) {
      const response = await handleGoogleSessionCreate(
        new Request(`${ORIGIN}/api/google-session/create`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            accessToken: ACCESS_TOKEN,
            expiresInSeconds: 1200,
            scope: DRIVE_FILE_SCOPE,
          }),
        }),
        tracked.runtime,
      );
      expect(response.status).toBe(403);
      await expectSecurityHeaders(response);
    }
    expect(tracked.storeCreates).toBe(0);
    expect(tracked.keyReads).toBe(0);
  });

  it("rejects cross-site Sec-Fetch-Site without touching runtime factories", async () => {
    const tracked = createTrackedRuntime();
    const response = await handleGoogleSessionCreate(
      createJsonRequest(
        "/api/google-session/create",
        {
          accessToken: ACCESS_TOKEN,
          expiresInSeconds: 1200,
          scope: DRIVE_FILE_SCOPE,
        },
        { "sec-fetch-site": "cross-site" },
      ),
      tracked.runtime,
    );
    expect(response.status).toBe(403);
    await expectSecurityHeaders(response);
    expect(tracked.storeCreates).toBe(0);
    expect(tracked.keyReads).toBe(0);
  });

  it("rejects invalid content-type, oversized bodies, malformed JSON, and extra fields", async () => {
    const tracked = createTrackedRuntime();
    const validBody = {
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
    };

    const invalidContentType = await handleGoogleSessionCreate(
      createJsonRequest("/api/google-session/create", validBody, {
        "content-type": "text/plain",
      }),
      tracked.runtime,
    );
    expect(invalidContentType.status).toBe(400);

    const oversized = await handleGoogleSessionCreate(
      new Request(`${ORIGIN}/api/google-session/create`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          "content-length": String(GOOGLE_SESSION_CREATE_BODY_MAX_BYTES + 1),
        },
        body: "x".repeat(GOOGLE_SESSION_CREATE_BODY_MAX_BYTES + 1),
      }),
      tracked.runtime,
    );
    expect(oversized.status).toBe(400);

    const malformed = await handleGoogleSessionCreate(
      new Request(`${ORIGIN}/api/google-session/create`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
        },
        body: "{not-json",
      }),
      tracked.runtime,
    );
    expect(malformed.status).toBe(400);

    const extraFields = await handleGoogleSessionCreate(
      createJsonRequest("/api/google-session/create", {
        ...validBody,
        refreshToken: "1//secret",
      }),
      tracked.runtime,
    );
    expect(extraFields.status).toBe(400);

    const longToken = await handleGoogleSessionCreate(
      createJsonRequest("/api/google-session/create", {
        accessToken: "a".repeat(GOOGLE_SESSION_ACCESS_TOKEN_MAX_LENGTH + 1),
        expiresInSeconds: 1200,
        scope: DRIVE_FILE_SCOPE,
      }),
      tracked.runtime,
    );
    expect(longToken.status).toBe(400);

    expect(tracked.storeCreates).toBe(0);
    expect(tracked.keyReads).toBe(0);
    await expectSecurityHeaders(invalidContentType);
    await expectSecurityHeaders(oversized);
    await expectSecurityHeaders(malformed);
    await expectSecurityHeaders(extraFields);
  });

  it("rejects a streamed body over 16 KiB when Content-Length is absent", async () => {
    const tracked = createTrackedRuntime();
    const response = await handleGoogleSessionCreate(
      createStreamRequest(
        "/api/google-session/create",
        createByteStream(GOOGLE_SESSION_CREATE_BODY_MAX_BYTES + 1, 4096),
      ),
      tracked.runtime,
    );
    expect(response.status).toBe(400);
    await expectSecurityHeaders(response);
    expect(tracked.storeCreates).toBe(0);
    expect(tracked.keyReads).toBe(0);
  });

  it("rejects a streamed body over 16 KiB even when Content-Length is understated", async () => {
    const tracked = createTrackedRuntime();
    const response = await handleGoogleSessionCreate(
      createStreamRequest(
        "/api/google-session/create",
        createByteStream(GOOGLE_SESSION_CREATE_BODY_MAX_BYTES + 1, 4096),
        { "content-length": "100" },
      ),
      tracked.runtime,
    );
    expect(response.status).toBe(400);
    await expectSecurityHeaders(response);
    expect(tracked.storeCreates).toBe(0);
    expect(tracked.keyReads).toBe(0);
  });

  it("creates a session from a chunked valid JSON body under 16 KiB", async () => {
    const { runtime, store } = createTrackedRuntime();
    const encoded = new TextEncoder().encode(
      JSON.stringify({
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1200,
        scope: DRIVE_FILE_SCOPE,
      }),
    );
    const response = await handleGoogleSessionCreate(
      createStreamRequest(
        "/api/google-session/create",
        createChunkedStream(encoded, 24),
      ),
      runtime,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: "created",
      expiresAtMs: NOW_MS + 1200 * 1000,
    });
    expectHostSessionCookie(response.headers.get("set-cookie")!, 1200);
    expect(store.writes).toHaveLength(1);
  });

  it("stops reading a body stream at the limit before runtime factories run", async () => {
    const tracked = createTrackedRuntime();
    const first = new Uint8Array(8 * 1024).fill(0x7b);
    const second = new Uint8Array(
      GOOGLE_SESSION_CREATE_BODY_MAX_BYTES - first.byteLength + 1,
    ).fill(0x78);
    const response = await handleGoogleSessionCreate(
      createStreamRequest(
        "/api/google-session/create",
        createChunkedStream([first, second]),
      ),
      tracked.runtime,
    );
    expect(response.status).toBe(400);
    await expectSecurityHeaders(response);
    expect(tracked.storeCreates).toBe(0);
    expect(tracked.keyReads).toBe(0);
  });

  it("restores without a cookie as notConnected and does not create a store", async () => {
    const tracked = createTrackedRuntime();
    const response = await handleGoogleSessionRestore(
      createPostRequest("/api/google-session/restore"),
      tracked.runtime,
    );
    expect(response.status).toBe(200);
    await expectSecurityHeaders(response);
    await expect(response.json()).resolves.toEqual({ kind: "notConnected" });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(tracked.storeCreates).toBe(0);
    expect(tracked.keyReads).toBe(0);
  });

  it("returns the access token on restore without extending the cookie", async () => {
    const tracked = createTrackedRuntime();
    const created = await handleGoogleSessionCreate(
      createJsonRequest("/api/google-session/create", {
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1800,
        scope: DRIVE_FILE_SCOPE,
      }),
      tracked.runtime,
    );
    const sessionCookie = created.headers.get("set-cookie")!;
    tracked.storeCreates = 0;
    tracked.keyReads = 0;

    const response = await handleGoogleSessionRestore(
      createPostRequest("/api/google-session/restore", {
        cookie: `${GOOGLE_SESSION_COOKIE_NAME}=${cookieValue(sessionCookie)}`,
      }),
      tracked.runtime,
    );

    expect(response.status).toBe(200);
    await expectSecurityHeaders(response);
    await expect(response.json()).resolves.toEqual({
      kind: "restored",
      accessToken: ACCESS_TOKEN,
      expiresAtMs: NOW_MS + 1800 * 1000,
    });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(tracked.storeCreates).toBe(1);
    expect(tracked.store.writes).toHaveLength(1);
  });

  it("returns notConnected when the service cannot restore a session", async () => {
    const tracked = createTrackedRuntime();
    const response = await handleGoogleSessionRestore(
      createPostRequest("/api/google-session/restore", {
        cookie: `${GOOGLE_SESSION_COOKIE_NAME}=${generateGoogleSessionId()}`,
      }),
      tracked.runtime,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ kind: "notConnected" });
    expectHostSessionCookie(response.headers.get("set-cookie")!, 0);
  });

  it("maps restore backend failure to notConnected without vendor details or retry", async () => {
    const store = new FakeStore();
    store.readError = new Error(VENDOR_MESSAGE);
    const tracked = createTrackedRuntime(store);
    const response = await handleGoogleSessionRestore(
      createPostRequest("/api/google-session/restore", {
        cookie: `${GOOGLE_SESSION_COOKIE_NAME}=${generateGoogleSessionId()}`,
      }),
      tracked.runtime,
    );

    expect(response.status).toBe(200);
    await expectSecurityHeaders(response);
    const body = await response.json();
    expect(body).toEqual({ kind: "notConnected" });
    expect(JSON.stringify(body)).not.toContain(VENDOR_MESSAGE);
    expect(JSON.stringify(body)).not.toContain("redis://");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(store.reads).toHaveLength(1);
    expect(tracked.storeCreates).toBe(1);
  });

  it("deletes a present session once and always expires the cookie", async () => {
    const tracked = createTrackedRuntime();
    const created = await handleGoogleSessionCreate(
      createJsonRequest("/api/google-session/create", {
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1200,
        scope: DRIVE_FILE_SCOPE,
      }),
      tracked.runtime,
    );
    tracked.storeCreates = 0;

    const response = await handleGoogleSessionDelete(
      createPostRequest("/api/google-session/delete", {
        cookie: `${GOOGLE_SESSION_COOKIE_NAME}=${cookieValue(created.headers.get("set-cookie")!)}`,
      }),
      tracked.runtime,
    );
    expect(response.status).toBe(200);
    await expectSecurityHeaders(response);
    await expect(response.json()).resolves.toEqual({ kind: "disconnected" });
    expectHostSessionCookie(response.headers.get("set-cookie")!, 0);
    expect(tracked.store.deletes).toHaveLength(1);
    expect(tracked.storeCreates).toBe(1);
  });

  it("does not touch the store when delete has no cookie, and still expires it", async () => {
    const tracked = createTrackedRuntime();
    const response = await handleGoogleSessionDelete(
      createPostRequest("/api/google-session/delete"),
      tracked.runtime,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ kind: "disconnected" });
    expectHostSessionCookie(response.headers.get("set-cookie")!, 0);
    expect(tracked.storeCreates).toBe(0);
    expect(tracked.store.deletes).toHaveLength(0);
  });

  it("expires the cookie and returns disconnected when delete backend fails", async () => {
    const store = new FakeStore();
    store.deleteError = new Error(VENDOR_MESSAGE);
    const tracked = createTrackedRuntime(store);
    const created = await handleGoogleSessionCreate(
      createJsonRequest("/api/google-session/create", {
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1200,
        scope: DRIVE_FILE_SCOPE,
      }),
      tracked.runtime,
    );
    store.deleteError = new Error(VENDOR_MESSAGE);

    const response = await handleGoogleSessionDelete(
      createPostRequest("/api/google-session/delete", {
        cookie: `${GOOGLE_SESSION_COOKIE_NAME}=${cookieValue(created.headers.get("set-cookie")!)}`,
      }),
      tracked.runtime,
    );
    const body = await response.json();
    expect(body).toEqual({ kind: "disconnected" });
    expect(JSON.stringify(body)).not.toContain(VENDOR_MESSAGE);
    expectHostSessionCookie(response.headers.get("set-cookie")!, 0);
    expect(store.deletes).toHaveLength(1);
  });

  it("keeps HTTP helpers and routes free of logging, public env, and token query params", () => {
    for (const source of [
      httpSource,
      createRouteSource,
      restoreRouteSource,
      deleteRouteSource,
    ]) {
      for (const forbidden of [
        "console.log",
        "console.error",
        "console.warn",
        "console.debug",
        "refresh_token",
        "client_secret",
        "NEXT_PUBLIC_",
        "searchParams",
        "tokeninfo",
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "fromEnv",
        "Access-Control-Allow-Origin",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
    expect(httpSource).toContain('import "server-only"');
    expect(httpSource).toContain("getReader(");
    expect(httpSource).not.toContain("arrayBuffer(");
    expect(httpSource).not.toContain("setTimeout(");
    for (const source of [
      createRouteSource,
      restoreRouteSource,
      deleteRouteSource,
    ]) {
      expect(source).toContain('export const runtime = "nodejs"');
      expect(source).toContain('export const dynamic = "force-dynamic"');
      expect(source).toContain("export function POST(");
      expect(source).not.toContain("export function GET(");
      expect(source).not.toContain("process.env");
      expect(source).not.toContain("createGoogleSessionUpstashStore(");
      expect(source).not.toContain("new Redis");
    }
  });
});

function createTrackedRuntime(store = new FakeStore()) {
  const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
  const tracked = {
    store,
    storeCreates: 0,
    keyReads: 0,
    runtime: {
      createStore() {
        tracked.storeCreates += 1;
        return store;
      },
      readEncryptionKey() {
        tracked.keyReads += 1;
        return encryptionKey;
      },
      nowMs() {
        return NOW_MS;
      },
    } satisfies GoogleSessionHttpRuntime,
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

function createStreamRequest(
  path: string,
  body: ReadableStream<Uint8Array>,
  extraHeaders?: HeadersInit,
) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      ...extraHeaders,
    },
    body,
    duplex: "half",
  } as RequestInit);
}

function createByteStream(byteLength: number, chunkSize: number) {
  const chunks: Uint8Array[] = [];
  let remaining = byteLength;
  while (remaining > 0) {
    const size = Math.min(chunkSize, remaining);
    chunks.push(new Uint8Array(size).fill(0x78));
    remaining -= size;
  }
  return createChunkedStream(chunks);
}

function createChunkedStream(input: Uint8Array | Uint8Array[], chunkSize = 32) {
  const chunks = Array.isArray(input)
    ? input
    : splitBytes(input, chunkSize);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function splitBytes(bytes: Uint8Array, chunkSize: number) {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(bytes.slice(offset, offset + chunkSize));
  }
  return chunks;
}

async function expectSecurityHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
}

function expectHostSessionCookie(setCookie: string, maxAgeSeconds: number) {
  expect(setCookie.startsWith(`${GOOGLE_SESSION_COOKIE_NAME}=`)).toBe(true);
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("Secure");
  expect(setCookie).toContain("SameSite=Strict");
  expect(setCookie).toContain("Path=/");
  expect(setCookie).toContain(`Max-Age=${maxAgeSeconds}`);
  expect(setCookie).not.toMatch(/domain=/i);
}

function cookieValue(setCookie: string) {
  return setCookie.split(";", 1)[0].slice(setCookie.indexOf("=") + 1);
}
