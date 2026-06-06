# Goal 04-5 Handoff: IndexedDB transaction helper

作成日: 2026-06-06

## ステータス

Goal 04-5 の IndexedDB transaction helper 追加まで完了。

`src/lib/offline-db.ts` に、IndexedDBの低レイヤー共通部品として以下を追加した。

- `OfflineTransactionMode`
- `requestToPromise<T>()`
- `runOfflineTransaction<T>()`

GitHub Actions deploy 完了済み。

## 完了したこと

### 1. transaction mode 型の追加

追加済み:

- `OfflineTransactionMode`

定義:

~~~ts
export type OfflineTransactionMode = "readonly" | "readwrite";
~~~

意図:

- 通常の読み書きtransactionだけを許可する
- `versionchange` は通常helperから扱わせない
- DB upgrade は `openOfflineDb()` の `onupgradeneeded` の責務として分離する

## 2. IDBRequest Promise変換 helper

追加済み:

- `requestToPromise<T>(request: IDBRequest<T>): Promise<T>`

役割:

- IndexedDBの `IDBRequest` を `Promise` として扱えるようにする
- `store.get(...)`、`store.put(...)`、`store.delete(...)` などの結果を `await` できるようにする

挙動:

- `request.onsuccess` で `request.result` を `resolve`
- `request.onerror` で `request.error` を `reject`
- `request.error` がない場合は通常の `Error` を返す

意図:

- `onsuccess` / `onerror` の手書きを各読み書き関数に散らさない
- 後続の store別読み書き関数で共通利用する

## 3. transaction helper

追加済み:

- `runOfflineTransaction<T>(...)`

役割:

- `openOfflineDb()` を呼ぶ
- 指定storeで transaction を作る
- callbackに `transaction` と `stores` を渡す
- callbackの戻り値を保持する
- transaction完了後にcallback戻り値を返す
- transaction失敗時はrejectする
- 最後に `closeOfflineDb()` を呼ぶ

## runOfflineTransaction の仕様

### 入力

- `storeNames: string[]`
- `mode: OfflineTransactionMode`
- `callback`

callback に渡すもの:

- `transaction: IDBTransaction`
- `stores: Record<string, IDBObjectStore>`

### storeNames の扱い

`storeNames` が空の場合:

- 即座に `Error` をthrowする

`storeNames` に重複がある場合:

- `Array.from(new Set(storeNames))` で重複排除する

重複排除後のstore名配列を、以下の両方に使う。

- `db.transaction(...)`
- callbackへ渡す `stores` の生成

理由:

- 実際に開いたstoreとcallbackに渡すstoreを一致させるため
- 空transactionを許可しないため
- 重複store指定による曖昧さを避けるため

## transaction完了待ち

`runOfflineTransaction()` は、callbackが完了しただけでは成功扱いにしない。

流れ:

1. `openOfflineDb()` でDBを開く
2. transactionを作成する
3. callback実行前に `oncomplete` / `onerror` / `onabort` を設定する
4. `stores` を作る
5. callbackを実行する
6. callback戻り値を保持する
7. `transaction.oncomplete` を待つ
8. transaction完了後にcallback戻り値を返す
9. 最後に `closeOfflineDb()` を呼ぶ

理由:

- callback終了時点では、IndexedDB側の保存・削除がまだ確定していない場合があるため
- write処理で「関数は成功したが保存は失敗した」という状態を避けるため

## transaction失敗時の扱い

### transaction.onerror

`transaction.error` があればそれをrejectする。

`transaction.error` がない場合は、通常の `Error` をrejectする。

### transaction.onabort

`transaction.error` があればそれをrejectする。

`transaction.error` がない場合は、通常の `Error` をrejectする。

### callback例外

callback内で例外が出た場合:

- `transaction.abort()` を試みる
- abort失敗は握りつぶす
- transaction側のAbortErrorではなく、元のcallback例外を優先してthrowする
- `transactionDone.catch(...)` で未処理rejectを避ける

理由:

- 本当の失敗理由を隠さないため
- staging検証や確定store昇格で、検証失敗理由を上位へ残すため
- abortによる汎用エラーで元の原因を潰さないため

## DB接続の扱い

`runOfflineTransaction()` は、helper側でDB接続を管理する。

実施すること:

- 内部で `openOfflineDb()` を呼ぶ
- `finally` で `closeOfflineDb()` を呼ぶ
- `closeOfflineDb()` の失敗は握りつぶす

意図:

- 呼び出し側にDB接続のopen / closeを意識させない
- close忘れを防ぐ
- close失敗でtransaction本体の成功・失敗結果を上書きしない

## callback内でやってはいけないこと

transaction callback 内では、Drive fetch などの長い非IndexedDB処理を待たない。

避けるべきもの:

- Drive API fetch
- Photos API fetch
- 画像Blobダウンロード
- タイマー待ち
- ユーザー操作待ち
- その他の長い外部処理

理由:

IndexedDB transaction は、request が発行されない状態が続くと自動的に完了・終了することがある。  
callback内で長い外部処理を `await` すると、戻ってきた時点で transaction が inactive になっている可能性がある。

正しい方針:

1. DriveやPhotosから必要データを先に取得する
2. Blobやmetadataを先に組み立てる
3. その後、短いtransaction内でIndexedDB requestを発行する
4. transaction内ではIndexedDB requestだけを扱う

## 意図的に含めなかったこと

今回のtransaction helperパッチでは、以下は実装していない。

- store別読み書き関数
- `getOfflineProject()`
- `putOfflineProject()`
- `getOfflineAsset()`
- `putOfflineAsset()`
- Blob保存関数
- Blob読み取り関数
- `offlineSyncState` 読み書き関数
- staging保存関数
- staging検証関数
- 確定store昇格関数
- staging cleanup
- transaction専用Error class
- index作成
- Drive同期処理
- `/settings` 変更
- `/player` 変更
- `/admin` 変更

## 変更ファイル

transaction helper パッチで変更したファイル:

- `src/lib/offline-db.ts`

今回のhandoff追加で追加するファイル:

- `docs/handoffs/2026-06-06-goal-04-5-transaction-helper-handoff.md`

## 現在の IndexedDB 基盤構成

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

## 検証

transaction helper パッチでは、以下を実行し成功を確認済み。

~~~zsh
git diff -- src/lib/offline-db.ts
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

## 今後の推奨順序

次に進む場合も、いきなりDrive同期全体へ進まない。

推奨順序:

1. 確定storeの最小読み取り関数設計
2. 確定storeの最小書き込み関数設計
3. `offlineSyncState` 読み書き設計
4. staging保存関数設計
5. staging検証関数設計
6. 確定store昇格設計
7. staging cleanup設計
8. Drive project 1件同期処理設計
9. `/player` IndexedDB読み取り設計
10. `/player` offline再生切り替え設計

## 次の候補

次の候補:

1. 第4-5 確定storeの最小読み取り関数設計
2. 第4-5 確定storeの最小書き込み関数設計
3. 第4-5 `offlineSyncState` 読み書き設計
4. 第4-5 staging保存 / 検証 / 昇格設計

推奨:

次は **確定storeの最小読み取り関数設計** から入るのがよい。

理由:

- 読み取りは書き込みより副作用が少ない
- `runOfflineTransaction()` と `requestToPromise()` の使い勝手を小さく確認できる
- `/player` の将来オフライン読み取りに直結する
- いきなり書き込みやstaging昇格に進むより安全
