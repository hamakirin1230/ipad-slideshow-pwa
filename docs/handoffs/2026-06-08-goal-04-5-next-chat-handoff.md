# Goal 04-5 next chat handoff

Date: 2026-06-08

## 現在の位置づけ

この handoff は、Goal 04-5 の staging pipeline 実装完了後、次チャットへ引き継ぐためのものです。

Goal 04-5 では、Drive API や UI 接続にはまだ入らず、IndexedDB 内部の staging pipeline を中心に実装した。

現在、以下の流れは実装済み。

```txt
staging read
-> staging validation
-> validation failure classification
-> confirmed store promotion
-> obsolete confirmed asset/blob deletion
-> offlineSyncState ready / failed / corrupt 更新
-> staging cleanup
-> stale-sync-run handling
-> precondition error handling
```

詳細は次の handoff を参照すること。

```txt
docs/handoffs/2026-06-08-goal-04-5-staging-pipeline-completion-handoff.md
```

## 直近で完了したこと

Goal 04-5 では、以下を実装済み。

```txt
- staging cleanup helper
- staging cleanup helper transaction reuse
- staging read helper
- staging read helper transaction reuse
- staging validation rules
- staging validation integration helper
- staging validation integration transaction reuse
- validation failure classification helper
- staging promotion helper
- obsolete confirmed asset/blob deletion
- promotion helper transaction reuse
- offlineSyncState ready helper
- offlineSyncState failed / corrupt transaction helpers
- promotion orchestration helper
- promotion success path cleanup
- validation failure -> failed / corrupt state update
- promotion / cleanup failure -> failed fallback
- stale-sync-run result normalization
- orchestration precondition error handling
```

各ステップで次を確認済み。

```bash
npm run lint
npm run build
git diff --check
```

各ステップは GitHub Desktop で Commit -> Push 済み。

GitHub Actions deploy も完了済み。

## 主要な実装ファイル

```txt
src/lib/offline-staging-read.ts
src/lib/offline-staging-validation.ts
src/lib/offline-staging-validation-integration.ts
src/lib/offline-staging-validation-failure-classification.ts
src/lib/offline-staging-promotion.ts
src/lib/offline-staging-cleanup.ts
src/lib/offline-sync-state.ts
src/lib/offline-staging-promotion-orchestration.ts
```

## 最終的な内部入口

現在の staging pipeline の主要入口はこれ。

```ts
promoteOfflineStagingForSyncRun(args)
```

場所:

```txt
src/lib/offline-staging-promotion-orchestration.ts
```

入力:

```ts
export type PromoteOfflineStagingForSyncRunArgs = {
  projectId: string;
  syncRunId: string;
  readyAt: IsoDateTimeString;
  failedAt: IsoDateTimeString;
  context: OfflineSyncStateContext;
};
```

この helper は、すでに staging records が IndexedDB の staging stores に書き込まれている前提で動く。

この helper は Drive API を呼ばない。

この helper は UI から直接呼ぶ最終 API ではなく、今後作る上位同期 orchestration から呼ぶ内部 helper として扱う。

## 現在の成功経路

成功経路は、概ね次の流れ。

```txt
runOfflineTransaction(readwrite)
  -> staging records を syncRunId で読む
  -> staging validation
  -> validated projectId と args.projectId の一致確認
  -> offlineSyncState を ready に更新
  -> obsolete confirmed asset/blob を削除
  -> staging records を confirmed stores に昇格
  -> 指定 syncRunId の staging records を cleanup
  -> ok:true を返す
```

成功時の戻り値:

```ts
{
  ok: true;
  promotion: PromoteOfflineStagingResult;
  cleanup: ClearOfflineStagingResult;
  syncStateUpdate: { updated: true };
}
```

## validation failure 経路

validation failure 時は、validation reason を分類する。

現在の分類はすべて `corrupt`。

```ts
classifyOfflineStagingValidationFailure(reason)
```

validation failure 時の流れ:

```txt
staging read
-> staging validation
-> validation reason を corrupt に分類
-> markOfflineStoreCorruptInTransaction(...)
-> ok:false / reason:"validation-failed" を返す
```

戻り値:

```ts
{
  ok: false;
  reason: "validation-failed";
  validationReason: OfflineStagingValidationFailureReason;
  validationClassification: "corrupt";
  syncStateUpdate: { updated: true };
}
```

## stale-sync-run handling

offlineSyncState 更新時、既存 state の `syncRunId` が現在の `syncRunId` と異なる場合は stale とする。

```txt
previous.syncRunId !== args.syncRunId
-> { updated: false, reason: "stale-sync-run" }
```

orchestration helper は、state update helper から stale が返った場合、常に次の戻り値へ寄せる。

```ts
{
  ok: false;
  reason: "stale-sync-run";
}
```

これにより、上位層は stale を一貫して「古い同期実行結果なので無視可能」と扱える。

## promotion / cleanup failure 経路

promotion / cleanup / transaction 中に throw した場合、transaction は abort される。

その後、別 transaction で `markOfflineSyncFailed(...)` を呼び、失敗を記録する。

戻り値:

```ts
{
  ok: false;
  reason: "promotion-or-cleanup-failed";
  syncStateUpdate: { updated: true };
}
```

ただし、failed 更新時に stale-sync-run が返った場合は、最終戻り値も stale-sync-run に寄せる。

## precondition error handling

呼び出し側バグは offlineSyncState の failed / corrupt に変換しない。

対象:

```txt
projectId が空文字
projectId に前後空白がある
syncRunId が空文字
syncRunId に前後空白がある
validated staging projectId と args.projectId が一致しない
```

これらは `OfflineStagingPromotionPreconditionError` として throw される。

この error は orchestration helper 内の catch で握りつぶさず、再 throw する。

理由:

```txt
これらは staging data の不整合ではなく、呼び出し側の接続ミスまたは内部IDの扱いミスだから。
```

## confirmed store promotion

promotion helper は次を行う。

```txt
- staging project を offlineProjects に put
- staging assets を offlineAssets に put
- staging asset blob records を offlineAssetBlobs に put
- stagingId / syncRunId は confirmed records に保存しない
```

対象ファイル:

```txt
src/lib/offline-staging-promotion.ts
```

公開関数:

```ts
promoteValidatedOfflineStagingToConfirmedStores(validatedStaging)
promoteValidatedOfflineStagingToConfirmedStoresInTransaction(stores, validatedStaging)
```

## obsolete confirmed asset/blob deletion

promotion helper は、同じ projectId の古い confirmed asset / blob を削除する。

削除対象:

```txt
offlineAssets
offlineAssetBlobs
```

削除ルール:

```txt
confirmed record の projectId が今回の projectId と一致する
かつ
confirmed record の assetId が今回の staging records に存在しない
-> 削除
```

削除しないもの:

```txt
offlineProjects
他 projectId の records
```

## cleanup

promotion 成功後、同じ transaction 内で staging cleanup を実行する。

対象:

```txt
offlineStagingProjects
offlineStagingAssets
offlineStagingAssetBlobs
```

条件:

```txt
record.syncRunId === args.syncRunId
```

公開関数:

```ts
clearOfflineStagingBySyncRunId(syncRunId)
clearOfflineStagingBySyncRunIdInTransaction(stores, syncRunId)
```

## offlineSyncState

`offline-sync-state.ts` には、外部向け helper と transaction 内 helper の両方がある。

外部向け:

```ts
markOfflineSyncing(args)
markOfflineSyncReady(args)
markOfflineSyncFailed(args)
markOfflineStoreCorrupt(args)
```

transaction 内:

```ts
markOfflineSyncReadyInTransaction(stores, args)
markOfflineSyncFailedInTransaction(stores, args)
markOfflineStoreCorruptInTransaction(stores, args)
```

corrupt 維持方針:

```txt
previous.status === "corrupt" の場合、
syncing / ready / failed へ勝手に戻さない。
```

corrupt 解除は、別途明示的な recovery strategy が必要。

## まだ未実装のもの

Goal 04-5 では次はまだ実装していない。

```txt
Drive API 呼び出し
Drive 取得データから staging records への書き込み
上位同期 orchestration
UI 接続
user-facing error 表示
diagnostics 出力
retry policy
実機 IndexedDB 動作確認
```

## 次チャットで最初に進めるべきこと

次チャットでは、いきなり UI に接続しない。

まず次を設計する。

```txt
Goal 04-6 Drive fetch -> staging write -> staging promotion orchestration strategy
```

最初に詰めるべき論点:

```txt
Drive API 取得結果を、どの単位で staging records に書き込むか。
```

具体的には、次の既存 pipeline に入る前段を設計する。

```txt
Drive API
-> workspace/index/manifest/assets 取得
-> staging write
-> promoteOfflineStagingForSyncRun(args)
```

## 次に設計すべき主な論点

```txt
- syncRunId をどこで生成するか
- projectId をどこで確定するか
- Drive 取得結果から staging project / assets / asset blob records をどう作るか
- staging write helper を新規に作るか
- staging write を1 transaction にするか
- asset blob 取得失敗時に staging を incomplete のまま残すか
- staging write 成功後すぐ promoteOfflineStagingForSyncRun を呼ぶか
- Drive API 失敗を offlineSyncState failed にする層はどこか
- markOfflineSyncing をいつ呼ぶか
- 古い syncRunId の staging cleanup をいつ行うか
```

## 次チャットでまだ避けるべきこと

次チャット冒頭では、次をまだやらない。

```txt
UI 接続
ボタン実装
user-facing error copy
大きな diagnostics 仕様
retry policy
実機 IndexedDB デバッグ
```

まずは、Drive fetch から staging write までの責務境界を設計する。

## 推奨する次の作業順

```txt
1. 現在の Goal 04-5 staging pipeline completion handoff を読む
2. 現在の offline-staging-promotion-orchestration.ts を確認する
3. Drive fetch -> staging write の責務境界を設計する
4. staging write helper の型を設計する
5. staging write helper を実装する
6. staging write -> promoteOfflineStagingForSyncRun を接続する上位 orchestration helper を設計する
7. その後に UI 接続へ進む
```

## 確認済み

直近の各実装ステップで次を確認済み。

```bash
npm run lint
npm run build
git diff --check
```

GitHub Desktop で Commit -> Push 済み。

GitHub Actions deploy 完了済み。
