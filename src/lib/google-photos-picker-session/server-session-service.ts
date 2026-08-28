import {
  createGooglePhotosPickerSessionLookupKey,
  decryptGoogleSessionAccessToken,
  encryptGoogleSessionAccessToken,
  generateGoogleSessionId,
  GOOGLE_SESSION_AES_KEY_BYTES,
  GOOGLE_SESSION_ENCRYPTION_ALGORITHM,
  GOOGLE_SESSION_ENCRYPTION_VERSION,
  normalizeGooglePhotosPickerSessionScopeMetadata,
  normalizeGoogleSessionExpiry,
  type GooglePhotosPickerSessionScopeMetadata,
  type GoogleSessionEncryptedAccessToken,
} from "../google-session/server-primitives";
import type { GoogleSessionStore } from "../google-session/server-session-service";

export const GOOGLE_PHOTOS_PICKER_SESSION_RECORD_VERSION = 1;

export type GooglePhotosPickerSessionStoredRecord = {
  version: typeof GOOGLE_PHOTOS_PICKER_SESSION_RECORD_VERSION;
  encryptedAccessToken: GoogleSessionEncryptedAccessToken;
  expiresAtMs: number;
  scopeMetadata: GooglePhotosPickerSessionScopeMetadata;
};

export type GooglePhotosPickerSessionCreateResult = {
  sessionId: string;
  expiresAtMs: number;
  maxAgeSeconds: number;
};

export type GooglePhotosPickerSessionRestoreResult =
  | {
      kind: "restored";
      accessToken: string;
      expiresAtMs: number;
    }
  | {
      kind: "notConnected";
    };

const STORED_RECORD_KEYS = [
  "encryptedAccessToken",
  "expiresAtMs",
  "scopeMetadata",
  "version",
] as const;

const ENCRYPTED_TOKEN_KEYS = [
  "algorithm",
  "authTag",
  "ciphertext",
  "iv",
  "version",
] as const;

const SCOPE_METADATA_KEYS = ["photosPicker"] as const;

export async function createGooglePhotosPickerServerSession(input: {
  store: GoogleSessionStore;
  encryptionKey: Uint8Array;
  accessToken: string;
  expiresInSeconds: number;
  scope: string;
  nowMs: number;
}): Promise<GooglePhotosPickerSessionCreateResult> {
  requireNowMs(input.nowMs);
  requireEncryptionKey(input.encryptionKey);

  const expiry = normalizeGoogleSessionExpiry({
    createdAtMs: input.nowMs,
    expiresInSeconds: input.expiresInSeconds,
  });
  const scopeMetadata = normalizeGooglePhotosPickerSessionScopeMetadata(
    input.scope,
  );
  const sessionId = generateGoogleSessionId();
  const lookupKey = createGooglePhotosPickerSessionLookupKey(sessionId);
  const encryptedAccessToken = encryptGoogleSessionAccessToken({
    accessToken: input.accessToken,
    key: input.encryptionKey,
  });
  const record: GooglePhotosPickerSessionStoredRecord = {
    version: GOOGLE_PHOTOS_PICKER_SESSION_RECORD_VERSION,
    encryptedAccessToken,
    expiresAtMs: expiry.expiresAtMs,
    scopeMetadata,
  };

  await writeStoreRecord(input.store, {
    lookupKey,
    value: JSON.stringify(record),
    ttlSeconds: expiry.ttlSeconds,
  });

  return {
    sessionId,
    expiresAtMs: expiry.expiresAtMs,
    maxAgeSeconds: expiry.ttlSeconds,
  };
}

export async function restoreGooglePhotosPickerServerSession(input: {
  store: GoogleSessionStore;
  encryptionKey: Uint8Array;
  sessionId: string;
  nowMs: number;
}): Promise<GooglePhotosPickerSessionRestoreResult> {
  requireNowMs(input.nowMs);
  requireEncryptionKey(input.encryptionKey);

  const lookupKey = lookupKeyOrNull(input.sessionId);
  if (lookupKey === null) {
    return { kind: "notConnected" };
  }

  const storedValue = await readStoreRecord(input.store, lookupKey);
  if (storedValue === null) {
    return { kind: "notConnected" };
  }

  const record = parseGooglePhotosPickerSessionStoredRecord(storedValue);
  if (record === null) {
    await bestEffortDelete(input.store, lookupKey);
    return { kind: "notConnected" };
  }

  if (record.expiresAtMs <= input.nowMs) {
    await bestEffortDelete(input.store, lookupKey);
    return { kind: "notConnected" };
  }

  try {
    const accessToken = decryptGoogleSessionAccessToken({
      encrypted: record.encryptedAccessToken,
      key: input.encryptionKey,
    });
    return {
      kind: "restored",
      accessToken,
      expiresAtMs: record.expiresAtMs,
    };
  } catch {
    await bestEffortDelete(input.store, lookupKey);
    return { kind: "notConnected" };
  }
}

export async function deleteGooglePhotosPickerServerSession(input: {
  store: GoogleSessionStore;
  sessionId: string;
}): Promise<void> {
  const lookupKey = lookupKeyOrNull(input.sessionId);
  if (lookupKey === null) {
    return;
  }

  try {
    await input.store.delete(lookupKey);
  } catch {
    throw sanitizedStoreUnavailable();
  }
}

function requireNowMs(nowMs: number) {
  if (!Number.isFinite(nowMs) || !Number.isSafeInteger(nowMs)) {
    throw sanitizedGoogleSessionError("invalid-now-ms");
  }
}

function requireEncryptionKey(key: Uint8Array) {
  if (
    !(key instanceof Uint8Array) ||
    key.byteLength !== GOOGLE_SESSION_AES_KEY_BYTES
  ) {
    throw sanitizedGoogleSessionError("invalid-key");
  }
}

function lookupKeyOrNull(sessionId: string) {
  try {
    return createGooglePhotosPickerSessionLookupKey(sessionId);
  } catch (error) {
    if (isSanitizedGoogleSessionError(error)) {
      return null;
    }
    throw error;
  }
}

async function writeStoreRecord(
  store: GoogleSessionStore,
  input: {
    lookupKey: string;
    value: string;
    ttlSeconds: number;
  },
) {
  try {
    await store.write(input);
  } catch {
    throw sanitizedStoreUnavailable();
  }
}

async function readStoreRecord(store: GoogleSessionStore, lookupKey: string) {
  try {
    const value = await store.read(lookupKey);
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      return "";
    }
    return value;
  } catch {
    throw sanitizedStoreUnavailable();
  }
}

async function bestEffortDelete(store: GoogleSessionStore, lookupKey: string) {
  try {
    await store.delete(lookupKey);
  } catch {
    return;
  }
}

function parseGooglePhotosPickerSessionStoredRecord(
  value: string,
): GooglePhotosPickerSessionStoredRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed) || !hasExactKeys(parsed, STORED_RECORD_KEYS)) {
    return null;
  }

  if (parsed.version !== GOOGLE_PHOTOS_PICKER_SESSION_RECORD_VERSION) {
    return null;
  }

  const expiresAtMs = parsed.expiresAtMs;
  if (
    typeof expiresAtMs !== "number" ||
    !Number.isFinite(expiresAtMs) ||
    !Number.isSafeInteger(expiresAtMs)
  ) {
    return null;
  }

  const encryptedAccessToken = parseEncryptedAccessToken(
    parsed.encryptedAccessToken,
  );
  const scopeMetadata = parseScopeMetadata(parsed.scopeMetadata);
  if (encryptedAccessToken === null || scopeMetadata === null) {
    return null;
  }

  return {
    version: GOOGLE_PHOTOS_PICKER_SESSION_RECORD_VERSION,
    encryptedAccessToken,
    expiresAtMs,
    scopeMetadata,
  };
}

function parseEncryptedAccessToken(
  value: unknown,
): GoogleSessionEncryptedAccessToken | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ENCRYPTED_TOKEN_KEYS)) {
    return null;
  }
  if (
    value.version !== GOOGLE_SESSION_ENCRYPTION_VERSION ||
    value.algorithm !== GOOGLE_SESSION_ENCRYPTION_ALGORITHM ||
    typeof value.iv !== "string" ||
    typeof value.ciphertext !== "string" ||
    typeof value.authTag !== "string" ||
    value.iv.length === 0 ||
    value.ciphertext.length === 0 ||
    value.authTag.length === 0
  ) {
    return null;
  }

  return {
    version: GOOGLE_SESSION_ENCRYPTION_VERSION,
    algorithm: GOOGLE_SESSION_ENCRYPTION_ALGORITHM,
    iv: value.iv,
    ciphertext: value.ciphertext,
    authTag: value.authTag,
  };
}

function parseScopeMetadata(
  value: unknown,
): GooglePhotosPickerSessionScopeMetadata | null {
  if (!isPlainObject(value) || !hasExactKeys(value, SCOPE_METADATA_KEYS)) {
    return null;
  }
  if (value.photosPicker !== true) {
    return null;
  }
  return { photosPicker: true };
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizedStoreUnavailable() {
  return sanitizedGoogleSessionError("store-unavailable");
}

function sanitizedGoogleSessionError(kind: string) {
  return new Error(`google-session-${kind}`);
}

function isSanitizedGoogleSessionError(error: unknown) {
  return error instanceof Error && error.message.startsWith("google-session-");
}
