import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DRIVE_AND_PHOTOS_PICKER_SCOPES,
  DRIVE_FILE_SCOPE,
  PHOTOS_LIBRARY_APPENDONLY_SCOPE,
} from "../google-auth";
import {
  createGooglePhotosPickerSessionLookupKey,
  createGoogleSessionLookupKey,
  GOOGLE_PHOTOS_PICKER_SESSION_LOOKUP_KEY_PREFIX,
  GOOGLE_SESSION_AES_KEY_BYTES,
  GOOGLE_SESSION_ENCRYPTION_ALGORITHM,
  GOOGLE_SESSION_ENCRYPTION_VERSION,
  GOOGLE_SESSION_LOOKUP_DIGEST_HEX_LENGTH,
} from "../google-session/server-primitives";
import {
  createGoogleServerSession,
  deleteGoogleServerSession,
  restoreGoogleServerSession,
  type GoogleSessionStore,
} from "../google-session/server-session-service";
import {
  createGooglePhotosPickerServerSession,
  deleteGooglePhotosPickerServerSession,
  GOOGLE_PHOTOS_PICKER_SESSION_RECORD_VERSION,
  restoreGooglePhotosPickerServerSession,
} from "./server-session-service";

const source = readFileSync(
  new URL("./server-session-service.ts", import.meta.url),
  "utf8",
);

const ACCESS_TOKEN = "ya29.photos-picker-access-token-secret";
const DRIVE_TOKEN = "ya29.drive-access-token-secret";
const NOW_MS = 1_700_000_000_000;

class FakeStore implements GoogleSessionStore {
  records = new Map<string, { value: string; ttlSeconds: number }>();
  writes: Array<{ lookupKey: string; value: string; ttlSeconds: number }> = [];
  reads: string[] = [];
  deletes: string[] = [];

  async write(input: {
    lookupKey: string;
    value: string;
    ttlSeconds: number;
  }) {
    this.writes.push(input);
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

describe("google photos picker session server service", () => {
  it("creates a session with hashed Photos lookup key and no secrets in storage", async () => {
    const store = new FakeStore();
    const created = await createGooglePhotosPickerServerSession({
      store,
      encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
      nowMs: NOW_MS,
    });

    expect(created).toEqual({
      sessionId: expect.any(String),
      expiresAtMs: NOW_MS + 1200 * 1000,
      maxAgeSeconds: 1200,
    });
    expect(created).not.toHaveProperty("accessToken");
    expect(store.writes).toHaveLength(1);
    const write = store.writes[0];
    expect(write.lookupKey).toBe(
      createGooglePhotosPickerSessionLookupKey(created.sessionId),
    );
    expect(write.lookupKey.startsWith(GOOGLE_PHOTOS_PICKER_SESSION_LOOKUP_KEY_PREFIX)).toBe(
      true,
    );
    expect(write.lookupKey.slice(GOOGLE_PHOTOS_PICKER_SESSION_LOOKUP_KEY_PREFIX.length)).toHaveLength(
      GOOGLE_SESSION_LOOKUP_DIGEST_HEX_LENGTH,
    );
    expect(write.lookupKey).not.toBe(
      createGoogleSessionLookupKey(created.sessionId),
    );
    expect(write.value).not.toContain(ACCESS_TOKEN);
    expect(write.value).not.toContain(created.sessionId);
    expect(write.value).not.toContain("photospicker.mediaitems.readonly");
    const record = JSON.parse(write.value) as Record<string, unknown>;
    expect(record).toMatchObject({
      version: GOOGLE_PHOTOS_PICKER_SESSION_RECORD_VERSION,
      expiresAtMs: created.expiresAtMs,
      scopeMetadata: { photosPicker: true },
      encryptedAccessToken: {
        version: GOOGLE_SESSION_ENCRYPTION_VERSION,
        algorithm: GOOGLE_SESSION_ENCRYPTION_ALGORITHM,
      },
    });
  });

  it("caps create TTL at min(expires_in, 3600)", async () => {
    const store = new FakeStore();
    const created = await createGooglePhotosPickerServerSession({
      store,
      encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 7200,
      scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
      nowMs: NOW_MS,
    });
    expect(store.writes[0].ttlSeconds).toBe(3600);
    expect(created.maxAgeSeconds).toBe(3600);
    expect(created.expiresAtMs).toBe(NOW_MS + 3600 * 1000);
  });

  it("rejects Drive-only and Photos export scopes before writing", async () => {
    const store = new FakeStore();
    await expect(
      createGooglePhotosPickerServerSession({
        store,
        encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1200,
        scope: DRIVE_FILE_SCOPE,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/google-session-invalid-scope/);
    await expect(
      createGooglePhotosPickerServerSession({
        store,
        encryptionKey: randomBytes(GOOGLE_SESSION_AES_KEY_BYTES),
        accessToken: ACCESS_TOKEN,
        expiresInSeconds: 1200,
        scope: `${DRIVE_AND_PHOTOS_PICKER_SCOPES} ${PHOTOS_LIBRARY_APPENDONLY_SCOPE}`,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/google-session-invalid-scope/);
    expect(store.writes).toHaveLength(0);
  });

  it("restores the token without extending absolute expiry", async () => {
    const store = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const created = await createGooglePhotosPickerServerSession({
      store,
      encryptionKey,
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1800,
      scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
      nowMs: NOW_MS,
    });

    const restored = await restoreGooglePhotosPickerServerSession({
      store,
      encryptionKey,
      sessionId: created.sessionId,
      nowMs: NOW_MS + 60_000,
    });

    expect(restored).toEqual({
      kind: "restored",
      accessToken: ACCESS_TOKEN,
      expiresAtMs: created.expiresAtMs,
    });
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].ttlSeconds).toBe(1800);
  });

  it("returns unavailable after absolute expiry without extending TTL", async () => {
    const store = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const created = await createGooglePhotosPickerServerSession({
      store,
      encryptionKey,
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
      nowMs: NOW_MS,
    });

    const restored = await restoreGooglePhotosPickerServerSession({
      store,
      encryptionKey,
      sessionId: created.sessionId,
      nowMs: created.expiresAtMs,
    });

    expect(restored).toEqual({ kind: "notConnected" });
    expect(store.writes).toHaveLength(1);
    expect(store.deletes).toEqual([store.writes[0].lookupKey]);
  });

  it("does not change a Drive session store when creating or deleting Photos sessions", async () => {
    const photosStore = new FakeStore();
    const driveStore = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const driveCreated = await createGoogleServerSession({
      store: driveStore,
      encryptionKey,
      accessToken: DRIVE_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });
    const photosCreated = await createGooglePhotosPickerServerSession({
      store: photosStore,
      encryptionKey,
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 900,
      scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
      nowMs: NOW_MS,
    });

    await deleteGooglePhotosPickerServerSession({
      store: photosStore,
      sessionId: photosCreated.sessionId,
    });

    expect(driveStore.writes).toHaveLength(1);
    expect(driveStore.deletes).toHaveLength(0);
    expect(driveStore.records.size).toBe(1);
    const driveRestored = await restoreGoogleServerSession({
      store: driveStore,
      encryptionKey,
      sessionId: driveCreated.sessionId,
      nowMs: NOW_MS + 1,
    });
    expect(driveRestored).toMatchObject({
      kind: "restored",
      accessToken: DRIVE_TOKEN,
    });
  });

  it("does not change a Photos session store when creating or deleting Drive sessions", async () => {
    const photosStore = new FakeStore();
    const driveStore = new FakeStore();
    const encryptionKey = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const photosCreated = await createGooglePhotosPickerServerSession({
      store: photosStore,
      encryptionKey,
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 900,
      scope: DRIVE_AND_PHOTOS_PICKER_SCOPES,
      nowMs: NOW_MS,
    });
    const driveCreated = await createGoogleServerSession({
      store: driveStore,
      encryptionKey,
      accessToken: DRIVE_TOKEN,
      expiresInSeconds: 1200,
      scope: DRIVE_FILE_SCOPE,
      nowMs: NOW_MS,
    });
    await deleteGoogleServerSession({
      store: driveStore,
      sessionId: driveCreated.sessionId,
    });

    expect(photosStore.deletes).toHaveLength(0);
    expect(photosStore.records.size).toBe(1);
    const photosRestored = await restoreGooglePhotosPickerServerSession({
      store: photosStore,
      encryptionKey,
      sessionId: photosCreated.sessionId,
      nowMs: NOW_MS + 1,
    });
    expect(photosRestored).toMatchObject({
      kind: "restored",
      accessToken: ACCESS_TOKEN,
    });
  });

  it("keeps Photos session service free of Drive cookie and export names", () => {
    expect(source).toContain("createGooglePhotosPickerSessionLookupKey");
    expect(source).not.toContain("createGoogleSessionLookupKey(");
    expect(source).not.toContain("__Host-google-session");
    expect(source).not.toContain("photosExport");
    expect(source).not.toContain("photoslibrary.appendonly");
    expect(source).not.toContain("console.log");
    expect(source).not.toContain("localStorage");
  });
});
