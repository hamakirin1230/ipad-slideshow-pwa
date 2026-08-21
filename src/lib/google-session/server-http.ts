import "server-only";
import { readGoogleSessionEncryptionKey } from "./server-encryption-key";
import {
  createGoogleSessionLookupKey,
  GOOGLE_SESSION_MAX_TTL_SECONDS,
  normalizeGoogleSessionExpiry,
  normalizeGoogleSessionScopeMetadata,
} from "./server-primitives";
import {
  createGoogleServerSession,
  deleteGoogleServerSession,
  restoreGoogleServerSession,
  type GoogleSessionStore,
} from "./server-session-service";
import { createGoogleSessionUpstashStore } from "./server-upstash-store";

export const GOOGLE_SESSION_COOKIE_NAME = "__Host-google-session";
export const GOOGLE_SESSION_CREATE_BODY_MAX_BYTES = 16 * 1024;
export const GOOGLE_SESSION_ACCESS_TOKEN_MAX_LENGTH = 8192;
export const GOOGLE_SESSION_SCOPE_MAX_LENGTH = 1024;

const CREATE_BODY_KEYS = ["accessToken", "expiresInSeconds", "scope"] as const;

export type GoogleSessionHttpRuntime = {
  createStore: () => GoogleSessionStore;
  readEncryptionKey: () => Uint8Array;
  nowMs: () => number;
};

export function createDefaultGoogleSessionHttpRuntime(): GoogleSessionHttpRuntime {
  return {
    createStore: () => createGoogleSessionUpstashStore(),
    readEncryptionKey: () => readGoogleSessionEncryptionKey(),
    nowMs: () => Date.now(),
  };
}

export function handleGoogleSessionCreate(
  request: Request,
  runtime: GoogleSessionHttpRuntime = createDefaultGoogleSessionHttpRuntime(),
) {
  return handleCreate(request, runtime);
}

export function handleGoogleSessionRestore(
  request: Request,
  runtime: GoogleSessionHttpRuntime = createDefaultGoogleSessionHttpRuntime(),
) {
  return handleRestore(request, runtime);
}

export function handleGoogleSessionDelete(
  request: Request,
  runtime: GoogleSessionHttpRuntime = createDefaultGoogleSessionHttpRuntime(),
) {
  return handleDelete(request, runtime);
}

async function handleCreate(
  request: Request,
  runtime: GoogleSessionHttpRuntime,
) {
  const rejected = rejectIfNotSafePost(request);
  if (rejected) {
    return rejected;
  }

  const parsed = await readCreateBody(request);
  if (parsed.ok === false) {
    return parsed.response;
  }

  const nowMs = runtime.nowMs();
  try {
    normalizeGoogleSessionExpiry({
      createdAtMs: nowMs,
      expiresInSeconds: parsed.body.expiresInSeconds,
    });
    normalizeGoogleSessionScopeMetadata(parsed.body.scope);
  } catch {
    return invalidRequest();
  }

  let encryptionKey: Uint8Array;
  try {
    encryptionKey = runtime.readEncryptionKey();
  } catch {
    return unavailable();
  }

  let store: GoogleSessionStore;
  try {
    store = runtime.createStore();
  } catch {
    return unavailable();
  }

  try {
    const created = await createGoogleServerSession({
      store,
      encryptionKey,
      accessToken: parsed.body.accessToken,
      expiresInSeconds: parsed.body.expiresInSeconds,
      scope: parsed.body.scope,
      nowMs,
    });
    const maxAgeSeconds = Math.min(
      created.maxAgeSeconds,
      GOOGLE_SESSION_MAX_TTL_SECONDS,
    );
    return jsonResponse(
      { kind: "created", expiresAtMs: created.expiresAtMs },
      200,
      setSessionCookie(created.sessionId, maxAgeSeconds),
    );
  } catch (error) {
    if (isConfigOrStoreUnavailable(error)) {
      return unavailable();
    }
    return invalidRequest();
  }
}

async function handleRestore(
  request: Request,
  runtime: GoogleSessionHttpRuntime,
) {
  const rejected = rejectIfNotSafePost(request);
  if (rejected) {
    return rejected;
  }

  const sessionId = readSessionCookie(request);
  if (sessionId === null) {
    return jsonResponse({ kind: "notConnected" }, 200);
  }
  if (!isOpaqueSessionCookie(sessionId)) {
    return jsonResponse(
      { kind: "notConnected" },
      200,
      expireSessionCookie(),
    );
  }

  let encryptionKey: Uint8Array;
  try {
    encryptionKey = runtime.readEncryptionKey();
  } catch {
    return jsonResponse({ kind: "notConnected" }, 200);
  }

  let store: GoogleSessionStore;
  try {
    store = runtime.createStore();
  } catch {
    return jsonResponse({ kind: "notConnected" }, 200);
  }

  try {
    const restored = await restoreGoogleServerSession({
      store,
      encryptionKey,
      sessionId,
      nowMs: runtime.nowMs(),
    });
    if (restored.kind === "restored") {
      return jsonResponse(
        {
          kind: "restored",
          accessToken: restored.accessToken,
          expiresAtMs: restored.expiresAtMs,
        },
        200,
      );
    }
    return jsonResponse(
      { kind: "notConnected" },
      200,
      expireSessionCookie(),
    );
  } catch {
    return jsonResponse({ kind: "notConnected" }, 200);
  }
}

async function handleDelete(
  request: Request,
  runtime: GoogleSessionHttpRuntime,
) {
  const rejected = rejectIfNotSafePost(request);
  if (rejected) {
    return rejected;
  }

  const sessionId = readSessionCookie(request);
  if (sessionId !== null) {
    try {
      const store = runtime.createStore();
      await deleteGoogleServerSession({ store, sessionId });
    } catch {
      // Backend failure must not block cookie expiry.
    }
  }

  return jsonResponse(
    { kind: "disconnected" },
    200,
    expireSessionCookie(),
  );
}

function rejectIfNotSafePost(request: Request) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }
  if (!isSameOriginRequest(request)) {
    return forbidden();
  }
  return null;
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (origin === null || origin.trim() === "") {
    return false;
  }

  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }
  if (origin !== requestOrigin) {
    return false;
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite !== null && secFetchSite !== "same-origin") {
    return false;
  }
  return true;
}

async function readCreateBody(request: Request): Promise<
  | {
      ok: true;
      body: {
        accessToken: string;
        expiresInSeconds: number;
        scope: string;
      };
    }
  | { ok: false; response: Response }
> {
  const contentType = request.headers.get("content-type");
  if (!isJsonContentType(contentType)) {
    return { ok: false, response: invalidRequest() };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (
      !Number.isFinite(parsedLength) ||
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > GOOGLE_SESSION_CREATE_BODY_MAX_BYTES
    ) {
      return { ok: false, response: invalidRequest() };
    }
  }

  const limited = await readBodyWithLimit(
    request,
    GOOGLE_SESSION_CREATE_BODY_MAX_BYTES,
  );
  if (limited.ok === false) {
    return { ok: false, response: invalidRequest() };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(limited.bytes));
  } catch {
    return { ok: false, response: invalidRequest() };
  }

  if (!isPlainObject(parsed) || !hasExactKeys(parsed, CREATE_BODY_KEYS)) {
    return { ok: false, response: invalidRequest() };
  }

  const accessToken = parsed.accessToken;
  const expiresInSeconds = parsed.expiresInSeconds;
  const scope = parsed.scope;
  if (
    typeof accessToken !== "string" ||
    accessToken.trim() === "" ||
    accessToken.length > GOOGLE_SESSION_ACCESS_TOKEN_MAX_LENGTH ||
    typeof scope !== "string" ||
    scope.trim() === "" ||
    scope.length > GOOGLE_SESSION_SCOPE_MAX_LENGTH ||
    typeof expiresInSeconds !== "number" ||
    !Number.isFinite(expiresInSeconds)
  ) {
    return { ok: false, response: invalidRequest() };
  }

  return {
    ok: true,
    body: {
      accessToken,
      expiresInSeconds,
      scope,
    },
  };
}

async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  const body = request.body;
  if (body === null) {
    return { ok: true, bytes: new Uint8Array(0) };
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = body.getReader();
  } catch {
    return { ok: false };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value === undefined || value.byteLength === 0) {
        continue;
      }
      if (total + value.byteLength > maxBytes) {
        await cancelReader(reader);
        return { ok: false };
      }
      total += value.byteLength;
      chunks.push(value);
    }
  } catch {
    await cancelReader(reader);
    return { ok: false };
  }

  if (total === 0) {
    return { ok: true, bytes: new Uint8Array(0) };
  }
  if (chunks.length === 1) {
    return { ok: true, bytes: chunks[0] };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
) {
  try {
    await reader.cancel();
  } catch {
    return;
  }
}

function isOpaqueSessionCookie(sessionId: string) {
  try {
    createGoogleSessionLookupKey(sessionId);
    return true;
  } catch {
    return false;
  }
}

function isJsonContentType(value: string | null) {
  if (value === null) {
    return false;
  }
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json";
}

function readSessionCookie(request: Request) {
  const header = request.headers.get("cookie");
  if (header === null || header.trim() === "") {
    return null;
  }

  let value: string | null = null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (name === GOOGLE_SESSION_COOKIE_NAME) {
      value = part.slice(separator + 1).trim();
    }
  }
  if (value === null || value.length === 0) {
    return null;
  }
  return value;
}

function setSessionCookie(sessionId: string, maxAgeSeconds: number) {
  return `${GOOGLE_SESSION_COOKIE_NAME}=${sessionId}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

function expireSessionCookie() {
  return setSessionCookie("", 0);
}

function jsonResponse(body: unknown, status: number, setCookie?: string) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });
  if (setCookie !== undefined) {
    headers.set("Set-Cookie", setCookie);
  }
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function invalidRequest() {
  return jsonResponse({ kind: "invalidRequest" }, 400);
}

function forbidden() {
  return jsonResponse({ kind: "invalidRequest" }, 403);
}

function methodNotAllowed() {
  return jsonResponse({ kind: "invalidRequest" }, 405);
}

function unavailable() {
  return jsonResponse({ kind: "unavailable" }, 503);
}

function isConfigOrStoreUnavailable(error: unknown) {
  return (
    error instanceof Error &&
    (error.message === "google-session-store-unavailable" ||
      error.message === "google-session-encryption-key-unavailable" ||
      error.message === "google-session-invalid-key")
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const keys = Object.keys(value);
  if (keys.length !== expected.length) {
    return false;
  }
  return expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
