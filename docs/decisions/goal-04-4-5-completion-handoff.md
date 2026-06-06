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
