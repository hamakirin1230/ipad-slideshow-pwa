# Unused asset delete preflight handoff

Date: 2026-06-13

## 実施内容

- unused asset cleanup delete readiness UI に削除直前preflightとconfirm previewを追加した。
- preflightではfresh manifestを再読込し、assetFileIdごとの参照数を再計算する。
- preflightでは選択されたassetFileIdごとにDrive metadataを再取得する。
- preflight結果をeligible / blockedに分け、checked / eligible / blocked / fresh manifest slide count / eligible total sizeを表示する。
- confirm previewにはpreflight済みeligible assetを再表示する。
- final delete buttonは表示のみで、常にdisabledのままにした。

## 変更ファイル

- `src/lib/google-drive.ts`
- `src/app/app-providers.tsx`
- `src/app/admin/asset-cleanup-preview-panel.tsx`
- `docs/current-context.md`
- `docs/handoffs/2026-06-13-unused-asset-delete-preflight-handoff.md`

## preflight の判定条件

- selected assetFileIdsはdedupeし、最大50件までに制限する。
- fresh manifestからassetFileIdのreferenceSlideCountを計算する。
- Drive metadataは `id,name,mimeType,createdTime,modifiedTime,appProperties,size,parents,trashed` を再取得する。
- `trashed !== true` であること。
- `appProperties.app === "ipad-slideshow-pwa"` であること。
- `appProperties.role === "asset"` であること。
- workspaceId / projectId が選択中projectと一致すること。
- parentに選択中projectの `assetsFolderId` が含まれること。
- MIME typeが `image/jpeg` / `image/png` / `image/webp` のいずれかであること。
- fresh manifest上のreferenceSlideCountが0であること。

## UI 仕様

- 選択assetがあるときに `削除前再検証` buttonを表示する。
- preflight中はbuttonをin-flight表示にする。
- preflight結果のdiagnosticsは件数中心の安全な文言だけを表示する。
- blocked assetがある場合は、このままでは将来の物理削除も実行できない旨を表示する。
- confirm previewでも `preflight済み asset を物理削除` buttonは常にdisabled。

## 実装しなかったこと

- Drive file delete API
- Drive file削除実行
- `manifest.json` / `index.json` 更新
- Drive asset file更新
- Blob / thumbnail / image preview取得
- IndexedDB / localStorage / sessionStorageへの選択状態保存
- `/player` / offline sync / Google OAuth / Photos Picker変更

## 重要な安全制約

- このコミットはread + validate + displayのみ。
- access tokenはAppProviders内部refだけで扱い、UI / diagnostics / consoleには出さない。
- Authorization header、Bearer、raw Drive API URLは表示しない。
- eligibleでもこのコミットでは削除しない。

## 検証コマンド

```bash
npm run lint
npm run build
git diff --check
```

## browser acceptance

- `/admin` でDrive project ready後、unused assetを選択して `削除前再検証` を実行できる。
- preflight結果にchecked / eligible / blocked / fresh manifest slide count / eligible total sizeが表示される。
- blocked reasonが表示される。
- confirm previewが表示される。
- final delete buttonは常にdisabled。
- diagnosticsにaccess token / Authorization / Bearer / raw URLが出ない。

## iPad PWA acceptance

- cleanup preview cardが横向きで崩れない。
- checkboxと `削除前再検証` buttonをタップできる。
- preflight resultとconfirm previewが読める。
- 横スクロールと縦スクロールが大きく干渉しない。
- final delete buttonがdisabledで誤操作できない。
- `/player` の再生、production mode、lock、swipe、自動送り、テロップ表示に影響がない。

## 次フェーズ候補

- Drive delete APIの追加可否を改めて確認する。
- 物理削除直前confirmを実行UIとして設計する。
- delete実行後のcleanup preview再実行を追加する。
- partial failure handlingをUIに追加する。
