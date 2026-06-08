# Goal 04-5 staging pipeline completion handoff

Date: 2026-06-08

## 目的

この handoff は、Goal 04-5 で実装した offline staging pipeline の完了内容をまとめるためのものです。

Goal 04-5 では、Drive API や UI 接続にはまだ入らず、IndexedDB 上の staging records を検証し、confirmed stores へ昇格し、offlineSyncState を更新し、不要な staging records を cleanup する内部 pipeline を整備した。

## 実装済みの主な流れ

現在の staging pipeline は、概ね次の流れになっている。

```txt
staging read
-> staging validation
-> validation failure classification
-> confirmed store promotion
-> obsolete confirmed asset/blob deletion
-> ready / failed / corrupt sync state update
-> staging cleanup
-> stale-sync-run handling
-> precondition error handling
```

このうち、最終的な接続点は次の helper。

```txt
src/lib/offline-staging-promotion-orchestration.ts
```

主な公開関数:

```ts
promoteOfflineStagingForSyncRun(args)
```

## 追加・更新した主要ファイル

```txt
src/lib/offline-staging-read.ts
src/lib/offline-staging-validation-integration.ts
src/lib/offline-staging-validation-failure-classification.ts
src/lib/offline-staging-promotion.ts
src/lib/offline-staging-cleanup.ts
src/lib/offline-sync-state.ts
src/lib/offline-staging-promotion-orchestration.ts
```

## staging read helper

ファイル:

```txt
src/lib/offline-staging-read.ts
```

役割:

```txt
指定 syncRunId に一致する staging project / assets / asset blob records を読み取る。
```

追加済みの transaction helper:

```ts
getOfflineStagingRecordsBySyncRunIdInTransaction(stores, syncRunId)
```

既存の外部向け helper も維持している。

```ts
getOfflineStagingRecordsBySyncRunId(syncRunId)
```

この変更により、orchestration helper は staging read を外側の readwrite transaction 内で実行できるようになった。

## staging validation integration helper

ファイル:

```txt
src/lib/offline-staging-validation-integration.ts
```

役割:

```txt
staging records を読み取り、validation rules に渡し、後続の promotion が使える形で result を返す。
```

追加済みの transaction helper:

```ts
validateOfflineStagingForSyncRunInTransaction(stores, syncRunId)
```

既存の外部向け helper も維持している。

```ts
validateOfflineStagingForSyncRun(syncRunId)
```

戻り値は `ok: true / false` の discriminated union。

成功時:

```ts
{
  ok: true;
  records: OfflineStagingRecordsForSyncRun;
  project: OfflineStagingProject;
  validation: { ok: true };
}
```

失敗時:

```ts
{
  ok: false;
  records: OfflineStagingRecordsForSyncRun;
  validation: {
    ok: false;
    reason: OfflineStagingValidationFailureReason;
  };
}
```

`records` には Blob を含む staging asset blob records が含まれるため、UI / diagnostics / console log には流さない前提。

## validation failure classification

ファイル:

```txt
src/lib/offline-staging-validation-failure-classification.ts
```

役割:

```txt
staging validation failure reason を offlineSyncState の failed / corrupt に分類する。
```

公開関数:

```ts
classifyOfflineStagingValidationFailure(reason)
```

現在の分類方針:

```txt
すべて corrupt
```

理由:

validation failure は、Drive API の一時失敗ではなく、IndexedDB staging records 内の整合性崩れを表すため。

対象例:

```txt
missing-project
multiple-projects
schema-version-mismatch
duplicate-asset
duplicate-asset-blob
missing-asset
unexpected-asset
missing-asset-blob
unexpected-asset-blob
```

## promotion helper

ファイル:

```txt
src/lib/offline-staging-promotion.ts
```

役割:

```txt
validation 済み staging records を confirmed stores へ昇格する。
```

公開関数:

```ts
promoteValidatedOfflineStagingToConfirmedStores(validatedStaging)
promoteValidatedOfflineStagingToConfirmedStoresInTransaction(stores, validatedStaging)
```

confirmed stores への書き込み対象:

```txt
offlineAssetBlobs
offlineAssets
offlineProjects
```

staging records から confirmed records へ変換する際、staging 専用 field は保存しない。

```txt
stagingId
syncRunId
```

## obsolete confirmed asset / blob deletion

promotion helper では、同じ projectId の古い confirmed asset / blob を削除する。

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

削除しない対象:

```txt
offlineProjects
他 projectId の records
```

理由:

`offlineProjects` は projectId で put されるため、今回の helper では project store の削除差分までは扱わない。

## cleanup helper

ファイル:

```txt
src/lib/offline-staging-cleanup.ts
```

役割:

```txt
指定 syncRunId の staging project / assets / asset blob records を削除する。
```

公開関数:

```ts
clearOfflineStagingBySyncRunId(syncRunId)
clearOfflineStagingBySyncRunIdInTransaction(stores, syncRunId)
```

transaction helper を追加したことで、orchestration helper が promotion 成功後に同一 transaction 内で cleanup できるようになった。

## offline sync state helper

ファイル:

```txt
src/lib/offline-sync-state.ts
```

役割:

```txt
offlineSyncState を syncing / ready / failed / corrupt に更新する。
```

追加・整理済みの transaction helper:

```ts
markOfflineSyncReadyInTransaction(stores, args)
markOfflineSyncFailedInTransaction(stores, args)
markOfflineStoreCorruptInTransaction(stores, args)
```

外部向け helper も維持している。

```ts
markOfflineSyncing(args)
markOfflineSyncReady(args)
markOfflineSyncFailed(args)
markOfflineStoreCorrupt(args)
```

stale 判定:

```txt
previous が存在し、previous.syncRunId !== args.syncRunId の場合
-> { updated: false, reason: "stale-sync-run" }
```

corrupt 維持方針:

```txt
previous.status === "corrupt" の場合、syncing / ready / failed へ勝手に戻さない。
```

## promotion orchestration helper

ファイル:

```txt
src/lib/offline-staging-promotion-orchestration.ts
```

公開関数:

```ts
promoteOfflineStagingForSyncRun(args)
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

戻り値:

```ts
export type PromoteOfflineStagingForSyncRunResult =
  | {
      ok: true;
      promotion: PromoteOfflineStagingResult;
      cleanup: ClearOfflineStagingResult;
      syncStateUpdate: Extract<OfflineSyncStateUpdateResult, { updated: true }>;
    }
  | {
      ok: false;
      reason: "validation-failed";
      validationReason: OfflineStagingValidationFailureReason;
      validationClassification: OfflineStagingValidationFailureClassification;
      syncStateUpdate: Extract<OfflineSyncStateUpdateResult, { updated: true }>;
    }
  | {
      ok: false;
      reason: "stale-sync-run";
    }
  | {
      ok: false;
      reason: "promotion-or-cleanup-failed";
      syncStateUpdate: Extract<OfflineSyncStateUpdateResult, { updated: true }>;
    };
```

現在の成功経路:

```txt
runOfflineTransaction(readwrite)
  -> staging read
  -> validation
  -> validated projectId と requested projectId の一致確認
  -> markOfflineSyncReadyInTransaction
  -> obsolete confirmed asset/blob deletion
  -> confirmed store promotion
  -> staging cleanup
```

validation failure 経路:

```txt
runOfflineTransaction(readwrite)
  -> staging read
  -> validation
  -> classify validation failure
  -> markOfflineStoreCorruptInTransaction または markOfflineSyncFailedInTransaction
  -> result を返す
```

promotion / cleanup / transaction failure 経路:

```txt
transaction abort
-> catch
-> markOfflineSyncFailed
-> result を返す
```

stale-sync-run の扱い:

```txt
offlineSyncState 更新 helper が stale-sync-run を返した場合、
orchestration result も { ok: false, reason: "stale-sync-run" } に寄せる。
```

## precondition error handling

`promoteOfflineStagingForSyncRun(args)` は、呼び出し側バグを offlineSyncState failure に変換しない。

precondition error 対象:

```txt
projectId が空文字
projectId に前後空白がある
syncRunId が空文字
syncRunId に前後空白がある
validated staging projectId と args.projectId が一致しない
```

これらは `OfflineStagingPromotionPreconditionError` として throw される。

理由:

これらは staging data の validation failure ではなく、呼び出し側の接続ミスまたは内部IDの扱いミスだから。

## transaction 方針

Goal 04-5 の最終形では、read / validation / state update / promotion / cleanup をできる限り同じ IndexedDB transaction に寄せた。

主な目的:

```txt
validation した staging records と promotion する staging records のズレを避ける
ready 更新と promotion の順序不整合を避ける
promotion 成功後の cleanup 失敗時に transaction abort できるようにする
stale-sync-run 判定後に古い syncRunId の confirmed records を書かない
```

## 現在まだやっていないこと

Goal 04-5 では、次はまだ接続していない。

```txt
Drive API 呼び出し
Drive 取得データから staging records への書き込み
UI 接続
user-facing error 表示
diagnostics 出力
retry policy
実機 IndexedDB 動作確認
```

## 今後の推奨順序

次に進めるなら、以下の順が妥当。

```txt
1. Drive API 取得 -> staging write helper への接続方針を設計
2. staging write -> promoteOfflineStagingForSyncRun の上位 orchestration を作る
3. 実機 IndexedDB で成功経路を確認
4. validation failure / stale-sync-run / promotion failure の手動確認
5. UI から同期実行できる導線を接続
6. user-facing error / diagnostics を最小限追加
```

## 検証

各実装ステップごとに以下を確認済み。

```bash
npm run lint
npm run build
git diff --check
```

各ステップは GitHub Desktop で Commit -> Push 済み。

GitHub Actions deploy も完了済み。
