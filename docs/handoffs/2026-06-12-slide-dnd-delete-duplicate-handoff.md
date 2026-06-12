# Slide drag-and-drop, bulk delete, and duplicate handoff

Date: 2026-06-12
Project: `ipad-slideshow-pwa`

## 目的

`/admin/` のslide編集機能を拡張し、画像順のdrag-and-drop変更、複数slide一括削除、slide複製に対応した。

今回追加したもの:

```txt
Admin drag-and-drop slide reorder
Admin multiple slide bulk delete
Admin slide duplicate
Drive helper: deleteDriveProjectSlides()
Drive helper: duplicateDriveProjectSlide()
Context actions for drag reorder / delete / duplicate
```

維持したもの:

```txt
上へ / 下へボタンによるreorder
Player自動送り間隔選択
Player slide transition animation
Playerはconfirmed storeのslide順をそのまま再生
```

## 自動送り間隔

`/player/` の自動送り選択肢は継続。

```txt
なし
5秒
10秒
15秒
20秒
30秒
1分
```

保存先:

```txt
localStorage key: ipad-slideshow:player-auto-advance-interval-seconds
values: none / 5 / 10 / 15 / 20 / 30 / 60
```

`なし` はpauseではなく、auto advance timerを張らない状態。Drive manifest、confirmed store、Blobには保存しない。

## Player transition animation

next / previous / swipe / 自動送りでfade + slight horizontal slideを継続。

```txt
next: 新画像が右から少し入る
previous: 新画像が左から少し入る
prefers-reduced-motion: 短いfade
```

slide順が変わってもPlayer側に特別なreorder logicは追加しない。offline sync後にconfirmed storeへ入った順番に対して、既存のnext / previous / swipe / 自動送り / transitionが動く。

## Slide reorder保存先

画像順の正はDrive project manifest。

```txt
projects/{projectId}/manifest.json
manifest.json.slides[]
```

drag-and-drop reorderと上へ / 下へreorderは、どちらも`manifest.json.slides[]`の配列順だけを変更する。

更新するもの:

```txt
manifest.json.slides[]
manifest.json.updatedAt
index.json.projects[].updatedAt
```

変更しないもの:

```txt
asset file
assetId
assetFileId
caption
durationSeconds
Drive assets/内のファイル
confirmed store
```

## Drag-and-drop reorder

`@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`を追加した。

UI:

```txt
drag handleのみでdrag開始
checkbox / button / textarea操作ではdrag開始しない
drag over中は暫定順を表示
drop時にDriveへ保存
保存失敗時はDrive由来の最新順へ戻す
```

disable条件:

```txt
project readyでない
offline sync中
asset import中
caption保存中
title保存中
Drive操作中
slide edit保存中
```

## 複数slide一括削除

checkboxで複数slideを選択し、確認dialog後に削除する。

仕様:

```txt
manifest.json.slides[]から対象slide entryを削除
すべてのslide削除も許可
削除成功後は選択をクリア
Drive assets/内のasset fileは削除しない
confirmed storeは直接更新しない
```

`deleteDriveProjectSlides()`は、更新前に`index.json`と`manifest.json`を再読込し、対象projectとslideId集合を検証する。重複、存在しないslideId、空のslideIds、不整合はinvalidで止める。更新後もmanifest / indexを再読込し、対象slideが消えていることを再検証する。

## Slide複製

source slideの直後に新しいslide entryを挿入する。

新しくするもの:

```txt
slideId
createdAt
updatedAt
```

コピーするもの:

```txt
assetId
assetFileId
assetName
mimeType
caption
durationSeconds
source fields
```

仕様:

```txt
Drive asset fileはコピーしない
project全体50 slides上限を維持
confirmed storeは直接更新しない
```

`duplicateDriveProjectSlide()`は、更新前に`index.json`と`manifest.json`を再読込し、対象project、source slide、50 slides上限を検証する。更新後もmanifest / indexを再読込し、新しいslideがsource直後にあり、assetId / assetFileId / caption / durationSecondsが維持されていることを再検証する。

## Offline syncが必要

Adminでの変更をiPad再生へ反映する流れ:

```txt
Drive manifest slides order / entries
-> offline sync
-> confirmed store slides order / entries
-> player playback order
```

drag reorder、上へ / 下へreorder、一括削除、複製のいずれも、保存直後にconfirmed storeは直接編集しない。iPadの`/player/`へ反映するには、対象projectのoffline syncが必要。

## 確認済みコマンド

ローカルで確認済み:

```txt
npm run lint
npm run build
git diff --check
Browserで /admin/ を開く
Browser console errorなし
```

## Production / iPad確認項目

```txt
Project Aでdrag-and-drop reorderを実行する
Project Aで上へ / 下へreorderも継続動作することを確認する
Project Aで複数slideを選択して一括削除する
Project Aですべてのslide削除を許可する必要がある場合は別projectで慎重に確認する
Project Aでslide複製を実行し、source直後に入ることを確認する
reorder / delete / duplicate後にmanifest.json.slides[]が意図通り変わる
index.json.projects[].updatedAtが更新される
captionがslideに紐づいたまま維持される
assetId / assetFileIdが変わらない
Drive assets/内のファイルが削除・コピーされない
offline syncを実行できる
/player/?projectId=<Project A>で新しい順番・件数どおりに再生される
next / previousが新しい順番で動く
swipeが新しい順番で動く
自動送り10秒が新しい順番で進む
transition animationが破綻しない
production mode + lock中でも新しい順番でswipeできる
Project Bでも同じ確認をする
console errorがない
```

## 既知の制約

```txt
project間のslide移動は未対応
Drive asset fileの並び替えは未対応
confirmed storeの直接編集はしない
削除したslideをUIから即時rollbackする機能は未対応
複製はDrive fileをコピーせず、同じassetFileIdを参照する
動画再生は未対応
公開履歴・ロールバックは未対応
```
