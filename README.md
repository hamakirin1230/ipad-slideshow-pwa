# スライドショー

iPadで安定して本番再生するためのスライドショーPWAです。

PC側でGoogle Drive上のworkspace / project / manifest / assetsを管理し、iPad側ではDriveから取得した再生用コピーをIndexedDBに保存して、offline-firstで再生します。最優先は、学校現場・イベント現場で本番中に止まらないことです。

## 現在の到達点

現在はVercel productionでの運用を前提に、Drive連携からoffline playbackまでの主要な縦線が通っています。

完了済み:

- Vercel productionで公開中
- Google OAuth / `drive.file` scope接続
- Google Drive workspace / project作成と再確認
- Google Photos Pickerから素材追加
- Drive assets保存、`manifest.json` / `index.json`反映
- Drive snapshot取得、IndexedDB staging write、confirmed store promotion
- `/player/` でIndexedDB confirmed Blobからoffline-first再生
- next / previous / 自動送り / swipe操作
- Service Workerによるapp shell cache
- iPad実機PWA offline shell / player recovery確認
- `/admin/` でproject単位ローカル削除、保存容量、browser storage estimate、app shell cache状態確認
- `/player/` のiPad横向き再生UI polish
- 複数project playback準備、project selector、`/player/?projectId=...`
- Vercel productionでProject A / Project Bのoffline sync、confirmed store複数保持、player selector、project指定再生を確認
- `/player/` 本番モード、操作ロック、lock中の左右swipe navigation、2秒長押しロック解除
- `/player/` captionテロップoverlay、`/admin/` slide別テロップ編集
- Google Photos Pickerから複数写真を順次Drive保存し、成功分をbatchでmanifest反映
- `/player/` 自動送り間隔選択、なし/5秒/10秒/15秒/20秒/30秒/1分、localStorage保存
- `/player/` slide transition animation、next / previous / swipe / 自動送りでfade + slight horizontal slide
- `/admin/` slide順の上へ/下へ変更、drag-and-drop並び替え、複数slide一括削除、slide複製
- `manifest.json.slides[]` 配列順を再生順のsource of truthとして保存
- `/admin/` drag handle表示を「≡」のみへ簡略化し、aria-label / titleは維持
- `/player/` のcaptionテロップ下帯をiPad PWAでも残るように背景指定を強化
- Google Photos Pickerのユーザー認証・選択待ちアプリ側timeoutを30分に延長

## 公開URL

```text
https://ipad-slideshow-pwa.vercel.app/
```

現在の本番運用対象はVercel productionです。GitHub Pages前提の`basePath: "/ipad-slideshow-pwa"`は初期段階の履歴として残っていますが、現在のmanifest / icon / Service Workerはroot path前提です。

## 現在使える画面

- `/` トップ画面
- `/settings` Google接続、Drive workspace確認、IndexedDB疎通確認
- `/admin` Drive project、Photos Picker batch素材追加、画像順変更、複数slide削除、slide複製、テロップ編集、offline sync、confirmed store、storage管理
- `/player` iPad offline-first再生、project selector、自動送り設定、本番モード、操作ロック、テロップ表示
- `/auth-test` OAuth単体確認用の開発ページ

## 重要な運用方針

- iPadホーム画面PWAで安定して動くことを優先する
- access tokenは保存しない、表示しない、console出力しない
- access tokenはProvider内部のメモリ上にだけ保持する
- Google OAuth scopeは原則`https://www.googleapis.com/auth/drive.file`
- Client SecretとAPIキーは作らない、使わない
- Drive上のworkspace / project / manifest / assetsをsource of truthにする
- slide再生順はDrive `manifest.json.slides[]` の配列順をsource of truthにする
- Photos Pickerから追加したslideは現在のDrive `manifest.json.slides[]` の末尾へ選択順でappendする
- IndexedDBはiPad端末内のoffline playback用コピーとして扱う
- Cache StorageはService Workerのapp shell cacheとして扱う
- iPad側のローカル削除ではGoogle Drive上のデータを削除しない
- Drive上の画像順・caption変更をiPad再生へ反映するには、対象projectのoffline syncを実行する
- Drive上のslide削除・複製をiPad再生へ反映するにも、対象projectのoffline syncを実行する

## ローカル起動

```bash
npm run dev
```

ローカル確認URL:

```text
http://localhost:3000/
```

## ビルド確認

```bash
npm run lint
npm run build
```

`next/font` がGoogle Fontsをビルド時に取得するため、ネットワーク制限下では`npm run build`がFonts取得で失敗することがあります。

## 次の作業候補

- README以外の古い設計docsを、現行方針と履歴に分けて整理する
- 動画再生、公開履歴、ロールバックを順番に追加する

## 最新ハンドオフ

- `docs/handoffs/2026-06-13-player-admin-polish-fixes-handoff.md`
- `docs/handoffs/2026-06-12-slide-dnd-delete-duplicate-handoff.md`
- `docs/handoffs/2026-06-12-player-auto-advance-transition-and-slide-reorder-handoff.md`
- `docs/handoffs/2026-06-12-caption-telop-and-batch-asset-import-handoff.md`
- `docs/handoffs/2026-06-12-production-mode-and-operation-lock-handoff.md`
- `docs/handoffs/2026-06-12-multi-project-playback-preparation-handoff.md`
- `docs/handoffs/2026-06-12-advanced-offline-storage-controls-handoff.md`
- `docs/handoffs/2026-06-10-offline-storage-management-ui-handoff.md`
- `docs/handoffs/2026-06-10-ipad-pwa-offline-shell-verification-handoff.md`
- `docs/handoffs/2026-06-10-pwa-offline-shell-local-recovery-handoff.md`
