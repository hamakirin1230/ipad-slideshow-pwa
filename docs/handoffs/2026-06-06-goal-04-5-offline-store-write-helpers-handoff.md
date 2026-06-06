# Goal 04-5 Handoff: Offline store write helpers

作成日: 2026-06-06

## ステータス

Goal 04-5 の確定store最小書き込み関数追加まで完了。

`src/lib/offline-store.ts` に、IndexedDBの確定storeへ主キー付きrecordを1件保存するための最小 `put` 関数を追加した。

GitHub Actions deploy 完了済み。

## 完了したこと

### 1. 確定store書き込み関数の追加

変更済み:

- `src/lib/offline-store.ts`

追加済み:

- `putOfflineProject(project)`
- `putOfflineAsset(asset)`
- `putOfflineAssetBlobRecord(blobRecord)`
- `putOfflineSyncState(syncState)`

すべて、確定storeへ1件保存する薄い関数として実装した。

対象store:

| 関数 | store | keyPath |
|---|---|---|
| `putOfflineProject(project)` | `offlineProjects` | `projectId` |
| `putOfflineAsset(asset)` | `offlineAssets` | `assetId` |
| `putOfflineAssetBlobRecord(blobRecord)` | `offlineAssetBlobs` | `assetId` |
| `putOfflineSyncState(syncState)` | `offlineSyncState` | `projectId` |

## 追加した関数

### `putOfflineProject(project)`

対象store:

- `offlineProjects`

引数:

~~~ts
OfflineProject
~~~

戻り値:

~~~ts
Promise<void>
~~~

役割:

- 確定済みoffline project recordを保存する
- 既存の同一 `projectId` record があれば上書きする
- projectの `slides[]`、caption、`durationSeconds`、source情報を保存する土台になる

含めない責務:

- slide整合性検証
- asset存在確認
- Blob存在確認
- `ready` 判定

### `putOfflineAsset(asset)`

対象store:

- `offlineAssets`

引数:

~~~ts
OfflineAsset
~~~

戻り値:

~~~ts
Promise<void>
~~~

役割:

- 確定済みasset metadata recordを保存する
- Drive元情報と再生用Blob metadataを保存する土台になる

含めない責務:

- Drive fileId検証
- mimeType検証
- sizeBytes検証
- checksum検証
- Blob record存在確認

### `putOfflineAssetBlobRecord(blobRecord)`

対象store:

- `offlineAssetBlobs`

引数:

~~~ts
OfflineAssetBlobRecord
~~~

戻り値:

~~~ts
Promise<void>
~~~

役割:

- 確定済み画像Blob recordを保存する
- Blob本体を wrapper object の一部としてIndexedDBへ保存する

含めない責務:

- object URL 作成
- 画像表示
- BlobのReact state保存
- BlobのUI表示
- Blob検証
- Blobリサイズ
- Blob圧縮
- Blob形式変換

注意:

Blob本体を保存する関数だが、BlobをUIやReact stateには出さない。  
表示用のobject URL生成と `URL.revokeObjectURL()` は、将来の `/player` offline画像hook側の責務にする。

### `putOfflineSyncState(syncState)`

対象store:

- `offlineSyncState`

引数:

~~~ts
OfflineSyncState
~~~

戻り値:

~~~ts
Promise<void>
~~~

役割:

- project単位のoffline sync state recordを保存する
- `syncing` / `ready` / `failed` / `corrupt` などの状態を保存する土台になる

重要な注意:

この関数自体では、`status: "ready"` の安全性を検証しない。

理由:

- `ready` 判定には複数storeの整合性確認が必要
- project本体、全asset metadata、全画像Blobが揃っているか確認する必要がある
- これは低レベル `put` 関数の責務ではない

`ready` を作ってよいかの判断は、後続の staging検証・確定store昇格処理に置く。

## 実装方針

すべての書き込み関数は、以下を使って実装した。

- `runOfflineTransaction(..., "readwrite", ...)`
- `requestToPromise()`

方針:

- 書き込みはすべて `readwrite` transaction
- DB open / close は `runOfflineTransaction()` 側に任せる
- 個々の `IDBRequest` は `requestToPromise()` でPromise化する
- `store.put(...)` の結果は使わない
- transaction完了後に `Promise<void>` として成功する
- DB open失敗、transaction失敗、request失敗は例外として上位へ返す

## 戻り値方針

各 `put` 関数の戻り値は `Promise<void>` とした。

理由:

- 保存対象record内に主キーがすでに含まれている
- `put()` の戻り値として主キーを返しても呼び出し側に新しい情報は増えない
- 保存成功か失敗かだけを表現すれば十分
- 保存後の再読込や検証は別関数として設計するべき

## runtime検証について

今回の `put` 関数では、保存前のruntime検証は行っていない。

検証していないもの:

- `schemaVersion`
- `projectId`
- `assetId`
- `slides[]`
- `durationSeconds`
- `caption`
- `blobMimeType`
- `blobSizeBytes`
- `blobStatus`
- `OfflineSyncState.status`
- `ready` の安全性
- Blob metadata整合性

理由:

- 今回の責務は「確定storeへ1件保存する」ことだけ
- 保存関数に検証ロジックを混ぜると責務が広がる
- 断片的な検証をここに入れると、後でstaging検証・ready判定と重複する
- 整合性検証は後続の staging検証、確定store昇格、破損検知でまとめて扱うべき

## 意図的に含めなかったこと

今回の最小書き込み関数パッチでは、以下は実装していない。

- delete関数
- clear関数
- staging store への保存関数
- staging読み取り関数
- staging検証関数
- 確定store昇格関数
- staging cleanup
- 一覧取得関数
- 複数store横断のまとめ読み関数
- `ready` 判定
- runtime schema検証
- `schemaVersion` 検証
- Blob metadata検証
- Blobのobject URL化
- `/settings` への接続
- `/player` への接続
- `/admin` への接続
- Drive同期処理
- 同期UI
- 容量不足UI
- 再同期UI

## delete / clear を入れなかった理由

削除系は、保存よりも危険な操作である。

削除系には、少なくとも以下の設計が必要になる。

- 対象project 1件だけを消すのか
- assetが他projectから参照されていないか
- Blobだけ消すのか、metadataも消すのか
- staging cleanup と確定store削除を分けるのか
- `offlineSyncState` をどう更新するのか
- 削除後に `/player` が何を表示するのか

そのため、今回の最小書き込み関数では delete / clear は追加していない。

## staging保存を入れなかった理由

staging store は、同期途中の一時保存先であり、単なる別storeではない。

staging保存には以下が必要になる。

- `syncRunId`
- `stagingId`
- 同期失敗時のcleanup
- staging一式の検証
- 確定storeへの昇格
- 既存readyデータを壊さないための制御

これは最小 `put` 関数の範囲を超えるため、後続に分離した。

## `ready` 判定を入れなかった理由

`offlineSyncState.status = "ready"` は、project本体だけでなく、全asset metadataと全画像Blobが揃った場合だけ設定してよい。

今回の `putOfflineSyncState()` は低レベル保存関数であり、`ready` の安全性を検証しない。

今後の方針:

- `ready` を設定できるのは、staging検証・確定store昇格の成功経路だけにする
- projectだけ、assetだけ、Blobだけの保存で `ready` にしない
- `putOfflineSyncState()` を直接UIから呼ばない

## 変更ファイル

書き込み関数パッチで変更したファイル:

- `src/lib/offline-store.ts`

今回のhandoff追加で追加するファイル:

- `docs/handoffs/2026-06-06-goal-04-5-offline-store-write-helpers-handoff.md`

## 現在の IndexedDB 関連構成

### `src/lib/offline-schema.ts`

定義済み:

- DB名
- DB version
- schema version
- object store名
- offline schema型
- staging型

### `src/lib/offline-db.ts`

実装済み:

- `openOfflineDb()`
- `closeOfflineDb()`
- `OfflineDbUnavailableError`
- `OfflineDbOpenError`
- object store 作成
- Promiseキャッシュ
- `OfflineTransactionMode`
- `requestToPromise<T>()`
- `runOfflineTransaction<T>()`

### `src/lib/offline-store.ts`

実装済み読み取り関数:

- `getOfflineProject(projectId)`
- `getOfflineAsset(assetId)`
- `getOfflineAssetBlobRecord(assetId)`
- `getOfflineSyncState(projectId)`

実装済み書き込み関数:

- `putOfflineProject(project)`
- `putOfflineAsset(asset)`
- `putOfflineAssetBlobRecord(blobRecord)`
- `putOfflineSyncState(syncState)`

### `/settings`

実装済み:

- IndexedDB確認パネル
- 手動ボタンによる `openOfflineDb()` 確認
- 確認後の `closeOfflineDb()`
- 最小診断表示

## 維持した安全境界

以下の安全境界は維持している。

- Drive file を公開共有しない
- Drive fileId を公開URL化しない
- access token をContext valueやUI propsに直接出さない
- access token をUIやdiagnosticsに出さない
- Authorization header をUIやdiagnosticsに出さない
- full `assetFileId` をUIやdiagnosticsに出さない
- object URL をUIやdiagnosticsに出さない
- Drive API URL をUIやdiagnosticsに出さない
- Blob本体をReact stateに保存しない
- IndexedDB確認UIにDrive由来IDを表示しない
- IndexedDB確認UIにstore内容を表示しない
- staging中データを `/player` の本番再生元にしない
- `offlineSyncState.status = "ready"` を安易に設定しない
- Blob record保存時にobject URLを作成しない
- 確定storeへの保存関数をUIへ接続しない

## 検証

書き込み関数パッチでは、以下を実行し成功を確認済み。

~~~zsh
git diff -- src/lib/offline-store.ts
git diff --check
npm run lint
npm run build
~~~

確認結果:

- `git diff --check` 成功
- `npm run lint` 成功
- `npm run build` 成功
- Next.js build 成功
- lint error なし
- TypeScript error なし

デプロイ:

- GitHub Desktop で commit
- GitHub Desktop で push
- GitHub Actions deploy 完了

## 今後の推奨順序

次に進む場合も、いきなりDrive同期全体へ進まない。

推奨順序:

1. `offlineSyncState` の安全な運用設計
2. staging保存関数設計
3. staging検証関数設計
4. 確定store昇格設計
5. staging cleanup設計
6. Drive project 1件同期処理設計
7. `/player` IndexedDB読み取り設計
8. `/player` offline再生切り替え設計

## 次の候補

次の候補:

1. 第4-5 `offlineSyncState` の安全な運用設計
2. 第4-5 staging保存関数設計
3. 第4-5 staging検証 / 確定store昇格設計

推奨:

次は **`offlineSyncState` の安全な運用設計** をグリルするのがよい。

理由:

- `putOfflineSyncState()` によって `ready` を保存できる低レベル関数ができた
- しかし `ready` を作ってよい条件はまだコード上では制御していない
- staging検証・確定store昇格へ進む前に、`syncing` / `ready` / `failed` / `corrupt` の運用ルールを固定する必要がある
- ここを曖昧にすると、不完全なオフラインデータを `/player` が再生元として扱うリスクが出る
