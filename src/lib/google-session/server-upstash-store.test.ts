import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createGoogleSessionLookupKey,
  generateGoogleSessionId,
} from "./server-primitives";
import {
  createGoogleSessionStoreFromRedis,
  createGoogleSessionUpstashRedisConfig,
  createGoogleSessionUpstashStore,
  type GoogleSessionRedisClient,
} from "./server-upstash-store";

const source = readFileSync(
  new URL("./server-upstash-store.ts", import.meta.url),
  "utf8",
);

const LOOKUP_KEY = createGoogleSessionLookupKey(generateGoogleSessionId());
const STORED_VALUE = '{"version":1,"expiresAtMs":1700001200000}';
const TTL_SECONDS = 1200;
const VENDOR_MESSAGE =
  "WRONGPASS redis://default:super-secret@host:6379 token=ya29.leaked";

class FakeRedis implements GoogleSessionRedisClient {
  setCalls: Array<{
    key: string;
    value: string;
    options: { ex: number; nx: true };
  }> = [];
  getCalls: string[] = [];
  delCalls: string[] = [];
  setResult: "OK" | null = "OK";
  getResult: string | null = null;
  setError: Error | null = null;
  getError: Error | null = null;
  delError: Error | null = null;

  async set(
    key: string,
    value: string,
    options: { ex: number; nx: true },
  ) {
    this.setCalls.push({ key, value, options });
    if (this.setError) {
      throw this.setError;
    }
    return this.setResult;
  }

  async get(key: string) {
    this.getCalls.push(key);
    if (this.getError) {
      throw this.getError;
    }
    return this.getResult;
  }

  async del(key: string) {
    this.delCalls.push(key);
    if (this.delError) {
      throw this.delError;
    }
    return 1;
  }
}

describe("google session upstash store", () => {
  it("writes with a single SET NX EX command", async () => {
    const redis = new FakeRedis();
    const store = createGoogleSessionStoreFromRedis(redis);

    await store.write({
      lookupKey: LOOKUP_KEY,
      value: STORED_VALUE,
      ttlSeconds: TTL_SECONDS,
    });

    expect(redis.setCalls).toEqual([
      {
        key: LOOKUP_KEY,
        value: STORED_VALUE,
        options: { ex: TTL_SECONDS, nx: true },
      },
    ]);
    expect(redis.getCalls).toHaveLength(0);
    expect(redis.delCalls).toHaveLength(0);
  });

  it("does not retry when SET NX finds an existing key", async () => {
    const redis = new FakeRedis();
    redis.setResult = null;
    const store = createGoogleSessionStoreFromRedis(redis);

    const error = await store
      .write({
        lookupKey: LOOKUP_KEY,
        value: STORED_VALUE,
        ttlSeconds: TTL_SECONDS,
      })
      .catch((caught: unknown) => caught);

    expectSanitizedStoreError(error);
    expect(redis.setCalls).toHaveLength(1);
  });

  it("reads the raw string from a single GET", async () => {
    const redis = new FakeRedis();
    redis.getResult = STORED_VALUE;
    const store = createGoogleSessionStoreFromRedis(redis);

    await expect(store.read(LOOKUP_KEY)).resolves.toBe(STORED_VALUE);
    expect(redis.getCalls).toEqual([LOOKUP_KEY]);
    expect(redis.setCalls).toHaveLength(0);
    expect(redis.delCalls).toHaveLength(0);
  });

  it("returns null for a missing key", async () => {
    const redis = new FakeRedis();
    redis.getResult = null;
    const store = createGoogleSessionStoreFromRedis(redis);

    await expect(store.read(LOOKUP_KEY)).resolves.toBeNull();
    expect(redis.getCalls).toHaveLength(1);
  });

  it("deletes with a single DEL", async () => {
    const redis = new FakeRedis();
    const store = createGoogleSessionStoreFromRedis(redis);

    await store.delete(LOOKUP_KEY);
    expect(redis.delCalls).toEqual([LOOKUP_KEY]);
    expect(redis.setCalls).toHaveLength(0);
    expect(redis.getCalls).toHaveLength(0);
  });

  it("sanitizes set, get, and del vendor errors", async () => {
    const redis = new FakeRedis();
    const store = createGoogleSessionStoreFromRedis(redis);

    redis.setError = new Error(VENDOR_MESSAGE);
    expectSanitizedStoreError(
      await store
        .write({
          lookupKey: LOOKUP_KEY,
          value: STORED_VALUE,
          ttlSeconds: TTL_SECONDS,
        })
        .catch((caught: unknown) => caught),
    );
    expect(redis.setCalls).toHaveLength(1);

    redis.getError = new Error(VENDOR_MESSAGE);
    expectSanitizedStoreError(
      await store.read(LOOKUP_KEY).catch((caught: unknown) => caught),
    );
    expect(redis.getCalls).toHaveLength(1);

    redis.delError = new Error(VENDOR_MESSAGE);
    expectSanitizedStoreError(
      await store.delete(LOOKUP_KEY).catch((caught: unknown) => caught),
    );
    expect(redis.delCalls).toHaveLength(1);
  });

  it("fails closed on missing env without creating a Redis client", () => {
    for (const env of [
      {},
      { KV_REST_API_URL: "", KV_REST_API_TOKEN: "fake-rest-token" },
      { KV_REST_API_URL: "https://kv.example.invalid", KV_REST_API_TOKEN: "" },
      {
        KV_REST_API_URL: "   ",
        KV_REST_API_TOKEN: "fake-rest-token",
      },
    ]) {
      expect(() => createGoogleSessionUpstashRedisConfig(env)).toThrow(
        "google-session-store-unavailable",
      );
      expect(() => createGoogleSessionUpstashStore(env)).toThrow(
        "google-session-store-unavailable",
      );
    }
  });

  it("pins production Redis client options to raw strings, no telemetry, and no SDK retry", () => {
    const config = createGoogleSessionUpstashRedisConfig({
      KV_REST_API_URL: "https://kv.example.invalid",
      KV_REST_API_TOKEN: "fake-rest-token",
    });

    expect(config.retry.retries).toBe(0);
    expect(config.automaticDeserialization).toBe(false);
    expect(config.enableTelemetry).toBe(false);
    expect(config).toEqual({
      url: "https://kv.example.invalid",
      token: "fake-rest-token",
      automaticDeserialization: false,
      enableTelemetry: false,
      retry: { retries: 0 },
    });
  });

  it("is a server-only adapter without app-level retry loops or extra Redis commands", () => {
    expect(source).toContain('import "server-only"');
    expect(source).toContain("retries: 0");
    expect(source).not.toContain("fromEnv");
    expect(source).not.toContain("Redis.fromEnv");
    for (const forbidden of [
      ".touch(",
      ".scan(",
      ".keys(",
      ".expire(",
      ".setex(",
      ".persist(",
      "REDIS_URL",
      "KV_URL",
      "KV_REST_API_READ_ONLY_TOKEN",
      "NEXT_PUBLIC_",
      "GOOGLE_SESSION_ENCRYPTION_KEY",
      "new Map",
      "console.log",
      "console.error",
      "console.warn",
      "console.debug",
      "while (",
      "setTimeout(",
      "setInterval(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

function expectSanitizedStoreError(error: unknown) {
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe("google-session-store-unavailable");
  expect((error as Error).message).not.toContain(VENDOR_MESSAGE);
  expect((error as Error).message).not.toContain("redis://");
  expect((error as Error).message).not.toContain("super-secret");
  expect((error as Error).message).not.toContain("ya29.leaked");
  expect((error as Error).cause).toBeUndefined();
}
