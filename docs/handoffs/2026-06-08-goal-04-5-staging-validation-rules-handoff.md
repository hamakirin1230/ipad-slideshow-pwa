# Goal 04-5 staging validation rules handoff

Date: 2026-06-08

## Scope

Goal 04-5 の IndexedDB / オフライン再生基盤として、staging store から収集済みの project / asset / asset blob record 一式を、確定storeへ昇格可能な構造かどうか判定する validation rules を追加した。

今回の目的は、`getOfflineStagingRecordsBySyncRunId(syncRunId)` で集めた staging records を、同期オーケストレーション側が次工程へ進めてよいか判断できるようにすること。

今回の validation は、読み取り・cleanup・確定store昇格・`offlineSyncState` 更新は行わない。

## Added file

```txt
src/lib/offline-staging-validation.ts
```

## Added public API

```ts
validateOfflineStagingRecordsForSyncRun(records)
```

## Added types

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

type OfflineStagingValidationResult =
  | { ok: true }
  | { ok: false; reason: OfflineStagingValidationFailureReason };
```

Validation result には、`assetId` / `stagingId` / `projectId` / Blob情報 / raw error / 自由文 message は含めない。
返すのは `ok` と短い `reason` code だけ。

## Responsibility

`src/lib/offline-staging-validation.ts` は、収集済み staging records が構造的に昇格候補として成立しているかを判定することだけを担当する。

入力は read helper の結果型。

```ts
type OfflineStagingRecordsForSyncRun = {
  projects: OfflineStagingProject[];
  assets: OfflineStagingAsset[];
  assetBlobRecords: OfflineStagingAssetBlobRecord[];
};
```

この helper は `syncRunId` を受け取らない。
IndexedDB から読み取らない。
渡された records だけを見る。

## Rule order

Validation は次の順で実行する。
最初に見つかった failure 1件だけを返す。

```txt
1. projects.length === 1 を確認
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

## Project count rule

Staging validation の最上流前提は、対象 `syncRunId` 内に staging project がちょうど1件だけあること。

```txt
projects.length === 0
=> missing-project

projects.length > 1
=> multiple-projects

projects.length === 1
=> 次の rule へ進む
```

初期同期単位は現在の再生対象 project 1件である。
project が0件または複数件ある状態では、asset / blob の対応を見ても意味が曖昧になる。

## Schema version rule

`projects.length === 1` を確認した直後に、schemaVersion を確認する。

対象:

```txt
- staging project
- staging assets
- staging asset blob records
```

どれか1つでも現行 `OFFLINE_SCHEMA_VERSION` と一致しない場合:

```ts
{ ok: false, reason: "schema-version-mismatch" }
```

schemaVersion が違う record を asset / blob 対応チェックへ進めない。
古い schema の staging data を、現行コードで安全に解釈できるとは限らないため。

## Duplicate rules

不足・余剰判定の前に、assetId の重複を確認する。

```txt
staging assets に同じ assetId が複数ある
=> duplicate-asset

staging asset blob records に同じ assetId が複数ある
=> duplicate-asset-blob
```

重複がある状態では、後続の Set / Map 比較結果が信用しにくくなる。
先に一意性を確認する。

## Asset correspondence rule

Asset 検証では、staging assets 側を正としない。
1件の staging project の `slides` から必要な `assetId` 集合を作り、それを基準にする。

```txt
project.slides に必要な assetId がある
しかし staging assets に存在しない
=> missing-asset

staging assets に asset がある
しかし project.slides から要求されていない
=> unexpected-asset
```

`project.slides` 内の同一 `assetId` 重複は許可する。
同じ画像を複数 slide で使うことは自然なので、`Set` で一意化する。

```ts
const requiredAssetIds = new Set(project.slides.map((slide) => slide.assetId));
```

## Asset blob correspondence rule

Blob record 検証では、staging asset blob records 側を正としない。
staging assets の `assetId` 集合を基準にする。

```txt
staging assets に assetId がある
しかし staging asset blob records に対応する assetId がない
=> missing-asset-blob

staging asset blob records に assetId がある
しかし staging assets に対応する asset がない
=> unexpected-asset-blob
```

Blob record は asset の実体データなので、asset が必要と判断されたあとで、その asset に対応する blob record があるかを見る。

## Empty slides behavior

`project.slides.length === 0` 自体は validation failure にしない。

空 slides で `ok: true` になる条件:

```txt
projects: 1件
project.schemaVersion: 現行
assets: 0件
assetBlobRecords: 0件
```

空 slides に対して staging assets が存在する場合は `unexpected-asset`。
staging asset blob records が存在する場合は `unexpected-asset-blob`。

空 project を許可するかどうかは、Drive manifest validation や再生仕様側の責務であり、今回の staging validation rules には含めない。

## Blob handling

`OfflineStagingAssetBlobRecord` は `blob: Blob` を含むが、今回の validation rules では Blob 本体の内容検査は行わない。

含めない検査:

```txt
- blob instanceof Blob
- blob.size > 0
- blob.type と mimeType の一致
- 画像として decode できるか
```

今回見るのは、assetId の対応関係と schemaVersion まで。
Blob 内容検査は重く、Drive / Photos 取得時や保存時の検証とも責務が重なるため、別スコープとする。

## Result behavior

複数の failure が同時に存在しても、すべての reason は返さない。

```ts
{ ok: false, reason: "schema-version-mismatch" }
```

のように、定義した rule 順で最初に見つかった failure 1件だけを返す。

理由:

* 上流の前提が壊れている場合、下流の判定結果は信用しにくい
* 複数 reason を返すには全 rule を走らせる必要がある
* 初期実装では原因分類を単純に保つ

## Sync state classification

Validation rules は `failed` / `corrupt` への状態分類を行わない。

返すのは次のどちらかだけ。

```ts
{ ok: true }
```

または

```ts
{ ok: false, reason: "missing-asset-blob" }
```

この結果を受けて `markOfflineSyncFailed(...)` を呼ぶか、`markOfflineStoreCorrupt(...)` を呼ぶか、別の扱いにするかは、後続の同期オーケストレーション側で決める。

Staging の不整合は、多くの場合「今回の同期Runが不完全だった」という意味であり、即座に確定storeが壊れているとは限らない。

## Synchronous function

`validateOfflineStagingRecordsForSyncRun(records)` は同期関数。

```ts
export function validateOfflineStagingRecordsForSyncRun(
  records: OfflineStagingRecordsForSyncRun,
): OfflineStagingValidationResult
```

`Promise` は返さない。

理由:

* IndexedDB を読まない
* Drive API を呼ばない
* Blob decode をしない
* 入力済み配列だけを見て判定する

## Mutation policy

Validation function は入力 records を mutate しない。

やってよいこと:

```txt
- Set を作る
- Map を作る
- for...of で走査する
- some / every を使う
```

避けること:

```txt
- records.assets.sort(...)
- records.projects.splice(...)
- assetBlobRecords に marker を追加する
- record 自体の property を書き換える
```

後続の昇格処理が同じ records を使う可能性があるため、validation は入力を変更しない。

## Imports

`src/lib/offline-staging-validation.ts` の import は、schemaVersion、staging record 型、read helper の結果型に限定した。

```ts
OFFLINE_SCHEMA_VERSION

type OfflineStagingProject
type OfflineStagingAsset
type OfflineStagingAssetBlobRecord

type OfflineStagingRecordsForSyncRun
```

次は import しない。

```txt
runOfflineTransaction
requestToPromise
openOfflineDb
clearOfflineStagingBySyncRunId
putOfflineProject
putOfflineAsset
putOfflineAssetBlobRecord
putOfflineSyncState
markOfflineSyncing
markOfflineSyncFailed
markOfflineStoreCorrupt
```

## Included

今回含めたもの:

```txt
- OfflineStagingValidationFailureReason
- OfflineStagingValidationResult
- validateOfflineStagingRecordsForSyncRun(records)
- schemaVersion 検証
- duplicate-asset 検証
- duplicate-asset-blob 検証
- missing / unexpected asset 検証
- missing / unexpected asset blob 検証
- 最初の failure 1件だけ返す
```

## Excluded

今回含めていないもの:

```txt
- IndexedDB 読み取り
- Drive API 呼び出し
- cleanup helper 呼び出し
- 確定store昇格
- offlineSyncState 更新
- ready / failed / corrupt の状態更新
- failed / corrupt への分類
- runtime schema validation
- Blob 本体の存在 / size / type / decode 検査
- assetId / stagingId / projectId / Blob情報の返却
- 複数 failure reason の返却
- 入力 records の mutate
- UI / diagnostics 接続
- テストファイル追加
```

## Safety boundaries

守った安全境界:

```txt
- validation は同期関数
- IndexedDB helper を import しない
- cleanup helper を import しない
- offlineSyncState helper を import しない
- 確定store write helper を import しない
- 入力配列や record を書き換えない
- reason は短い code のみ
- project.slides の assetId 重複は許可し Set 化する
- project.slides.length === 0 自体は failure にしない
- Blob record は対応関係だけを見る
- Blob 本体の内容検査はしない
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
Add offline staging validation rules
```

## Notes

`git diff --check` が失敗している場合は、`lint` / `build` が成功していても commit しない。

## Next candidate

次の設計候補:

```txt
Goal 04-5 staging validation integration strategy
```

次に詰めるべき内容:

```txt
- read helper と validation rules をどう接続するか
- validation failure を同期フローでどう扱うか
- cleanup をいつ呼ぶか
- failed / corrupt への分類をどこで行うか
- 確定store昇格の前提条件
- ready 成功経路はまだ作らない
```

`ready` は staging 検証と確定store昇格の成功経路を設計してから追加する。
