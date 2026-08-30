import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OFFLINE_ASSETS_STORE,
  OFFLINE_ASSET_BLOBS_STORE,
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  OFFLINE_PROJECTS_STORE,
  OFFLINE_SYNC_STATE_STORE,
} from "./offline-schema";
import { closeOfflineDb, openOfflineDb } from "./offline-db";

afterEach(async () => {
  await closeOfflineDb();
  vi.unstubAllGlobals();
});

describe("offline database identity contract", () => {
  it("keys confirmed projects and sync state by projectId", async () => {
    const createObjectStore = vi.fn();
    const close = vi.fn();
    const db = {
      objectStoreNames: { contains: vi.fn(() => false) },
      createObjectStore,
      close,
      onversionchange: null,
    } as unknown as IDBDatabase;
    const request = {
      result: db,
      error: null,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
    } as unknown as IDBOpenDBRequest;
    const open = vi.fn(() => {
      queueMicrotask(() => {
        request.onupgradeneeded?.(new Event("upgradeneeded") as IDBVersionChangeEvent);
        request.onsuccess?.(new Event("success"));
      });
      return request;
    });
    vi.stubGlobal("window", { indexedDB: { open } });

    await openOfflineDb();

    expect(open).toHaveBeenCalledWith(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    expect(createObjectStore).toHaveBeenCalledWith(OFFLINE_PROJECTS_STORE, {
      keyPath: "projectId",
    });
    expect(createObjectStore).toHaveBeenCalledWith(OFFLINE_SYNC_STATE_STORE, {
      keyPath: "projectId",
    });
    expect(createObjectStore).toHaveBeenCalledWith(OFFLINE_ASSETS_STORE, {
      keyPath: "assetId",
    });
    expect(createObjectStore).toHaveBeenCalledWith(OFFLINE_ASSET_BLOBS_STORE, {
      keyPath: "assetId",
    });
  });
});
