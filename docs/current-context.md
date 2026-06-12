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
Drive assets/保存
manifest.json.slides反映
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

未確認:

```text
Vercel productionで複数projectを実際にoffline sync
/player/のproject selectorを実データで確認
last played projectIdがiPad PWA再起動後も効くことを確認
```

## 直近の検証済み

ローカルで確認済み:

```text
npm run lint
npm run build
git diff --check
Browserで /player/?projectId=test-project を開く
Browserで /admin/ を開く
console errorなし
```

注意:

```text
ローカル環境にはconfirmed projectがないため、
複数project selectorの実データ表示は未確認。
```

## 次に自然な作業

優先候補:

```text
1. Vercel productionでproject A/Bをoffline syncし、multi-project selectorを実機確認
2. 古いdocs/decisionsやdocs/architectureを「履歴」と「現行方針」に分けて整理
3. 本番モード・操作ロックの設計
4. 動画再生・テロップ・公開履歴・ロールバックの順次実装
```

## 最新ハンドオフ

読む順:

```text
docs/handoffs/2026-06-12-multi-project-playback-preparation-handoff.md
docs/handoffs/2026-06-12-advanced-offline-storage-controls-handoff.md
docs/handoffs/2026-06-10-offline-storage-management-ui-handoff.md
docs/handoffs/2026-06-10-ipad-pwa-offline-shell-verification-handoff.md
docs/handoffs/2026-06-10-pwa-offline-shell-local-recovery-handoff.md
docs/handoffs/2026-06-09-offline-playback-e2e-handoff.md
```
