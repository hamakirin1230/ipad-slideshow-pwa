import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  PUBLICATION_WRITE_LOCKED_CODE,
  PUBLICATION_WRITE_LOCKED_MESSAGE,
  createProjectPublicationWriteLockName,
  runWithProjectPublicationWriteLock,
  type PublicationLockRequest,
} from "./project-publication-write-lock";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const PROJECT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const DRIVE_FILE_ID = "1AbCDefGhIjkLmNoPqRsTuVwXyZ-raw-drive-id";
const REVISION_ID = "rev_20260828T120000000Z_deadbeef";

function createFakeLockRequest(held: Set<string> = new Set()) {
  const request: PublicationLockRequest = async (name, options, callback) => {
    expect(options.ifAvailable).toBe(true);
    expect(options.mode).toBe("exclusive");

    if (options.ifAvailable && held.has(name)) {
      return callback(null);
    }

    held.add(name);
    try {
      return await callback({ name });
    } finally {
      held.delete(name);
    }
  };

  return { held, request };
}

describe("project publication write lock names", () => {
  it("creates a stable hashed name without raw project, Drive, or revision IDs", async () => {
    const name = await createProjectPublicationWriteLockName(PROJECT_A);
    const again = await createProjectPublicationWriteLockName(PROJECT_A);
    const other = await createProjectPublicationWriteLockName(PROJECT_B);

    expect(name).toBe(again);
    expect(name).not.toBe(other);
    expect(name.startsWith("ispwa.pubwrite.v1.")).toBe(true);
    expect(name).toMatch(/^ispwa\.pubwrite\.v1\.[0-9a-f]{64}$/);
    expect(name).not.toContain(PROJECT_A);
    expect(name).not.toContain(PROJECT_B);
    expect(name).not.toContain(DRIVE_FILE_ID);
    expect(name).not.toContain(REVISION_ID);
    expect(name).not.toContain("projectId");
    expect(name).not.toContain("revision");
  });
});

describe("runWithProjectPublicationWriteLock", () => {
  it("runs the existing publish write after a successful lock", async () => {
    const { request } = createFakeLockRequest();
    const write = vi.fn(async () => "published");

    const result = await runWithProjectPublicationWriteLock(
      { projectId: PROJECT_A },
      write,
      { requestLock: request },
    );

    expect(result).toEqual({ acquired: true, value: "published" });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("runs the existing rollback write after a successful lock", async () => {
    const { request } = createFakeLockRequest();
    const write = vi.fn(async () => "rolled-back");

    const result = await runWithProjectPublicationWriteLock(
      { projectId: PROJECT_A },
      write,
      { requestLock: request },
    );

    expect(result).toEqual({ acquired: true, value: "rolled-back" });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("blocks the same project without starting the write", async () => {
    const { held, request } = createFakeLockRequest();
    const lockName = await createProjectPublicationWriteLockName(PROJECT_A);
    held.add(lockName);
    const write = vi.fn(async () => "should-not-run");

    const result = await runWithProjectPublicationWriteLock(
      { projectId: PROJECT_A },
      write,
      { requestLock: request },
    );

    expect(result).toEqual({ acquired: false });
    expect(write).not.toHaveBeenCalled();
    expect(PUBLICATION_WRITE_LOCKED_MESSAGE).toBe(
      "別のタブで公開操作を実行中です。完了後にもう一度操作してください。",
    );
    expect(PUBLICATION_WRITE_LOCKED_CODE).toBe("publicationWriteLocked");
  });

  it("does not block a different project", async () => {
    const { held, request } = createFakeLockRequest();
    held.add(await createProjectPublicationWriteLockName(PROJECT_A));
    const write = vi.fn(async () => "other-project");

    const result = await runWithProjectPublicationWriteLock(
      { projectId: PROJECT_B },
      write,
      { requestLock: request },
    );

    expect(result).toEqual({ acquired: true, value: "other-project" });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("releases the lock when the write throws", async () => {
    const { held, request } = createFakeLockRequest();
    const write = vi.fn(async () => {
      throw new Error("publication write failed");
    });

    await expect(
      runWithProjectPublicationWriteLock(
        { projectId: PROJECT_A },
        write,
        { requestLock: request },
      ),
    ).rejects.toThrow("publication write failed");
    expect(held.size).toBe(0);

    const retry = vi.fn(async () => "recovered");
    const recovered = await runWithProjectPublicationWriteLock(
      { projectId: PROJECT_A },
      retry,
      { requestLock: request },
    );
    expect(recovered).toEqual({ acquired: true, value: "recovered" });
  });

  it("keeps existing same-tab behavior when navigator.locks is unsupported", async () => {
    const write = vi.fn(async () => "same-tab-only");

    const result = await runWithProjectPublicationWriteLock(
      { projectId: PROJECT_A },
      write,
      { requestLock: null },
    );

    expect(result).toEqual({ acquired: true, value: "same-tab-only" });
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe("publication write lock security contract", () => {
  it("does not persist identifiers or expose lock internals", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("./project-publication-write-lock.ts", import.meta.url),
      ),
      "utf8",
    );

    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("indexedDB");
    expect(source).not.toContain("document.cookie");
    expect(source).not.toContain("console.log");
    expect(source).not.toContain("console.info");
    expect(source).not.toContain("console.debug");
    expect(source).toContain("ifAvailable: true");
    expect(source).toContain("PUBLICATION_WRITE_LOCKED_MESSAGE");
  });
});
