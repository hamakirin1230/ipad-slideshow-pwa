# iPad PWA offline shell verification handoff

Date: 2026-06-10
Project: `ipad-slideshow-pwa`
Production URL: `https://ipad-slideshow-pwa.vercel.app/`

## 目的

この handoff は、Vercel production 上の iPad 用 slideshow PWA について、PWA manifest / Service Worker / IndexedDB offline Blob / `/player` recovery copy が iPad 実機確認まで進んだ状態を記録する。

前回 handoff:

```txt
docs/handoffs/2026-06-10-pwa-offline-shell-local-recovery-handoff.md
```

では、以下までを記録した。

```txt
PWA manifest path を Vercel production root に正規化
minimal Service Worker を追加
app shell cache を導入
/player recovery copy を改善
IndexedDB confirmed / staging records を projectId 単位で削除可能にした
GitHub Actions / Vercel deploy success 確認
```

今回の handoff は、その後続として **iPad 実機で PWA offline shell / player recovery を確認したこと**を記録する。

## 対象URL

```txt
https://ipad-slideshow-pwa.vercel.app/
https://ipad-slideshow-pwa.vercel.app/settings/
https://ipad-slideshow-pwa.vercel.app/admin/
https://ipad-slideshow-pwa.vercel.app/player/
https://ipad-slideshow-pwa.vercel.app/manifest.json
https://ipad-slideshow-pwa.vercel.app/sw.js
```

## 今回の確認結果

iPad 実機で以下を確認済み。

```txt
iPad Safari で Vercel production を開く
ホーム画面に追加
ホーム画面アイコンから PWA として起動
/admin/ で offline sync 確認
/player/ で画像再生確認
offline shell / player recovery の挙動確認
project 単位ローカル削除後の recovery copy 確認
online 復帰後の offline sync 再実行による復元確認
```

これにより、以下の到達点を完了扱いとする。

```txt
A-0: Vercel production 用 manifest path 正規化
A-1: minimal Service Worker / app shell cache
A-2: iPad 実機 PWA offline shell / player recovery 確認
```

## 現在の到達点

```txt
Vercel production 移行
PWA manifest path 正規化
Service Worker / app shell cache
IndexedDB confirmed Blob 再生
project 単位ローカル削除
/player recovery copy
iPad 実機 offline shell / player recovery 確認
```

## 関連コミット

### `Normalize PWA manifest paths for production`

目的:

```txt
Vercel production root で PWA manifest / icon path が正しく解決されるようにする。
```

主な内容:

```txt
metadata.manifest: /manifest.json
manifest start_url: /
manifest scope: /
icons: /icons/...
```

### `Add minimal PWA service worker`

目的:

```txt
一度 online で開いた後、/player/ などの app shell を offline でも返せる入口を作る。
```

主な内容:

```txt
public/sw.js
src/app/service-worker-registration.tsx
src/app/layout.tsx
```

Cache Storage 名:

```txt
ipad-slideshow-pwa-app-shell-v1
```

Service Worker が扱うもの:

```txt
app shell
manifest
icons
/_next/static/... chunks
```

Service Worker が扱わないもの:

```txt
写真Blob
Drive project snapshot
asset metadata
sync state
```

これらは IndexedDB 側で扱う。

### `Add project-scoped local offline data clear action`

目的:

```txt
端末内に保存された offline playback 用コピーを、projectId 単位で削除できるようにする。
```

削除対象:

```txt
offlineProjects
offlineAssets
offlineAssetBlobs
offlineSyncState
offlineStagingProjects
offlineStagingAssets
offlineStagingAssetBlobs
```

削除しないもの:

```txt
Google Drive workspace
Google Drive project folder
Google Drive manifest.json
Google Drive assets
Service Worker app shell cache
他 project の IndexedDB records
```

### `Improve player offline recovery copy`

目的:

```txt
/player/ で未同期・project単位削除後・破損・画像Blob不整合時に、ユーザーが次に何をすべきか分かる表示にする。
```

主な内容:

```txt
オンライン / オフライン badge
未同期または削除後の説明
invalid snapshot 時の修復導線
画像Blob読み込み失敗時の修復導線
再読み込みボタン
管理画面への導線
```

### `Add PWA offline shell local recovery handoff`

目的:

```txt
PWA offline shell / project-scoped local recovery までの状態を handoff として記録する。
```

追加ファイル:

```txt
docs/handoffs/2026-06-10-pwa-offline-shell-local-recovery-handoff.md
```

## オフライン保存先の整理

### 1. Cache Storage

用途:

```txt
アプリ shell を offline でも起動できるようにする。
```

代表 cache:

```txt
ipad-slideshow-pwa-app-shell-v1
```

主な保存対象:

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

### 2. IndexedDB

用途:

```txt
/player/ が Drive にアクセスせず、端末内の confirmed Blob から画像を表示する。
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

## iPad 実機で確認済みの観点

### ホーム画面 PWA 起動

確認済み:

```txt
iPad Safari からホーム画面追加
ホーム画面アイコンから起動
Vercel production の PWA として利用
```

### `/player/` 再生

確認済み:

```txt
IndexedDB confirmed store から snapshot 読み込み
asset Blob から画像表示
next / previous
自動送り
swipe / drag 相当の操作
```

### offline shell

確認済み:

```txt
Service Worker により app shell が cache される
/player/ の画面 shell が offline でも表示できる前提が成立
```

### project 単位削除後の recovery

確認済み:

```txt
/admin/ の confirmed projects から対象 project のローカル保存を削除
/player/ で再生データなし状態を表示
管理画面で offline sync を実行する導線が表示される
online 復帰後に offline sync 再実行で復元できる
```

## 現在のユーザー向け運用

### 初回セットアップ

```txt
1. /settings/ で Google 接続
2. Drive workspace ready を確認
3. /admin/ で Drive project ready を確認
4. 必要なら Photos Picker から素材追加
5. offline sync を実行
6. confirmed store を確認
7. /player/ で再生
```

### iPad で使う場合

```txt
1. iPad Safari で https://ipad-slideshow-pwa.vercel.app/ を開く
2. ホーム画面に追加
3. ホーム画面アイコンから起動
4. /player/ で再生
```

### オフラインで使う場合

```txt
1. online 状態で一度 PWA を開く
2. /admin/ で offline sync を完了する
3. /player/ で画像再生できることを確認する
4. その後 offline 状態で /player/ を使う
```

### ローカル保存を project 単位で削除する場合

```txt
/admin/
-> confirmed store を確認
-> confirmed projects
-> このprojectのローカル保存を削除
```

この操作で削除されるのは、端末内 IndexedDB の対象 project コピーのみ。

Drive 側の project / manifest / assets は削除されない。

## 既知の制約

### offline でできること

```txt
/player/ app shell 表示
保存済み IndexedDB Blob からの画像再生
next / previous
自動送り
swipe / drag
ローカル保存済み project の recovery 表示
```

### offline でできないこと

```txt
Google OAuth
Drive workspace check
Drive project check
Photos Picker
Drive assets 取得
offline sync
```

これらは online 前提。

### Service Worker はまだ minimal 実装

未実装:

```txt
Service Worker update notification
cache clear UI
cache version 表示
background sync
offline fallback 専用ページ
高度な stale cache 制御
```

### project は現時点で単一 project 運用が中心

helper は複数 ready sync state を invalid と扱う設計が残っている。
今後 multi-project playback を正式化する場合は、player 側で project selection が必要。

## 次の推奨タスク

次は、以下のどちらかが自然。

### 案A: iPad 向け UX polish

目的:

```txt
ホーム画面 PWA として使う前提で、再生画面の見た目・操作性を整える。
```

候補:

```txt
/player/ の full-screen 寄せ
ヘッダー非表示モード
操作ボタンの自動フェード
画面タップで controls 表示
横向き表示の最適化
iPad Safari safe area 対応
```

推奨 commit 名:

```txt
Improve iPad player viewing experience
```

### 案B: offline / storage 管理 UX

目的:

```txt
ユーザーが端末内保存状態を理解しやすくする。
```

候補:

```txt
/admin/ に保存容量概算表示
project ごとの asset blob total bytes 表示
Service Worker cache clear UI
IndexedDB clear の説明強化
last synced project の表示
```

推奨 commit 名:

```txt
Improve offline storage management UI
```

### 案C: root page / status copy 更新

目的:

```txt
トップページに残っている GitHub Pages / 古いゴール表現を Vercel production 現状に合わせる。
```

候補:

```txt
トップページ文言更新
/settings /admin /player 導線整理
現在の完成状況表示
iPad PWA 利用手順への導線
```

推奨 commit 名:

```txt
Update landing page status copy for Vercel production
```

## 次回チャット開始時の確認ポイント

次回は以下から開始する。

```txt
1. 最新 main が Add iPad PWA offline shell verification handoff まで含んでいること
2. Vercel deploy が success であること
3. iPad 実機 PWA offline shell / player recovery は確認済みとして扱うこと
4. 次の作業候補は iPad UX polish / offline storage 管理 UI / root page copy 更新から選ぶこと
```

確認対象ファイル:

```txt
public/sw.js
src/app/service-worker-registration.tsx
src/app/layout.tsx
src/app/admin/offline-confirmed-store-panel.tsx
src/lib/offline-local-project-clear.ts
src/app/player/page.tsx
docs/handoffs/2026-06-10-pwa-offline-shell-local-recovery-handoff.md
docs/handoffs/2026-06-10-ipad-pwa-offline-shell-verification-handoff.md
```
