# Goal 04-5 Handoff: Offline store read helpers

作成日: 2026-06-06

## ステータス

Goal 04-5 の確定store最小読み取り関数追加まで完了。

`src/lib/offline-store.ts` を新規作成し、IndexedDBの確定storeから主キーで1件読むための最小読み取り関数を追加した。

GitHub Actions deploy 完了済み。

## 完了したこと

### 1. offline store読み取りファイルの追加

追加済み:

- `src/lib/offline-store.ts`

役割:

- IndexedDBの確定storeから、主キーで1件取得する関数を置く
- `src/lib/offline-db.ts` の低レイヤーhelperを利用する
- `/player`、`/admin`、`/settings` にはまだ接続しない

`offline-db.ts` との責務分担:

- `offline-db.ts`
  - DB open / close
  - object store 作成
  - transaction helper
  - `IDBRequest` Promise変換

- `offline-store.ts`
  - offline schema に沿ったstore別読み取り関数
  - project / asset / Blob / sync state など、保存データ種別に近い関数

## 追加した読み取り関数

追加済み:

- `getOfflineProject(projectId)`
- `getOfflineAsset(assetId)`
- `getOfflineAssetBlobRecord(assetId)`
- `getOfflineSyncState(projectId)`

### `getOfflineProject(projectId)`

対象store:

- `offlineProjects`

主キー:

- `projectId`

戻り値:

~~~ts
Promise<OfflineProject | null>
~~~

役割:

- 確定済みoffline projectを1件読む
- 将来 `/player` がオフライン再生対象projectを読む土台になる

### `getOfflineAsset(assetId)`

対象store:

- `offlineAssets`

主キー:

- `assetId`

戻り値:

~~~ts
Promise<OfflineAsset | null>
~~~

役割:

- 確定済みasset metadataを1件読む
- Drive元情報と再生用Blob metadataを取得する土台になる

### `getOfflineAssetBlobRecord(assetId)`

対象store:

- `offlineAssetBlobs`

主キー:

- `assetId`

戻り値:

~~~ts
Promise<OfflineAssetBlobRecord | null>
~~~

役割:

- 確定済み画像Blob recordを1件読む
- Blob本体とBlob metadataを wrapper object として返す

注意:

- Blob recordをそのまま返す
- object URL は作成しない
- 画像表示処理はしない
- `URL.revokeObjectURL()` の責務は、将来の表示hook側に寄せる

### `getOfflineSyncState(projectId)`

対象store:

- `offlineSyncState`

主キー:

- `projectId`

戻り値:

~~~ts
Promise<OfflineSyncState | null>
~~~

役割:

- project単位のオフライン同期状態を1件読む
- 未同期状態は `null` として扱う

## 実装方針

すべての読み取り関数は、以下を使って実装した。

- `runOfflineTransaction(..., "readonly", ...)`
- `requestToPromise()`

方針:

- 読み取りはすべて `readonly` transaction
- DB open / close は `runOfflineTransaction()` 側に任せる
- 個々の `IDBRequest` は `requestToPromise()` でPromise化する
- storeに該当レコードがない場合は `null` を返す
- DB open失敗、transaction失敗、request失敗は例外として上位へ返す

## nullの扱い

該当レコードなしはエラーではなく `null` として返す。

理由:

- `offlineSyncState` のレコードなしは「未同期」を意味する
- assetやBlobが存在しない状態は、今後の同期前・削除後・未保存状態として普通に起きる
- 「データがない」と「DB操作が失敗した」を分けるため

扱い:

- レコードなし: `null`
- IndexedDBが開けない: 例外
- transaction失敗: 例外
- request失敗: 例外

## 意図的に含めなかったこと

今回の最小読み取り関数パッチでは、以下は実装していない。

- 書き込み関数
- delete関数
- staging store 読み取り
- staging保存関数
- staging検証関数
- 確定store昇格関数
- staging cleanup
- 一覧取得関数
- `listOfflineProjects()`
- `listOfflineAssets()`
- `listOfflineAssetsByProject(projectId)`
- 複数store横断のまとめ読み関数
- `getOfflineProjectBundle(projectId)`
- `ready` 判定
- runtime schema検証
- `schemaVersion` 検証
- Blob metadata検証
- Blobのobject URL化
- `/settings` への接続
- `/player` への接続
- `/admin` への接続
- Drive同期処理

## runtime検証について

今回の読み取り関数では、IndexedDBから読んだ値のruntime検証は行っていない。

理由:

- 今回の責務は「主キーで1件読む」ことだけ
- 読み取り関数に検証ロジックを混ぜると責務が広がる
- `ready` 判定、staging検証、破損検知は後続で別関数として設計するべき

今後検討する検証:

- `schemaVersion`
- 必須フィールド
- `slides[]`
- `assetId`
- Blob metadata
- `OfflineSyncState.status`
- `OfflineAsset.blobStatus`
- project / asset / Blob の整合性

## Blobの扱い

`getOfflineAssetBlobRecord(assetId)` は、`OfflineAssetBlobRecord` をそのまま返す。

やらないこと:

- object URL 作成
- 画像表示
- React stateへのBlob保存
- Blobの形式変換
- Blobのリサイズ
- Blobの圧縮
- Blob検証

理由:

- Blob読み取りと画像表示は責務が違う
- object URL は表示ライフサイクルとcleanupが必要
- `URL.revokeObjectURL()` は、将来の `/player` offline画像hook側で扱うべき

## 変更ファイル

読み取り関数パッチで追加したファイル:

- `src/lib/offline-store.ts`

今回のhandoff追加で追加するファイル:

- `docs/handoffs/2026-06-06-goal-04-5-offline-store-read-helpers-handoff.md`

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

実装済み:

- `getOfflineProject(projectId)`
- `getOfflineAsset(assetId)`
- `getOfflineAssetBlobRecord(assetId)`
- `getOfflineSyncState(projectId)`

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
- Blob record読み取り時にobject URLを作成しない

## 検証

読み取り関数パッチでは、以下を実行し成功を確認済み。

~~~zsh
git status --short
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

1. 確定storeの最小書き込み関数設計
2. `offlineSyncState` の最小読み書き運用設計
3. staging保存関数設計
4. staging検証関数設計
5. 確定store昇格設計
6. staging cleanup設計
7. Drive project 1件同期処理設計
8. `/player` IndexedDB読み取り設計
9. `/player` offline再生切り替え設計

## 次の候補

次の候補:

1. 第4-5 確定storeの最小書き込み関数設計
2. 第4-5 `offlineSyncState` 読み書き設計
3. 第4-5 staging保存 / 検証 / 昇格設計

推奨:

次は **確定storeの最小書き込み関数設計** に進むのが自然。

理由:

- 読み取り関数ができたため、次は保存側の最小単位を作れる
- ただし、`ready` 判定やstaging昇格とは混ぜない
- まずは確定storeに1件保存する薄い関数だけを設計する
- 実際のDrive同期処理はまだ入れない
