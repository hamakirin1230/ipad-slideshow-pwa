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

function statefulStore<T extends { assetId?: string; projectId?: string }>(
  initialValues: T[],
  keyOf: (value: T) => string,
) {
  const records = new Map(initialValues.map((value) => [keyOf(value), value]));
  const put = vi.fn((value: T) => {
    records.set(keyOf(value), value);
    return request(value);
  });
  const openCursor = vi.fn(() => {
    const cursorRequest = {
      result: null,
      error: null,
      onsuccess: null,
      onerror: null,
    } as unknown as IDBRequest<IDBCursorWithValue | null>;
    const keys = [...records.keys()];
    let index = 0;

    const advance = () => {
      while (index < keys.length && !records.has(keys[index]!)) index += 1;
      const key = keys[index];
      if (key === undefined) {
        Object.defineProperty(cursorRequest, "result", {
          configurable: true,
          value: null,
        });
      } else {
        const cursor = {
          value: records.get(key),
          delete: () => {
            records.delete(key);
            return request(undefined);
          },
          continue: () => {
            index += 1;
            queueMicrotask(advance);
          },
        } as unknown as IDBCursorWithValue;
        Object.defineProperty(cursorRequest, "result", {
          configurable: true,
          value: cursor,
        });
      }
      cursorRequest.onsuccess?.(new Event("success"));
    };

    queueMicrotask(advance);
    return cursorRequest;
  });

  return {
    records,
    store: { openCursor, put } as unknown as IDBObjectStore,
  };
}

describe("offline staging promotion provenance", () => {
  it("replaces one confirmed project snapshot and removes only its obsolete assets", async () => {
    const oldProject = {
      schemaVersion: 1,
      projectId: "same-project",
      projectTitle: "以前の作品名",
      slides: [
        {
          slideId: "removed-slide",
          assetId: "removed-asset",
          caption: "以前のテロップ",
          durationSeconds: 10,
          order: 0,
        },
        {
          slideId: "kept-slide",
          assetId: "kept-asset",
          caption: "変更前",
          durationSeconds: 10,
          order: 1,
        },
      ],
      sourceManifestFileId: "manifest-file",
      syncedAt: "2026-07-30T01:00:00.000Z",
    };
    const otherProject = {
      ...oldProject,
      projectId: "other-project",
      projectTitle: "別の作品",
      slides: [],
    };
    const nextProject = {
      schemaVersion: 1,
      projectId: "same-project",
      projectTitle: "変更後の作品名",
      slides: [
        {
          slideId: "added-slide",
          assetId: "added-asset",
          caption: "追加したテロップ",
          durationSeconds: 8,
          order: 0,
        },
        {
          slideId: "kept-slide",
          assetId: "kept-asset",
          caption: "変更後",
          durationSeconds: 12,
          imageEdit: {
            rotation: 90 as const,
            crop: { x: 0.1, y: 0.2, width: 0.8, height: 0.7 },
          },
          order: 1,
        },
      ],
      sourceManifestFileId: "manifest-file",
      syncedAt: "2026-07-31T01:00:00.000Z",
      transition: "wipe" as const,
      transitionStrength: "strong" as const,
      stagingId: "same-project-staging",
      syncRunId: "same-project-run",
    };
    const blob = new Blob(["next"], { type: "image/jpeg" });
    const nextAssets = ["added-asset", "kept-asset"].map((assetId) => ({
      schemaVersion: 1,
      assetId,
      projectId: "same-project",
      sourceDriveFileId: `${assetId}-file`,
      blobMimeType: "image/jpeg",
      blobSizeBytes: blob.size,
      blobVariant: "original" as const,
      blobStatus: "ready" as const,
      syncedAt: "2026-07-31T01:00:00.000Z",
      stagingId: `${assetId}-staging`,
      syncRunId: "same-project-run",
    }));
    const nextBlobs = nextAssets.map((asset) => ({
      schemaVersion: 1,
      assetId: asset.assetId,
      projectId: asset.projectId,
      blob,
      blobMimeType: asset.blobMimeType,
      blobSizeBytes: asset.blobSizeBytes,
      blobVariant: asset.blobVariant,
      syncedAt: asset.syncedAt,
      stagingId: `${asset.assetId}-blob-staging`,
      syncRunId: asset.syncRunId,
    }));
    const projectStore = statefulStore(
      [oldProject, otherProject],
      (value) => value.projectId,
    );
    const assetStore = statefulStore(
      [
        { assetId: "removed-asset", projectId: "same-project" },
        { assetId: "kept-asset", projectId: "same-project" },
        { assetId: "other-asset", projectId: "other-project" },
      ],
      (value) => value.assetId!,
    );
    const blobStore = statefulStore(
      [
        { assetId: "removed-asset", projectId: "same-project" },
        { assetId: "kept-asset", projectId: "same-project" },
        { assetId: "other-asset", projectId: "other-project" },
      ],
      (value) => value.assetId!,
    );

    const result =
      await promoteValidatedOfflineStagingToConfirmedStoresInTransaction(
        {
          [OFFLINE_PROJECTS_STORE]: projectStore.store,
          [OFFLINE_ASSETS_STORE]: assetStore.store,
          [OFFLINE_ASSET_BLOBS_STORE]: blobStore.store,
        },
        {
          ok: true,
          project: nextProject,
          records: {
            projects: [nextProject],
            assets: nextAssets,
            assetBlobRecords: nextBlobs,
          },
          validation: { ok: true },
        },
      );

    expect(result).toMatchObject({
      promotedProjects: 1,
      deletedObsoleteAssets: 1,
      deletedObsoleteAssetBlobs: 1,
    });
    expect(projectStore.records.size).toBe(2);
    expect(projectStore.records.get("same-project")).toMatchObject({
      projectId: "same-project",
      projectTitle: "変更後の作品名",
      transition: "wipe",
      transitionStrength: "strong",
      slides: [
        expect.objectContaining({
          slideId: "added-slide",
          caption: "追加したテロップ",
          order: 0,
        }),
        expect.objectContaining({
          slideId: "kept-slide",
          caption: "変更後",
          imageEdit: nextProject.slides[1]!.imageEdit,
          order: 1,
        }),
      ],
    });
    expect(projectStore.records.get("other-project")).toBe(otherProject);
    expect([...assetStore.records.keys()].sort()).toEqual([
      "added-asset",
      "kept-asset",
      "other-asset",
    ]);
    expect([...blobStore.records.keys()].sort()).toEqual([
      "added-asset",
      "kept-asset",
      "other-asset",
    ]);
    expect(assetStore.records.get("other-asset")).toEqual({
      assetId: "other-asset",
      projectId: "other-project",
    });
    expect(blobStore.records.get("other-asset")).toEqual({
      assetId: "other-asset",
      projectId: "other-project",
    });
  });

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
          imageEdit: { rotation: 90 as const },
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
      expect.objectContaining({
        publicationProvenance: provenance,
        slides: [expect.objectContaining({ imageEdit: { rotation: 90 } })],
      }),
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
    expect(projectStore.put).toHaveBeenCalledWith(
      expect.not.objectContaining({ transitionStrength: expect.anything() }),
    );
  });

  it("keeps album transitionStrength when promoting staging to confirmed", async () => {
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
      transition: "wipe" as const,
      transitionStrength: "strong" as const,
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
      expect.objectContaining({
        transition: "wipe",
        transitionStrength: "strong",
      }),
    );
  });
});
