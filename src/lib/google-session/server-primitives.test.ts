import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DRIVE_FILE_SCOPE,
  PHOTOS_LIBRARY_APPENDONLY_SCOPE,
  PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE,
} from "../google-auth";
import {
  createGooglePhotosPickerSessionLookupKey,
  createGoogleSessionLookupKey,
  decryptGoogleSessionAccessToken,
  encryptGoogleSessionAccessToken,
  generateGoogleSessionId,
  GOOGLE_PHOTOS_PICKER_SESSION_LOOKUP_KEY_PREFIX,
  GOOGLE_SESSION_AES_IV_BYTES,
  GOOGLE_SESSION_AES_KEY_BYTES,
  GOOGLE_SESSION_ENCRYPTION_ALGORITHM,
  GOOGLE_SESSION_ENCRYPTION_VERSION,
  GOOGLE_SESSION_ID_BYTES,
  GOOGLE_SESSION_LOOKUP_DIGEST_HEX_LENGTH,
  GOOGLE_SESSION_LOOKUP_KEY_PREFIX,
  GOOGLE_SESSION_MAX_TTL_SECONDS,
  normalizeGooglePhotosPickerSessionScopeMetadata,
  normalizeGoogleSessionExpiry,
  normalizeGoogleSessionScopeMetadata,
  type GoogleSessionEncryptedAccessToken,
} from "./server-primitives";

const source = readFileSync(new URL("./server-primitives.ts", import.meta.url), "utf8");

describe("google session server primitives", () => {
  it("generates opaque 32-byte base64url session IDs without collisions", () => {
    const ids = Array.from({ length: 200 }, () => generateGoogleSessionId());
    for (const sessionId of ids) {
      expect(sessionId).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(sessionId).not.toContain("=");
      expect(Buffer.from(sessionId, "base64url").byteLength).toBe(
        GOOGLE_SESSION_ID_BYTES,
      );
      expect(sessionId).not.toMatch(/account|project|drive|timestamp/i);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds a SHA-256 lookup key without embedding the raw session ID", () => {
    const sessionId = generateGoogleSessionId();
    const lookupKey = createGoogleSessionLookupKey(sessionId);
    expect(lookupKey.startsWith(GOOGLE_SESSION_LOOKUP_KEY_PREFIX)).toBe(true);
    const digest = lookupKey.slice(GOOGLE_SESSION_LOOKUP_KEY_PREFIX.length);
    expect(digest).toMatch(/^[0-9a-f]+$/);
    expect(digest).toHaveLength(GOOGLE_SESSION_LOOKUP_DIGEST_HEX_LENGTH);
    expect(lookupKey).not.toContain(sessionId);
    expect(createGoogleSessionLookupKey(sessionId)).toBe(lookupKey);
    expect(createGoogleSessionLookupKey(generateGoogleSessionId())).not.toBe(
      lookupKey,
    );
  });

  it("round-trips Drive access tokens with AES-256-GCM and a random IV", () => {
    const key = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const accessToken = "ya29.drive-access-token-secret";
    const first = encryptGoogleSessionAccessToken({ accessToken, key });
    const second = encryptGoogleSessionAccessToken({ accessToken, key });

    expect(first).toMatchObject({
      version: GOOGLE_SESSION_ENCRYPTION_VERSION,
      algorithm: GOOGLE_SESSION_ENCRYPTION_ALGORITHM,
    });
    expect(Buffer.from(first.iv, "base64url").byteLength).toBe(
      GOOGLE_SESSION_AES_IV_BYTES,
    );
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(JSON.stringify(first)).not.toContain(accessToken);
    expect(decryptGoogleSessionAccessToken({ encrypted: first, key })).toBe(
      accessToken,
    );
    expect(decryptGoogleSessionAccessToken({ encrypted: second, key })).toBe(
      accessToken,
    );
  });

  it("rejects decrypt with the wrong key, tampered ciphertext, or tampered auth tag", () => {
    const key = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const accessToken = "ya29.drive-access-token-secret";
    const encrypted = encryptGoogleSessionAccessToken({ accessToken, key });

    expect(() =>
      decryptGoogleSessionAccessToken({
        encrypted,
        key: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
      }),
    ).toThrow(/google-session-decrypt-failed/);

    expect(() =>
      decryptGoogleSessionAccessToken({
        encrypted: tamperBase64UrlField(encrypted, "ciphertext"),
        key,
      }),
    ).toThrow(/google-session-decrypt-failed/);

    expect(() =>
      decryptGoogleSessionAccessToken({
        encrypted: tamperBase64UrlField(encrypted, "authTag"),
        key,
      }),
    ).toThrow(/google-session-decrypt-failed/);
  });

  it("rejects non-32-byte keys and empty access tokens without leaking secrets", () => {
    const key = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const accessToken = "ya29.drive-access-token-secret";

    expect(() =>
      encryptGoogleSessionAccessToken({
        accessToken,
        key: randomBytes(16),
      }),
    ).toThrow(/google-session-invalid-key/);
    expect(() =>
      encryptGoogleSessionAccessToken({
        accessToken: "   ",
        key,
      }),
    ).toThrow(/google-session-invalid-access-token/);

    try {
      encryptGoogleSessionAccessToken({ accessToken, key: randomBytes(31) });
      throw new Error("expected reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) return;
      expect(error.message).not.toContain(accessToken);
      expect(error.message).not.toContain(key.toString("base64url"));
    }
  });

  it("caps Google expires_in at 3600 seconds and computes absolute expiry", () => {
    const createdAtMs = 1_700_000_000_000;
    expect(
      normalizeGoogleSessionExpiry({ createdAtMs, expiresInSeconds: 1200 }),
    ).toEqual({
      ttlSeconds: 1200,
      expiresAtMs: createdAtMs + 1200 * 1000,
    });
    expect(
      normalizeGoogleSessionExpiry({ createdAtMs, expiresInSeconds: 3600 }),
    ).toEqual({
      ttlSeconds: GOOGLE_SESSION_MAX_TTL_SECONDS,
      expiresAtMs: createdAtMs + GOOGLE_SESSION_MAX_TTL_SECONDS * 1000,
    });
    expect(
      normalizeGoogleSessionExpiry({ createdAtMs, expiresInSeconds: 7200 }),
    ).toEqual({
      ttlSeconds: GOOGLE_SESSION_MAX_TTL_SECONDS,
      expiresAtMs: createdAtMs + GOOGLE_SESSION_MAX_TTL_SECONDS * 1000,
    });
    expect(
      normalizeGoogleSessionExpiry({ createdAtMs, expiresInSeconds: 3600.9 }),
    ).toEqual({
      ttlSeconds: GOOGLE_SESSION_MAX_TTL_SECONDS,
      expiresAtMs: createdAtMs + GOOGLE_SESSION_MAX_TTL_SECONDS * 1000,
    });

    for (const expiresInSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        normalizeGoogleSessionExpiry({ createdAtMs, expiresInSeconds }),
      ).toThrow(/google-session-invalid/);
    }
  });

  it("rejects expiry results that are not safe integers without leaking inputs", () => {
    expect(() =>
      normalizeGoogleSessionExpiry({
        createdAtMs: Number.MAX_SAFE_INTEGER,
        expiresInSeconds: 3600,
      }),
    ).toThrow(/google-session-invalid-expiry/);
    expect(() =>
      normalizeGoogleSessionExpiry({
        createdAtMs: Number.MAX_SAFE_INTEGER - 1000,
        expiresInSeconds: 3600,
      }),
    ).toThrow(/google-session-invalid-expiry/);

    try {
      normalizeGoogleSessionExpiry({
        createdAtMs: Number.MAX_SAFE_INTEGER,
        expiresInSeconds: 1200,
      });
      throw new Error("expected reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) return;
      expect(error.message).toBe("google-session-invalid-expiry");
      expect(error.message).not.toContain(String(Number.MAX_SAFE_INTEGER));
      expect(error.message).not.toContain("1200");
      expect(error.message).not.toMatch(/ya29|access.token|secret/i);
    }

    const now = Date.now();
    const normal = normalizeGoogleSessionExpiry({
      createdAtMs: now,
      expiresInSeconds: 1800,
    });
    expect(Number.isSafeInteger(normal.expiresAtMs)).toBe(true);
    expect(normal.expiresAtMs).toBeGreaterThan(now);
    expect(normal.ttlSeconds).toBe(1800);
  });

  it("accepts drive.file and rejects Photos scopes without storing the raw scope string", () => {
    expect(normalizeGoogleSessionScopeMetadata(DRIVE_FILE_SCOPE)).toEqual({
      driveFile: true,
    });
    expect(
      normalizeGoogleSessionScopeMetadata(` ${DRIVE_FILE_SCOPE} `),
    ).toEqual({ driveFile: true });

    expect(() => normalizeGoogleSessionScopeMetadata("")).toThrow(
      /google-session-invalid-scope/,
    );
    expect(() =>
      normalizeGoogleSessionScopeMetadata(
        "https://www.googleapis.com/auth/drive.readonly",
      ),
    ).toThrow(/google-session-invalid-scope/);
    expect(() =>
      normalizeGoogleSessionScopeMetadata(
        `${DRIVE_FILE_SCOPE} ${PHOTOS_LIBRARY_APPENDONLY_SCOPE}`,
      ),
    ).toThrow(/google-session-invalid-scope/);
    expect(() =>
      normalizeGoogleSessionScopeMetadata(
        `${DRIVE_FILE_SCOPE} ${PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE}`,
      ),
    ).toThrow(/google-session-invalid-scope/);

    const metadata = normalizeGoogleSessionScopeMetadata(DRIVE_FILE_SCOPE);
    expect(JSON.stringify(metadata)).not.toContain(DRIVE_FILE_SCOPE);
    expect(metadata).not.toHaveProperty("scope");
  });

  it("builds a Photos Picker lookup key in a separate namespace", () => {
    const sessionId = generateGoogleSessionId();
    const driveKey = createGoogleSessionLookupKey(sessionId);
    const photosKey = createGooglePhotosPickerSessionLookupKey(sessionId);
    expect(photosKey.startsWith(GOOGLE_PHOTOS_PICKER_SESSION_LOOKUP_KEY_PREFIX)).toBe(
      true,
    );
    expect(photosKey).not.toBe(driveKey);
    expect(photosKey).not.toContain(sessionId);
    expect(driveKey.startsWith(GOOGLE_SESSION_LOOKUP_KEY_PREFIX)).toBe(true);
  });

  it("accepts Photos Picker scopes only in the Photos Picker metadata helper", () => {
    const pickerScope = `${DRIVE_FILE_SCOPE} ${PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE}`;
    expect(normalizeGooglePhotosPickerSessionScopeMetadata(pickerScope)).toEqual({
      photosPicker: true,
    });
    expect(() =>
      normalizeGooglePhotosPickerSessionScopeMetadata(DRIVE_FILE_SCOPE),
    ).toThrow(/google-session-invalid-scope/);
    expect(() =>
      normalizeGooglePhotosPickerSessionScopeMetadata(
        `${DRIVE_FILE_SCOPE} ${PHOTOS_LIBRARY_APPENDONLY_SCOPE}`,
      ),
    ).toThrow(/google-session-invalid-scope/);
    expect(() =>
      normalizeGooglePhotosPickerSessionScopeMetadata(
        `${DRIVE_FILE_SCOPE} ${PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE} ${PHOTOS_LIBRARY_APPENDONLY_SCOPE}`,
      ),
    ).toThrow(/google-session-invalid-scope/);
  });

  it("keeps server primitives free of env, cookies, Redis, fetch, and logging", () => {
    for (const forbidden of [
      "process.env",
      "fetch(",
      "cookies(",
      "headers(",
      "NextRequest",
      "NextResponse",
      "Redis",
      "Upstash",
      "googleapis.com/token",
      "tokeninfo",
      "console.log",
      "console.error",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "document.cookie",
      "refresh_token",
      "client_secret",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toContain("photosExport");
    expect(source).not.toContain("encryptGooglePhotos");
  });
});

function tamperBase64UrlField(
  encrypted: GoogleSessionEncryptedAccessToken,
  field: "ciphertext" | "authTag",
): GoogleSessionEncryptedAccessToken {
  const bytes = Buffer.from(encrypted[field], "base64url");
  bytes[0] = bytes[0] === 0 ? 1 : 0;
  return {
    ...encrypted,
    [field]: bytes.toString("base64url"),
  };
}
