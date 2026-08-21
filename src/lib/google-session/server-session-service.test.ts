import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DRIVE_FILE_SCOPE,
  PHOTOS_LIBRARY_APPENDONLY_SCOPE,
} from "../google-auth";
import {
  createGoogleSessionLookupKey,
  generateGoogleSessionId,
  GOOGLE_SESSION_AES_KEY_BYTES,
  GOOGLE_SESSION_ENCRYPTION_ALGORITHM,
  GOOGLE_SESSION_ENCRYPTION_VERSION,
  GOOGLE_SESSION_LOOKUP_DIGEST_HEX_LENGTH,
  GOOGLE_SESSION_LOOKUP_KEY_PREFIX,
} from "./server-primitives";
import {
  createGoogleServerSession,
  deleteGoogleServerSession,
  GOOGLE_SESSION_RECORD_VERSION,
  restoreGoogleServerSession,
  type GoogleSessionStore,
} from "./server-session-service";

const source = readFileSync(
  new URL("./server-session-service.ts", import.meta.url),
  "utf8",
);

const ACCESS_TOKEN = "ya29.drive-access-token-secret";
const NOW_MS = 1_700_000_000_000;

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

describe("google session server service", () => {
  it("creates a session with one hashed write and no secrets in the stored value", async () => {
    const store = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const created = await createGoogleServerSession({
      store,
      encryptionKey,
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });

    expect(store.writes).toHaveLength(1);
    expect(created).toEqual({
      sessionId: expect.any(String),
      expiresAtMs: NOW_MS + 1200 * 1000,
      maxAgeSeconds: 1200,
    });
    expect(created).not.toHaveProperty("accessToken");
    expect(created).not.toHaveProperty("lookupKey");

    const write = store.writes[0];
    const digest = write.lookupKey.slice(GOOGLE_SESSION_LOOKUP_KEY_PREFIX.length);
    expect(write.lookupKey).toBe(`google-session:${digest}`);
    expect(digest).toMatch(/^[0-9a-f]+$/);
    expect(digest).toHaveLength(GOOGLE_SESSION_LOOKUP_DIGEST_HEX_LENGTH);
    expect(write.lookupKey).toBe(createGoogleSessionLookupKey(created.sessionId));
    expect(write.lookupKey).not.toContain(created.sessionId);
    expect(write.ttlSeconds).toBe(1200);
    expect(write.value).not.toContain(created.sessionId);
    expect(write.value).not.toContain(ACCESS_TOKEN);
    expect(write.value).not.toContain(DRIVE_FILE_SCOPE);
    expect(write.value).not.toContain("photoslibrary");
    expect(write.value).not.toContain("photospicker");

    const record = JSON.parse(write.value) as Record<string, unknown>;
    expect(Object.keys(record).sort()).toEqual([
      "encryptedAccessToken",
      "expiresAtMs",
      "scopeMetadata",
      "version",
    ]);
    expect(record).toEqual({
      version: GOOGLE_SESSION_RECORD_VERSION,
      encryptedAccessToken: {
        version: GOOGLE_SESSION_ENCRYPTION_VERSION,
        algorithm: GOOGLE_SESSION_ENCRYPTION_ALGORITHM,
        iv: expect.any(String),
        ciphertext: expect.any(String),
        authTag: expect.any(String),
      },
      expiresAtMs: created.expiresAtMs,
      scopeMetadata: { driveFile: true },
    });
  });

  it("caps create TTL at 3600 seconds", async () => {
    const store = new FakeStore();
    const created = await createGoogleServerSession({
      store,
      encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 7200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });

    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].ttlSeconds).toBe(3600);
    expect(created.maxAgeSeconds).toBe(3600);
    expect(created.expiresAtMs).toBe(NOW_MS + 3600 * 1000);
  });

  it("rejects Photos scope before writing", async () => {
    const store = new FakeStore();
    await expect(
      createGoogleServerSession({
        store,
        encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1200,
        scope: `${DRIVE_FILE_SCOPE} ${PHOTOS_LIBRARY_APPENDONLY_SCOPE}`,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/google-session-invalid-scope/);
    expect(store.writes).toHaveLength(0);
    expect(store.reads).toHaveLength(0);
    expect(store.deletes).toHaveLength(0);
  });

  it("rejects invalid expiry before writing", async () => {
    const store = new FakeStore();
    await expect(
      createGoogleServerSession({
        store,
        encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 0,
        scope: DRIVE_FILE_SCOPE,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/google-session-invalid-expires-in/);
    expect(store.writes).toHaveLength(0);
  });

  it("sanitizes store.write backend errors", async () => {
    const store = new FakeStore();
    const vendorMessage =
      "UPSTASH ECONNREFUSED redis://default:super-secret@host:6379 token=ya29.leaked";
    store.writeError = new Error(vendorMessage);

    const error = await createGoogleServerSession({
      store,
      encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("google-session-store-unavailable");
    expect((error as Error).message).not.toContain(vendorMessage);
    expect((error as Error).message).not.toContain(ACCESS_TOKEN);
    expect((error as Error).message).not.toContain("UPSTASH");
    expect((error as Error).cause).toBeUndefined();
  });

  it("restores the exact plaintext token without extending TTL", async () => {
    const store = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const created = await createGoogleServerSession({
      store,
      encryptionKey,
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1800,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });

    const restored = await restoreGoogleServerSession({
      store,
      encryptionKey,
      sessionId: created.sessionId,
      nowMs: NOW_MS + 1,
    });

    expect(restored).toEqual({
      kind: "restored",
      accessToken: ACCESS_TOKEN,
      expiresAtMs: created.expiresAtMs,
    });
    expect(store.writes).toHaveLength(1);
    expect(store.reads).toHaveLength(1);
    expect(store.deletes).toHaveLength(0);
  });

  it("returns notConnected for a missing record", async () => {
    const store = new FakeStore();
    const restored = await restoreGoogleServerSession({
      store,
      encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
      sessionId: generateGoogleSessionId(),
      nowMs: NOW_MS,
    });

    expect(restored).toEqual({ kind: "notConnected" });
    expect(store.reads).toHaveLength(1);
    expect(store.writes).toHaveLength(0);
    expect(store.deletes).toHaveLength(0);
  });

  it("does not query the store for an invalid session ID", async () => {
    const store = new FakeStore();
    const restored = await restoreGoogleServerSession({
      store,
      encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
      sessionId: "not-a-valid-session-id",
      nowMs: NOW_MS,
    });

    expect(restored).toEqual({ kind: "notConnected" });
    expect(store.reads).toHaveLength(0);
    expect(store.writes).toHaveLength(0);
    expect(store.deletes).toHaveLength(0);
  });

  it("treats an expired record as notConnected and deletes it once", async () => {
    const store = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const created = await createGoogleServerSession({
      store,
      encryptionKey,
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });

    const restored = await restoreGoogleServerSession({
      store,
      encryptionKey,
      sessionId: created.sessionId,
      nowMs: created.expiresAtMs,
    });

    expect(restored).toEqual({ kind: "notConnected" });
    expect(restored).not.toHaveProperty("accessToken");
    expect(store.deletes).toEqual([store.writes[0].lookupKey]);
    expect(store.writes).toHaveLength(1);
  });

  it("deletes malformed JSON once and returns notConnected", async () => {
    const store = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const created = await createGoogleServerSession({
      store,
      encryptionKey,
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });
    const lookupKey = store.writes[0].lookupKey;
    store.records.set(lookupKey, {
      value: "{not-json",
      ttlSeconds: 1200,
    });

    const restored = await restoreGoogleServerSession({
      store,
      encryptionKey,
      sessionId: created.sessionId,
      nowMs: NOW_MS,
    });

    expect(restored).toEqual({ kind: "notConnected" });
    expect(store.deletes).toEqual([lookupKey]);
  });

  it("deletes a malformed stored record shape once", async () => {
    const store = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const created = await createGoogleServerSession({
      store,
      encryptionKey,
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });
    const lookupKey = store.writes[0].lookupKey;
    store.records.set(lookupKey, {
      value: JSON.stringify({ version: 1, expiresAtMs: created.expiresAtMs }),
      ttlSeconds: 1200,
    });

    const restored = await restoreGoogleServerSession({
      store,
      encryptionKey,
      sessionId: created.sessionId,
      nowMs: NOW_MS,
    });

    expect(restored).toEqual({ kind: "notConnected" });
    expect(store.deletes).toEqual([lookupKey]);
  });

  it("rejects plaintext-style extra fields as a malformed record", async () => {
    const store = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const created = await createGoogleServerSession({
      store,
      encryptionKey,
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });
    const lookupKey = store.writes[0].lookupKey;
    const record = JSON.parse(store.writes[0].value) as Record<string, unknown>;
    store.records.set(lookupKey, {
      value: JSON.stringify({
        ...record,
        accessToken: ACCESS_TOKEN,
        sessionId: created.sessionId,
        scope: DRIVE_FILE_SCOPE,
        refreshToken: "1//refresh-secret",
      }),
      ttlSeconds: 1200,
    });

    const restored = await restoreGoogleServerSession({
      store,
      encryptionKey,
      sessionId: created.sessionId,
      nowMs: NOW_MS,
    });

    expect(restored).toEqual({ kind: "notConnected" });
    expect(restored).not.toHaveProperty("accessToken");
    expect(store.deletes).toEqual([lookupKey]);
  });

  it("treats tampered ciphertext as notConnected and deletes once", async () => {
    const store = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const created = await createGoogleServerSession({
      store,
      encryptionKey,
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });
    const lookupKey = store.writes[0].lookupKey;
    const record = JSON.parse(store.writes[0].value) as {
      encryptedAccessToken: { ciphertext: string };
    };
    const ciphertext = Buffer.from(
      record.encryptedAccessToken.ciphertext,
      "base64url",
    );
    ciphertext[0] = ciphertext[0] === 0 ? 1 : 0;
    record.encryptedAccessToken.ciphertext = ciphertext.toString("base64url");
    store.records.set(lookupKey, {
      value: JSON.stringify(record),
      ttlSeconds: 1200,
    });

    const restored = await restoreGoogleServerSession({
      store,
      encryptionKey,
      sessionId: created.sessionId,
      nowMs: NOW_MS,
    });

    expect(restored).toEqual({ kind: "notConnected" });
    expect(restored).not.toHaveProperty("accessToken");
    expect(store.deletes).toEqual([lookupKey]);
  });

  it("does not return an access token for a wrong decrypt key", async () => {
    const store = new FakeStore();
    const created = await createGoogleServerSession({
      store,
      encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });

    const restored = await restoreGoogleServerSession({
      store,
      encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
      sessionId: created.sessionId,
      nowMs: NOW_MS,
    });

    expect(restored).toEqual({ kind: "notConnected" });
    expect(restored).not.toHaveProperty("accessToken");
    expect(JSON.stringify(restored)).not.toContain(ACCESS_TOKEN);
    expect(store.deletes).toHaveLength(1);
  });

  it("sanitizes restore store.read backend errors", async () => {
    const store = new FakeStore();
    const vendorMessage = "WRONGPASS redis://default:credential@host token=ya29.x";
    store.readError = new Error(vendorMessage);

    const error = await restoreGoogleServerSession({
      store,
      encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
      sessionId: generateGoogleSessionId(),
      nowMs: NOW_MS,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("google-session-store-unavailable");
    expect((error as Error).message).not.toContain(vendorMessage);
    expect((error as Error).cause).toBeUndefined();
  });

  it("swallows invalid-record cleanup delete failure without retrying", async () => {
    const store = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const created = await createGoogleServerSession({
      store,
      encryptionKey,
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });
    store.records.set(store.writes[0].lookupKey, {
      value: "not-json",
      ttlSeconds: 1200,
    });
    store.deleteError = new Error("redis timeout");

    const restored = await restoreGoogleServerSession({
      store,
      encryptionKey,
      sessionId: created.sessionId,
      nowMs: NOW_MS,
    });

    expect(restored).toEqual({ kind: "notConnected" });
    expect(store.deletes).toHaveLength(1);
  });

  it("deletes a valid session by hashed lookup key", async () => {
    const store = new FakeStore();
    const created = await createGoogleServerSession({
      store,
      encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });

    await deleteGoogleServerSession({
      store,
      sessionId: created.sessionId,
    });

    expect(store.deletes).toEqual([store.writes[0].lookupKey]);
    expect(store.deletes[0]).not.toContain(created.sessionId);
    expect(store.records.size).toBe(0);
  });

  it("treats explicit delete of an invalid session ID as a no-op", async () => {
    const store = new FakeStore();
    await deleteGoogleServerSession({
      store,
      sessionId: "not-a-valid-session-id",
    });
    expect(store.deletes).toHaveLength(0);
    expect(store.reads).toHaveLength(0);
    expect(store.writes).toHaveLength(0);
  });

  it("sanitizes explicit delete backend errors", async () => {
    const store = new FakeStore();
    const created = await createGoogleServerSession({
      store,
      encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });
    const vendorMessage = "MOVED 7991 redis://secret@host";
    store.deleteError = new Error(vendorMessage);

    const error = await deleteGoogleServerSession({
      store,
      sessionId: created.sessionId,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("google-session-store-unavailable");
    expect((error as Error).message).not.toContain(vendorMessage);
    expect((error as Error).cause).toBeUndefined();
  });

  it("rejects invalid nowMs without accessing the store", async () => {
    const store = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const sessionId = generateGoogleSessionId();

    for (const nowMs of [Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      await expect(
        createGoogleServerSession({
          store,
          encryptionKey,
          accessToken: ACCESS_TOKEN,
          expiresInSeconds: 1200,
          scope: DRIVE_FILE_SCOPE,
          nowMs,
        }),
      ).rejects.toThrow(/google-session-invalid-now-ms/);
      await expect(
        restoreGoogleServerSession({
          store,
          encryptionKey,
          sessionId,
          nowMs,
        }),
      ).rejects.toThrow(/google-session-invalid-now-ms/);
    }

    expect(store.writes).toHaveLength(0);
    expect(store.reads).toHaveLength(0);
    expect(store.deletes).toHaveLength(0);
  });

  it("keeps the service free of env, cookies, Redis, fetch, logging, and Map fallback", () => {
    for (const forbidden of [
      "process.env",
      "fetch(",
      "cookies(",
      "headers(",
      "NextRequest",
      "NextResponse",
      "Redis",
      "Upstash",
      "googleapis.com",
      "tokeninfo",
      "console.log",
      "console.error",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "document.cookie",
      "refresh_token",
      "client_secret",
      "Date.now(",
      "new Map",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/\bMap\b/);
    expect(source).not.toContain("photosExport");
    expect(source).not.toContain("encryptGooglePhotos");
  });
});
