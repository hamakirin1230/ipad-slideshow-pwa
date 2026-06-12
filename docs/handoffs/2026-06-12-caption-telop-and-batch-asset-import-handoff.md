# Caption telop and batch asset import handoff

Date: 2026-06-12
Project: `ipad-slideshow-pwa`

## 目的

この handoff は、`/player/` のテロップ表示、`/admin/` のslide別テロップ編集、Google Photos Pickerからの複数素材追加対応を記録する。

今回スキップしたもの:

```txt
PINロック
パスコード
管理者認証
動画再生
project削除
公開履歴
ロールバック
confirmed store容量自動制御
```

## テロップ

新しいticker / marquee / project-wide announcementは作らず、既存の`slide.caption`をテロップ本文として扱う。

```txt
保存先: Drive project manifest.json の slides[].caption
source of truth: Drive manifest
plain textのみ
保存時trim
上限80文字
空文字は非表示
player表示は最大2行
```

`/admin/` の本編スライド順に、slideごとのtextareaと保存buttonを追加した。保存は個別slide単位で行い、保存後にproject detailsを更新する。

caption変更をiPad再生へ反映するには、対象projectのoffline syncが必要。confirmed storeをcaption保存時に直接書き換えない。

## Player表示

`/player/` のcaption表示を通常controlsから分離し、テロップoverlayとして表示する。

```txt
normal modeで表示
production modeで表示
lock中も表示
pointer-events-none
左右swipeを邪魔しない
safe-area考慮
最大2行clamp
```

## Batch素材追加

Google Photos Pickerの選択上限を、次の実効上限にした。

```txt
min(10, 50 - currentSlideCount)
```

処理方針:

```txt
複数選択
itemごとに順次download
itemごとに順次Drive assets/ upload
成功itemをsavedAssetsとして集める
成功itemが1件以上あればmanifest.jsonへbatch append
index.jsonの対象project.updatedAtを更新
更新後にmanifest / indexを再読込して検証
```

partial failure方針:

```txt
成功分と失敗分をUIで分けて表示
失敗itemがあっても成功itemがあればmanifest appendへ進む
Drive保存済みだがmanifest未反映のassetが残る可能性を診断に出す
自動削除しない
自動修復しない
project切り替え時にbatch stateをreset
```

## 変更ファイル

```txt
src/lib/google-photos-picker.ts
src/lib/google-drive.ts
src/app/app-providers.tsx
src/app/admin/asset-import-panel.tsx
src/app/admin/drive-project-workspace-panel.tsx
src/app/player/page.tsx
README.md
docs/current-context.md
docs/handoffs/2026-06-12-caption-telop-and-batch-asset-import-handoff.md
```

## 確認済み

ローカルで確認済み:

```txt
npm run lint
npm run build
git diff --check
Browserで /admin/ と /player/ を開く
console errorなし
ローカル未接続状態で /admin/ の追加可能枚数とbatch素材追加説明が表示されること
ローカル未接続状態で /player/ のoffline data不足blocking messageが表示されること
```

## Production / iPad確認項目

```txt
Project Aで複数素材を追加
成功item / 失敗itemのUI表示
manifestに成功分のslidesが追加されること
slideごとのcaption編集・保存
offline sync後に /player/?projectId=<Project A> でテロップ表示
production mode + lock中もテロップ表示
lock中swipeで前後移動
Project Bでも同じ流れを確認
PWA再起動後もconfirmed storeからテロップ付き再生
```

## 既知の制約

```txt
動画は未対応
captionはplain textのみ
captionのフォント・位置・色の詳細カスタマイズは未対応
project-wide固定テロップは未対応
scrolling marqueeは未対応
Drive保存済みだがmanifest未反映になったassetの自動削除は未対応
confirmed storeへの反映にはoffline syncが必要
batch importは順次処理であり、完全なtransactionではない
```
