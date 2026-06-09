# Offline playback E2E handoff: Vercel production / Drive / IndexedDB / player

Date: 2026-06-09
Project: `ipad-slideshow-pwa`

## 目的

この handoff は、Vercel 公開版で Google Drive workspace から素材追加、manifest 反映、offline sync、IndexedDB confirmed store、`/player` offline-first 再生までの E2E が通過した時点の状態を記録する。

対象URL:

```txt
https://ipad-slideshow-pwa.vercel.app/
https://ipad-slideshow-pwa.vercel.app/settings/
https://ipad-slideshow-pwa.vercel.app/admin/
https://ipad-slideshow-pwa.vercel.app/player/
```

## 到達点

以下の E2E が公開版で確認済み。

```txt
Google auth
-> Drive workspace ready
-> Drive project ready
-> Google Photos Picker から素材追加
-> Drive assets/ へ保存
-> manifest.json.slides へ反映
-> index.json updatedAt 同期
-> project 再確認で 素材数 1 / 本編スライド数 1
-> offline sync
-> IndexedDB confirmed store promotion
-> confirmed store 件数確認
-> /player offline-first 表示
-> next / previous
-> 自動送り
-> swipe / drag 移動
```

## 確認済みの公開版状態

### `/settings/`

確認済み:

```txt
Google接続済み
drive.file scope 許可済み
access_token は表示・保存しない
Driveワークスペース準備済み
```

Vercel 本番URLを Google OAuth の Authorized JavaScript origins に追加済み。

```txt
https://ipad-slideshow-pwa.vercel.app
```

### `/admin/`

確認済み:

```txt
Driveプロジェクト数: 1
素材数: 1
本編スライド数: 1
```

素材追加は Google Photos Picker 経由で確認済み。

確認済みの流れ:

```txt
Photos Picker で写真選択
Drive assets/ へ JPEG として保存
manifest.json へ slide 追加
index.json updatedAt 同期
更新後再検証完了
```

素材追加例:

```txt
元MIME type: image/heif
取得後Content-Type: image/jpeg
Drive MIME type: image/jpeg
Drive保存サイズ: 約281KB〜356KB
```

## offline sync / confirmed store

offline sync 実行後、以下を確認済み。

```txt
status: ready
slides: 1
assets: 1
staging written projects: 1
staging written assets: 1
staging written asset blobs: 1
promoted projects: 1
promoted assets: 1
promoted asset blobs: 1
```

confirmed store inspection の最終期待値も確認済み。

```txt
PROJECTS: 1
ASSETS: 1
ASSET BLOBS: 1
SYNC STATES: 1
```

これにより、Drive 上の画像が IndexedDB confirmed store に Blob として保存され、`/player` が読む前提が成立した。

## `/player` E2E

確認済み:

```txt
IndexedDB confirmed asset blob から画像表示
next button
previous button
自動送り
PC mouse drag / swipe 相当操作
```

最初に swipe / drag が効かなかったが、後述の修正で通過済み。

## 今回の修正コミット

### 1. `Use validated project details after project recheck`

目的:

```txt
プロジェクト状態を再確認した後、validateDriveProjectDetails の検証済み details を UI state に反映する。
```

修正内容:

```txt
src/app/app-providers.tsx
src/lib/google-drive.ts
```

背景:

素材追加後、manifest.json.slides には slide が追加されていたが、`プロジェクト状態を再確認` 後の UI が `素材数 0 / 本編スライド数 0` に戻っていた。

原因は、`validateDriveProjectDetails()` が manifest を検証していたにもかかわらず、details を返しておらず、`AppProviders` 側も empty details を state に入れていたこと。

修正後:

```txt
validateDriveProjectDetails()
-> parseDriveProjectManifestJson()
-> DriveProjectReadyDetails を返す
-> AppProviders が ProjectDetails に変換
-> 素材数 / 本編スライド数 に反映
```

### 2. `Prune stale confirmed offline records on promotion`

目的:

```txt
offline sync promotion 時に、現在の projectId 以外の confirmed records を削除する。
```

修正内容:

```txt
src/lib/offline-staging-promotion.ts
```

背景:

古い project の confirmed record が IndexedDB に残り、以下の状態になった。

```txt
PROJECTS: 2
ASSETS: 1
ASSET BLOBS: 1
SYNC STATES: 2
```

この状態では `/player` の offline playback snapshot helper が、ready sync state 2件を invalid と判断する。

修正後:

```txt
promotion 時に現在 projectId 以外の confirmed project / asset / asset blob / sync state を削除
```

最終確認値:

```txt
PROJECTS: 1
ASSETS: 1
ASSET BLOBS: 1
SYNC STATES: 1
```

### 3. `Improve player swipe gesture handling`

目的:

```txt
/player で pointer swipe / mouse drag によるスライド移動を安定化する。
```

修正内容:

```txt
src/app/player/page.tsx
```

背景:

button の next / previous と自動送りは動いていたが、画像上の drag / swipe で移動できなかった。

修正内容:

```txt
pointerup 判定中心から pointermove 判定中心に変更
50px 以上の横移動で即時 next / previous
didTrigger による二重発火防止
画像の native drag を disabled
user-select を抑制
```

確認済み:

```txt
PC mouse drag / swipe 相当操作で移動できた
```

## 現時点の重要な設計制約

維持されている前提:

```txt
access_token は AppProviders 内部の useRef のみに保持
access_token を localStorage / IndexedDB / React global state に保存しない
Blob 本体を React state に載せない
Drive snapshot raw object を UI state に載せない
offline sync result は lightweight summary のみ UI に返す
confirmed store inspection でも Blob 本体は画面表示しない
/player は confirmed store から offline-first で読む
```

## 既知の制約・未実装

現時点で未実装または未検証:

```txt
Service Worker / app shell offline
PWA install 後の完全オフライン起動
iPad 実機ホーム画面追加後の確認
iPad 実機での長時間再生
大量画像での IndexedDB / Blob / memory stress
retry policy
自動修復
自動削除
詳細な user-facing error copy
複数 project 対応
Drive workspace / project の競合解決
stale Drive metadata の自動修復
```

## 次に進む候補

### 候補A: Service Worker / PWA offline shell

目的:

```txt
アプリ本体をオフラインでも起動可能にする。
```

確認したいこと:

```txt
iPad Safari でホーム画面追加
ネットワーク切断
/player がアプリ shell と confirmed Blob で表示できる
```

注意:

```txt
Google認証や Drive sync はオンライン前提のまま扱う。
offline playback のみオフライン動作対象にする。
```

### 候補B: iPad実機ストレス確認

目的:

```txt
iPad 実機で IndexedDB Blob 再生が安定するか確認する。
```

確認観点:

```txt
10枚
30枚
50枚
画像サイズ
長時間自動送り
Safari memory pressure
ホーム画面PWA表示
スリープ復帰
画面回転
```

### 候補C: admin UI の素材・スライド管理強化

目的:

```txt
素材一覧、スライド順、削除、duration、caption の編集を行う。
```

現在は、Google Photos Picker から追加した素材が即 manifest.json.slides に入る最小実装として扱っている。

### 候補D: retry / repair / error copy

目的:

```txt
Drive API / Photos Picker / IndexedDB / promotion failure を user-facing に扱いやすくする。
```

対象:

```txt
Drive fetch retry
asset blob fetch retry
staging write failure
promotion validation failure
stale sync run
corrupt store
manual repair
manual reset
```

## 再開時の推奨確認コマンド

ローカル確認:

```bash
npm run lint
npm run build
git diff --check
git status --short
```

公開版確認:

```txt
/settings/
-> Google接続
-> Drive状態を再確認

/admin/
-> プロジェクト状態を再確認
-> offline sync を実行
-> confirmed store を確認

/player/
-> 画像表示
-> next / previous
-> 自動送り
-> swipe / drag
```

## 最終確認済みコミット群

今回の E2E 完了に直接関係するコミット:

```txt
Support Vercel production deployment
Use validated project details after project recheck
Prune stale confirmed offline records on promotion
Improve player swipe gesture handling
```

前段の Goal 04-6 関連:

```txt
Add offline staging write and Drive snapshot helpers
Add Drive offline staging orchestration helper
Add safe Drive offline staging summary helper
Add safe Drive offline staging sync facade
Add Drive offline staging sync runtime helper
```

## 最終状態

この handoff 時点で、Vercel 公開版の最小 offline playback E2E は通過済み。

```txt
Drive source
-> Photos asset import
-> manifest slide
-> offline sync
-> confirmed IndexedDB Blob
-> /player image render
-> button navigation
-> autoplay
-> swipe navigation
```

次の大きな区切りは、`Service Worker / PWA install / iPad実機offline` に進むか、先に `admin slide management` を厚くするかの判断。
