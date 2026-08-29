import { describe, expect, it, vi } from "vitest";
import {
  OFFLINE_ASSETS_STORE,
  OFFLINE_ASSET_BLOBS_STORE,
  OFFLINE_PROJECTS_STORE,
} from "./offline-schema";
import { promoteValidatedOfflineStagingToConfirmedStoresInTransaction } from "./offline-staging-promotion";

function request<T>(result: T): IDBRequest<T> {
  const value = { result, error: null } as unknown as IDBRequest<T>;
  queueMicrotask(() => value.onsuccess?.(new Event("success")));
  return value;
}

function store() {
  return {
    openCursor: vi.fn(() => request<IDBCursorWithValue | null>(null)),
    put: vi.fn((value: unknown) => request(value)),
  } as unknown as IDBObjectStore;
}

describe("offline staging promotion provenance", () => {
  it("copies provenance only to the confirmed project", async () => {
    const projectStore = store();
    const assetStore = store();
    const blobStore = store();
    const provenance = {
      status: "unpublished" as const,
      checkedAt: "2026-07-31T01:00:00.000Z",
    };
    const blob = new Blob(["x"], { type: "image/jpeg" });
    const project = {
      schemaVersion: 1,
      projectId: "dummy-project",
      slides: [
        {
          slideId: "dummy-slide",
          assetId: "dummy-asset",
          caption: "",
          durationSeconds: 10,
          order: 0,
        },
      ],
      sourceManifestFileId: "dummy-manifest",
      syncedAt: "2026-07-31T01:00:00.000Z",
      publicationProvenance: provenance,
      stagingId: "dummy-project-staging",
      syncRunId: "dummy-run",
    };
    const asset = {
      schemaVersion: 1,
      assetId: "dummy-asset",
      projectId: "dummy-project",
      sourceDriveFileId: "dummy-asset-file",
      blobMimeType: "image/jpeg",
      blobSizeBytes: blob.size,
      blobVariant: "original" as const,
      blobStatus: "ready" as const,
      syncedAt: "2026-07-31T01:00:00.000Z",
      stagingId: "dummy-asset-staging",
      syncRunId: "dummy-run",
    };
    const assetBlobRecord = {
      schemaVersion: 1,
      assetId: "dummy-asset",
      projectId: "dummy-project",
      blob,
      blobMimeType: "image/jpeg",
      blobSizeBytes: blob.size,
      blobVariant: "original" as const,
      syncedAt: "2026-07-31T01:00:00.000Z",
      stagingId: "dummy-blob-staging",
      syncRunId: "dummy-run",
    };
    await promoteValidatedOfflineStagingToConfirmedStoresInTransaction(
      {
        [OFFLINE_PROJECTS_STORE]: projectStore,
        [OFFLINE_ASSETS_STORE]: assetStore,
        [OFFLINE_ASSET_BLOBS_STORE]: blobStore,
      },
      {
        ok: true,
        project,
        records: {
          projects: [project],
          assets: [asset],
          assetBlobRecords: [assetBlobRecord],
        },
        validation: { ok: true },
      },
    );
    expect(projectStore.put).toHaveBeenCalledWith(
      expect.objectContaining({ publicationProvenance: provenance }),
    );
    expect(assetStore.put).toHaveBeenCalledWith(
      expect.not.objectContaining({ publicationProvenance: expect.anything() }),
    );
    expect(blobStore.put).toHaveBeenCalledWith(
      expect.not.objectContaining({ publicationProvenance: expect.anything() }),
    );
  });

  it("keeps album transition when promoting staging to confirmed", async () => {
    const projectStore = store();
    const assetStore = store();
    const blobStore = store();
    const blob = new Blob(["x"], { type: "image/jpeg" });
    const project = {
      schemaVersion: 1,
      projectId: "dummy-project",
      slides: [
        {
          slideId: "dummy-slide",
          assetId: "dummy-asset",
          caption: "",
          durationSeconds: 10,
          order: 0,
        },
      ],
      sourceManifestFileId: "dummy-manifest",
      syncedAt: "2026-07-31T01:00:00.000Z",
      transition: "fade" as const,
      stagingId: "dummy-project-staging",
      syncRunId: "dummy-run",
    };
    const asset = {
      schemaVersion: 1,
      assetId: "dummy-asset",
      projectId: "dummy-project",
      sourceDriveFileId: "dummy-asset-file",
      blobMimeType: "image/jpeg",
      blobSizeBytes: blob.size,
      blobVariant: "original" as const,
      blobStatus: "ready" as const,
      syncedAt: "2026-07-31T01:00:00.000Z",
      stagingId: "dummy-asset-staging",
      syncRunId: "dummy-run",
    };
    const assetBlobRecord = {
      schemaVersion: 1,
      assetId: "dummy-asset",
      projectId: "dummy-project",
      blob,
      blobMimeType: "image/jpeg",
      blobSizeBytes: blob.size,
      blobVariant: "original" as const,
      syncedAt: "2026-07-31T01:00:00.000Z",
      stagingId: "dummy-blob-staging",
      syncRunId: "dummy-run",
    };

    await promoteValidatedOfflineStagingToConfirmedStoresInTransaction(
      {
        [OFFLINE_PROJECTS_STORE]: projectStore,
        [OFFLINE_ASSETS_STORE]: assetStore,
        [OFFLINE_ASSET_BLOBS_STORE]: blobStore,
      },
      {
        ok: true,
        project,
        records: {
          projects: [project],
          assets: [asset],
          assetBlobRecords: [assetBlobRecord],
        },
        validation: { ok: true },
      },
    );

    expect(projectStore.put).toHaveBeenCalledWith(
      expect.objectContaining({ transition: "fade" }),
    );
  });
});
