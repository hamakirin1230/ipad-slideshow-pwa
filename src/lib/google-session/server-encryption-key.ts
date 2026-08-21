import "server-only";
import { GOOGLE_SESSION_AES_KEY_BYTES } from "./server-primitives";

const BASE64URL_CHARSET = /^[A-Za-z0-9_-]+$/;

export type GoogleSessionEncryptionKeyEnv = {
  GOOGLE_SESSION_ENCRYPTION_KEY?: string;
};

export function readGoogleSessionEncryptionKey(
  env?: GoogleSessionEncryptionKeyEnv,
): Uint8Array {
  const value =
    env?.GOOGLE_SESSION_ENCRYPTION_KEY ??
    process.env.GOOGLE_SESSION_ENCRYPTION_KEY;
  if (typeof value !== "string" || value.length === 0) {
    throw sanitizedEncryptionKeyUnavailable();
  }
  if (!BASE64URL_CHARSET.test(value)) {
    throw sanitizedEncryptionKeyUnavailable();
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    throw sanitizedEncryptionKeyUnavailable();
  }

  if (decoded.byteLength !== GOOGLE_SESSION_AES_KEY_BYTES) {
    throw sanitizedEncryptionKeyUnavailable();
  }
  if (decoded.toString("base64url") !== value) {
    throw sanitizedEncryptionKeyUnavailable();
  }

  return new Uint8Array(decoded);
}

function sanitizedEncryptionKeyUnavailable() {
  return new Error("google-session-encryption-key-unavailable");
}
