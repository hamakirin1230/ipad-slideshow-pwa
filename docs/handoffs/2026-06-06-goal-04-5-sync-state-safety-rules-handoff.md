# Goal 04-5 Handoff: Offline sync state safety rules

作成日: 2026-06-06

## ステータス

Goal 04-5 の `offlineSyncState` 安全運用ルールの decision 追記まで完了。

`putOfflineSyncState()` によって `offlineSyncState.status = "ready"` を保存できる低レベル関数が追加されたため、`ready` / `syncing` / `failed` / `corrupt` の意味と運用ルールを `docs/decisions/goal-04-5-offline-sync-indexeddb.md` に明文化した。

GitHub Actions deploy 完了済み。

## 完了したこと

### 1. decision 文書の更新

更新済み:

* `docs/decisions/goal-04-5-offline-sync-indexeddb.md`

追加した主なセクション:

* `offlineSyncState` 安全運用ルール
* `ready` を設定してよい経路
* `syncing` の運用
* `failed` の運用
* `corrupt` の運用
* `syncedAt` / `lastFailedAt` の意味
* `syncRunId` の意味
* `ready` 成功時に更新する情報
* `/player` での扱い
* 低レベル保存関数との関係

## 決定した運用ルール

### `ready`

`offlineSyncState.status = "ready"` を設定してよいのは、staging検証と確定store昇格が成功した経路だけに限定する。

許可する経路:

1. Driveからproject、asset metadata、画像Blobを取得する
2. staging storeへ保存する
3. staging一式を検証する
4. project本体、全asset metadata、全画像Blobが揃っていることを確認する
5. 対象project 1件の確定storeをトランザクション内で置き換える
6. 確定store昇格が成功した場合だけ `status = "ready"` にする

禁止すること:

* `putOfflineSyncState()` の単発呼び出しで安易に `ready` を作る
* projectだけ保存した状態で `ready` にする
* asset metadataだけ保存した状態で `ready` にする
* Blobが欠けた状態で `ready` にする
* UI操作や開発用確認ボタンから直接 `ready` にする
* staging検証を通さずに `ready` にする

理由:

`ready` は、IndexedDB内の確定storeを本番再生元として使ってよいという宣言に近い。
低レベル保存関数から自由に作れる状態にすると、不完全なprojectやBlob欠損状態を `/player` が再生可能と誤認する危険がある。

### `syncing`

`syncing` は、新しい同期処理が進行中であることを表す。

`syncing` は、既存の確定済み再生データを無効化する意味ではない。

同期開始時の運用:

* `status` を `syncing` にする
* `syncRunId` を今回の同期試行IDに更新する
* 既存の `offlineProjects` / `offlineAssets` / `offlineAssetBlobs` は消さない
* 既存の確定storeを上書きしない
* 新しい同期データは staging store に保存する
* `syncedAt` は前回成功同期時刻として保持する
* `sourceUpdatedAt` は前回成功同期時のDrive側更新時刻として保持する
* `slideCount` / `assetCount` は前回成功同期時の値として保持する
* 前回の `lastErrorCode` / `lastErrorMessage` / `lastFailedAt` はクリアする

理由:

同期開始時点では、新しいデータはまだ確定していない。
この段階で前回成功同期情報を消すと、同期失敗時に最後に使えるデータがいつのものか分からなくなる。

### `failed`

`failed` は、直近の同期処理に失敗したことを表す。

`failed` は、既存の確定storeデータが再生不可であることを必ずしも意味しない。

同期失敗時の運用:

* `status` を `failed` にする
* `syncRunId` は失敗した直近同期試行IDとして残す
* `lastErrorCode` / `lastErrorMessage` / `lastFailedAt` を保存する
* `syncedAt` は前回成功同期時刻として保持する
* `sourceUpdatedAt` は前回成功同期時のDrive側更新時刻として保持する
* `slideCount` / `assetCount` は前回成功同期時の値として保持する
* 既存の `offlineProjects` / `offlineAssets` / `offlineAssetBlobs` は残す
* 失敗したstagingデータは削除またはcleanup対象にする

理由:

同期失敗は、新しいデータへの更新に失敗したという意味であり、既存の確定済みデータが壊れたとは限らない。
最新化に失敗しても、前回同期済みデータで再生できる可能性を残す。

### `corrupt`

`corrupt` は、同期失敗ではなく、確定store内の保存済みデータが信用できない状態を表す。

`corrupt` の例:

* `offlineProjects` は存在するが、slideが参照する `offlineAssets` が欠けている
* `offlineAssets` は存在するが、対応する `offlineAssetBlobs` が欠けている
* Blob metadataが大きく矛盾している
* 保存済みBlobが破損している
* 確定store検証で再生に必要なデータ欠損が見つかった

`corrupt` 時の運用:

* `status` を `corrupt` にする
* `/player` はそのprojectをオフライン再生元として使わない
* `syncedAt` は最後に信用できた成功同期時刻として保持する
* `sourceUpdatedAt` は最後に信用できたDrive側更新時刻として保持する
* `slideCount` / `assetCount` は最後に信用できた確定データの値として保持する
* `lastErrorCode` / `lastErrorMessage` に破損理由を保存する
* `lastFailedAt` は更新しない

理由:

`failed` は同期処理の失敗であり、`corrupt` は保存済み確定データの破損である。
この2つを混ぜると、既存データで再生してよいのか、再同期や復旧が必要なのか判断できなくなる。

## 日時フィールドの意味

### `syncedAt`

`syncedAt` は、最後に確定storeが正常に同期・昇格された時刻として扱う。

運用:

* `syncing` 開始時には更新しない
* `failed` 時には更新しない
* `corrupt` 時にも消さない
* `ready` 成功時に今回成功同期時刻へ更新する

### `lastFailedAt`

`lastFailedAt` は、直近の同期失敗時刻として扱う。

運用:

* `failed` 時だけ更新する
* `syncing` 開始時には前回値をクリアする
* `ready` 成功時にはクリアする
* `corrupt` 検知時刻としては使わない

`corrupt` 検知時刻が必要になった場合は、将来 `corruptDetectedAt` のような別フィールド追加を検討する。

## `syncRunId` の意味

初期運用では、`syncRunId` は直近の同期試行IDとして扱う。

状態別の扱い:

* `syncing`: 現在進行中の同期試行ID
* `failed`: 失敗した直近同期試行ID
* `ready`: 成功して確定storeへ昇格された同期ID
* `corrupt`: 原則として直近状態の `syncRunId` を保持する

将来、最後に成功した同期IDと直近試行IDを明確に分ける必要が出た場合は、`lastSuccessfulSyncRunId` のような別フィールド追加を検討する。

## `ready` 成功時に更新する情報

staging検証と確定store昇格が成功し、`ready` にする場合は、同期成功情報を今回の確定データに更新する。

更新するもの:

* `status = "ready"`
* `syncRunId`: 成功した同期ID
* `syncedAt`: 今回の成功同期時刻
* `sourceUpdatedAt`: 今回同期元Driveの更新時刻
* `slideCount`: 今回の確定データのslide数
* `assetCount`: 今回の確定データのasset数

クリアするもの:

* `lastErrorCode`
* `lastErrorMessage`
* `lastFailedAt`

理由:

`ready` は、この時点の確定storeを再生元として使ってよいという状態である。
そのため、件数や時刻は前回成功分ではなく、今回昇格に成功した確定データの情報に更新する。

## `/player` での扱い

将来の `/player` では、`offlineSyncState.status === "ready"` だけに依存しすぎない。

初期方針:

* `ready` は再生開始の強い候補条件にする
* `corrupt` は再生不可として扱う
* `syncing` / `failed` は、既存確定store検証の結果と組み合わせて扱う余地を残す
* 前回readyデータが残っているかどうかは、後続の確定store検証関数で判断する

理由:

`syncing` や `failed` は、直近同期状態を表す。
それだけで既存確定データが再生可能かどうかまでは断定しない。

## 低レベル保存関数との関係

`putOfflineSyncState()` は、`offlineSyncState` store に1件保存する低レベル関数である。

注意:

* `putOfflineSyncState()` 自体は `ready` の安全性を検証しない
* `putOfflineSyncState()` をUIから直接呼ばない
* `putOfflineSyncState()` で `ready` を作るのは、staging検証・確定store昇格の成功経路だけにする
* `syncing` / `failed` / `corrupt` への状態更新も、後続の専用関数で安全に包むことを検討する

将来の候補:

* `markOfflineSyncing(...)`
* `markOfflineSyncFailed(...)`
* `markOfflineSyncReadyAfterPromotion(...)`
* `markOfflineSyncCorrupt(...)`

ただし、これらの関数は今回のdecision追記では実装していない。

## 意図的に実装しなかったこと

今回のdecision追記では、以下は実装していない。

* `markOfflineSyncing(...)`
* `markOfflineSyncFailed(...)`
* `markOfflineSyncReadyAfterPromotion(...)`
* `markOfflineSyncCorrupt(...)`
* staging保存関数
* staging検証関数
* 確定store昇格関数
* staging cleanup
* 確定store検証関数
* `/player` のIndexedDB読み取り
* `/player` のoffline再生切り替え
* `/settings` の同期状態UI
* `/admin` の同期開始UI
* Drive同期処理

## 変更ファイル

decision追記で変更したファイル:

* `docs/decisions/goal-04-5-offline-sync-indexeddb.md`

今回のhandoff追加で追加するファイル:

* `docs/handoffs/2026-06-06-goal-04-5-sync-state-safety-rules-handoff.md`

## 現在の IndexedDB 関連構成

### `src/lib/offline-schema.ts`

定義済み:

* DB名
* DB version
* schema version
* object store名
* offline schema型
* staging型

### `src/lib/offline-db.ts`

実装済み:

* `openOfflineDb()`
* `closeOfflineDb()`
* `OfflineDbUnavailableError`
* `OfflineDbOpenError`
* object store 作成
* Promiseキャッシュ
* `OfflineTransactionMode`
* `requestToPromise<T>()`
* `runOfflineTransaction<T>()`

### `src/lib/offline-store.ts`

実装済み読み取り関数:

* `getOfflineProject(projectId)`
* `getOfflineAsset(assetId)`
* `getOfflineAssetBlobRecord(assetId)`
* `getOfflineSyncState(projectId)`

実装済み書き込み関数:

* `putOfflineProject(project)`
* `putOfflineAsset(asset)`
* `putOfflineAssetBlobRecord(blobRecord)`
* `putOfflineSyncState(syncState)`

### `/settings`

実装済み:

* IndexedDB確認パネル
* 手動ボタンによる `openOfflineDb()` 確認
* 確認後の `closeOfflineDb()`
* 最小診断表示

## 維持した安全境界

以下の安全境界は維持している。

* Drive file を公開共有しない
* Drive fileId を公開URL化しない
* access token をContext valueやUI propsに直接出さない
* access token をUIやdiagnosticsに出さない
* Authorization header をUIやdiagnosticsに出さない
* full `assetFileId` をUIやdiagnosticsに出さない
* object URL をUIやdiagnosticsに出さない
* Drive API URL をUIやdiagnosticsに出さない
* Blob本体をReact stateに保存しない
* IndexedDB確認UIにDrive由来IDを表示しない
* IndexedDB確認UIにstore内容を表示しない
* staging中データを `/player` の本番再生元にしない
* `offlineSyncState.status = "ready"` を安易に設定しない
* `putOfflineSyncState()` をUIから直接呼ばない
* `failed` と `corrupt` を混同しない
* `lastFailedAt` を破損検知時刻として使わない

## 検証

decision追記パッチでは、以下を実行し成功を確認済み。

```zsh
git status --short
git diff -- docs/decisions/goal-04-5-offline-sync-indexeddb.md
git diff --check
npm run lint
npm run build
```

確認結果:

* `git diff --check` 成功
* `npm run lint` 成功
* `npm run build` 成功
* Next.js build 成功
* lint error なし
* TypeScript error なし

デプロイ:

* GitHub Desktop で commit
* GitHub Desktop で push
* GitHub Actions deploy 完了

## 今後の推奨順序

次に進む場合も、いきなりDrive同期全体へ進まない。

推奨順序:

1. `offlineSyncState` 専用状態更新関数設計
2. staging保存関数設計
3. staging検証関数設計
4. 確定store昇格設計
5. staging cleanup設計
6. Drive project 1件同期処理設計
7. `/player` IndexedDB読み取り設計
8. `/player` offline再生切り替え設計

## 次の候補

次の候補:

1. 第4-5 `offlineSyncState` 専用状態更新関数設計
2. 第4-5 staging保存関数設計
3. 第4-5 staging検証 / 確定store昇格設計

推奨:

次は **`offlineSyncState` 専用状態更新関数設計** をグリルするのがよい。

理由:

* `putOfflineSyncState()` は低レベル保存関数であり、`ready` の安全性を検証しない
* decision で状態運用ルールを固定したため、次はそれを安全に呼べる関数へ落とし込める
* ただし、`ready` 成功関数は staging検証・確定store昇格と密接に関係するため、最初から安易に実装しない
* まずは `syncing` / `failed` / `corrupt` の専用更新関数をどう切るかを詰めるべき
