import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  DRIVE_FILE_SCOPE,
  PHOTOS_LIBRARY_APPENDONLY_SCOPE,
  PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE,
} from "../google-auth";

export const GOOGLE_SESSION_ID_BYTES = 32;
export const GOOGLE_SESSION_LOOKUP_KEY_PREFIX = "google-session:";
export const GOOGLE_SESSION_LOOKUP_DIGEST_HEX_LENGTH = 64;
export const GOOGLE_SESSION_AES_KEY_BYTES = 32;
export const GOOGLE_SESSION_AES_IV_BYTES = 12;
export const GOOGLE_SESSION_MAX_TTL_SECONDS = 3600;
export const GOOGLE_SESSION_ENCRYPTION_VERSION = 1;
export const GOOGLE_SESSION_ENCRYPTION_ALGORITHM = "AES-256-GCM";

const AES_256_GCM_CIPHER = "aes-256-gcm";
const BASE64URL_SESSION_ID = /^[A-Za-z0-9_-]+$/;

export type GoogleSessionScopeMetadata = {
  driveFile: true;
};

export type GoogleSessionEncryptedAccessToken = {
  version: typeof GOOGLE_SESSION_ENCRYPTION_VERSION;
  algorithm: typeof GOOGLE_SESSION_ENCRYPTION_ALGORITHM;
  iv: string;
  ciphertext: string;
  authTag: string;
};

export type GoogleSessionExpiry = {
  ttlSeconds: number;
  expiresAtMs: number;
};

export function generateGoogleSessionId() {
  return randomBytes(GOOGLE_SESSION_ID_BYTES).toString("base64url");
}

export function createGoogleSessionLookupKey(sessionId: string) {
  if (!isOpaqueGoogleSessionId(sessionId)) {
    throw sanitizedGoogleSessionError("invalid-session-id");
  }
  const digest = createHash("sha256").update(sessionId, "utf8").digest("hex");
  if (digest.length !== GOOGLE_SESSION_LOOKUP_DIGEST_HEX_LENGTH) {
    throw sanitizedGoogleSessionError("invalid-lookup-digest");
  }
  return `${GOOGLE_SESSION_LOOKUP_KEY_PREFIX}${digest}`;
}

export function encryptGoogleSessionAccessToken(input: {
  accessToken: string;
  key: Uint8Array;
}): GoogleSessionEncryptedAccessToken {
  const accessToken = requireNonEmptyAccessToken(input.accessToken);
  const key = requireAesKey(input.key);
  const iv = randomBytes(GOOGLE_SESSION_AES_IV_BYTES);
  const cipher = createCipheriv(AES_256_GCM_CIPHER, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return {
    version: GOOGLE_SESSION_ENCRYPTION_VERSION,
    algorithm: GOOGLE_SESSION_ENCRYPTION_ALGORITHM,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: authTag.toString("base64url"),
  };
}

export function decryptGoogleSessionAccessToken(input: {
  encrypted: GoogleSessionEncryptedAccessToken;
  key: Uint8Array;
}) {
  const key = requireAesKey(input.key);
  const encrypted = requireEncryptedPayload(input.encrypted);
  try {
    const decipher = createDecipheriv(
      AES_256_GCM_CIPHER,
      key,
      Buffer.from(encrypted.iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return requireNonEmptyAccessToken(plaintext);
  } catch (error) {
    if (isSanitizedGoogleSessionError(error)) {
      throw error;
    }
    throw sanitizedGoogleSessionError("decrypt-failed");
  }
}

export function normalizeGoogleSessionExpiry(input: {
  createdAtMs: number;
  expiresInSeconds: number;
}): GoogleSessionExpiry {
  if (
    !Number.isFinite(input.createdAtMs) ||
    !Number.isSafeInteger(input.createdAtMs)
  ) {
    throw sanitizedGoogleSessionError("invalid-created-at");
  }
  if (
    !Number.isFinite(input.expiresInSeconds) ||
    input.expiresInSeconds <= 0
  ) {
    throw sanitizedGoogleSessionError("invalid-expires-in");
  }

  const ttlSeconds = Math.min(
    Math.floor(input.expiresInSeconds),
    GOOGLE_SESSION_MAX_TTL_SECONDS,
  );
  if (ttlSeconds < 1) {
    throw sanitizedGoogleSessionError("invalid-ttl");
  }

  const expiresAtMs = input.createdAtMs + ttlSeconds * 1000;
  if (
    !Number.isSafeInteger(expiresAtMs) ||
    expiresAtMs <= input.createdAtMs
  ) {
    throw sanitizedGoogleSessionError("invalid-expiry");
  }

  return {
    ttlSeconds,
    expiresAtMs,
  };
}

export function normalizeGoogleSessionScopeMetadata(
  scope: string,
): GoogleSessionScopeMetadata {
  if (typeof scope !== "string" || scope.trim() === "") {
    throw sanitizedGoogleSessionError("invalid-scope");
  }

  const scopes = scope.trim().split(/\s+/);
  const hasDriveFile = scopes.includes(DRIVE_FILE_SCOPE);
  const hasPhotosScope = scopes.some(isRejectedPhotosSessionScope);
  if (!hasDriveFile || hasPhotosScope) {
    throw sanitizedGoogleSessionError("invalid-scope");
  }

  return { driveFile: true };
}

function isOpaqueGoogleSessionId(sessionId: string) {
  if (typeof sessionId !== "string" || !BASE64URL_SESSION_ID.test(sessionId)) {
    return false;
  }
  try {
    return Buffer.from(sessionId, "base64url").byteLength === GOOGLE_SESSION_ID_BYTES;
  } catch {
    return false;
  }
}

function requireNonEmptyAccessToken(accessToken: string) {
  if (typeof accessToken !== "string" || accessToken.trim() === "") {
    throw sanitizedGoogleSessionError("invalid-access-token");
  }
  return accessToken;
}

function requireAesKey(key: Uint8Array) {
  if (
    !(key instanceof Uint8Array) ||
    key.byteLength !== GOOGLE_SESSION_AES_KEY_BYTES
  ) {
    throw sanitizedGoogleSessionError("invalid-key");
  }
  return Buffer.from(key);
}

function requireEncryptedPayload(value: GoogleSessionEncryptedAccessToken) {
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
    throw sanitizedGoogleSessionError("invalid-payload");
  }
  return value;
}

function isRejectedPhotosSessionScope(scope: string) {
  return (
    scope === PHOTOS_LIBRARY_APPENDONLY_SCOPE ||
    scope === PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE ||
    scope.includes("photoslibrary") ||
    scope.includes("photospicker")
  );
}

function sanitizedGoogleSessionError(kind: string) {
  return new Error(`google-session-${kind}`);
}

function isSanitizedGoogleSessionError(error: unknown) {
  return error instanceof Error && error.message.startsWith("google-session-");
}
