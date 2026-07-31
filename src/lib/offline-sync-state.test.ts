import { describe, expect, it, vi } from "vitest";
import {
  OFFLINE_DB_VERSION,
  OFFLINE_SCHEMA_VERSION,
  OFFLINE_SYNC_STATE_STORE,
} from "./offline-schema";
import { markOfflineSyncReadyInTransaction } from "./offline-sync-state";

function successfulRequest<T>(result: T): IDBRequest<T> {
  const request = { result, error: null } as unknown as IDBRequest<T>;
  queueMicrotask(() => request.onsuccess?.(new Event("success")));
  return request;
}

describe("offline sync state publication provenance", () => {
  it("keeps the existing database and record schema versions", () => {
    expect(OFFLINE_DB_VERSION).toBe(1);
    expect(OFFLINE_SCHEMA_VERSION).toBe(1);
  });

  it("writes the ready state with the same provenance context", async () => {
    const put = vi.fn((value: unknown) => successfulRequest(value));
    const store = {
      get: vi.fn(() => successfulRequest(undefined)),
      put,
    } as unknown as IDBObjectStore;
    const publicationProvenance = {
      status: "unpublishedChanges" as const,
      checkedAt: "2026-07-31T01:00:00.000Z",
      currentPublishedRevisionId: "rev_20260731T010000000Z_ab12cd34",
      publishedAt: "2026-07-31T00:59:00.000Z",
      operation: "publish" as const,
    };
    const result = await markOfflineSyncReadyInTransaction(
      { [OFFLINE_SYNC_STATE_STORE]: store },
      {
        projectId: "dummy-project",
        syncRunId: "dummy-run",
        readyAt: "2026-07-31T01:00:00.000Z",
        context: {
          rootFolderId: "dummy-root",
          workspaceFileId: "dummy-workspace",
          indexFileId: "dummy-index",
          manifestFileId: "dummy-manifest",
          slideCount: 0,
          assetCount: 0,
          publicationProvenance,
        },
      },
    );
    expect(result).toEqual({ updated: true });
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ publicationProvenance, status: "ready" }),
    );
  });

  it("preserves the stale sync-run guard without writing", async () => {
    const put = vi.fn((value: unknown) => successfulRequest(value));
    const store = {
      get: vi.fn(() =>
        successfulRequest({
          projectId: "dummy-project",
          syncRunId: "newer-run",
        }),
      ),
      put,
    } as unknown as IDBObjectStore;
    const result = await markOfflineSyncReadyInTransaction(
      { [OFFLINE_SYNC_STATE_STORE]: store },
      {
        projectId: "dummy-project",
        syncRunId: "older-run",
        readyAt: "2026-07-31T01:00:00.000Z",
        context: {
          rootFolderId: "dummy-root",
          workspaceFileId: "dummy-workspace",
          indexFileId: "dummy-index",
          manifestFileId: "dummy-manifest",
          slideCount: 0,
          assetCount: 0,
        },
      },
    );
    expect(result).toEqual({ updated: false, reason: "stale-sync-run" });
    expect(put).not.toHaveBeenCalled();
  });
});
