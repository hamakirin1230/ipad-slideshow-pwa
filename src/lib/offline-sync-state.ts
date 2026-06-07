// src/lib/offline-sync-state.ts

import {
    requestToPromise,
    runOfflineTransaction,
  } from "@/lib/offline-db";
  import {
    OFFLINE_SCHEMA_VERSION,
    OFFLINE_SYNC_STATE_STORE,
    type IsoDateTimeString,
    type OfflineSyncState,
  } from "@/lib/offline-schema";
  
  export type OfflineSyncStateContext = {
    rootFolderId: string;
    workspaceFileId: string;
    indexFileId: string;
    manifestFileId: string;
    slideCount: number;
    assetCount: number;
    sourceUpdatedAt?: IsoDateTimeString;
    sourceRevisionId?: string;
    sourceETag?: string;
  };
  
  export type OfflineSyncStateUpdateResult =
    | { updated: true }
    | { updated: false; reason: "stale-sync-run" };
  
  type MarkOfflineSyncingArgs = {
    projectId: string;
    syncRunId: string;
    context: OfflineSyncStateContext;
  };
  
  type MarkOfflineSyncFailedArgs = {
    projectId: string;
    syncRunId: string;
    failedAt: IsoDateTimeString;
    context: OfflineSyncStateContext;
  };
  
  type MarkOfflineStoreCorruptArgs = {
    projectId: string;
    syncRunId: string;
    context: OfflineSyncStateContext;
  };
  
  function buildOfflineSyncState(args: {
    projectId: string;
    syncRunId: string;
    context: OfflineSyncStateContext;
    previous?: OfflineSyncState;
    status: OfflineSyncState["status"];
    lastFailedAt?: IsoDateTimeString;
  }): OfflineSyncState {
    return {
      schemaVersion: OFFLINE_SCHEMA_VERSION,
      projectId: args.projectId,
      status: args.status,
      syncRunId: args.syncRunId,
      rootFolderId: args.context.rootFolderId,
      workspaceFileId: args.context.workspaceFileId,
      indexFileId: args.context.indexFileId,
      manifestFileId: args.context.manifestFileId,
      syncedAt: args.previous?.syncedAt,
      sourceUpdatedAt: args.context.sourceUpdatedAt,
      slideCount: args.context.slideCount,
      assetCount: args.context.assetCount,
      lastFailedAt: args.lastFailedAt,
      sourceRevisionId: args.context.sourceRevisionId,
      sourceETag: args.context.sourceETag,
    };
  }
  
  export function markOfflineSyncing(
    args: MarkOfflineSyncingArgs,
  ): Promise<OfflineSyncStateUpdateResult> {
    return runOfflineTransaction(
      [OFFLINE_SYNC_STATE_STORE],
      "readwrite",
      async ({ stores }) => {
        const store = stores[OFFLINE_SYNC_STATE_STORE];
        const previous = await requestToPromise<OfflineSyncState | undefined>(
          store.get(args.projectId),
        );
  
        const next = buildOfflineSyncState({
          projectId: args.projectId,
          syncRunId: args.syncRunId,
          context: args.context,
          previous,
          status: previous?.status === "corrupt" ? "corrupt" : "syncing",
          lastFailedAt: previous?.lastFailedAt,
        });
  
        await requestToPromise(store.put(next));
  
        return { updated: true };
      },
    );
  }
  
  export function markOfflineSyncFailed(
    args: MarkOfflineSyncFailedArgs,
  ): Promise<OfflineSyncStateUpdateResult> {
    return runOfflineTransaction(
      [OFFLINE_SYNC_STATE_STORE],
      "readwrite",
      async ({ stores }) => {
        const store = stores[OFFLINE_SYNC_STATE_STORE];
        const previous = await requestToPromise<OfflineSyncState | undefined>(
          store.get(args.projectId),
        );
  
        if (previous && previous.syncRunId !== args.syncRunId) {
          return { updated: false, reason: "stale-sync-run" };
        }
  
        const next = buildOfflineSyncState({
          projectId: args.projectId,
          syncRunId: args.syncRunId,
          context: args.context,
          previous,
          status: previous?.status === "corrupt" ? "corrupt" : "failed",
          lastFailedAt: args.failedAt,
        });
  
        await requestToPromise(store.put(next));
  
        return { updated: true };
      },
    );
  }
  
  export function markOfflineStoreCorrupt(
    args: MarkOfflineStoreCorruptArgs,
  ): Promise<OfflineSyncStateUpdateResult> {
    return runOfflineTransaction(
      [OFFLINE_SYNC_STATE_STORE],
      "readwrite",
      async ({ stores }) => {
        const store = stores[OFFLINE_SYNC_STATE_STORE];
        const previous = await requestToPromise<OfflineSyncState | undefined>(
          store.get(args.projectId),
        );
  
        if (previous && previous.syncRunId !== args.syncRunId) {
          return { updated: false, reason: "stale-sync-run" };
        }
  
        const next = buildOfflineSyncState({
          projectId: args.projectId,
          syncRunId: args.syncRunId,
          context: args.context,
          previous,
          status: "corrupt",
          lastFailedAt: previous?.lastFailedAt,
        });
  
        await requestToPromise(store.put(next));
  
        return { updated: true };
      },
    );
  }
  