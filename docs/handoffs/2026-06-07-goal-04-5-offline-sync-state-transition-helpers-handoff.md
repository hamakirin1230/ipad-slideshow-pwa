# Goal 04-5 offlineSyncState transition helpers handoff

Date: 2026-06-07

## Scope

Goal 04-5 の IndexedDB / オフライン再生基盤として、`offlineSyncState` 専用の状態更新関数を追加した。

今回の対象は `syncing` / `failed` / `corrupt` のみ。
`ready` 成功関数は staging 検証・確定store昇格と密接なため、今回の実装対象から除外した。

## Added file

```txt
src/lib/offline-sync-state.ts
```

## Added types

```ts
OfflineSyncStateContext
OfflineSyncStateUpdateResult
```

`OfflineSyncStateContext` は、既存 `OfflineSyncState` 型の必須フィールドを満たすために追加した。

理由:

`OfflineSyncState` には次の必須フィールドがある。

```ts
rootFolderId
workspaceFileId
indexFileId
manifestFileId
slideCount
assetCount
```

そのため、既存レコードがない状態で `projectId` / `syncRunId` だけから `offlineSyncState` を新規作成することはできない。
`offline-schema.ts` の型を変更せず、状態更新関数側で必要な context を受け取る方針にした。

## Added functions

```ts
markOfflineSyncing(...)
markOfflineSyncFailed(...)
markOfflineStoreCorrupt(...)
```

## Responsibility

`src/lib/offline-sync-state.ts` は、`offlineSyncState` store の状態更新だけを担当する。

このファイルは同期処理本体ではない。
Drive API 呼び出し、staging store 操作、project / asset / blob の整合性検証、UI接続は含めない。

## Store access

対象 object store は次のみ。

```txt
offlineSyncState
```

各関数は `runOfflineTransaction(..., "readwrite", ...)` を使い、同一 transaction 内で次を行う。

```txt
get -> 判定 -> put
```

既存の `getOfflineSyncState()` / `putOfflineSyncState()` は使わない。
理由は、読み取りと書き込みを別 transaction に分けると、`syncRunId` の stale 判定が競合に弱くなるため。

## State transition rules

### markOfflineSyncing(...)

* 常に `{ updated: true }` を返す
* `syncRunId` は新しい値で上書きする
* 既存状態が `corrupt` の場合、`status` は `corrupt` のまま維持する
* 既存状態が `corrupt` 以外の場合、`status` は `syncing` にする
* `syncedAt` は既存値を維持する
* `lastFailedAt` は既存値を維持する
* `ready` は作らない

### markOfflineSyncFailed(...)

* 既存レコードがあり、`syncRunId` が一致しない場合は `{ updated: false; reason: "stale-sync-run" }` を返す
* 既存レコードがない場合は stale 扱いせず新規作成する
* 既存状態が `corrupt` の場合、`status` は `corrupt` のまま維持する
* 既存状態が `corrupt` 以外の場合、`status` は `failed` にする
* `lastFailedAt` は引数の `failedAt` に更新する
* `syncedAt` は既存値を維持する
* `ready` は作らない

### markOfflineStoreCorrupt(...)

* 既存レコードがあり、`syncRunId` が一致しない場合は `{ updated: false; reason: "stale-sync-run" }` を返す
* 既存レコードがない場合は stale 扱いせず新規作成する
* `status` は `corrupt` にする
* `syncedAt` は既存値を維持する
* `lastFailedAt` は更新しない
* `lastFailedAt` は破損検知時刻として使わない
* `ready` は作らない

## Safety boundaries

今回守った安全境界:

```txt
- ready 成功関数は含めない
- corrupt は syncing / failed で解除しない
- failed / corrupt は syncRunId 不一致なら stale として無視する
- syncedAt は消さない
- lastFailedAt は failed のみ更新する
- syncing / corrupt では lastFailedAt を更新しない
- raw error を保存しない
- 自由文 error message を保存しない
- 理由コード追加はしない
- startedAt / syncStartedAt は追加しない
- runtime validation は追加しない
- UI接続はしない
- Drive API 呼び出しはしない
- staging store 操作はしない
- project / asset / blob store の検証はしない
```

## Files intentionally not changed

```txt
src/lib/offline-schema.ts
src/lib/offline-store.ts
src/app/settings/page.tsx
src/app/settings/offline-db-check-panel.tsx
src/app/player/*
```

## Verification

Confirmed:

```bash
npm run lint
npm run build
git diff --check
```

Result:

```txt
lint: success
build: success
git diff --check: success
GitHub Desktop Commit -> Push: done
GitHub Actions deploy: completed
```

## Commit

Commit message:

```txt
Add offline sync state transition helpers
```

## Next candidate

Next design target:

```txt
Goal 04-5 staging store write helpers
```

Recommended next scope:

* staging project 保存関数
* staging asset 保存関数
* staging asset blob 保存関数
* syncRunId / stagingId の責務確認
* staging clear / delete を今回含めるかの確認
* ready 昇格処理はまだ含めない
