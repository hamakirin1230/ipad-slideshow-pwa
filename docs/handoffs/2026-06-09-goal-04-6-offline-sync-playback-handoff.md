# Goal 04-6 handoff: Drive offline sync / confirmed store / offline-first player

Date: 2026-06-09
Project: `ipad-slideshow-pwa`

## 目的

Goal 04-6 では、Google Drive 上の project manifest / assets を取得し、IndexedDB の staging store に保存した後、検証済み snapshot を confirmed offline store へ promotion し、最終的に `/player` が confirmed offline store から offline-first で再生できるところまで接続した。

今回の主目的は、以下の一連のパイプラインを実装・接続すること。

```txt
Drive API
-> Drive snapshot fetch
-> offline staging write
-> staging validation
-> confirmed store promotion
-> confirmed store inspection
-> offline playback snapshot
-> /player offline-first rendering
```

## 完了済みの大きな流れ

### 1. offline staging write helper

追加ファイル:

```txt
src/lib/offline-staging-write.ts
```

実装内容:

* `OfflineProject` / `OfflineAsset` / `OfflineAssetBlobRecord` を staging record に変換
* staging store への書き込み helper を追加
* `asset + asset blob` を短い transaction で書き込み
* 最後に `project` を final marker 的に書き込む
* projectId 単位で既存 staging record を cleanup
* complete snapshot 書き込み用 `writeCompleteOfflineStagingSnapshot` を追加

設計上の要点:

* Drive API は呼ばない
* promotion は行わない
* Blob を長時間 transaction 内に持ち込まない
* iPad PWA で大きな Blob を扱う前提で、asset 単位書き込みを採用

Commit:

```txt
Add offline staging write and Drive snapshot helpers
```

## 2. Drive -> offline staging snapshot helper

追加ファイル:

```txt
src/lib/drive-offline-staging-snapshot.ts
```

実装内容:

* Drive project manifest を読み取り
* manifest JSON を検証
* slide ごとに asset metadata を取得
* asset blob を Drive API `alt=media` で取得
* Drive 由来の不整合を staging write 前に検出
* IndexedDB には触らず、`OfflineProject + assetPairs` の snapshot を返す

設計上の要点:

* Drive API fetch 専用
* IndexedDB を触らない
* promotion しない
* Blob 本体は React state に載せない前提

Commit:

```txt
Add offline staging write and Drive snapshot helpers
```

## 3. Drive offline staging orchestration

追加ファイル:

```txt
src/lib/drive-offline-staging-orchestration.ts
```

実装内容:

* `syncRunId` 生成
* `markOfflineSyncing`
* Drive snapshot fetch
* staging write
* `promoteOfflineStagingForSyncRun`
* Drive fetch / staging write 失敗時の `markOfflineSyncFailed`
* stale-sync-run を result として扱う
* retry policy は持たない
* user-facing copy は持たない

設計上の要点:

* orchestration は UI から直接扱う raw result を返す
* raw result には `snapshot` が含まれるため、UI state へ直接載せない
* Blob を含む可能性がある object を React state に載せない方針を維持

Commit:

```txt
Add Drive offline staging orchestration helper
```

## 4. orchestration summary helper

追加ファイル:

```txt
src/lib/drive-offline-staging-orchestration-summary.ts
```

実装内容:

* raw orchestration result を lightweight summary に変換
* 成功時:

  * projectId
  * slideCount
  * assetCount
  * staging write count
  * promotion count
  * cleanup count
* 失敗時:

  * stale
  * drive fetch / staging write failure
  * promotion failure
* diagnostics の件数制限と truncate

設計上の要点:

* raw `snapshot` を UI 側に返さないための中間層
* Blob を含む可能性がある object を隠す

Commit:

```txt
Add safe Drive offline staging summary helper
```

## 5. offline staging sync facade

追加ファイル:

```txt
src/lib/drive-offline-staging-sync.ts
```

実装内容:

* `runDriveOfflineStagingPromotionOrchestration` を呼ぶ facade
* raw result を `summarizeDriveOfflineStagingPromotionOrchestrationResult` に通す
* UI/Provider 側には lightweight result だけ返す
* precondition failure / unexpected failure を安全な result に変換

設計上の要点:

* raw snapshot を返さない
* Blob を React state に載せない
* user-facing copy はまだ最小限
* retry policy は持たない

Commit:

```txt
Add safe Drive offline staging sync facade
```

## 6. offline staging sync runtime

追加ファイル:

```txt
src/lib/drive-offline-staging-sync-runtime.ts
```

実装内容:

* offline sync 専用 runtime
* 既存 Drive operation timeout 15秒とは分離
* default timeout は5分
* 同時実行防止
* manual cancel
* timeout cancel
* AbortController 管理
* access_token を保持し続けない

設計上の要点:

* UI state は持たない
* user-facing copy は作らない
* retry policy は持たない
* `AppProviders` から `useRef` で保持する前提

Commit:

```txt
Add Drive offline staging sync runtime helper
```

## 7. AppProviders への offline sync 接続

変更ファイル:

```txt
src/app/app-providers.tsx
```

実装内容:

* offline sync status / message / diagnostics / lastResult を Provider に追加
* `startOfflineSync`
* `cancelOfflineSync`
* `isOfflineSyncInFlight`
* `canStartOfflineSync`
* `offlineSyncBlockedReason`
* asset import 中 / Drive operation 中は offline sync を開始しない
* offline sync 中は asset import を開始しない
* project ready reset 時に offline sync state も reset
* runtime result の lightweight summary だけを React state に保存

設計上の要点:

* access_token は従来通り `accessTokenRef.current` から開始時だけ読む
* Blob / raw snapshot は React state に載せない
* UI button はこの段階ではまだ追加しない

Commit:

```txt
Wire Drive offline staging sync into AppProviders
```

## 8. Admin offline sync panel

追加・変更ファイル:

```txt
src/app/admin/offline-sync-panel.tsx
src/app/admin/page.tsx
```

実装内容:

* `/admin` に offline sync 実行パネルを追加
* offline sync status 表示
* start / cancel button
* blocked reason 表示
* diagnostics 表示
* last result summary 表示

設計上の要点:

* retry policy はまだ持たない
* confirmed store を使った player 表示はこの時点では未接続
* user-facing copy は最小限

Commit:

```txt
Add admin offline sync panel
```

## 9. confirmed offline store inspection panel

追加・変更ファイル:

```txt
src/lib/offline-confirmed-store-snapshot.ts
src/app/admin/offline-confirmed-store-panel.tsx
src/app/admin/page.tsx
```

実装内容:

* confirmed stores を読み取り専用で snapshot 化
* 対象 stores:

  * `offlineProjects`
  * `offlineAssets`
  * `offlineAssetBlobs`
  * `offlineSyncState`
* `/admin` に confirmed store inspection panel を追加
* project / asset / asset blob / sync state count を表示
* project summary 表示
* sync state summary 表示
* asset metadata 表示
* Blob 本体は表示しない
* 件数整合 diagnostics を表示

設計上の要点:

* 修復・削除・再同期は行わない
* Blob 本体を UI に出さない
* offline sync 完了後の検証用 panel

Commit:

```txt
Add confirmed offline store inspection panel
```

## 10. offline playback snapshot reader

追加ファイル:

```txt
src/lib/offline-playback-snapshot.ts
```

実装内容:

* confirmed offline store から playback 用 snapshot を構築
* ready な sync state を起点に project を選択
* project / assets / asset blobs / sync state の整合を検証
* slide order 順に `OfflinePlaybackSlide[]` を作成
* `Blob` を含む playback snapshot を返す
* status:

  * `empty`
  * `invalid`
  * `ready`

設計上の要点:

* player 接続前の read-only helper
* 現時点では単一 project のみ対応
* duplicate / missing asset / missing blob / count mismatch を検出
* Blob は helper result に含むが、Provider state には載せない

Commit:

```txt
Add offline playback snapshot reader
```

## 11. Player offline-first 接続

追加・変更ファイル:

```txt
src/app/player/use-offline-playback-snapshot.ts
src/app/player/use-offline-current-slide-image.ts
src/app/player/page.tsx
```

実装内容:

* `/player` を Google Drive fetch 依存から offline-first に切り替え
* confirmed offline store から `readOfflinePlaybackSnapshot()` を読み込み
* current slide の Blob から `URL.createObjectURL()` を作成
* object URL cleanup を実装
* next / previous 操作を維持
* slide duration による自動送りを維持
* empty / invalid / error state を表示
* admin への導線を表示

修正中に発生した問題:

1. `react-hooks/set-state-in-effect`

   * effect 本体で同期的に `setState` したため lint error
   * `queueMicrotask` 経由に変更して解消

2. `useOfflineCurrentSlideImage` export missing

   * ファイル内容不一致の可能性
   * `export function useOfflineCurrentSlideImage` を含む全文差し替えで解消

Commit:

```txt
Wire player to offline playback snapshot
```

## 現在の状態

完了済み:

```txt
Drive API
-> Drive snapshot fetch
-> staging write
-> staging validation
-> confirmed promotion
-> admin offline sync execution
-> admin confirmed store inspection
-> offline playback snapshot reader
-> player offline-first rendering
```

確認済み:

```txt
npm run lint
npm run build
git diff --check
GitHub Desktop Commit -> Push
GitHub Actions deploy
```

最後に確認済みの commit:

```txt
Wire player to offline playback snapshot
```

## まだ未確認の重要事項

GitHub Actions deploy は完了済みだが、会話内では以下の公開版 E2E はまだ完了報告されていない。

```txt
1. GitHub Pages 公開版で /settings を開く
2. Google接続
3. Drive状態を再確認
4. /admin を開く
5. project ready を確認
6. 必要なら素材を1件以上追加
7. offline sync を実行
8. offline sync ready を確認
9. confirmed store を確認
10. /player を開く
11. Google接続に依存せず offline store から画像表示されることを確認
12. next / previous が動くことを確認
13. 自動送りが動くことを確認
```

## 次にやること

### 最優先: 公開版 E2E 確認

まずコード追加前に、GitHub Pages 公開版で実機または通常ブラウザ確認を行う。

確認観点:

```txt
/settings:
- Google接続できる
- Drive状態を ready にできる

/admin:
- projectStatus が ready になる
- 素材追加済み project で offline sync を実行できる
- offline sync status が ready になる
- confirmed store を確認できる
- projects: 1
- assets: slide count と一致
- asset blobs: assets と一致
- sync states: 1
- diagnostics に件数整合確認が出る

/player:
- offline-first player として開く
- Drive API fetch なしで IndexedDB Blob から画像が表示される
- next / previous が動く
- 自動送りが動く
- Google未接続状態で再訪問しても表示できる
```

### 次の実装候補 1: `/admin` から `/player` への導線追加

目的:

* offline sync 完了後にすぐ player 確認できるようにする
* E2E確認手順を短くする

候補変更:

```txt
src/app/admin/offline-sync-panel.tsx
```

追加内容:

* offline sync ready 時に「playerで確認」ボタンを表示
* confirmed store ready 時にも player 導線を出すか検討

推奨 commit:

```txt
Add player link after offline sync
```

### 次の実装候補 2: player の表示状態を少し hardening

目的:

* 実機確認時に原因を切り分けやすくする

候補:

```txt
/player に diagnostics の折りたたみ表示
offline snapshot checkedAt 表示
projectId / slideCount / assetCount 表示
current slide asset name 表示
image error 時に current slide metadata 表示
```

推奨 commit:

```txt
Improve offline player diagnostics
```

### 次の実装候補 3: iPad 実機向け IndexedDB / Blob stress check

目的:

* iPad Safari / PWA で Blob 保存・読み出し・object URL の挙動を確認する
* 最大50枚想定に向けた前段確認

候補:

```txt
/admin に offline storage diagnostic panel を追加
confirmed asset blob の合計 bytes 表示
最大 blob size 表示
object URL 作成テスト
読み出し時間の簡易計測
```

注意:

* 実機 IndexedDB の容量制限や eviction は端末状態に依存する
* この段階では自動修復や retry はまだ入れない

推奨 commit:

```txt
Add offline storage diagnostics
```

### 次の実装候補 4: Service Worker / PWA cache 方針

目的:

* app shell をオフライン起動できるようにする
* IndexedDB に保存済みの playback data と組み合わせて本番再生へ近づける

注意:

* 先に player offline-first の E2E を確認する
* Service Worker を先に入れると cache 問題で debugging が難しくなる
* したがって順序は E2E確認後がよい

推奨 commit:

```txt
Add PWA app shell cache strategy
```

## 現時点の推奨順序

```txt
1. 公開版 E2E確認
2. /admin から /player への導線追加
3. player diagnostics 改善
4. iPad実機 IndexedDB / Blob stress check
5. Service Worker / app shell cache
6. 本番再生モード設計
```

## 既知の設計制約

* access_token は永続化しない
* access_token は `AppProviders` 内部の `useRef` のみ
* raw Drive snapshot / Blob を React global state に載せない
* confirmed store inspection では Blob 本体を表示しない
* offline playback snapshot は Provider 経由ではなく player local hook で読む
* 現時点では単一 project 前提
* retry policy は未実装
* 自動修復・自動削除は未実装
* Service Worker は未実装
* iPad 実機 stress check は未実施
