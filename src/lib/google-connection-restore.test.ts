import { describe, expect, it } from "vitest";
import {
  GOOGLE_CONNECTION_RESTORE_STORAGE_KEY,
  GOOGLE_CONNECTION_RESTORE_WINDOW_MS,
  clearGoogleConnectionRestoreMarker,
  createGoogleConnectionRestoreExpiry,
  isGoogleConnectionRestoreMarkerActive,
  parseGoogleConnectionRestoreMarker,
  readActiveGoogleConnectionRestoreMarker,
  writeGoogleConnectionRestoreMarker,
} from "./google-connection-restore";

function createMemoryStorage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
}

describe("google connection restore marker", () => {
  it("uses a 60-minute restore window", () => {
    expect(GOOGLE_CONNECTION_RESTORE_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(createGoogleConnectionRestoreExpiry(1_000)).toBe(
      1_000 + 60 * 60 * 1000,
    );
  });

  it("uses the shorter Google token lifetime when it is clearly below 60 minutes", () => {
    expect(createGoogleConnectionRestoreExpiry(0, 3599)).toBe(3_599_000);
    expect(createGoogleConnectionRestoreExpiry(0, 7200)).toBe(
      GOOGLE_CONNECTION_RESTORE_WINDOW_MS,
    );
  });

  it("writes only a non-secret expiry marker on manual success", () => {
    const storage = createMemoryStorage();
    writeGoogleConnectionRestoreMarker(1_700_000_000_000, storage);
    expect(storage.snapshot()).toEqual({
      [GOOGLE_CONNECTION_RESTORE_STORAGE_KEY]: JSON.stringify({
        expiresAt: 1_700_000_000_000,
      }),
    });
    expect(storage.getItem(GOOGLE_CONNECTION_RESTORE_STORAGE_KEY)).not.toMatch(
      /access_token|refresh_token|id_token|ya29|email|scope/,
    );
  });

  it("treats expired and malformed markers as inactive and clears them", () => {
    const now = 2_000;
    expect(
      parseGoogleConnectionRestoreMarker(
        JSON.stringify({ expiresAt: 1_000, access_token: "secret" }),
      ),
    ).toBeNull();
    expect(parseGoogleConnectionRestoreMarker("not-json")).toBeNull();
    expect(parseGoogleConnectionRestoreMarker("[]")).toBeNull();
    expect(
      parseGoogleConnectionRestoreMarker(JSON.stringify({ expiresAt: "soon" })),
    ).toBeNull();

    const expired = createMemoryStorage({
      [GOOGLE_CONNECTION_RESTORE_STORAGE_KEY]: JSON.stringify({
        expiresAt: now,
      }),
    });
    expect(readActiveGoogleConnectionRestoreMarker(now, expired)).toBeNull();
    expect(expired.getItem(GOOGLE_CONNECTION_RESTORE_STORAGE_KEY)).toBeNull();

    const malformed = createMemoryStorage({
      [GOOGLE_CONNECTION_RESTORE_STORAGE_KEY]: '{"expiresAt":"soon"}',
    });
    expect(readActiveGoogleConnectionRestoreMarker(now, malformed)).toBeNull();
    expect(malformed.getItem(GOOGLE_CONNECTION_RESTORE_STORAGE_KEY)).toBeNull();
  });

  it("keeps a valid marker unchanged when it is still inside the window", () => {
    const storage = createMemoryStorage();
    const expiresAt = 10_000;
    writeGoogleConnectionRestoreMarker(expiresAt, storage);
    expect(readActiveGoogleConnectionRestoreMarker(9_999, storage)).toEqual({
      expiresAt,
    });
    expect(storage.getItem(GOOGLE_CONNECTION_RESTORE_STORAGE_KEY)).toBe(
      JSON.stringify({ expiresAt }),
    );
    expect(
      isGoogleConnectionRestoreMarkerActive({ expiresAt }, 10_000),
    ).toBe(false);
  });

  it("clears the marker without throwing", () => {
    const storage = createMemoryStorage({
      [GOOGLE_CONNECTION_RESTORE_STORAGE_KEY]: JSON.stringify({
        expiresAt: 9_999,
      }),
    });
    clearGoogleConnectionRestoreMarker(storage);
    expect(storage.getItem(GOOGLE_CONNECTION_RESTORE_STORAGE_KEY)).toBeNull();
  });
});
