import "server-only";
import { Redis } from "@upstash/redis";
import {
  GOOGLE_SESSION_LOOKUP_DIGEST_HEX_LENGTH,
  GOOGLE_SESSION_LOOKUP_KEY_PREFIX,
} from "./server-primitives";
import type { GoogleSessionStore } from "./server-session-service";

export type GoogleSessionUpstashEnv = {
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;
};

export type GoogleSessionRedisClient = {
  set(
    key: string,
    value: string,
    options: {
      ex: number;
      nx: true;
    },
  ): Promise<"OK" | null | string>;
  get(key: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

const LOOKUP_KEY_PATTERN = new RegExp(
  `^${GOOGLE_SESSION_LOOKUP_KEY_PREFIX}[0-9a-f]{${GOOGLE_SESSION_LOOKUP_DIGEST_HEX_LENGTH}}$`,
);

export function createGoogleSessionUpstashRedisConfig(
  env: GoogleSessionUpstashEnv,
) {
  return {
    url: requireEnvValue(env.KV_REST_API_URL),
    token: requireEnvValue(env.KV_REST_API_TOKEN),
    automaticDeserialization: false as const,
    enableTelemetry: false as const,
    retry: {
      retries: 0 as const,
    },
  };
}

export function createGoogleSessionUpstashStore(
  env?: GoogleSessionUpstashEnv,
): GoogleSessionStore {
  const redis = new Redis(
    createGoogleSessionUpstashRedisConfig(readGoogleSessionUpstashEnv(env)),
  );
  return createGoogleSessionStoreFromRedis(redis);
}

export function createGoogleSessionStoreFromRedis(
  redis: GoogleSessionRedisClient,
): GoogleSessionStore {
  return {
    async write(input) {
      const lookupKey = requireLookupKey(input.lookupKey);
      const value = requireStoredValue(input.value);
      const ttlSeconds = requireTtlSeconds(input.ttlSeconds);
      let result: unknown;
      try {
        result = await redis.set(lookupKey, value, {
          ex: ttlSeconds,
          nx: true,
        });
      } catch {
        throw sanitizedStoreUnavailable();
      }
      if (result !== "OK") {
        throw sanitizedStoreUnavailable();
      }
    },
    async read(lookupKey) {
      const key = requireLookupKey(lookupKey);
      let result: unknown;
      try {
        result = await redis.get(key);
      } catch {
        throw sanitizedStoreUnavailable();
      }
      if (result === null) {
        return null;
      }
      if (typeof result !== "string") {
        throw sanitizedStoreUnavailable();
      }
      return result;
    },
    async delete(lookupKey) {
      const key = requireLookupKey(lookupKey);
      try {
        await redis.del(key);
      } catch {
        throw sanitizedStoreUnavailable();
      }
    },
  };
}

function readGoogleSessionUpstashEnv(
  env?: GoogleSessionUpstashEnv,
): GoogleSessionUpstashEnv {
  if (env) {
    return env;
  }
  return {
    KV_REST_API_URL: process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
  };
}

function requireEnvValue(value: string | undefined) {
  if (typeof value !== "string" || value.trim() === "") {
    throw sanitizedStoreUnavailable();
  }
  return value;
}

function requireLookupKey(lookupKey: string) {
  if (typeof lookupKey !== "string" || !LOOKUP_KEY_PATTERN.test(lookupKey)) {
    throw sanitizedStoreUnavailable();
  }
  return lookupKey;
}

function requireStoredValue(value: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw sanitizedStoreUnavailable();
  }
  return value;
}

function requireTtlSeconds(ttlSeconds: number) {
  if (
    !Number.isFinite(ttlSeconds) ||
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 1
  ) {
    throw sanitizedStoreUnavailable();
  }
  return ttlSeconds;
}

function sanitizedStoreUnavailable() {
  return new Error("google-session-store-unavailable");
}
