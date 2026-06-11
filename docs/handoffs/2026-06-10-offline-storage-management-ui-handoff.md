# Offline storage management UI handoff

Date: 2026-06-10
Project: `ipad-slideshow-pwa`
Production URL: `https://ipad-slideshow-pwa.vercel.app/`

## 目的

この handoff は、`/admin/` の confirmed offline store 表示に storage management 情報を追加した状態を記録する。

前回までに、Vercel production、PWA manifest path 正規化、Service Worker app shell cache、IndexedDB confirmed Blob 再生、project 単位ローカル削除、`/player` recovery copy、iPad 実機 offline shell 確認まで完了済み。

今回の handoff では、その後続として **端末内に保存されている project / asset Blob の容量と同期状態を管理画面で確認できるようになったこと**を記録する。

## 関連する前回 handoff

```txt
docs/handoffs/2026-06-10-pwa-offline-shell-local-recovery-handoff.md
docs/handoffs/2026-06-10-ipad-pwa-offline-shell-verification-handoff.md
```

## 今回の到達点

今回の変更で、`/admin/` の confirmed offline store panel に以下が追加された。

```txt
confirmed store 全体の blob bytes 表示
project storage summary 表示
project ごとの local blob size 表示
project ごとの source size 表示
project ごとの last synced 表示
project ごとの sourceUpdatedAt 表示
confirmed assets で blobSize / sourceSize を読みやすい単位で表示
project 単位削除ボタンは継続
```

これにより、iPad 運用時に「この端末にどの project がどれくらい保存されているか」を確認しやすくなった。

## 今回の変更ファイル

```txt
src/app/admin/offline-confirmed-store-panel.tsx
```

## 最新 commit

```txt
e133fa958c7215c3744cdf789b4a2a2024f1fd73
```

commit message は以下になっている。

```txt
 M src/app/admin/offline-confirmed-store-panel.tsx
```

動作上の問題はないが、履歴としては分かりにくい。
次回以降は GitHub Desktop の Summary に明示的な commit message を入れる。

推奨されていた commit message:

```txt
Improve offline storage management UI
```

## Vercel deploy

確認済み:

```txt
GitHub Desktop で Commit -> Push
GitHub Actions / Vercel deploy success
```

production URL:

```txt
https://ipad-slideshow-pwa.vercel.app/
```

管理画面:

```txt
https://ipad-slideshow-pwa.vercel.app/admin/
```

## UI 追加内容

### 1. 全体 count cards

既存:

```txt
projects
assets
asset blobs
sync states
```

追加:

```txt
blob bytes
```

`blob bytes` は confirmed `offlineAssetBlobs` の `blobSizeBytes` 合計を表示する。

表示例:

```txt
0 B
281 KB
1.2 MB
```

### 2. project storage summary

新しく `project storage summary` セクションを追加した。

表示内容:

```txt
project title
projectId short display
sync status
slides
assets
asset blobs
local blob size
source size
last synced
sourceUpdatedAt
```

目的:

```txt
project ごとの保存状態を一目で確認する
asset metadata と asset Blob の件数差を見つけやすくする
sync status が ready か missing / failed かを確認しやすくする
端末内保存容量を iPad 運用者が把握しやすくする
```

### 3. confirmed projects

既存の `confirmed projects` セクションには、project 単位削除ボタンが残っている。

追加表示:

```txt
local blob size
asset blobs
```

これにより、削除前に対象 project の保存容量と Blob 件数を確認できる。

導線:

```txt
/admin/
-> confirmed store を確認
-> confirmed projects
-> local blob size を確認
-> このprojectのローカル保存を削除
```

### 4. offline sync states

既存の表示に加えて、`sourceUpdatedAt` を表示するようにした。

表示内容:

```txt
syncRunId
slides
assets
syncedAt
sourceUpdatedAt
lastErrorCode
lastFailedAt
```

### 5. confirmed assets

既存は `sizeBytes` を raw number で表示していた。

今回から以下を表示する。

```txt
projectId
blobSize
sourceSize
```

`blobSize` と `sourceSize` は `formatBytes()` で読みやすい単位に変換する。

例:

```txt
281 KB
356 KB
1.2 MB
```

## 追加された内部 helper

### `ProjectStorageSummary`

`offline-confirmed-store-panel.tsx` 内に追加した型。

```txt
projectId
projectTitle
slideCount
assetCount
assetBlobCount
totalBlobSizeBytes
sourceTotalSizeBytes
syncStatus
lastSyncedAt
sourceUpdatedAt
```

### `buildProjectStorageSummary()`

project ごとの表示用 summary を組み立てる。

入力:

```txt
OfflineConfirmedStoreSnapshot
OfflineConfirmedProjectSummary
```

集計対象:

```txt
snapshot.assets
snapshot.assetBlobs
snapshot.syncStates
```

集計内容:

```txt
projectId が一致する assets
projectId が一致する assetBlobs
projectId が一致する syncState
assetBlob.blobSizeBytes の合計
asset.sourceSizeBytes の合計
sync state status
last synced
sourceUpdatedAt
```

### `getTotalAssetBlobSizeBytes()`

confirmed store 全体の `assetBlob.blobSizeBytes` 合計を返す。

### `formatBytes()`

byte 数を表示用文字列に変換する。

```txt
0 -> 0 B
1024 -> 1.00 KB
281000 -> 274 KB 前後
1048576 -> 1.00 MB
```

負数・非数は `未取得` とする。

## 保存先の整理

### Cache Storage

用途:

```txt
Service Worker による app shell cache
```

代表 cache:

```txt
ipad-slideshow-pwa-app-shell-v1
```

保存対象:

```txt
/
/settings/
/admin/
/player/
/manifest.json
/icons/icon-192.png
/icons/icon-512.png
/_next/static/...
```

今回の storage UI では Cache Storage の容量はまだ表示しない。

### IndexedDB

用途:

```txt
/player/ が Drive にアクセスせず、端末内の confirmed Blob から画像再生する
```

DB 名:

```txt
ipad-slideshow-offline
```

confirmed stores:

```txt
offlineProjects
offlineAssets
offlineAssetBlobs
offlineSyncState
```

staging stores:

```txt
offlineStagingProjects
offlineStagingAssets
offlineStagingAssetBlobs
```

今回の storage UI で表示する容量は主に `offlineAssetBlobs` の `blobSizeBytes`。

### Google Drive

用途:

```txt
workspace / project / manifest / assets の source of truth
```

project 単位ローカル削除では Drive 側は削除しない。

```txt
workspace folder: 残る
project folder: 残る
manifest.json: 残る
assets: 残る
```

## 本番確認手順

対象:

```txt
https://ipad-slideshow-pwa.vercel.app/admin/
```

確認手順:

```txt
1. /admin/ を開く
2. confirmed store を確認
3. count cards に blob bytes が表示される
4. project storage summary が表示される
5. local blob size が KB / MB 表記で表示される
6. source size が取得済みなら表示される
7. last synced / sourceUpdatedAt が表示される
8. confirmed assets で blobSize / sourceSize が読みやすい単位になっている
9. project 単位削除ボタンが引き続き動く
```

削除確認:

```txt
/admin/
-> confirmed store を確認
-> このprojectのローカル保存を削除
-> confirm OK
-> 削除結果表示
-> confirmed store を再確認
```

期待値:

```txt
project storage summary が消える、または対象 project が消える
projects / assets / asset blobs / sync states が 0 になる
/player/ で再生データなし recovery copy が表示される
/admin/ で offline sync 再実行すると復元する
```

## 現在の到達点

完了済み:

```txt
Vercel production 移行
PWA manifest path 正規化
Service Worker / app shell cache
IndexedDB confirmed Blob 再生
project 単位ローカル削除
/player recovery copy
iPad 実機 offline shell / player recovery 確認
root page / status copy 更新
/admin offline storage management UI 改善
```

## 既知の制約

### Cache Storage 容量はまだ表示しない

今回表示している容量は IndexedDB の asset Blob 合計。
Service Worker の app shell cache 容量は表示していない。

今後追加するなら:

```txt
navigator.storage.estimate()
Cache Storage key listing
Service Worker cache clear UI
```

ただし iPad Safari での API 挙動差を考慮する必要がある。

### source size は取得できない場合がある

`asset.sourceSizeBytes` が undefined の場合は `未取得` と表示する。
Drive 側 metadata からサイズを確実に取る設計にする場合は、Photos Picker / Drive save 時の metadata 保存方針を追加で見直す。

### multi-project playback は未実装

storage summary は project ごとの表示に対応したが、`/player/` はまだ単一 ready project 前提が中心。
複数 project を正式に扱う場合は player 側に project selection が必要。

### commit message が不明瞭

今回の commit message はファイル状態文字列になっている。
必要なら将来、履歴整理のために squash / rebase で修正できるが、現時点では main 運用中なので無理に修正しない。

## 次の推奨タスク

次は以下のどちらかが自然。

### 案A: iPad player viewing experience

目的:

```txt
iPad 横向き・ホーム画面PWAでの再生体験を磨く。
```

候補:

```txt
/player/ の full-screen 寄せ
controls overlay
操作ボタンの自動フェード
画面タップで controls 表示
safe area 対応
横向き表示の余白調整
```

推奨 commit 名:

```txt
Improve iPad player viewing experience
```

### 案B: storage management advanced

目的:

```txt
端末内保存をさらに分かりやすく管理する。
```

候補:

```txt
navigator.storage.estimate() 表示
Service Worker cache clear UI
IndexedDB project clear と cache clear の違いを UI で説明
last synced project の強調表示
stale project warning
```

推奨 commit 名:

```txt
Improve advanced offline storage controls
```

### 案C: multi-project playback preparation

目的:

```txt
複数 project を保存した場合に、player で対象 project を選べるようにする。
```

候補:

```txt
offline playback snapshot helper の multi-project 対応
/player/ project selector
/admin/ から再生対象 project へ遷移
last played projectId 保存
```

推奨 commit 名:

```txt
Prepare multi-project offline playback
```

## 次回チャット開始時の確認ポイント

次回は以下から開始する。

```txt
1. 最新 main が offline storage management UI 改善まで含んでいること
2. Vercel deploy が success であること
3. /admin/ の confirmed store で blob bytes / project storage summary が見えること
4. iPad 実機 offline shell / player recovery は確認済みとして扱うこと
5. 次の作業候補は iPad player viewing experience / advanced storage controls / multi-project playback preparation から選ぶこと
```

確認対象ファイル:

```txt
src/app/admin/offline-confirmed-store-panel.tsx
src/lib/offline-confirmed-store-snapshot.ts
src/lib/offline-local-project-clear.ts
src/app/player/page.tsx
public/sw.js
docs/handoffs/2026-06-10-pwa-offline-shell-local-recovery-handoff.md
docs/handoffs/2026-06-10-ipad-pwa-offline-shell-verification-handoff.md
docs/handoffs/2026-06-10-offline-storage-management-ui-handoff.md
```
