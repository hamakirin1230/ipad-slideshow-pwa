import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GOOGLE_SESSION_AES_KEY_BYTES } from "./server-primitives";
import { readGoogleSessionEncryptionKey } from "./server-encryption-key";

const source = readFileSync(
  new URL("./server-encryption-key.ts", import.meta.url),
  "utf8",
);

describe("google session encryption key loader", () => {
  it("accepts a canonical unpadded 32-byte base64url key", () => {
    const bytes = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES);
    const encoded = bytes.toString("base64url");
    const loaded = readGoogleSessionEncryptionKey({
      GOOGLE_SESSION_ENCRYPTION_KEY: encoded,
    });
    expect(Buffer.from(loaded).equals(bytes)).toBe(true);
    expect(encoded).not.toContain("=");
    expect(encoded).toHaveLength(43);
  });

  it("rejects missing, empty, noncanonical, and wrong-length keys without leaking values", () => {
    const canonical = randomBytes(GOOGLE_SESSION_AES_KEY_BYTES).toString(
      "base64url",
    );
    const padded = `${canonical}=`;
    const tooShort = randomBytes(16).toString("base64url");
    const tooLong = randomBytes(48).toString("base64url");
    const plusAlphabet = `${"A".repeat(42)}+`;

    for (const env of [
      {},
      { GOOGLE_SESSION_ENCRYPTION_KEY: "" },
      { GOOGLE_SESSION_ENCRYPTION_KEY: padded },
      { GOOGLE_SESSION_ENCRYPTION_KEY: tooShort },
      { GOOGLE_SESSION_ENCRYPTION_KEY: tooLong },
      { GOOGLE_SESSION_ENCRYPTION_KEY: "not-valid" },
      { GOOGLE_SESSION_ENCRYPTION_KEY: plusAlphabet },
    ]) {
      const error = (() => {
        try {
          readGoogleSessionEncryptionKey(env);
          return null;
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        "google-session-encryption-key-unavailable",
      );
      const leaked = env.GOOGLE_SESSION_ENCRYPTION_KEY;
      if (leaked) {
        expect((error as Error).message).not.toContain(leaked);
      }
      expect((error as Error).cause).toBeUndefined();
    }
  });

  it("keeps the loader free of public env, logging, and secret leakage", () => {
    for (const forbidden of [
      "NEXT_PUBLIC_",
      "console.log",
      "console.error",
      "console.warn",
      "console.debug",
      "refresh_token",
      "client_secret",
      "cookies(",
      "fetch(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain('import "server-only"');
  });
});
