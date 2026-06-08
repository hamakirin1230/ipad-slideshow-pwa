# Goal 04-5 staging cleanup helper handoff

Date: 2026-06-08

## Scope

Goal 04-5 の IndexedDB / オフライン再生基盤として、staging store の cleanup helper を追加した。

今回の目的は、指定した `syncRunId` に一致する staging レコードだけを削除できるようにすること。

staging store は、Drive から取得した project / asset / blob を、確定storeへ昇格する前に仮置きする IndexedDB の保存領域である。

今回の cleanup helper は、staging の仮置きデータだけを対象にする。
確定store、`offlineSyncState`、Drive API、UI、`ready` 成功経路は触らない。

## Added file

```txt
src/lib/offline-staging-cleanup.ts
```

## Added public API

```ts
clearOfflineStagingBySyncRunId(syncRunId)
```

## Added result type

```ts
type ClearOfflineStagingResult = {
  deletedProjects: number;
  deletedAssets: number;
  deletedAssetBlobs: number;
};
```

削除したレコード本体は返さない。
返すのは store 別の削除件数だけ。

## Responsibility

`src/lib/offline-staging-cleanup.ts` は、指定された `syncRunId` に一致する staging レコードを削除することだけを担当する。

対象 store は次の3つ。

```txt
offlineStagingAssetBlobs
offlineStagingAssets
offlineStagingProjects
```

確定storeは対象外。

```txt
offlineProjects
offlineAssets
offlineAssetBlobs
offlineSyncState
```

## Implementation strategy

IndexedDB version upgrade や `syncRunId` index 追加は行わず、今回は cursor scan で実装した。

理由:

* 現在の staging store は `stagingId` が主キー
* `syncRunId` index はまだ存在しない
* index 追加には IndexedDB version upgrade が必要
* version upgrade は既存DB移行を伴うため、今回の小さな helper 追加には含めない

## Cursor scan behavior

内部 private 関数として、cursor scan 削除処理を持つ。

```ts
deleteStagingRecordsBySyncRunId(...)
```

この関数は export しない。
public API は `clearOfflineStagingBySyncRunId(syncRunId)` だけ。

削除条件:

```ts
record.syncRunId === syncRunId
```

この条件に一致したレコードだけを削除する。

次のようなレコードは削除しない。

```txt
- syncRunId がない
- syncRunId が一致しない
- 想定外の形の record
```

想定外レコードを見つけても例外にはしない。
「一致したものだけ消す。分からないものは触らない」という方針。

## Delete ordering

3つの staging store は、同一 `readwrite` transaction 内で直列に削除する。

削除順序:

```txt
offlineStagingAssetBlobs
offlineStagingAssets
offlineStagingProjects
```

`Promise.all(...)` による並列削除は使わない。

理由:

* 削除順序を明確にするため
* どの store で失敗したか追いやすくするため
* 初期運用では件数が少ない想定なので、速度より予測可能性を優先するため

## Transaction behavior

`runOfflineTransaction(..., "readwrite", ...)` を使い、3つの staging store を同一 transaction 内で処理する。

削除中に `openCursor()` または `cursor.delete()` でエラーが起きた場合は、握りつぶさず reject する。

`runOfflineTransaction` 側が callback error を受けて `transaction.abort()` を試みる。

## cursor.delete handling

一致レコードを削除するときは、`cursor.delete()` の完了を待つ。

削除件数は、`cursor.delete()` が成功した後に増やす。

```txt
cursor.delete() success
=> deleted += 1
=> cursor.continue()
```

削除命令を出しただけでは件数を増やさない。

## Imports

`src/lib/offline-staging-cleanup.ts` の import は、IndexedDB helper と staging store 定数に限定した。

```ts
requestToPromise
runOfflineTransaction

OFFLINE_STAGING_ASSET_BLOBS_STORE
OFFLINE_STAGING_ASSETS_STORE
OFFLINE_STAGING_PROJECTS_STORE
```

`OfflineStagingProject` / `OfflineStagingAsset` / `OfflineStagingAssetBlobRecord` は import しない。

理由:

cleanup helper は staging record の中身を理解しない。
`syncRunId` の一致だけを見るため、局所的な最小型で足りる。

## Included

今回含めたもの:

```txt
- ClearOfflineStagingResult
- clearOfflineStagingBySyncRunId(syncRunId)
- private deleteStagingRecordsBySyncRunId(...)
- cursor scan による syncRunId 一致削除
- staging 3 store の同一 transaction 処理
- blob -> asset -> project の直列削除
- store 別削除件数の返却
```

## Excluded

今回含めていないもの:

```txt
- IndexedDB version upgrade
- syncRunId index 追加
- 全 staging clear
- store 別 public clear 関数
- 汎用 scan/delete helper の export
- staging read helpers
- staging write helpers の変更
- offline-store.ts の変更
- 確定store操作
- offlineSyncState 更新
- ready / failed / corrupt の状態更新
- Drive API 呼び出し
- UI接続
- runtime validation
- テストファイル追加
```

## Safety boundaries

守った安全境界:

```txt
- 対象は staging store 3つだけ
- 確定storeは一切触らない
- offlineSyncState は一切触らない
- record.syncRunId === syncRunId のものだけ削除する
- syncRunId がない record は残す
- 想定外の record は残す
- cursor.delete() 完了後に削除件数を増やす
- エラーは握りつぶさず reject する
- Promise.all で並列化しない
- ready 成功経路は作らない
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
Add offline staging cleanup helper
```

## Notes

`git diff --check` が失敗している場合は、`lint` / `build` が成功していても commit しない。

## Next candidate

次の設計候補:

```txt
Goal 04-5 staging validation read strategy
```

ただし、`ready` 成功経路はまだ作らない。
`ready` は staging 検証と確定store昇格の成功経路を設計してから追加する。
