# Goal 04-5 Handoff: IndexedDB open wrapper / check panel

作成日: 2026-06-06

## ステータス

Goal 04-5 の IndexedDB 基盤確認導線まで完了。

第4-5では、オフライン同期 / IndexedDB 設計書を追加し、その後、IndexedDB schema 型定義、IndexedDB open wrapper、`/settings` 上の IndexedDB 確認パネルを追加した。

GitHub Actions deploy 完了済み。

## 完了したこと

### 1. オフライン同期 / IndexedDB 設計判断

追加済み:

- `docs/decisions/goal-04-5-offline-sync-indexeddb.md`

決定内容:

- Drive は管理・同期元
- IndexedDB は本番オフライン再生元
- Drive Blob 直接再生は暫定経路
- 初期同期単位は現在の再生対象 project 1件
- workspace 全体同期や複数project対応は後続
- IndexedDBでは project情報、asset metadata、画像Blob、同期状態を分離
- 同期中データと確定データを分離
- staging → 検証 → 確定store昇格の方針
- `syncRunId` で同期1回分のstagingデータを束ねる
- `offlineSyncState.status` は `syncing` / `ready` / `failed` / `corrupt`
- 未同期は `offlineSyncState` レコードなしで表現
- `schemaVersion` を各保存レコードに持たせる
- ETag / revisionId は初期必須にせず、将来拡張余地を残す

### 2. IndexedDB schema 型定義

追加済み:

- `src/lib/offline-schema.ts`

定義済み:

- `OFFLINE_DB_NAME`
- `OFFLINE_DB_VERSION`
- `OFFLINE_SCHEMA_VERSION`
- object store名の定数
- `IsoDateTimeString`
- `OfflineSyncStatus`
- `OfflineBlobStatus`
- `OfflineBlobVariant`
- `OfflineProject`
- `OfflineProjectSlide`
- `OfflineAsset`
- `OfflineAssetBlobRecord`
- `OfflineSyncState`
- `OfflineStagingProject`
- `OfflineStagingAsset`
- `OfflineStagingAssetBlobRecord`

方針:

- Drive関連型は import しない
- offline schema は Drive schema から独立
- 型定義と定数のみ
- IndexedDBを開く処理や読み書き関数は含めない

### 3. staging 型の主キー対応

`src/lib/offline-schema.ts` の staging 型に `stagingId` を追加した。

対象:

- `OfflineStagingProject`
- `OfflineStagingAsset`
- `OfflineStagingAssetBlobRecord`

理由:

- staging store の keyPath を `stagingId` にするため
- `syncRunId` は同期1回分を束ねるID
- `stagingId` はstagingレコード1件を一意に識別するID

### 4. IndexedDB open wrapper

追加済み:

- `src/lib/offline-db.ts`

実装済み:

- `openOfflineDb(): Promise<IDBDatabase>`
- `closeOfflineDb(): Promise<void>`
- `OfflineDbUnavailableError`
- `OfflineDbOpenError`
- object store 作成処理
- 既存storeがある場合は作成しない処理
- Promiseキャッシュ
- open失敗時のキャッシュクリア
- blocked時のキャッシュクリア
- `db.onversionchange` で `db.close()` とキャッシュクリア

`openOfflineDb()` の責務:

- browser環境か確認
- IndexedDBが使えるか確認
- DBを開く
- version upgrade時にobject storeを作成
- 成功時に `IDBDatabase` を返す
- 未対応時は `OfflineDbUnavailableError`
- open失敗時は `OfflineDbOpenError`

`closeOfflineDb()` の責務:

- キャッシュ済みDB接続を閉じる
- Promiseキャッシュをクリアする
- DBが開かれていない場合は何もしない
- open失敗中やreject済みPromiseでも追加エラーを出さない

### 5. IndexedDB確認パネル

追加済み:

- `src/app/settings/offline-db-check-panel.tsx`

実装済み:

- client component として分離
- 「IndexedDBを確認」ボタン
- ボタン押下時だけ `openOfflineDb()` を実行
- 成功時に最小診断情報を表示
- 失敗時に最小エラー情報を表示
- 確認後に `closeOfflineDb()` を呼ぶ
- 確認中はボタンを disabled
- `IDBDatabase` オブジェクトはReact stateに保存しない

成功時に表示する情報:

- DB名
- DB version
- object store数
- 確認日時

失敗時に表示する情報:

- error name
- message
- 確認日時

表示しない情報:

- Drive fileId
- access token
- Authorization header
- object URL
- Drive API URL
- store内容
- Drive由来metadata
- Blob本体

### 6. `/settings` への差し込み

変更済み:

- `src/app/settings/page.tsx`

実装内容:

- `OfflineDbCheckPanel` を import
- `<DriveSettingsPanel />` の下に `<OfflineDbCheckPanel />` を追加
- `/settings/page.tsx` 全体は client component 化していない

配置意図:

- Google / Drive状態とは独立した「オフライン再生準備」セクション
- `/player` には診断UIを出さない
- `/admin` にはまだ同期UIを混ぜない

## 変更ファイル

今回の一連の変更で追加・更新した主なファイル:

- `docs/decisions/goal-04-5-offline-sync-indexeddb.md`
- `src/lib/offline-schema.ts`
- `src/lib/offline-db.ts`
- `src/app/settings/offline-db-check-panel.tsx`
- `src/app/settings/page.tsx`

このhandoff追加では、以下の新規ファイルのみを追加する。

- `docs/handoffs/2026-06-06-goal-04-5-indexeddb-check-panel-handoff.md`

## object store 設計

作成対象store:

| store | keyPath | 役割 |
|---|---|---|
| `offlineProjects` | `projectId` | 確定済みproject情報、slides[] |
| `offlineAssets` | `assetId` | 確定済みasset metadata |
| `offlineAssetBlobs` | `assetId` | 確定済み画像Blob |
| `offlineSyncState` | `projectId` | project単位の同期状態 |
| `offlineStagingProjects` | `stagingId` | 同期中project |
| `offlineStagingAssets` | `stagingId` | 同期中asset metadata |
| `offlineStagingAssetBlobs` | `stagingId` | 同期中画像Blob |

現時点では index 作成はしていない。

理由:

- まだ読み書き関数がない
- staging cleanup 実装時に `syncRunId` index の必要性を改めて判断する
- 初期wrapperはDB openとstore作成だけに限定する

## 意図的に含めなかったこと

今回の範囲では、以下は実装していない。

- IndexedDB read関数
- IndexedDB write関数
- delete関数
- transaction helper
- staging保存関数
- staging検証関数
- 確定store昇格関数
- staging cleanup
- index作成
- DriveからIndexedDBへの同期処理
- `/player` のIndexedDB読み取り
- `/player` のオフライン再生切り替え
- `/admin` の同期開始UI
- 同期進捗UI
- 容量不足UI
- 再同期UI
- rollback UI
- 競合merge UI
- Service Worker
- オフライン本番再生エンジン

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
- `/player` にIndexedDB診断UIを出さない
- `/settings/page.tsx` 全体をclient component化しない

## 検証

各パッチで以下を実行し、成功を確認済み。

~~~zsh
git diff --check
npm run lint
npm run build
~~~

直近の確認では、以下も成功済み。

~~~zsh
git diff -- src/lib/offline-db.ts src/app/settings/page.tsx
git diff --no-index /dev/null src/app/settings/offline-db-check-panel.tsx
git diff --check
npm run lint
npm run build
~~~

確認結果:

- `git diff --check` 成功
- `npm run lint` 成功
- `npm run build` 成功
- Next.js build 成功
- `/settings` の static generation 成功
- lint error なし
- TypeScript error なし

デプロイ:

- GitHub Desktop で commit
- GitHub Desktop で push
- GitHub Actions deploy 完了

## 手動確認ポイント

確認対象:

- `/settings` に「オフライン再生準備」セクションが表示される
- `/settings` を開いただけでは IndexedDB 確認は走らない
- 「IndexedDBを確認」ボタンを押すと確認が始まる
- 確認中はボタンが disabled になる
- 成功時にDB名、DB version、object store数、確認日時だけが表示される
- 失敗時にerror name、message、確認日時だけが表示される
- access token、Drive fileId、object URL、Drive API URL が表示されない
- `/player` の表示・手動送り・caption・スワイプ・自動送りに影響がない
- `/admin` に影響がない

## 今後の注意点

`openOfflineDb()` と確認導線は追加済みだが、まだIndexedDBへの実データ保存はしていない。

次に進む場合も、いきなりDrive同期全体へ進まないこと。

推奨順序:

1. 確定storeの最小読み取り関数設計
2. 確定storeの最小書き込み関数設計
3. transaction helper 設計
4. staging保存関数設計
5. staging検証関数設計
6. 確定store昇格設計
7. staging cleanup設計
8. Drive project 1件同期処理設計
9. `/player` IndexedDB読み取り設計
10. `/player` offline再生切り替え設計

特に注意すべき点:

- `offlineSyncState.status = "ready"` は安易に設定しない
- staging中データを `/player` の本番再生元にしない
- BlobをReact stateに保存しない
- object URL cleanupを必ず設計する
- Drive Blob直接再生前提で本番再生エンジンを作り込みすぎない

## 次の候補

次の候補:

1. 第4-5 IndexedDB 確定storeの最小読み取り関数設計
2. 第4-5 IndexedDB 確定storeの最小書き込み関数設計
3. 第4-5 transaction helper 設計
4. 第4-5 staging保存 / 検証 / 昇格設計

推奨:

次は、IndexedDBの読み書き関数へ進む前に、transaction helper の責務を先にグリルするのがよい。

理由:

- IndexedDBの読み書きは transaction が基本になる
- 後からtransaction helperを入れると、先に作った読み書き関数を直す可能性がある
- staging検証や確定store昇格は複数storeを扱うため、transaction設計を先に固定した方が後戻りが少ない
