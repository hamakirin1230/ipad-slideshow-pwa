# iPad用スライドショーPWA 現在の引き継ぎ

Date: 2026-06-12

このファイルは、次にCodexで作業を再開するときの入口です。古い第4-1時点の制約ではなく、2026-06-12時点の実装状態を正とします。

## 最重要方針

- iPadホーム画面PWAで安定して動くことを最優先にする
- 本番中に止まらないことを最優先にする
- 最終的にオフラインのiPadだけでスライドショーを本番再生できるようにする
- Vercel productionを現在の本番運用対象にする
- Google OAuth scopeは原則`https://www.googleapis.com/auth/drive.file`のみ
- access tokenは保存しない、表示しない、console出力しない
- access tokenはlocalStorage / IndexedDB / Cookie / docs / logsに出さない
- Client Secretは作らない、使わない
- APIキーは作らない、使わない
- iPadホーム画面PWAで確認できないものは、本番完了扱いにしない

## 現在の公開先

```text
https://ipad-slideshow-pwa.vercel.app/
```

GitHub Pagesは初期フェーズの公開先だったが、現在の運用対象ではない。

現在のPWA path:

```text
manifest: /manifest.json
start_url: /
scope: /
icons: /icons/...
service worker: /sw.js
```

`next.config.ts` は `GITHUB_PAGES=true` の場合だけ `basePath: "/ipad-slideshow-pwa"` を付ける。

## 現在の到達点

完了済み:

```text
Vercel production移行
Google OAuth / drive.file scope
Drive workspace作成・再確認
Drive project作成・再確認
Google Photos Pickerから素材追加
Google Photos Pickerから複数素材をbatch追加
Drive assets/保存
manifest.json.slides反映
slide.captionをテロップとして編集
index.json updatedAt同期
Drive offline snapshot fetch
IndexedDB staging write
staging validation
confirmed store promotion
/admin offline sync panel
/admin confirmed store inspection
/admin project単位ローカル削除
/admin projectごとの保存容量表示
/admin browser storage estimate表示
/admin app shell cache状態確認・削除
/player confirmed Blob offline-first再生
/player recovery copy
/player iPad横向き再生UI
/player project selector準備
/player production mode
/player operation lock
/player caption telop overlay
/player auto advance interval selector
/player slide transition animation
/admin slide reorder controls
/admin slide drag-and-drop reorder
/admin slide bulk delete
/admin slide duplicate
Service Worker app shell cache
iPad実機 offline shell / player recovery確認
```

## 保存先の整理

### Google Drive

source of truth。

保持するもの:

```text
workspace folder
workspace.json
index.json
projects/{projectId}/manifest.json
projects/{projectId}/assets/
```

### IndexedDB

offline playback用コピー。

DB:

```text
ipad-slideshow-offline
```

confirmed stores:

```text
offlineProjects
offlineAssets
offlineAssetBlobs
offlineSyncState
```

staging stores:

```text
offlineStagingProjects
offlineStagingAssets
offlineStagingAssetBlobs
```

### Cache Storage

Service Workerによるapp shell cache。

代表cache:

```text
ipad-slideshow-pwa-app-shell-v1
```

保存対象:

```text
/
/settings/
/admin/
/player/
/manifest.json
/icons/icon-192.png
/icons/icon-512.png
/_next/static/...
```

## 重要な実装境界

- Drive API呼び出しはProvider内部操作から行う
- access tokenをContextやUIへ公開しない
- Blob本体をReact stateへ載せない
- Drive raw responseやraw snapshotをUI stateへ載せない
- offline sync resultはlightweight summaryだけUIへ返す
- confirmed store inspectionでもBlob本体は画面表示しない
- `/player/` はconfirmed storeからoffline-firstで読む
- `/player/` はconfirmed store内のslide順をそのまま再生順として使う
- Drive上の画像順の正は`manifest.json.slides[]`の配列順
- Drive上のslide削除・複製も`manifest.json.slides[]`だけを変更し、Drive assets/内の画像ファイルは削除・コピーしない
- project単位ローカル削除ではDrive上のデータを削除しない
- app shell cache削除ではIndexedDBのproject / asset / Blobを削除しない

## 複数project再生の現在地

2026-06-12時点で準備済み:

```text
confirmed store promotion時に他projectを削除しない
readOfflinePlaybackSnapshot({ projectId }) 対応
ready project複数時はprojectSelectionRequiredを返す
/player/にproject selectorを表示
/player/?projectId=...で対象projectを直接開ける
最後に選んだprojectIdをlocalStorageへ保存
/admin/ confirmed projectsから「このprojectを再生」へ遷移
```

Vercel productionで確認済み:

```text
Project A / Project Bを識別できるtitle管理
複数Drive projectの作成
既存projectの切り替え
選択中projectへの素材追加
選択中projectのoffline sync
confirmed storeに複数projectを保持
/player/のproject selector
/player/?projectId=<Project A>で再生
/player/?projectId=<Project B>で再生
last played projectIdがiPad PWA再起動後も効くこと
```

## 本番モード・操作ロック

2026-06-12時点で追加済み:

```text
/player/でnormal / production modeを切り替え
production modeはlocalStorage key ipad-slideshow:player-presentation-modeに保存
production mode ONでlockもON
production mode OFFでlockもOFF
lock状態は永続化しない
lock中も自動送りは継続
production mode中は通常操作UI、project selector戻り、next/previous button、playback toggleを非表示・無効化
production mode / lock中も左右swipeによるslide navigationは許可
lock中にtapしてもcontrolsは表示しない
lock解除は右上の2秒長押し
lock解除後もproduction modeは維持
```

## テロップ・素材batch追加

2026-06-12時点で追加済み:

```text
既存のslide.captionをテロップ本文として扱う
captionはplain text、保存時trim、上限80文字
/admin/の本編スライド順でslideごとにテロップ編集・個別保存
caption更新はDrive manifest.jsonをsource of truthにする
caption更新後、iPad再生に反映するには対象projectのoffline syncが必要
/player/ではnormal / production / lock中の全てでテロップoverlayを表示
テロップoverlayはpointer-events-noneでswipe操作を邪魔しない
Photos Pickerは1回最大10件、かつproject全体50 slides上限まで
download / Drive uploadはitemごとに順次処理
Drive保存成功分が1件以上あればmanifest.jsonへbatch append
途中失敗時もDrive保存済みassetの自動削除・自動修復はしない
```

## Player自動送り・transition・画像順変更

2026-06-12時点で追加済み:

```text
/player/の自動送り間隔を端末ごとのlocalStorage設定として保存
localStorage key: ipad-slideshow:player-auto-advance-interval-seconds
選択肢は なし / 5秒 / 10秒 / 15秒 / 20秒 / 30秒 / 1分
初期値は10秒
なしはpauseではなくauto advance timerを張らない状態
production mode / lock中も選択済みintervalで自動送り継続
next / previous / swipe / 自動送りでfade + slight horizontal slide
prefers-reduced-motionでは短いfadeに落とす
/admin/の本編スライド順で上へ / 下へボタンによる画像順変更
先頭の上へ、最後の下へ、1枚だけ、保存中、project未ready、offline sync中、素材追加中、caption保存中はreorder不可
reorder保存先はDrive manifest.json.slides[]の配列順
reorderではasset file / assetId / assetFileId / caption / durationSecondsを変更しない
index.json.projects[].updatedAtも更新し、更新後にmanifest / indexを再読込して再検証
画像順変更後、iPad再生に反映するには対象projectのoffline syncが必要
```

## Admin slide drag-and-drop・一括削除・複製

2026-06-12時点で追加済み:

```text
/admin/の本編スライド順でdrag-and-dropによる画像順変更
drag handleのみでdrag開始し、checkbox / button / textarea操作ではdrag開始しない
drag over中に暫定順を表示し、drop時にDrive manifestへ保存
保存失敗時はDrive由来の最新slide順へ戻す
上へ / 下へボタンによるreorderは維持

checkboxで複数slideを選択し、一括削除できる
すべてのslide削除も許可
一括削除はmanifest.json.slides[]から対象slide entryを外すだけで、Drive assets/のasset fileは削除しない
削除成功後は選択をクリア

slide複製はsource slideの直後に新しいslide entryを挿入する
新しいslideId / createdAt / updatedAtを発行する
assetId / assetFileId / assetName / mimeType / caption / durationSeconds / source fieldsはsource slideからコピーする
Drive asset fileはコピーしない
project全体50 slides上限を維持する

delete / duplicate / drag reorderではmanifest.json.updatedAtとindex.json.projects[].updatedAtを更新する
更新後にmanifest / indexを再読込して保存結果を再検証する
不整合時は自動修復しない
project未ready、offline sync中、素材追加中、caption保存中、title保存中、Drive操作中、slide edit保存中はslide edit不可
slide削除・複製・並び替え後、iPad再生に反映するには対象projectのoffline syncが必要
```

## 直近の検証済み

ローカルで確認済み:

```text
npm run lint
npm run build
git diff --check
Browserで /player/ を開く
Browserで offline data不足時のblocking messageを確認
Browser console errorなし
```

注意:

```text
ローカル環境にはconfirmed projectがないため、
production mode ON/OFF、lock中swipe navigation、2秒長押しunlock、Project A / Project Bの実データ再生はVercel production / iPad PWA側で確認する。
Photos Picker複数選択、caption保存、offline sync後のテロップ再生もVercel production / iPad PWA側で確認する。
画像順変更、drag-and-drop reorder、複数slide削除、slide複製、変更後offline sync、Playerでのnext / previous / swipe / 自動送り / transitionはVercel production / iPad PWA側でProject A / Project Bそれぞれ確認する。
```

## 次に自然な作業

優先候補:

```text
1. 動画再生の設計・実装
2. 公開履歴・ロールバックの設計・実装
3. 古いdocs/decisionsやdocs/architectureを「履歴」と「現行方針」に分けて整理
```

## 最新ハンドオフ

読む順:

```text
docs/handoffs/2026-06-12-slide-dnd-delete-duplicate-handoff.md
docs/handoffs/2026-06-12-player-auto-advance-transition-and-slide-reorder-handoff.md
docs/handoffs/2026-06-12-caption-telop-and-batch-asset-import-handoff.md
docs/handoffs/2026-06-12-production-mode-and-operation-lock-handoff.md
docs/handoffs/2026-06-12-multi-project-playback-preparation-handoff.md
docs/handoffs/2026-06-12-advanced-offline-storage-controls-handoff.md
docs/handoffs/2026-06-10-offline-storage-management-ui-handoff.md
docs/handoffs/2026-06-10-ipad-pwa-offline-shell-verification-handoff.md
docs/handoffs/2026-06-10-pwa-offline-shell-local-recovery-handoff.md
docs/handoffs/2026-06-09-offline-playback-e2e-handoff.md
```
