# 第4-3-1 素材追加UI土台 完了報告

* 対象プロジェクト: `ipad-slideshow-pwa`
* 対象フェーズ: 第4ゴール / 第4-3-1 素材追加UI土台
* ステータス: 完了
* 最終更新日: 2026-06-04

---

## 1. 完了概要

第4-3-1では、Google Photos Picker連携とDrive `assets/` 保存に進む前の土台を追加した。

このスライスでは、外部APIの実行は行っていない。

Photos権限要求、Google Photos Picker起動、Photos API呼び出し、画像bytes取得、Drive `assets/` upload、`manifest.json.slides[]` 追加は、まだ実装していない。

---

## 2. 実装したこと

```text
- docs/decisions/goal-04-3-asset-import.md を追加
- Google Photos Picker 用 scope 定数を追加
- GoogleTokenClient.requestAccessToken の overrideConfig 型を追加
- assetImportStatus / assetImportMessage / assetImportDiagnostics の状態を追加
- DriveSlideSummary / DriveProjectReadyDetails 相当の型土台を追加
- ProjectSummary に slideCount / assetCount を追加
- /admin に素材追加準備状態を表示
- /admin に素材数 0 / 本編スライド数 0 を表示
- /admin に空の検証済みスライド一覧を表示
- 実行可能な「素材を追加」ボタンはまだ表示しない
```

---

## 3. 変更した主なファイル

```text
docs/decisions/goal-04-3-asset-import.md
src/lib/google-auth.ts
src/lib/google-drive.ts
src/app/app-providers.tsx
src/app/admin/asset-import-panel.tsx
src/app/admin/drive-project-workspace-panel.tsx
src/app/admin/page.tsx
src/app/admin/project-status-panel.tsx
```

---

## 4. 第4-3-1で追加した状態

素材追加の進捗は、既存の `projectStatus` には混ぜず、専用状態として分離した。

```text
assetImportStatus:
- idle
- requestingPhotosPermission
- openingPicker
- waitingForSelection
- downloadingFromPhotos
- uploadingToDrive
- updatingManifest
- verifying
- completed
- cancelled
- invalid
- error
```

第4-3-1では、実際の素材追加処理はまだ開始しない。

そのため、初期表示では「Google Photos Picker連携は次スライスで実装します」という案内を表示する。

---

## 5. 第4-3-1での manifest.json.slides[] の扱い

第4-3-1では、`manifest.json.slides[]` は空配列だけを `ready` として扱う。

```text
ready:
- manifest.json.slides が存在する
- slides が配列
- slides.length === 0
```

```text
invalid:
- slides が存在しない
- slides が配列ではない
- slides.length > 0
```

非空の `slides[]` は、第4-3-3で slide object と Drive asset metadata の検証を実装してから正式に扱う。

---

## 6. 第4-3-1でまだ扱わないこと

```text
- Photos権限要求
- Google Photos Picker起動
- Picker session作成
- pickerUriを開く
- session polling
- mediaItems.list
- baseUrlから画像bytes取得
- Content-Type検証
- 10MB上限検証
- Drive assets/ upload
- Drive slideAsset metadata検証
- manifest.json.slides[] append
- manifest.json保存
- 保存後のmanifest再読込検証
- サムネイル表示
- プレビュー表示
- IndexedDB同期
- オフライン本番再生
```

---

## 7. 検証結果

```text
npm run lint 成功
npm run build 成功
GitHub Actions deploy 完了
```

Next.js build では、以下のルートが静的生成された。

```text
/
 /admin
 /auth-test
 /player
 /settings
 /_not-found
```

---

## 8. 次フェーズ

次は、第4-3-2「Google Photos Picker選択まで」に進む。

第4-3-2では、Drive保存はまだ行わず、以下までに限定する予定。

```text
- Photos権限つきtoken取得
- Picker session作成
- pickingConfig.maxItemCount: "1"
- pickerUri + "/autoclose" を別ウィンドウまたは別タブで開く
- pollingConfig に従って選択完了を待つ
- mediaItems.list の結果を1件として検証
- baseUrlから画像bytesを取得
- Content-Typeを検証
- 10MB上限を検証
- 結果を/adminに診断表示する
```

Drive `assets/` への保存と `manifest.json.slides[]` への追加は、第4-3-3に分離する。
