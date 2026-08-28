export const PUBLICATION_WRITE_LOCKED_CODE = "publicationWriteLocked";
export const PUBLICATION_WRITE_LOCKED_MESSAGE =
  "別のタブで公開操作を実行中です。完了後にもう一度操作してください。";

const LOCK_NAME_PREFIX = "ispwa.pubwrite.v1.";
const LOCK_DIGEST_MATERIAL_PREFIX = "ipad-slideshow-pwa:publication-write:v1:";

export type ProjectPublicationWriteLockHost = {
  requestLock?: PublicationLockRequest | null;
  digest?: ((data: BufferSource) => Promise<ArrayBuffer>) | null;
};

export type PublicationLockRequest = <T>(
  name: string,
  options: {
    mode?: "exclusive" | "shared";
    ifAvailable?: boolean;
  },
  callback: (lock: { name: string } | null) => Promise<T>,
) => Promise<T>;

export type ProjectPublicationWriteLockResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

export async function createProjectPublicationWriteLockName(
  projectId: string,
  host: ProjectPublicationWriteLockHost = {},
): Promise<string> {
  if (typeof projectId !== "string" || projectId.trim().length === 0) {
    throw new TypeError("projectId is required");
  }

  const digestFn =
    host.digest ??
    ((data: BufferSource) => crypto.subtle.digest("SHA-256", data));
  const digest = await digestFn(
    new TextEncoder().encode(`${LOCK_DIGEST_MATERIAL_PREFIX}${projectId}`),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `${LOCK_NAME_PREFIX}${hex}`;
}

export async function runWithProjectPublicationWriteLock<T>(
  input: { projectId: string },
  write: () => Promise<T>,
  host: ProjectPublicationWriteLockHost = {},
): Promise<ProjectPublicationWriteLockResult<T>> {
  const requestLock = resolvePublicationLockRequest(host);

  if (!requestLock) {
    return { acquired: true, value: await write() };
  }

  let lockName: string;
  try {
    lockName = await createProjectPublicationWriteLockName(input.projectId, host);
  } catch {
    return { acquired: true, value: await write() };
  }

  return requestLock(
    lockName,
    { mode: "exclusive", ifAvailable: true },
    async (lock) => {
      if (lock === null) {
        return { acquired: false };
      }

      return { acquired: true, value: await write() };
    },
  );
}

function resolvePublicationLockRequest(
  host: ProjectPublicationWriteLockHost,
): PublicationLockRequest | null {
  if (host.requestLock === null) {
    return null;
  }

  if (host.requestLock) {
    return host.requestLock;
  }

  if (
    typeof navigator === "undefined" ||
    !navigator.locks ||
    typeof navigator.locks.request !== "function"
  ) {
    return null;
  }

  return navigator.locks.request.bind(navigator.locks) as PublicationLockRequest;
}
