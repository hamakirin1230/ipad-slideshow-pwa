import {
  OFFLINE_ASSETS_STORE,
  OFFLINE_ASSET_BLOBS_STORE,
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  OFFLINE_PROJECTS_STORE,
  OFFLINE_STAGING_ASSETS_STORE,
  OFFLINE_STAGING_ASSET_BLOBS_STORE,
  OFFLINE_STAGING_PROJECTS_STORE,
  OFFLINE_SYNC_STATE_STORE,
} from "@/lib/offline-schema";

let offlineDbPromise: Promise<IDBDatabase> | null = null;

export class OfflineDbUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineDbUnavailableError";
  }
}

export class OfflineDbOpenError extends Error {
  readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = "OfflineDbOpenError";
    this.originalError = originalError;
  }
}

function createObjectStoreIfMissing(
  db: IDBDatabase,
  storeName: string,
  options: IDBObjectStoreParameters,
) {
  if (!db.objectStoreNames.contains(storeName)) {
    db.createObjectStore(storeName, options);
  }
}

function createOfflineObjectStores(db: IDBDatabase) {
  createObjectStoreIfMissing(db, OFFLINE_PROJECTS_STORE, {
    keyPath: "projectId",
  });
  createObjectStoreIfMissing(db, OFFLINE_ASSETS_STORE, {
    keyPath: "assetId",
  });
  createObjectStoreIfMissing(db, OFFLINE_ASSET_BLOBS_STORE, {
    keyPath: "assetId",
  });
  createObjectStoreIfMissing(db, OFFLINE_SYNC_STATE_STORE, {
    keyPath: "projectId",
  });

  createObjectStoreIfMissing(db, OFFLINE_STAGING_PROJECTS_STORE, {
    keyPath: "stagingId",
  });
  createObjectStoreIfMissing(db, OFFLINE_STAGING_ASSETS_STORE, {
    keyPath: "stagingId",
  });
  createObjectStoreIfMissing(db, OFFLINE_STAGING_ASSET_BLOBS_STORE, {
    keyPath: "stagingId",
  });
}

function getBrowserIndexedDb(): IDBFactory {
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new OfflineDbUnavailableError(
      "IndexedDB is not available in this environment.",
    );
  }

  return window.indexedDB;
}

export function openOfflineDb(): Promise<IDBDatabase> {
  if (offlineDbPromise) {
    return offlineDbPromise;
  }

  const indexedDb = getBrowserIndexedDb();

  offlineDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let didSettle = false;
    const request = indexedDb.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    const rejectOpen = (message: string, originalError?: unknown) => {
      if (didSettle) return;

      didSettle = true;
      offlineDbPromise = null;
      reject(new OfflineDbOpenError(message, originalError));
    };

    request.onupgradeneeded = () => {
      createOfflineObjectStores(request.result);
    };

    request.onsuccess = () => {
      const db = request.result;

      if (didSettle) {
        db.close();
        return;
      }

      didSettle = true;

      db.onversionchange = () => {
        db.close();
        offlineDbPromise = null;
      };

      resolve(db);
    };

    request.onerror = () => {
      rejectOpen("Failed to open the offline IndexedDB database.", request.error);
    };

    request.onblocked = () => {
      rejectOpen(
        "Opening the offline IndexedDB database was blocked by another open connection.",
        request.error,
      );
    };
  });

  return offlineDbPromise;
}

export async function closeOfflineDb(): Promise<void> {
  const promise = offlineDbPromise;
  if (!promise) return;

  offlineDbPromise = null;

  const db = await promise.catch(() => null);
  db?.close();
}

export type OfflineTransactionMode = "readonly" | "readwrite";

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed."));
    };
  });
}

export async function runOfflineTransaction<T>(
  storeNames: string[],
  mode: OfflineTransactionMode,
  callback: (context: {
    transaction: IDBTransaction;
    stores: Record<string, IDBObjectStore>;
  }) => T | Promise<T>,
): Promise<T> {
  const uniqueStoreNames = Array.from(new Set(storeNames));

  if (uniqueStoreNames.length === 0) {
    throw new Error("At least one object store name is required.");
  }

  const db = await openOfflineDb();

  try {
    const transaction = db.transaction(uniqueStoreNames, mode);

    const transactionDone = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error ?? new Error("IndexedDB transaction failed."));
      };

      transaction.onabort = () => {
        reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
      };
    });

    const stores: Record<string, IDBObjectStore> = {};

    for (const storeName of uniqueStoreNames) {
      stores[storeName] = transaction.objectStore(storeName);
    }

    try {
      const callbackResult = await callback({ transaction, stores });
      await transactionDone;
      return callbackResult;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // Ignore abort failures and preserve the original error.
      }

      void transactionDone.catch(() => undefined);
      throw error;
    }
  } finally {
    await closeOfflineDb().catch(() => undefined);
  }
}
