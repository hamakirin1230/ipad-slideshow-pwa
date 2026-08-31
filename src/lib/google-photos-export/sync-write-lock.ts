const LOCK_NAME_PREFIX = "ispwa.gphotos-sync.v1.";
const LOCK_DIGEST_MATERIAL_PREFIX =
  "ipad-slideshow-pwa:google-photos-sync-write:v1:";

export type GooglePhotosSyncLockRequest = <T>(
  name: string,
  options: { mode: "exclusive"; ifAvailable: true },
  callback: (lock: { name: string } | null) => Promise<T>,
) => Promise<T>;

export type GooglePhotosSyncWriteLockHost = {
  requestLock?: GooglePhotosSyncLockRequest | null;
  digest?: ((data: BufferSource) => Promise<ArrayBuffer>) | null;
};

export type GooglePhotosSyncWriteLockResult<T> =
  | { acquired: true; value: T }
  | { acquired: false; reason: "locked" | "lockUnavailable" };

export async function createGooglePhotosSyncWriteLockName(
  projectId: string,
  host: GooglePhotosSyncWriteLockHost = {},
): Promise<string> {
  if (
    typeof projectId !== "string" ||
    projectId.length === 0 ||
    projectId !== projectId.trim()
  ) {
    throw new TypeError("A valid sync lock scope is required.");
  }
  const digest = resolveDigest(host);
  if (!digest) throw new TypeError("The sync lock digest is unavailable.");
  const value = await digest(
    new TextEncoder().encode(`${LOCK_DIGEST_MATERIAL_PREFIX}${projectId}`),
  );
  if (value.byteLength !== 32) {
    throw new TypeError("The sync lock digest is invalid.");
  }
  const hex = Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${LOCK_NAME_PREFIX}${hex}`;
}

/**
 * Coordinates same-browser tabs only. Drive generation checks remain
 * best-effort and this lock is not an atomic multi-device exclusion.
 */
export async function runWithGooglePhotosSyncWriteLock<T>(
  input: { projectId: string },
  write: () => Promise<T>,
  host: GooglePhotosSyncWriteLockHost = {},
): Promise<GooglePhotosSyncWriteLockResult<T>> {
  const requestLock = resolveLockRequest(host);
  if (!requestLock) return { acquired: false, reason: "lockUnavailable" };

  let lockName: string;
  try {
    lockName = await createGooglePhotosSyncWriteLockName(input.projectId, host);
  } catch {
    return { acquired: false, reason: "lockUnavailable" };
  }

  let callbackStarted = false;
  try {
    return await requestLock(
      lockName,
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        callbackStarted = true;
        return lock === null
          ? { acquired: false, reason: "locked" }
          : { acquired: true, value: await write() };
      },
    );
  } catch (error) {
    if (callbackStarted) throw error;
    return { acquired: false, reason: "lockUnavailable" };
  }
}

function resolveLockRequest(
  host: GooglePhotosSyncWriteLockHost,
): GooglePhotosSyncLockRequest | null {
  if (host.requestLock === null) return null;
  if (host.requestLock) return host.requestLock;
  if (
    typeof navigator === "undefined" ||
    !navigator.locks ||
    typeof navigator.locks.request !== "function"
  ) {
    return null;
  }
  return navigator.locks.request.bind(navigator.locks) as GooglePhotosSyncLockRequest;
}

function resolveDigest(
  host: GooglePhotosSyncWriteLockHost,
): ((data: BufferSource) => Promise<ArrayBuffer>) | null {
  if (host.digest === null) return null;
  if (host.digest) return host.digest;
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  return (data) => crypto.subtle.digest("SHA-256", data);
}
