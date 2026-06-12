# Player / Admin polish fixes handoff

Date: 2026-06-13

## 実施内容

- D&D handle 表示を「≡」のみに変更し、`aria-label` / `title` の「ドラッグして並び替え」は維持した。
- iPad PWA でテロップ黒帯が確実に出るように、caption本文へ `rgba(0, 0, 0, 0.62)` の背景指定と `WebkitBackdropFilter` を追加した。
- 素材追加時は `manifest.json.slides[]` の現在順序の末尾へ、今回追加したslideを選択順でappendする方針を維持し、更新後検証で末尾N件のslideId順一致を確認するようにした。
- Google Photos Picker のユーザー認証・選択待ち app-side timeout を30分へ延長した。

## 触った主なファイル

- `src/app/admin/drive-project-workspace-panel.tsx`
- `src/app/player/page.tsx`
- `src/app/app-providers.tsx`
- `src/lib/google-photos-picker.ts`
- `src/lib/google-drive.ts`
- `README.md`
- `docs/current-context.md`

## 継続確認メモ

- Drive operation timeout、upload timeout、offline sync timeout、cleanup timeoutは変更していない。
- access token、Photos Picker session id、picker uriは引き続き保存・表示・診断出力しない。
- iPad PWA実機では、横向き再生、production mode + lock中のテロップ黒帯、D&D操作、素材追加後の末尾追加順を確認する。
