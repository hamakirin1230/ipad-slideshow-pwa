# Goal 04-5 オフライン同期 / IndexedDB スキーマ設計

作成日: 2026-06-06

## 目的

Goal 04-5 では、iPad本番運用に向けて、Drive Blob直接再生ではなく、IndexedDBに同期済みデータを保存し、`/player` がオフライン再生できる設計へ進む。

この文書では、まずコード実装には入らず、IndexedDBに保存すべきデータ構造、同期状態、staging、ready判定、安全境界を整理する。

## 前提

本番運用では、`/player` は毎回Driveから画像を取得しない。

最終方針:

- Driveは管理・同期元
- IndexedDBは本番再生元
- Drive Blob直接再生は暫定経路
- `/admin` や同期処理がDriveからデータを取得する
- `/player` は将来的にIndexedDBから再生用データを読む

ここでいう IndexedDB は、ブラウザ内に大きめのデータを保存できるストレージであり、画像Blobの保存に使う。  
localStorageは画像Blob保存には不適切なため、保存先候補から外す。

## 第4-5初期スコープ

第4-5の初期スコープは、同期処理の完全実装ではなく、IndexedDB保存スキーマの設計に限定する。

初期スコープに含めるもの:

- 現在の再生対象project 1件のオフライン同期設計
- IndexedDB object store 設計
- project情報、asset metadata、画像Blob、同期状態の分離
- stagingから確定storeへの昇格設計
- `syncRunId` 設計
- `ready` 判定設計
- 同期元Driveスナップショット情報
- `schemaVersion` 設計
- 将来のリサイズ・圧縮・形式変換の余地
- ETag / revisionId 拡張余地

初期スコープに含めないもの:

- IndexedDBコード実装
- DriveからIndexedDBへの実同期処理
- `/player` のIndexedDB読み取り実装
- `/admin` の同期開始UI
- 同期進捗UI
- 容量不足UI
- 再同期UI
- rollback UI
- 競合merge UI
- ETag / revisionId による強い同時編集制御
- 複数project対応
- workspace全体同期
- 画像リサイズ・圧縮・形式変換の実装

## 重要な責務分担

### Drive

Driveは、管理・同期元として扱う。

Drive側にあるもの:

- workspace root
- `workspace.json`
- `index.json`
- project manifest
- asset files
- asset metadata
- Drive fileId
- Drive側更新時刻
- 将来の revisionId / ETag

Driveは、本番再生中の直接読み取り先にはしない。

### IndexedDB

IndexedDBは、iPad内の本番再生元として扱う。

IndexedDB側に保存するもの:

- 再生対象projectのスライド順
- caption
- `durationSeconds`
- asset metadata
- 画像Blob
- 同期状態
- 同期元Drive情報
- 同期済みバージョン情報
- 最終同期日時
- 破損・未同期・失敗状態

### `/player`

将来的な `/player` の責務:

- IndexedDBから再生対象projectを読む
- `offlineSyncState.status === "ready"` の場合だけオフライン再生する
- slideの `assetId` から画像Blobを読む
- Blobから object URL を作る
- 不要になった object URL は `URL.revokeObjectURL()` する
- access token やDrive APIには依存しない

### Drive Blob直接再生

現在のDrive Blob直接再生は、暫定経路として扱う。

用途:

- 開発中の確認
- 同期前プレビュー
- IndexedDB実装前の暫定プレイヤー

Drive Blob直接再生を本番再生エンジンとして作り込みすぎない。

## 同期単位

初期設計では、同期単位を現在の再生対象project 1件に限定する。

対象:

- `projectDetails` 相当
- 対象projectの `slides[]`
- slidesが参照するassets
- 各assetのmetadata
- 各assetの画像Blob
- 対象projectの同期状態

対象外:

- workspace全体
- 複数project
- 未使用assets
- project選択UI
- workspace横断の差分同期

理由:

- 現在のアプリは実質的に `projects[0]` を中心に進んでいる
- `/player` のオフライン再生成立を優先する
- workspace全体同期から入ると、容量、削除反映、複数project選択、未使用asset管理が一気に増える

## IndexedDB store 設計

初期設計では、1つの大きなJSONに全てを詰め込まない。

project情報、asset metadata、画像Blob、同期状態、stagingを分けて保存する。

### 確定store

`/player` がオフライン再生に使ってよい確定データ用store。

候補:

- `offlineProjects`
- `offlineAssets`
- `offlineAssetBlobs`
- `offlineSyncState`

### staging store

同期途中の一時データ用store。

候補:

- `offlineStagingProjects`
- `offlineStagingAssets`
- `offlineStagingAssetBlobs`

staging storeは、同期が完全成功するまで `/player` の再生元にしない。

## 主キー設計

IndexedDBの主キーは、Drive fileIdではなく、アプリ内の安定IDにする。

基本方針:

- project主キー: `projectId`
- asset主キー: `assetId`
- Blob主キー: `assetId`
- Drive fileId: metadata内の `sourceDriveFileId` として保持

Drive fileIdを主キーにしない理由:

- Drive側のID体系にローカル再生設計を従属させすぎないため
- 将来、画像差し替え、別Driveへの移行、再アップロード、ローカル作成素材に対応しやすくするため
- IndexedDBは本番再生元なので、アプリ内IDを中心にした方がよい

## `assetId` 方針

オフライン側のasset主キーは、現在のmanifest / projectDetails側で使っている `assetId` 相当を使う。

方針:

- IndexedDB保存時に別IDへ変換しない
- Drive fileIdから新しいassetIdを生成しない
- `slides[]`、`offlineAssets`、`offlineAssetBlobs` は同じ `assetId` で紐づける

理由:

- slideからasset metadata、画像Blobへの参照が単純になる
- `manifest assetId`、`Drive fileId`、`IndexedDB asset key` の3重変換を避ける

## `offlineProjects`

`offlineProjects` は、オフライン再生対象projectの確定情報を保存するstore。

### 主キー

- `projectId`

### 役割

- `/player` が最初に読む再生対象project情報
- 再生順、caption、`durationSeconds`、asset参照を持つ
- 画像Blob本体は持たない

### レコード例

~~~ts
type OfflineProject = {
  schemaVersion: number;
  projectId: string;
  projectTitle?: string;
  slides: OfflineProjectSlide[];
  sourceManifestFileId: string;
  sourceUpdatedAt?: string;
  syncedAt: string;
};
~~~

### `slides[]`

`slides[]` は `offlineProjects` の1レコード内に持つ。

初期設計では、`offlineSlides` のような別storeには分けない。

理由:

- 同期単位がproject 1件のため
- `/player` がprojectレコード1件を読めば再生順を取得できる
- 初期設計で正規化しすぎない

### slideレコード例

~~~ts
type OfflineProjectSlide = {
  slideId: string;
  assetId: string;
  caption?: string;
  durationSeconds?: number;
  order: number;
};
~~~

### 注意

`durationSeconds` は、既存の `/player` 実装と同じく、再生時に正規化する。

現行ルール:

- 1〜60の整数のみ有効
- 未設定、不正値、小数、範囲外は5秒扱い

## `offlineAssets`

`offlineAssets` は、asset metadata の確定情報を保存するstore。

### 主キー

- `assetId`

### 役割

- assetの管理情報を保持する
- Drive同期元情報を保持する
- Blob検証用のmetadataを保持する
- 画像Blob本体は持たない

### レコード例

~~~ts
type OfflineAsset = {
  schemaVersion: number;

  assetId: string;
  projectId: string;

  sourceDriveFileId: string;
  sourceName?: string;
  sourceMimeType?: string;
  sourceSizeBytes?: number;
  sourceUpdatedAt?: string;
  sourceRevisionId?: string;
  sourceETag?: string;

  blobMimeType: string;
  blobSizeBytes: number;
  blobVariant: "original" | "optimized";
  checksum?: string;

  blobStatus: "ready" | "missing" | "failed" | "corrupt";

  syncedAt: string;
};
~~~

### `mimeType` / `sizeBytes`

最低限、以下は持たせる。

- `blobMimeType`
- `blobSizeBytes`

Drive元情報として、取れる場合は以下も持たせる。

- `sourceMimeType`
- `sourceSizeBytes`

### `checksum`

`checksum` は将来の破損検知用フィールドとして設計に含める。

初期実装では必須にしない。

理由:

- Drive APIから安定して取れる値か、クライアント側で計算するかを後で決める必要がある
- 初期実装で必須にすると同期処理が重くなる

## `offlineAssetBlobs`

`offlineAssetBlobs` は、画像Blob本体の確定情報を保存するstore。

### 主キー

- `assetId`

### 役割

- `/player` が画像表示に使うBlobを保存する
- project情報やasset metadataとは分離する
- Blob本体をprojectレコードに埋め込まない

### レコード例

~~~ts
type OfflineAssetBlobRecord = {
  schemaVersion: number;
  assetId: string;
  projectId: string;
  blob: Blob;
  blobMimeType: string;
  blobSizeBytes: number;
  blobVariant: "original" | "optimized";
  syncedAt: string;
};
~~~

### 方針

初期実装では、Driveから取得したBlobをそのまま保存してよい。

ただし、設計上は「Drive元画像そのもの」ではなく、「オフライン再生用Blob」として扱う。

将来の余地:

- リサイズ
- 圧縮
- 形式変換
- iPad再生用最適化
- `blobVariant: "optimized"`

## `offlineSyncState`

`offlineSyncState` は、project単位の同期状態を保存するstore。

### 主キー

- `projectId`

### 役割

- 対象projectがオフライン再生可能か判断する
- 同期元Driveスナップショット情報を保持する
- 最終同期日時を保持する
- 同期失敗理由を保持する
- `ready` / `failed` / `corrupt` を区別する

### status

基本状態:

- `syncing`
- `ready`
- `failed`
- `corrupt`

未同期は、`offlineSyncState` に対象projectのレコードがない状態として表現する。

### statusの意味

#### `syncing`

同期処理中。

注意:

- `/player` は `syncing` のstagingデータを再生に使わない
- 既存の `ready` 確定データがある場合は、それを引き続き使える設計にする

#### `ready`

オフライン再生可能。

条件:

- `offlineProjects` に対象projectがある
- `offlineProjects.slides[]` がある
- 全slideが `assetId` を持つ
- 全slideの `assetId` に対応する `offlineAssets` がある
- 全slideの `assetId` に対応する `offlineAssetBlobs` がある
- Blob metadataが大きく矛盾していない

#### `failed`

直近の同期に失敗した。

注意:

- 既存の `ready` 確定データがある場合は、再生可能なまま残す
- `failed` は「同期処理の失敗」であり、保存済み確定データの破損とは区別する

#### `corrupt`

確定済みデータが壊れている、または必要Blobが欠けている。

注意:

- `/player` は `corrupt` データをオフライン再生に使わない
- 再同期または復旧が必要

### レコード例

~~~ts
type OfflineSyncState = {
  schemaVersion: number;

  projectId: string;
  status: "syncing" | "ready" | "failed" | "corrupt";

  syncRunId?: string;

  rootFolderId: string;
  workspaceFileId: string;
  indexFileId: string;
  manifestFileId: string;

  syncedAt?: string;
  sourceUpdatedAt?: string;

  slideCount: number;
  assetCount: number;

  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastFailedAt?: string;

  sourceRevisionId?: string;
  sourceETag?: string;
};
~~~

## staging設計

同期中データと確定データは分ける。

理由:

- 同期途中失敗で既存のオフライン再生データを壊さないため
- 通信切れ、容量不足、Drive権限切れ、画像取得失敗に備えるため
- 中途半端なproject / asset / Blobを `/player` に読ませないため

## `syncRunId`

stagingデータには、同期1回ごとの `syncRunId` を必ず持たせる。

### 役割

- 同じ同期処理で保存されたproject、asset metadata、Blobを束ねる
- 前回失敗したstaging残骸と今回の同期データを区別する
- 検証対象の一式を特定する
- staging cleanup の対象を特定する

### stagingレコード例

~~~ts
type OfflineStagingProject = OfflineProject & {
  syncRunId: string;
};

type OfflineStagingAsset = OfflineAsset & {
  syncRunId: string;
};

type OfflineStagingAssetBlobRecord = OfflineAssetBlobRecord & {
  syncRunId: string;
};
~~~

## stagingから確定storeへの昇格

同期成功時は、stagingデータを検証し、成功した場合だけ確定storeへ昇格する。

基本フロー:

1. `syncRunId` を作成
2. `offlineSyncState.status = "syncing"` を記録
3. staging storeへprojectを保存
4. staging storeへasset metadataを保存
5. staging storeへ画像Blobを保存
6. staging一式を検証
7. 検証成功時のみ、対象project 1件の確定データをトランザクション内で置き換える
8. `offlineSyncState.status = "ready"` にする
9. 古いstagingデータを削除

失敗時:

- `offlineSyncState.status = "failed"` にする
- 失敗理由を保存する
- 既存の `ready` 確定データは残す
- stagingデータは削除または次回cleanup対象にする

## 確定store置き換え方針

staging検証成功後、IndexedDB全体を削除して作り直さない。

対象project 1件のデータだけを、トランザクション内で置き換える。

置き換え対象:

- `offlineProjects` の対象 `projectId`
- 対象projectが参照する `offlineAssets`
- 対象projectが参照する `offlineAssetBlobs`
- 対象projectの `offlineSyncState`

理由:

- 将来複数project対応したとき、他projectのデータを巻き込まないため
- 画像Blob全削除・全保存を避けるため
- 途中失敗時の中途半端な状態を避けるため

## `ready` 判定

`offlineSyncState.status = "ready"` にしてよいのは、project本体・全asset metadata・全画像Blobが揃った場合だけ。

最低条件:

- 対象projectがstagingに存在する
- `slides[]` が存在する
- 各slideに `assetId` が存在する
- 全 `assetId` に対応する staging asset metadata が存在する
- 全 `assetId` に対応する staging Blob が存在する
- Blobの `blobMimeType` とasset metadataの `blobMimeType` が一致する
- Blobの `blobSizeBytes` が0より大きい
- asset metadataの `blobSizeBytes` とBlob recordの `blobSizeBytes` が一致する、または大きく矛盾しない
- slide数とasset数が `offlineSyncState` に記録できる

project JSONだけ保存できた状態は `ready` ではない。

## `offlineSyncState` 安全運用ルール

`offlineSyncState.status` は、単なる表示用文字列ではなく、`/player` が将来オフライン再生可否を判断するための重要な状態である。

そのため、`ready` / `syncing` / `failed` / `corrupt` の意味を混ぜない。

### `ready` を設定してよい経路

`offlineSyncState.status = "ready"` を設定してよいのは、staging検証と確定store昇格が成功した経路だけに限定する。

許可する経路:

1. Driveからproject、asset metadata、画像Blobを取得する
2. staging storeへ保存する
3. staging一式を検証する
4. project本体、全asset metadata、全画像Blobが揃っていることを確認する
5. 対象project 1件の確定storeをトランザクション内で置き換える
6. 確定store昇格が成功した場合だけ `status = "ready"` にする

禁止すること:

- `putOfflineSyncState()` の単発呼び出しで安易に `ready` を作る
- projectだけ保存した状態で `ready` にする
- asset metadataだけ保存した状態で `ready` にする
- Blobが欠けた状態で `ready` にする
- UI操作や開発用確認ボタンから直接 `ready` にする
- staging検証を通さずに `ready` にする

理由:

`ready` は「IndexedDB内の確定storeを本番再生元として使ってよい」という宣言に近い。

低レベル保存関数から自由に作れる状態にすると、不完全なprojectやBlob欠損状態を `/player` が再生可能と誤認する危険がある。

### `syncing` の運用

`syncing` は、新しい同期処理が進行中であることを表す。

`syncing` は、既存の確定済み再生データを無効化する意味ではない。

同期開始時の運用:

- `status` を `syncing` にする
- `syncRunId` を今回の同期試行IDに更新する
- 既存の `offlineProjects` / `offlineAssets` / `offlineAssetBlobs` は消さない
- 既存の確定storeを上書きしない
- 新しい同期データは staging store に保存する
- `syncedAt` は前回成功同期時刻として保持する
- `sourceUpdatedAt` は前回成功同期時のDrive側更新時刻として保持する
- `slideCount` / `assetCount` は前回成功同期時の値として保持する
- 前回の `lastErrorCode` / `lastErrorMessage` / `lastFailedAt` はクリアする

理由:

同期開始時点では、新しいデータはまだ確定していない。

この段階で前回成功同期情報を消すと、同期失敗時に「最後に使えるデータがいつのものか」が分からなくなる。

### `failed` の運用

`failed` は、直近の同期処理に失敗したことを表す。

`failed` は、既存の確定storeデータが再生不可であることを必ずしも意味しない。

同期失敗時の運用:

- `status` を `failed` にする
- `syncRunId` は失敗した直近同期試行IDとして残す
- `lastErrorCode` / `lastErrorMessage` / `lastFailedAt` を保存する
- `syncedAt` は前回成功同期時刻として保持する
- `sourceUpdatedAt` は前回成功同期時のDrive側更新時刻として保持する
- `slideCount` / `assetCount` は前回成功同期時の値として保持する
- 既存の `offlineProjects` / `offlineAssets` / `offlineAssetBlobs` は残す
- 失敗したstagingデータは削除またはcleanup対象にする

理由:

同期失敗は「新しいデータへの更新に失敗した」という意味であり、既存の確定済みデータが壊れたとは限らない。

最新化に失敗しても、前回同期済みデータで再生できる可能性を残す。

### `corrupt` の運用

`corrupt` は、同期失敗ではなく、確定store内の保存済みデータが信用できない状態を表す。

`corrupt` の例:

- `offlineProjects` は存在するが、slideが参照する `offlineAssets` が欠けている
- `offlineAssets` は存在するが、対応する `offlineAssetBlobs` が欠けている
- Blob metadataが大きく矛盾している
- 保存済みBlobが破損している
- 確定store検証で再生に必要なデータ欠損が見つかった

`corrupt` 時の運用:

- `status` を `corrupt` にする
- `/player` はそのprojectをオフライン再生元として使わない
- `syncedAt` は最後に信用できた成功同期時刻として保持する
- `sourceUpdatedAt` は最後に信用できたDrive側更新時刻として保持する
- `slideCount` / `assetCount` は最後に信用できた確定データの値として保持する
- `lastErrorCode` / `lastErrorMessage` に破損理由を保存する
- `lastFailedAt` は更新しない

理由:

`failed` は同期処理の失敗であり、`corrupt` は保存済み確定データの破損である。

この2つを混ぜると、既存データで再生してよいのか、再同期や復旧が必要なのか判断できなくなる。

### `syncedAt` / `lastFailedAt` の意味

`syncedAt` と `lastFailedAt` は意味を分ける。

`syncedAt`:

- 最後に確定storeが正常に同期・昇格された時刻
- `syncing` 開始時には更新しない
- `failed` 時には更新しない
- `corrupt` 時にも消さない
- `ready` 成功時に今回成功同期時刻へ更新する

`lastFailedAt`:

- 直近の同期失敗時刻
- `failed` 時だけ更新する
- `syncing` 開始時には前回値をクリアする
- `ready` 成功時にはクリアする
- `corrupt` 検知時刻としては使わない

`corrupt` 検知時刻が必要になった場合は、将来 `corruptDetectedAt` のような別フィールド追加を検討する。

### `syncRunId` の意味

初期運用では、`syncRunId` は直近の同期試行IDとして扱う。

状態別の扱い:

- `syncing`: 現在進行中の同期試行ID
- `failed`: 失敗した直近同期試行ID
- `ready`: 成功して確定storeへ昇格された同期ID
- `corrupt`: 原則として直近状態の `syncRunId` を保持する

将来、最後に成功した同期IDと直近試行IDを明確に分ける必要が出た場合は、`lastSuccessfulSyncRunId` のような別フィールド追加を検討する。

### `ready` 成功時に更新する情報

staging検証と確定store昇格が成功し、`ready` にする場合は、同期成功情報を今回の確定データに更新する。

更新するもの:

- `status = "ready"`
- `syncRunId`: 成功した同期ID
- `syncedAt`: 今回の成功同期時刻
- `sourceUpdatedAt`: 今回同期元Driveの更新時刻
- `slideCount`: 今回の確定データのslide数
- `assetCount`: 今回の確定データのasset数

クリアするもの:

- `lastErrorCode`
- `lastErrorMessage`
- `lastFailedAt`

理由:

`ready` は「この時点の確定storeを再生元として使ってよい」という状態である。

そのため、件数や時刻は前回成功分ではなく、今回昇格に成功した確定データの情報に更新する。

### `/player` での扱い

将来の `/player` では、`offlineSyncState.status === "ready"` だけに依存しすぎない。

初期方針:

- `ready` は再生開始の強い候補条件にする
- `corrupt` は再生不可として扱う
- `syncing` / `failed` は、既存確定store検証の結果と組み合わせて扱う余地を残す
- 前回readyデータが残っているかどうかは、後続の確定store検証関数で判断する

理由:

`syncing` や `failed` は、直近同期状態を表す。

それだけで既存確定データが再生可能かどうかまでは断定しない。

### 低レベル保存関数との関係

`putOfflineSyncState()` は、`offlineSyncState` store に1件保存する低レベル関数である。

注意:

- `putOfflineSyncState()` 自体は `ready` の安全性を検証しない
- `putOfflineSyncState()` をUIから直接呼ばない
- `putOfflineSyncState()` で `ready` を作るのは、staging検証・確定store昇格の成功経路だけにする
- `syncing` / `failed` / `corrupt` への状態更新も、後続の専用関数で安全に包むことを検討する

将来の候補:

- `markOfflineSyncing(...)`
- `markOfflineSyncFailed(...)`
- `markOfflineSyncReadyAfterPromotion(...)`
- `markOfflineSyncCorrupt(...)`

ただし、これらの関数は今回のdecision追記では実装しない。

## 同期元Driveスナップショット情報

`offlineSyncState` には、同期元Driveのスナップショット情報を保存する。

最低限保存するもの:

- `rootFolderId`
- `workspaceFileId`
- `indexFileId`
- `manifestFileId`
- `projectId`
- `syncedAt`
- `sourceUpdatedAt`
- `assetCount`
- `slideCount`
- `syncRunId`
- `status`

目的:

- このiPadがいつのDrive状態を再生しているか追跡する
- 古い同期データか判断できるようにする
- 現場で「最新かどうか」を確認できるようにする
- 将来のrevision / ETag制御へ拡張しやすくする

## ETag / revisionId 方針

初期設計では、ETag / revisionId による強い同時編集制御は必須にしない。

ただし、将来追加できるように任意フィールドを許容する。

候補フィールド:

- `sourceRevisionId`
- `sourceETag`

初期設計で使う古さ判定:

- `syncedAt`
- `sourceUpdatedAt`
- `slideCount`
- `assetCount`
- `syncRunId`

理由:

- ETag / revisionId を必須にするとDrive競合制御設計まで範囲が広がる
- 第4-5初期ではIndexedDB保存スキーマを固めることを優先する
- ただし後から入れられないスキーマにはしない

## `schemaVersion`

IndexedDBに保存する各レコードには、`schemaVersion` を持たせる。

対象:

- `offlineProjects`
- `offlineAssets`
- `offlineAssetBlobs`
- `offlineSyncState`
- staging各store

理由:

- IndexedDBはiPad内に残り続ける
- 将来スキーマ変更がほぼ確実に起きる
- 古い保存形式を読めるか、再同期すべきか判断する必要がある
- 「全部消して再同期してください」に寄せすぎないため

将来追加される可能性があるもの:

- `blobVariant`
- checksum
- revisionId / ETag
- captionスタイル設定
- ループ再生設定
- project選択
- 複数project対応
- 削除反映情報
- 同期失敗詳細
- 破損検知結果

## 削除反映の初期方針

第4-5初期設計では、削除反映の詳細実装は後続に分離する。

ただし、設計上は以下を意識する。

- 確定store昇格時に、対象projectが参照しなくなったassetをどう扱うか
- 複数project対応後、他projectが参照しているassetを削除しないこと
- project 1件限定の間は、対象projectの参照asset集合を基準に置き換え可能
- 将来、未参照asset cleanup が必要

## 容量不足の初期方針

第4-5初期設計では、容量不足UIや事前見積もり実装は含めない。

ただし、保存スキーマでは容量把握に必要な情報を持てるようにする。

必要情報:

- `blobSizeBytes`
- `sourceSizeBytes`
- `assetCount`
- `slideCount`
- `syncedAt`
- `blobVariant`

将来必要な対応:

- 同期前の容量見積もり
- 容量不足時の同期中止
- 古いオフラインデータ削除
- リサイズ・圧縮による保存サイズ削減

## `/player` の将来読み取りフロー

将来のIndexedDB対応後、`/player` は概ね以下の流れでオフライン再生する。

1. `offlineSyncState` を読む
2. 対象projectのstatusが `ready` か確認する
3. `offlineProjects` からprojectを読む
4. 現在slideの `assetId` を取得する
5. `offlineAssets` からmetadataを読む
6. `offlineAssetBlobs` からBlobを読む
7. Blobから object URL を作る
8. `<img>` で表示する
9. スライド切り替え時に古い object URL を revoke する
10. caption、`durationSeconds`、スワイプ、自動送りを既存UIに接続する

`offlineSyncState.status !== "ready"` の場合:

- オフライン再生は開始しない
- 同期が必要であることを表示する
- 既存Drive Blob直接再生へfallbackするかは別途設計する

## 安全境界

第4-5以降も以下を守る。

- Drive file を公開共有しない
- Drive fileId を公開URL化しない
- access token をContext valueやUI propsに直接出さない
- access token をUIやdiagnosticsに出さない
- Authorization header をUIやdiagnosticsに出さない
- full `assetFileId` をUIやdiagnosticsに出さない
- object URL をUIやdiagnosticsに出さない
- Drive API URL をUIやdiagnosticsに出さない
- Blob本体をReact stateに保存しない
- object URLを作ったら不要時に `URL.revokeObjectURL()` する
- 画像取得失敗だけで `projectStatus` / `projectDetails` を変更しない
- 画像取得失敗だけでDrive状態やproject状態をリセットしない
- `/player` 側で access token を props / state / hook引数に渡さない
- `/player` 側で `fetchDriveProjectAssetBlob()` を直接 import しない
- IndexedDB内の同期状態を根拠なく `ready` にしない
- staging中データを `/player` の本番再生元にしない

## 初期object store候補まとめ

| store | 主キー | 役割 |
|---|---|---|
| `offlineProjects` | `projectId` | 確定済みproject情報、slides[] |
| `offlineAssets` | `assetId` | 確定済みasset metadata |
| `offlineAssetBlobs` | `assetId` | 確定済み画像Blob |
| `offlineSyncState` | `projectId` | project単位の同期状態 |
| `offlineStagingProjects` | `syncRunId + projectId` 相当 | 同期中project |
| `offlineStagingAssets` | `syncRunId + assetId` 相当 | 同期中asset metadata |
| `offlineStagingAssetBlobs` | `syncRunId + assetId` 相当 | 同期中画像Blob |

staging storeの実際のkeyPathは実装時に決める。

候補:

- 複合キー `[syncRunId, projectId]`
- 複合キー `[syncRunId, assetId]`
- 文字列結合キー `${syncRunId}:${assetId}`

初期実装時にIndexedDB wrapperの扱いやすさで決める。

## 今後の実装分割候補

第4-5の設計書追加後、実装は小さく分割する。

候補:

1. IndexedDB schema type定義
2. IndexedDB open / migrate wrapper作成
3. object store作成
4. offlineProjects / offlineAssets / offlineAssetBlobs / offlineSyncState の読み書き関数
5. staging保存関数
6. staging検証関数
7. 確定store昇格関数
8. staging cleanup関数
9. Driveからproject 1件を同期する処理
10. `/player` のIndexedDB読み取りhook
11. `/player` のオフライン再生切り替え
12. `/admin` の同期開始UI
13. 同期状態表示UI
14. 容量不足・失敗・再同期UI

## 次の推奨

次の実装に進む前に、まずこの設計書をコミットする。

その後、いきなり同期処理全体を作らず、次の順に小さく進めるのがよい。

1. IndexedDB schema type定義
2. IndexedDB open / object store作成
3. 確定storeへの読み書き最小関数
4. staging storeへの保存とcleanup
5. staging検証
6. 確定store昇格
7. Drive同期処理
8. `/player` offline読み取り

最初のコードパッチでDrive同期まで入れるのは避ける。
