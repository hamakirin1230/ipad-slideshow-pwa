# Unused asset delete readiness UI handoff

Date: 2026-06-13

## 実施内容

- `/admin` の unused asset cleanup preview に削除 readiness UI を追加した。
- 未使用asset行にcheckboxを追加し、選択状態は `AssetCleanupPreviewPanel` 内のlocal stateだけで管理するようにした。
- preview result が変わったら選択状態をクリアするようにした。
- `すべて選択` / `選択解除` と、選択件数・選択total sizeの表示を追加した。
- `選択した未使用 asset を削除` buttonを表示したが、常にdisabledのままにした。
- 削除有効化前に次フェーズで必要な未実装チェックリストを表示した。

## 変更ファイル

- `src/app/admin/asset-cleanup-preview-panel.tsx`
- `docs/current-context.md`
- `docs/handoffs/2026-06-13-unused-asset-delete-readiness-ui-handoff.md`

## 重要な制約

- Drive file delete API は追加していない。
- Drive file の物理削除は実装していない。
- `manifest.json` / `index.json` / `assets/`配下fileの更新は実装していない。
- Drive read/write/delete処理、Drive再読込、metadata再取得、削除直前再検証は追加していない。
- Blob / thumbnail / image preview は取得していない。
- AppProviders のcontextは増やしていない。
- checkbox選択状態はlocalStorage / IndexedDB / sessionStorageへ保存していない。
- access token、Authorization header、raw URL、Drive API URLはUI / diagnostics / consoleへ出していない。

## 未実装のまま残したこと

- 削除直前に Drive manifest.json を再読込する処理
- 削除直前に assetFileId の参照数を再計算する処理
- 削除対象fileのDrive metadataを再取得する処理
- referenceSlideCount が 0 のfileだけを削除対象にする最終検証
- 削除対象の assetName / size / fileId をconfirmで再表示するUI
- Drive file削除実行
- 削除実行後のcleanup preview再実行
- 削除失敗時のpartial failure表示

## 検証コマンド

```bash
npm run lint
npm run build
git diff --check
```

## 受け入れ条件

- unused assetがある場合、各rowにcheckboxが表示される。
- 初期選択は0件。
- row checkboxを選ぶと、選択件数と選択total sizeが更新される。
- `すべて選択` で全unused assetsが選択される。
- `選択解除` で0件に戻る。
- `選択した未使用 asset を削除` buttonは表示されるが常にdisabled。
- 削除前checklistは「未実装」「次フェーズで必要」として表示される。
- preview result更新時に選択状態がクリアされる。
- Drive fileは削除されない。
- `manifest.json` / `index.json` は更新されない。
- diagnosticsにaccess token / Authorization / raw URLは出ない。
