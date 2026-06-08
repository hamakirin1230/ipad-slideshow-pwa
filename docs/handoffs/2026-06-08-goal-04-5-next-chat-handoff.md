# Goal 04-5 next chat handoff

Date: 2026-06-08

## Purpose

This handoff is for continuing the iPad slideshow PWA project in a new ChatGPT chat.

The current workstream is Goal 04-5: IndexedDB / offline playback staging pipeline.

The next recommended topic is:

```txt
Goal 04-5 staging validation integration strategy
```

Do not start with implementation immediately. Continue with design grilling first.

## Current completed state

The following Goal 04-5 items are complete and pushed.

```txt
- offlineSyncState transition helpers
- offlineSyncState transition helpers handoff
- staging store write helpers
- staging store write helpers handoff
- staging cleanup helper
- staging cleanup helper handoff
- staging read helper
- staging read helper handoff
- staging validation rules
- staging validation rules handoff
```

GitHub Desktop Commit -> Push completed.
GitHub Actions deploy completed.

## Recently added implementation files

```txt
src/lib/offline-staging-cleanup.ts
src/lib/offline-staging-read.ts
src/lib/offline-staging-validation.ts
```

## Recently added handoff files

```txt
docs/handoffs/2026-06-08-goal-04-5-staging-cleanup-helper-handoff.md
docs/handoffs/2026-06-08-goal-04-5-staging-read-helper-handoff.md
docs/handoffs/2026-06-08-goal-04-5-staging-validation-rules-handoff.md
```

## staging cleanup helper summary

Added:

```ts
ClearOfflineStagingResult
clearOfflineStagingBySyncRunId(syncRunId)
```

Responsibility:

```txt
指定 syncRunId に一致する staging records だけを削除する。
```

Target stores only:

```txt
offlineStagingAssetBlobs
offlineStagingAssets
offlineStagingProjects
```

Delete order:

```txt
offlineStagingAssetBlobs
offlineStagingAssets
offlineStagingProjects
```

Safety boundaries:

```txt
- 確定storeは触らない
- offlineSyncState は触らない
- ready / failed / corrupt は更新しない
- record.syncRunId === syncRunId のものだけ削除
- syncRunId 欠落・想定外レコードは残す
- cursor.delete() 成功後に件数加算
- Promise.all で並列化しない
- IndexedDB version upgrade / syncRunId index 追加は含めない
```

## staging read helper summary

Added:

```ts
OfflineStagingRecordsForSyncRun
getOfflineStagingRecordsBySyncRunId(syncRunId)
```

Return type:

```ts
type OfflineStagingRecordsForSyncRun = {
  projects: OfflineStagingProject[];
  assets: OfflineStagingAsset[];
  assetBlobRecords: OfflineStagingAssetBlobRecord[];
};
```

Responsibility:

```txt
指定 syncRunId に一致する staging project / asset / asset blob record を収集する。
```

Target stores only:

```txt
offlineStagingProjects
offlineStagingAssets
offlineStagingAssetBlobs
```

Read order:

```txt
offlineStagingProjects
offlineStagingAssets
offlineStagingAssetBlobs
```

Safety boundaries:

```txt
- readonly transaction で読む
- 確定storeは触らない
- offlineSyncState は触らない
- cleanup helper は呼ばない
- validation 判定はしない
- record.syncRunId === syncRunId のものだけ収集
- syncRunId 欠落・想定外レコードは無視
- cursor scan error は空配列にせず reject
- Promise.all で並列化しない
- 返却配列の意味上の順序は保証しない
- Blob record は返すが UI / diagnostics 用には使わない
```

## staging validation rules summary

Added:

```ts
OfflineStagingValidationFailureReason
OfflineStagingValidationResult
validateOfflineStagingRecordsForSyncRun(records)
```

Failure reasons are limited to:

```ts
type OfflineStagingValidationFailureReason =
  | "missing-project"
  | "multiple-projects"
  | "schema-version-mismatch"
  | "duplicate-asset"
  | "duplicate-asset-blob"
  | "missing-asset"
  | "unexpected-asset"
  | "missing-asset-blob"
  | "unexpected-asset-blob";
```

Result type:

```ts
type OfflineStagingValidationResult =
  | { ok: true }
  | { ok: false; reason: OfflineStagingValidationFailureReason };
```

Validation rule order:

```txt
1. projects.length === 1
   - 0件: missing-project
   - 2件以上: multiple-projects

2. project / assets / assetBlobRecords の schemaVersion を確認
   - どれか OFFLINE_SCHEMA_VERSION と不一致: schema-version-mismatch

3. staging assets の assetId 重複を確認
   - 重複あり: duplicate-asset

4. staging asset blob records の assetId 重複を確認
   - 重複あり: duplicate-asset-blob

5. project.slides から requiredAssetIds を Set で作る
   - requiredAssetIds にあるが assets にない: missing-asset
   - assets にあるが requiredAssetIds にない: unexpected-asset

6. staging assets の assetId 集合を基準に blob records を確認
   - assets にあるが blob records にない: missing-asset-blob
   - blob records にあるが assets にない: unexpected-asset-blob

7. すべて通れば { ok: true }
```

Validation safety boundaries:

```txt
- 同期関数
- IndexedDB を読まない
- Drive API を呼ばない
- cleanup helper を呼ばない
- 確定storeへ昇格しない
- offlineSyncState を更新しない
- ready / failed / corrupt を更新しない
- failed / corrupt への分類をしない
- Blob 本体の存在 / size / type / decode 検査はしない
- assetId / stagingId / projectId / Blob情報を result に含めない
- 複数 failure reason は返さない
- 最初の failure 1件だけ返す
- 入力 records を mutate しない
- project.slides の assetId 重複は許可し Set 化する
- project.slides.length === 0 自体は failure にしない
```

## Important current design boundary

Do not create the `ready` success path yet.

`ready` should only be added after both of the following are designed:

```txt
- staging validation integration strategy
- staging -> confirmed store promotion strategy
```

The confirmed stores are still protected from staging cleanup/read/validation helpers.

Confirmed stores:

```txt
offlineProjects
offlineAssets
offlineAssetBlobs
offlineSyncState
```

## Next recommended design grill

Next topic:

```txt
Goal 04-5 staging validation integration strategy
```

Start by grilling the integration boundaries. Suggested first decisions:

```txt
1. Whether to create a new integration helper file.
2. Whether the integration helper should read staging by syncRunId and call validation.
3. Whether validation failure should call markOfflineSyncFailed immediately or only return a result.
4. Whether cleanup should run automatically on validation failure or be left to the orchestration layer.
5. Whether failed / corrupt classification belongs in integration or later orchestration.
6. Whether the integration result should include validation reason only, or also cleanup result.
7. Whether the integration helper should remain separate from promotion.
8. Whether confirmed store promotion should be a separate future helper.
```

Recommended initial position:

```txt
Create a separate integration strategy, but do not implement yet.

The integration should probably compose:
- getOfflineStagingRecordsBySyncRunId(syncRunId)
- validateOfflineStagingRecordsForSyncRun(records)

But it should not yet:
- promote to confirmed stores
- set ready
- update offlineSyncState
- call cleanup automatically
- classify failed vs corrupt
```

Rationale:

```txt
The current helpers are intentionally narrow:
- read collects staging records
- validation judges records
- cleanup removes staging records

The next layer should decide how those pieces are composed, but should not collapse validation, cleanup, promotion, and state transition into one oversized helper.
```

## New chat start prompt

Use this prompt at the beginning of the next chat:

```txt
このチャットは、iPad用スライドショーPWA制作プロジェクト（ipad-slideshow-pwa）の続きです。

まず docs/handoffs/2026-06-08-goal-04-5-next-chat-handoff.md を読んでください。

直近では Goal 04-5 の staging cleanup helper / staging read helper / staging validation rules と各 handoff まで完了し、GitHub Desktop Commit -> Push、GitHub Actions deploy まで完了しています。

次は Goal 04-5 staging validation integration strategy の設計グリルから進めてください。

まだ実装には入らず、ready 成功経路、確定store昇格、offlineSyncState 更新、cleanup 自動実行は作らない前提で、read helper と validation rules をどう接続するかから1問ずつ詰めてください。
```

## Verification convention

For each implementation or handoff commit, continue using:

```bash
npm run lint
npm run build
git diff --check
```

Do not commit if `git diff --check` fails, even if lint/build pass.

## Commit message suggestion for this handoff

```txt
Add next chat handoff for staging validation integration
```
