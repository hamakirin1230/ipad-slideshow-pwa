import { describe, expect, it, vi } from "vitest";
import {
  OFFLINE_DB_VERSION,
  OFFLINE_SCHEMA_VERSION,
  OFFLINE_SYNC_STATE_STORE,
  type OfflineSyncState,
} from "./offline-schema";
import {
  markOfflineSyncReadyInTransaction,
  restoreOfflineSyncStateAfterStaleManifestInTransaction,
} from "./offline-sync-state";

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

  it("fully restores the previous ready state after staleManifest", async () => {
    const previousState: OfflineSyncState = {
      schemaVersion: 1,
      projectId: "dummy-project",
      status: "ready",
      syncRunId: "previous-run",
      rootFolderId: "previous-root",
      workspaceFileId: "previous-workspace",
      indexFileId: "previous-index",
      manifestFileId: "previous-manifest",
      syncedAt: "2026-07-30T01:00:00.000Z",
      sourceUpdatedAt: "2026-07-30T00:59:00.000Z",
      slideCount: 7,
      assetCount: 6,
      lastErrorCode: "previousWarning",
      lastErrorMessage: "sanitized previous warning",
      lastFailedAt: "2026-07-29T01:00:00.000Z",
      sourceRevisionId: "asset-source-revision",
      sourceETag: "asset-source-etag",
      publicationProvenance: {
        status: "publishedMatch",
        checkedAt: "2026-07-30T01:00:00.000Z",
        currentPublishedRevisionId:
          "rev_20260730T010000000Z_ab12cd34",
        publishedAt: "2026-07-30T00:58:00.000Z",
        operation: "publish",
      },
    };
    const put = vi.fn((value: unknown) => successfulRequest(value));
    const deleteRecord = vi.fn(() => successfulRequest(undefined));
    const store = {
      get: vi.fn(() =>
        successfulRequest({
          ...previousState,
          status: "syncing",
          syncRunId: "current-run",
        }),
      ),
      put,
      delete: deleteRecord,
    } as unknown as IDBObjectStore;

    const result =
      await restoreOfflineSyncStateAfterStaleManifestInTransaction(
        { [OFFLINE_SYNC_STATE_STORE]: store },
        {
          projectId: "dummy-project",
          syncRunId: "current-run",
          previousState,
        },
      );

    expect(result).toEqual({ updated: true });
    expect(put).toHaveBeenCalledWith(previousState);
    expect(put.mock.calls[0]?.[0]).toEqual(previousState);
    expect(deleteRecord).not.toHaveBeenCalled();
  });

  it("deletes the temporary syncing state when no previous state existed", async () => {
    const put = vi.fn((value: unknown) => successfulRequest(value));
    const deleteRecord = vi.fn(() => successfulRequest(undefined));
    const store = {
      get: vi.fn(() =>
        successfulRequest({
          projectId: "dummy-project",
          syncRunId: "current-run",
        }),
      ),
      put,
      delete: deleteRecord,
    } as unknown as IDBObjectStore;

    const result =
      await restoreOfflineSyncStateAfterStaleManifestInTransaction(
        { [OFFLINE_SYNC_STATE_STORE]: store },
        {
          projectId: "dummy-project",
          syncRunId: "current-run",
        },
      );

    expect(result).toEqual({ updated: true });
    expect(deleteRecord).toHaveBeenCalledWith("dummy-project");
    expect(put).not.toHaveBeenCalled();
  });

  it("does not overwrite a superseding sync run", async () => {
    const put = vi.fn((value: unknown) => successfulRequest(value));
    const deleteRecord = vi.fn(() => successfulRequest(undefined));
    const store = {
      get: vi.fn(() =>
        successfulRequest({
          projectId: "dummy-project",
          syncRunId: "newer-run",
        }),
      ),
      put,
      delete: deleteRecord,
    } as unknown as IDBObjectStore;

    const result =
      await restoreOfflineSyncStateAfterStaleManifestInTransaction(
        { [OFFLINE_SYNC_STATE_STORE]: store },
        {
          projectId: "dummy-project",
          syncRunId: "current-run",
        },
      );

    expect(result).toEqual({ updated: false, reason: "stale-sync-run" });
    expect(put).not.toHaveBeenCalled();
    expect(deleteRecord).not.toHaveBeenCalled();
  });

  it.each([
    { projectId: "", syncRunId: "current-run" },
    { projectId: " dummy-project", syncRunId: "current-run" },
    { projectId: "dummy-project", syncRunId: "" },
    { projectId: "dummy-project", syncRunId: "current-run " },
  ])("rejects invalid restore identity %#", async (args) => {
    await expect(
      restoreOfflineSyncStateAfterStaleManifestInTransaction(
        { [OFFLINE_SYNC_STATE_STORE]: {} as IDBObjectStore },
        args,
      ),
    ).rejects.toThrow();
  });
});
