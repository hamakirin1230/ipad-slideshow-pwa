# Goal 04-5 staging store write helpers handoff

Date: 2026-06-08

## Scope

Goal 04-5 の IndexedDB / オフライン再生基盤として、staging store へ完成済みレコードを保存する最小 write helpers を追加した。

staging store は、Drive から取得した project / asset / blob を、確定storeへ昇格する前に仮置きする IndexedDB の保存領域である。

今回の実装は、staging store へ1件ずつ保存する薄い `put` 関数だけを対象にした。
staging 検証、確定store昇格、`offlineSyncState.status = "ready"` の設定は含めていない。

## Changed file

```txt
src/lib/offline-store.ts
```

## Added functions

```ts
putOfflineStagingProject(...)
putOfflineStagingAsset(...)
putOfflineStagingAssetBlobRecord(...)
```

## Added imports

`src/lib/offline-store.ts` に staging store 定数と staging 型を追加した。

```ts
OFFLINE_STAGING_PROJECTS_STORE
OFFLINE_STAGING_ASSETS_STORE
OFFLINE_STAGING_ASSET_BLOBS_STORE

type OfflineStagingProject
type OfflineStagingAsset
type OfflineStagingAssetBlobRecord
```

## Responsibility

今回追加した関数は、完成済み staging レコードを IndexedDB の staging store に1件保存するだけを担当する。

各関数は、呼び出し元から受け取ったレコードをそのまま `put` する。
`stagingId` 生成、`syncRunId` 付与、`schemaVersion` 付与、Drive 由来データから offline schema への変換は行わない。

## Implementation pattern

既存の確定store write helpers と同じパターンで実装した。

```ts
runOfflineTransaction(
  [STAGING_STORE_NAME],
  "readwrite",
  async ({ stores }) => {
    await requestToPromise(stores[STAGING_STORE_NAME].put(record));
  },
)
```

各関数の戻り値は `Promise<void>` とした。

保存に成功した場合は何も返さない。
IndexedDB の open / transaction / put が失敗した場合は、例外として呼び出し元へ reject する。

## Store behavior

IndexedDB の `put` を使うため、同じ `stagingId` の既存レコードがある場合は上書きされる。

この判断は、staging store を同期Run中の仮置き領域として扱うためである。
同じ staging レコードを再保存しても結果が壊れにくく、同期処理の再試行に向いている。

## Included

今回含めたもの:

```txt
- staging project 1件保存
- staging asset 1件保存
- staging asset blob record 1件保存
- runOfflineTransaction(..., "readwrite", ...) の利用
- requestToPromise(...) の利用
- store.put(record) の利用
```

## Excluded

今回含めていないもの:

```txt
- staging read helpers
- bulk put helpers
- project / asset / blob の一括 transaction 保存
- staging clear / delete
- staging 検証
- staging -> 確定store昇格
- offlineSyncState 更新
- offlineSyncState.status = "ready" 設定
- Drive API 呼び出し
- UI接続
- runtime 検証
- schemaVersion 付与
- stagingId 生成
- syncRunId 付与
- テストファイル追加
- 新規ファイル追加
```

## Safety boundaries

今回の関数は「保存係」に限定した。

守った境界:

```txt
- 完成済み staging レコードだけを受け取る
- レコード内容を組み立てない
- レコード内容を検証しない
- 状態遷移をしない
- ready を作らない
- staging の削除・掃除をしない
- Drive fileId や token を UI / diagnostics に出さない
- Blob 本体を React state に保存しない
```

## Verification

Confirmed locally:

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
Add offline staging store write helpers
```

## Notes

`git diff --check` が失敗している場合は、`lint` / `build` が成功していても commit しない。

## Next candidate

次の設計候補:

```txt
Goal 04-5 staging store cleanup / clear helpers
```

または

```txt
Goal 04-5 staging validation read strategy
```

ただし、`ready` 成功経路はまだ作らない。
`ready` は staging 検証と確定store昇格の成功経路を設計してから追加する。
