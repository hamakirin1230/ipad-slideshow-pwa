# Goal 04-5 staging read helper handoff

Date: 2026-06-08

## Scope

Goal 04-5 の IndexedDB / オフライン再生基盤として、staging store から `syncRunId` 単位で staging レコード一式を読み取る helper を追加した。

今回の目的は、後続の staging validation が扱う対象を、安全に `syncRunId` 単位で収集できるようにすること。

staging validation 本体、確定store昇格、`offlineSyncState.status = "ready"` の設定は今回含めていない。

## Added file

```txt
src/lib/offline-staging-read.ts
```

## Added public API

```ts
getOfflineStagingRecordsBySyncRunId(syncRunId)
```

## Added result type

```ts
type OfflineStagingRecordsForSyncRun = {
  projects: OfflineStagingProject[];
  assets: OfflineStagingAsset[];
  assetBlobRecords: OfflineStagingAssetBlobRecord[];
};
```

## Responsibility

`src/lib/offline-staging-read.ts` は、指定された `syncRunId` に一致する staging レコードを収集することだけを担当する。

対象 store は次の3つ。

```txt
offlineStagingProjects
offlineStagingAssets
offlineStagingAssetBlobs
```

確定storeは対象外。

```txt
offlineProjects
offlineAssets
offlineAssetBlobs
offlineSyncState
```

## Implementation strategy

現在の staging store は `stagingId` が主キーであり、`syncRunId` index は存在しない。

そのため、今回は IndexedDB version upgrade や index 追加は行わず、cursor scan で `syncRunId` 一致レコードを収集する。

理由:

* `syncRunId` index 追加には IndexedDB version upgrade が必要
* version upgrade は既存DB移行を伴う
* 今回の目的は validation 前段の最小 read helper 追加である
* 初期運用では現在の再生対象 project 1件同期を想定している

## Cursor scan behavior

内部 private 関数として、cursor scan 収集処理を持つ。

```ts
collectStagingRecordsBySyncRunId<T>(...)
```

この関数は export しない。
public API は `getOfflineStagingRecordsBySyncRunId(syncRunId)` だけ。

収集条件:

```ts
record.syncRunId === syncRunId
```

この条件に一致したレコードだけを配列に入れる。

次のようなレコードは無視する。

```txt
- syncRunId がない
- syncRunId が一致しない
- 想定外の形の record
```

想定外レコードを見つけても例外にはしない。
「一致したものだけ集める。分からないものは混ぜない」という方針。

## Transaction behavior

`getOfflineStagingRecordsBySyncRunId(...)` は、3つの staging store を同一 `readonly` transaction 内で読む。

```txt
offlineStagingProjects
offlineStagingAssets
offlineStagingAssetBlobs
```

`readwrite` transaction は使わない。
この helper は読み取り専用であり、保存・削除・状態更新をしない。

## Read ordering

store の処理順は次の通り。

```txt
offlineStagingProjects
offlineStagingAssets
offlineStagingAssetBlobs
```

理由:

* 読み取りは validation 対象を組み立てる入口である
* 意味上は project が全体構造を持つ
* project slides が asset を参照する
* asset が blob record に対応する

ただし、返却配列の意味上の順序は保証しない。
後続の validation で順序が必要な場合は、`project.slides[].order` や `assetId` などを使って明示的に並べ替える。

## Parallelism

3つの store は `Promise.all(...)` で並列 scan しない。
同一 transaction 内で直列に cursor scan する。

理由:

* 初期運用では件数が少ない想定
* 速度より予測可能性を優先する
* どの store の読み取りで失敗したか追いやすくする
* cleanup helper と実装思想を揃える

## Error behavior

`openCursor()` の `request.onerror` は握りつぶさず reject する。

読み取り失敗を空配列には変換しない。

理由:

```txt
staging にデータがない
```

ことと、

```txt
staging を読めなかった
```

ことを区別するため。

## Blob handling

`OfflineStagingAssetBlobRecord[]` は Blob 本体を含む record としてそのまま返す。

ただし、この helper は UI / diagnostics 用ではない。
用途は validation / staging -> 確定store昇格処理用の低レベル関数に限定する。

Blob 本体を React state、UI 表示、diagnostics 表示へ流さない。

## Imports

`src/lib/offline-staging-read.ts` の import は、IndexedDB helper、staging store 定数、staging レコード型に限定した。

```ts
runOfflineTransaction

OFFLINE_STAGING_PROJECTS_STORE
OFFLINE_STAGING_ASSETS_STORE
OFFLINE_STAGING_ASSET_BLOBS_STORE

type OfflineStagingProject
type OfflineStagingAsset
type OfflineStagingAssetBlobRecord
```

次は import しない。

```txt
OFFLINE_SCHEMA_VERSION
OFFLINE_SYNC_STATE_STORE
OfflineSyncState
markOfflineSyncing
markOfflineSyncFailed
markOfflineStoreCorrupt
clearOfflineStagingBySyncRunId
```

## Included

今回含めたもの:

```txt
- OfflineStagingRecordsForSyncRun
- getOfflineStagingRecordsBySyncRunId(syncRunId)
- private collectStagingRecordsBySyncRunId<T>(...)
- cursor scan による syncRunId 一致レコード収集
- staging 3 store の同一 readonly transaction 処理
- project -> asset -> assetBlobRecord の直列 scan
- Blob 本体を含む OfflineStagingAssetBlobRecord[] の返却
```

## Excluded

今回含めていないもの:

```txt
- IndexedDB version upgrade
- syncRunId index 追加
- validation 判定
- project が1件だけかの判定
- asset と blob の対応確認
- slide と asset の対応確認
- schemaVersion 確認
- Blob 存在確認
- staging -> 確定store昇格
- offlineSyncState 更新
- ready / failed / corrupt の状態更新
- cleanup helper 呼び出し
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
- cleanup helper は呼ばない
- record.syncRunId === syncRunId のものだけ収集する
- syncRunId がない record は無視する
- 想定外の record は無視する
- cursor scan エラーは空配列にせず reject する
- readonly transaction で読む
- Promise.all で並列化しない
- 返却配列の意味上の順序は保証しない
- Blob record は返すが UI / diagnostics 用には使わない
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
Add offline staging read helper
```

## Notes

`git diff --check` が失敗している場合は、`lint` / `build` が成功していても commit しない。

## Next candidate

次の設計候補:

```txt
Goal 04-5 staging validation rules
```

次に詰めるべき内容:

```txt
- staging project が1件だけであること
- project slides と staging assets の対応
- staging assets と staging asset blob records の対応
- schemaVersion の扱い
- validation failure を failed とするか corrupt とするか
- ready 成功経路はまだ作らない
```

`ready` は staging 検証と確定store昇格の成功経路を設計してから追加する。
