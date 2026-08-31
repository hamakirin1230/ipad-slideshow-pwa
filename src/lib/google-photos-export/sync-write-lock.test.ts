import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createGooglePhotosSyncWriteLockName,
  runWithGooglePhotosSyncWriteLock,
  type GooglePhotosSyncLockRequest,
} from "./sync-write-lock";

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

function digest(byte = 0xab) {
  return vi.fn(async () => new Uint8Array(32).fill(byte).buffer);
}

describe("Google Photos sync write lock", () => {
  it("builds a deterministic hashed name without the raw project ID", async () => {
    const host = { digest: digest() };
    const first = await createGooglePhotosSyncWriteLockName(PROJECT_ID, host);
    const second = await createGooglePhotosSyncWriteLockName(PROJECT_ID, host);

    expect(first).toBe(`ispwa.gphotos-sync.v1.${"ab".repeat(32)}`);
    expect(second).toBe(first);
    expect(first).not.toContain(PROJECT_ID);
    const material = new TextDecoder().decode(
      host.digest.mock.calls[0]?.[0] as ArrayBuffer,
    );
    expect(material).toContain(PROJECT_ID);
    expect(material).not.toMatch(/token|album/i);
  });

  it("requests an exclusive ifAvailable lock and runs the callback", async () => {
    const write = vi.fn(async () => "checkpointed");
    const requestLock: GooglePhotosSyncLockRequest = vi.fn(
      async (name, options, callback) => callback({ name }),
    );

    await expect(
      runWithGooglePhotosSyncWriteLock(
        { projectId: PROJECT_ID },
        write,
        { requestLock, digest: digest(1) },
      ),
    ).resolves.toEqual({ acquired: true, value: "checkpointed" });
    expect(requestLock).toHaveBeenCalledWith(
      `ispwa.gphotos-sync.v1.${"01".repeat(32)}`,
      { mode: "exclusive", ifAvailable: true },
      expect.any(Function),
    );
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("returns locked and does not write when the lock is already held", async () => {
    const write = vi.fn(async () => "not-run");
    const requestLock: GooglePhotosSyncLockRequest = async (
      _name,
      _options,
      callback,
    ) => callback(null);
    await expect(
      runWithGooglePhotosSyncWriteLock(
        { projectId: PROJECT_ID },
        write,
        { requestLock, digest: digest() },
      ),
    ).resolves.toEqual({ acquired: false, reason: "locked" });
    expect(write).not.toHaveBeenCalled();
  });

  it("coordinates concurrent callbacks in the same lock host", async () => {
    let held = false;
    const requestLock: GooglePhotosSyncLockRequest = async (
      name,
      _options,
      callback,
    ) => {
      if (held) return callback(null);
      held = true;
      try {
        return await callback({ name });
      } finally {
        held = false;
      }
    };
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = runWithGooglePhotosSyncWriteLock(
      { projectId: PROJECT_ID },
      async () => {
        await firstGate;
        return "first";
      },
      { requestLock, digest: digest() },
    );
    await Promise.resolve();
    const secondWrite = vi.fn(async () => "second");
    const second = await runWithGooglePhotosSyncWriteLock(
      { projectId: PROJECT_ID },
      secondWrite,
      { requestLock, digest: digest() },
    );
    releaseFirst();

    expect(second).toEqual({ acquired: false, reason: "locked" });
    expect(secondWrite).not.toHaveBeenCalled();
    await expect(first).resolves.toEqual({ acquired: true, value: "first" });
  });

  it("fails closed when the API, digest, or lock request is unavailable", async () => {
    for (const host of [
      { requestLock: null, digest: digest() },
      {
        requestLock: vi.fn<GooglePhotosSyncLockRequest>(),
        digest: null,
      },
      {
        requestLock: vi.fn(async () => {
          throw new Error("raw lock failure");
        }) as GooglePhotosSyncLockRequest,
        digest: digest(),
      },
    ]) {
      const write = vi.fn(async () => "not-run");
      await expect(
        runWithGooglePhotosSyncWriteLock({ projectId: PROJECT_ID }, write, host),
      ).resolves.toEqual({ acquired: false, reason: "lockUnavailable" });
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("fails closed on digest errors and invalid digest lengths", async () => {
    const requestLock: GooglePhotosSyncLockRequest = async (
      name,
      _options,
      callback,
    ) => callback({ name });
    for (const digestFn of [
      vi.fn(async () => {
        throw new Error("raw digest failure");
      }),
      vi.fn(async () => new ArrayBuffer(1)),
    ]) {
      const write = vi.fn(async () => "not-run");
      await expect(
        runWithGooglePhotosSyncWriteLock(
          { projectId: PROJECT_ID },
          write,
          { requestLock, digest: digestFn },
        ),
      ).resolves.toEqual({ acquired: false, reason: "lockUnavailable" });
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("propagates write callback exceptions after acquiring the lock", async () => {
    const requestLock: GooglePhotosSyncLockRequest = async (
      name,
      _options,
      callback,
    ) => callback({ name });
    await expect(
      runWithGooglePhotosSyncWriteLock(
        { projectId: PROJECT_ID },
        async () => {
          throw new Error("write failed");
        },
        { requestLock, digest: digest() },
      ),
    ).rejects.toThrow("write failed");
  });

  it("contains no credentials, browser storage, logging, or timer code", () => {
    const source = readFileSync(new URL("./sync-write-lock.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/accessToken|albumId|operationId/);
    expect(source).not.toMatch(
      /localStorage|sessionStorage|indexedDB|document\.cookie|console\.|setTimeout/,
    );
  });
});
