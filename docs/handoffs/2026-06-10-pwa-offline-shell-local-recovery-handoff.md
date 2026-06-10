# PWA offline shell / project-scoped local recovery handoff

Date: 2026-06-10
Project: `ipad-slideshow-pwa`
Production URL: `https://ipad-slideshow-pwa.vercel.app/`

## 目的

この handoff は、Vercel production 移行後に実施した PWA manifest 正規化、Service Worker による app shell cache、IndexedDB confirmed store の project 単位削除、`/player` の recovery copy 改善までの状態を記録する。

前回 handoff `2026-06-09-offline-playback-e2e-handoff.md` では、Drive / Photos Picker / offline sync / IndexedDB confirmed Blob / `/player` 再生 E2E までを確認済みとしていた。
今回の handoff は、その後続として「端末内オフラインデータの扱い」と「PWA offline shell の入口」を整理する。

対象URL:

```txt
https://ipad-slideshow-pwa.vercel.app/
https://ipad-slideshow-pwa.vercel.app/settings/
https://ipad-slideshow-pwa.vercel.app/admin/
https://ipad-slideshow-pwa.vercel.app/player/
https://ipad-slideshow-pwa.vercel.app/manifest.json
https://ipad-slideshow-pwa.vercel.app/sw.js
```

## 前提方針

### GitHub Pages は今後使用しない

Vercel production へ移行したため、GitHub Pages 用の `basePath: "/ipad-slideshow-pwa"` 前提は今後の運用対象から外す。

manifest / icon / Service Worker registration は Vercel root path を正とする。

```txt
manifest: /manifest.json
start_url: /
scope: /
icons: /icons/...
service worker: /sw.js
```

## 今回の到達点

今回の一連のスライスで、以下が完了した。

```txt
PWA manifest path を Vercel production root に正規化
-> minimal Service Worker を追加
-> app shell cache を導入
-> /player recovery copy を改善
-> IndexedDB confirmed / staging records を projectId 単位で削除可能にした
-> GitHub Actions / Vercel deploy success 確認
```

## 今回の主なコミット

### 1. `Normalize PWA manifest paths for production`

目的:

```txt
Vercel production root で PWA manifest / icon path が正しく解決されるようにする。
```

変更対象:

```txt
src/app/layout.tsx
public/manifest.json
```

主な変更:

```txt
metadata.manifest:
/ipad-slideshow-pwa/manifest.json
-> /manifest.json

manifest start_url:
/ipad-slideshow-pwa/
-> /

manifest scope:
/ipad-slideshow-pwa/
-> /

icons:
/ipad-slideshow-pwa/icons/...
-> /icons/...
```

確認済み:

```txt
npm run lint
npm run build
git diff --check
GitHub Actions / Vercel deploy success
```

### 2. `Add minimal PWA service worker`

目的:

```txt
一度 online で開いた後、/player/ などの app shell を offline でも返せる入口を作る。
```

変更対象:

```txt
public/sw.js
src/app/service-worker-registration.tsx
src/app/layout.tsx
```

追加内容:

```txt
Service Worker registration
production build のみ /sw.js を register
Cache Storage に app shell を保存
navigate request で network fallback to cache
/_next/static/ と icons と manifest を cache-first 対象にする
```

Cache Storage 名:

```txt
ipad-slideshow-pwa-app-shell-v1
```

app shell cache 対象:

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

注意:

```txt
Service Worker はアプリ本体の shell を cache する。
写真 Blob や project snapshot は Service Worker ではなく IndexedDB に保存される。
```

### 3. `Add project-scoped local offline data clear action`

目的:

```txt
端末内に保存された offline playback 用コピーを、全件ではなく projectId 単位で削除できるようにする。
```

変更対象:

```txt
src/lib/offline-local-project-clear.ts
src/app/admin/offline-confirmed-store-panel.tsx
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

削除条件:

```txt
record.projectId === selected projectId
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

UI 導線:

```txt
/admin/
-> confirmed store を確認
-> confirmed projects
-> このprojectのローカル保存を削除
-> confirm
-> 削除結果表示
```

削除後の期待状態:

```txt
対象 projectId の confirmed project / assets / asset blobs / sync state が消える
/player/ は再生データなし状態になる
/admin/ で offline sync を再実行すると復元できる
```

### 4. `Improve player offline recovery copy`

目的:

```txt
/player/ で未同期・project単位削除後・破損・画像Blob不整合時に、ユーザーが次に何をすべきか分かる表示にする。
```

変更対象:

```txt
src/app/player/page.tsx
```

追加・改善内容:

```txt
オンライン / オフライン badge
未同期または削除後の説明
invalid snapshot 時の修復導線
画像Blob読み込み失敗時の修復導線
再読み込みボタン
管理画面への導線
PlayerStatusCard / PlayerActionRow の導入
```

主なユーザー向け文言:

```txt
この端末には再生データが保存されていません
ローカル保存データの整合性に問題があります
このスライド画像を表示できません
管理画面で offline sync を実行
管理画面で修復する
```

## オフライン保存先の整理

### 1. App shell

保存先:

```txt
Cache Storage
```

管理主体:

```txt
public/sw.js
```

用途:

```txt
アプリ画面そのものを offline でも起動しやすくする。
```

代表的な cache:

```txt
ipad-slideshow-pwa-app-shell-v1
```

保存されるもの:

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

### 2. Project / asset metadata / photo Blob

保存先:

```txt
IndexedDB
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

用途:

```txt
/player/ が Drive にアクセスせず、端末内の confirmed Blob から画像を表示する。
```

## 削除機能の現在仕様

### project 単位削除

`/admin/` の confirmed project 一覧から、対象 project のローカル保存だけを削除する。

```txt
/admin/
-> confirmed store を確認
-> confirmed projects
-> このprojectのローカル保存を削除
```

削除対象は IndexedDB records のみ。

```txt
offlineProjects
offlineAssets
offlineAssetBlobs
offlineSyncState
offlineStagingProjects
offlineStagingAssets
offlineStagingAssetBlobs
```

Drive 側の実体は削除しない。

```txt
workspace folder: 残る
project folder: 残る
manifest.json: 残る
assets: 残る
```

### browser / iPad 側の完全削除

アプリ内 UI ではなく、ブラウザの site data 削除で対応する。

PC Chrome / Edge:

```txt
DevTools
-> Application
-> Storage
-> Clear site data
```

iPad Safari:

```txt
設定
-> Safari
-> 詳細
-> Webサイトデータ
-> ipad-slideshow-pwa.vercel.app
-> 削除
```

ホーム画面 PWA も消す場合:

```txt
ホーム画面アイコン長押し
-> 削除
```

完全初期化したい場合は、Safari の Webサイトデータ削除とホーム画面アイコン削除の両方を行う。

## 現在の確認済み状態

確認済み:

```txt
npm run lint 成功
npm run build 成功
git diff --check 問題なし
GitHub Desktop で Commit -> Push 済み
GitHub Actions / Vercel deploy success
```

最新 production deploy 対象:

```txt
https://ipad-slideshow-pwa.vercel.app/
```

## 本番で確認すべき手順

### 1. 通常再生

```txt
/player/
```

期待値:

```txt
画像表示
next
previous
自動送り
swipe / drag
オンライン badge 表示
```

### 2. project 単位削除

```txt
/admin/
-> confirmed store を確認
-> confirmed projects
-> このprojectのローカル保存を削除
-> confirm OK
```

期待値:

```txt
削除結果が表示される
対象 projectId の projects / assets / asset blobs / sync states が削除される
Drive 側の project / manifest / assets は残る
```

### 3. 削除後の player

```txt
/player/
```

期待値:

```txt
この端末には再生データが保存されていません
管理画面で offline sync を実行
```

### 4. 再同期

```txt
/admin/
-> offline sync 実行
-> confirmed store を確認
```

期待値:

```txt
projects: 1
assets: 1
asset blobs: 1
sync states: 1
```

### 5. 再同期後の player

```txt
/player/
```

期待値:

```txt
画像再生が復元する
next / previous / 自動送り / swipe が動く
```

## iPad 実機で次に確認すること

次の未完了確認は iPad 実機での PWA offline shell / player recovery 確認。

推奨手順:

```txt
1. iPad Safari で https://ipad-slideshow-pwa.vercel.app/ を開く
2. ホーム画面に追加
3. ホーム画面アイコンから起動
4. /admin/ で confirmed store を確認
5. 必要なら offline sync を実行
6. /player/ で画像再生確認
7. 機内モード ON
8. ホーム画面アイコンから再起動
9. /player/ が表示される
10. 保存済み Blob から画像再生できる
11. project 単位削除後の recovery copy が自然に見える
12. online に戻して offline sync 再実行で復元できる
```

確認したい観点:

```txt
ホーム画面起動時に standalone 表示になるか
Service Worker が app shell を返すか
/player/ reload が offline でも表示されるか
IndexedDB Blob が残っていれば画像表示できるか
オフライン badge が期待通り表示されるか
project 削除後の案内文が iPad 画面幅で読めるか
```

## 既知の制約

### Google / Drive / Photos Picker は offline では動かない

offline で期待するのは再生のみ。

```txt
Google OAuth
Drive workspace check
Drive project check
Photos Picker
offline sync
```

これらは online 前提。

### Service Worker は minimal 実装

今回の `public/sw.js` は app shell cache の最小実装。
高度な update UI、cache version 表示、ユーザー操作による cache clear、background sync は未実装。

### iPad 実機の完全確認はまだ残っている

今回の到達点は code / deploy / desktop browser 確認のための準備完了。
iPad Safari / ホーム画面追加後の offline shell 挙動は次スライスで確認する。

## 次の推奨タスク

### A-2: iPad PWA offline shell 実機確認

目的:

```txt
iPad Safari / ホーム画面 PWA で、offline shell と IndexedDB Blob 再生が成立することを確認する。
```

実施内容:

```txt
ホーム画面追加
standalone 起動
online sync
/player/ 再生
機内モード
再起動
/player/ offline 表示
project 単位削除後の recovery copy
再同期復元
```

結果を確認できたら、次の handoff に記録する。

推奨 commit 名:

```txt
Add iPad PWA offline shell verification handoff
```

## 次回チャット開始時の確認ポイント

次回は以下から始める。

```txt
1. 最新 main が Improve player offline recovery copy まで含んでいること
2. Vercel deploy が success であること
3. iPad 実機で /player/ offline shell を確認すること
4. project 単位削除 -> /player/ recovery copy -> offline sync 復元を確認すること
```

必要に応じて確認するファイル:

```txt
public/sw.js
src/app/service-worker-registration.tsx
src/app/layout.tsx
src/app/admin/offline-confirmed-store-panel.tsx
src/lib/offline-local-project-clear.ts
src/app/player/page.tsx
src/lib/offline-schema.ts
src/lib/offline-db.ts
```
