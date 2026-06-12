# Orphan asset cleanup preview handoff

Date: 2026-06-13

## 実施内容

- `/admin` に選択中project単位の未使用asset cleanup previewを追加した。
- `manifest.json.slides[]` の `assetFileId` 参照Mapと、Drive `assets/` direct childrenのmetadataを照合するread-only previewにした。
- cleanup対象候補は、`appProperties.app === "ipad-slideshow-pwa"`、`role === "asset"`、workspaceId/projectId一致、画像MIME type一致を満たすapp-managed asset fileだけに限定した。
- app-managed assetと確認できないfileは削除候補にせず、ignored countとdiagnosticsで表示する。
- Drive file数がscan上限を超える場合はpreviewを中断し、中途半端な候補を完全結果として表示しない。

## 触った主なファイル

- `src/lib/google-drive.ts`
- `src/app/app-providers.tsx`
- `src/app/admin/asset-cleanup-preview-panel.tsx`
- `src/app/admin/drive-project-workspace-panel.tsx`
- `README.md`
- `docs/current-context.md`

## 守った制約

- Drive fileの物理削除は実装していない。
- 削除ボタン、選択checkbox、confirm dialogは追加していない。
- `manifest.json` / `index.json` / `assets/`配下のfileは更新しない。
- cleanup previewではBlob本体、画像thumbnail、Drive download URLを取得しない。
- access tokenは引き続き`AppProviders`内の`useRef`からのみ読み、state/context/UI/diagnosticsへ入れない。
- diagnosticsにはaccess token、Authorization header、Drive download URL、raw API URLを出さない。
- preview結果はPlayer / IndexedDB / offline sync snapshotへ影響させない。

## 受け入れ条件

- `/admin` に「未使用 asset cleanup preview」カードが表示される。
- Google未接続、Drive/project未ready、Drive操作中、素材追加中、offline sync中、slide編集/保存中は検出ボタンがdisabledになる。
- 検出成功時にscanned asset files、referenced asset files、unused asset files、ignored files、unused total sizeを表示する。
- 未使用assetがある場合、assetName、assetFileIdPart、assetIdPart、mimeType、size、createdTime、modifiedTime、referenceSlideCountをmetadataだけで一覧表示する。
- 未使用assetが0件なら「未使用 asset は見つかりませんでした。」を表示する。
- cleanup preview実行後もDrive fileは削除されず、manifest/index/assetsも更新されない。
