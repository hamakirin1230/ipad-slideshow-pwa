# Player auto advance, transition, and slide reorder handoff

Date: 2026-06-12
Project: `ipad-slideshow-pwa`

## 目的

`/player/` の再生体験改善と、`/admin/` からの画像順変更対応を記録する。

今回追加したもの:

```txt
Player自動送り間隔の選択
Player slide transition animation
Admin slide reorder controls
Drive manifest.json.slides[] 配列順の保存
```

今回スキップしたもの:

```txt
drag-and-drop reorder
複数slide一括削除
slide複製
project間のslide移動
Drive asset fileの並び替え
confirmed store直接編集
動画再生
公開履歴
ロールバック
```

## 自動送り間隔

`/player/` normal controls に自動送り選択を追加した。

```txt
なし
5秒
10秒
15秒
20秒
30秒
1分
```

初期値は10秒。保存先は端末ごとのlocalStorage。

```txt
key: ipad-slideshow:player-auto-advance-interval-seconds
values: none / 5 / 10 / 15 / 20 / 30 / 60
```

`なし` はpauseではなく、auto advance timerを張らない状態。`なし` のときplay / pause buttonはdisabledになる。

Drive manifest、confirmed store、access_token、Blob、raw manifestには自動送り設定を保存しない。

## Player transition animation

slide切り替え時に短いfade + slight horizontal slideを追加した。

対象:

```txt
next button
previous button
swipe left / right
auto advance
production mode
lock中swipe
```

移動方向:

```txt
next: 新画像が右から少し入る
previous: 新画像が左から少し入る
duration: 320ms
prefers-reduced-motion: 60ms fade
```

Player内でBlobからobject URLを作成し、旧画像はtransition終了まで保持してからrevokeする。画像load前に黒画面へ落ちにくい構造にした。

captionはcurrent slideに紐づくため、slide index変更に合わせて新captionへ切り替わる。旧captionは保持しない。

## Slide reorder

`/admin/` の本編スライド順に「↑ 上へ」「↓ 下へ」を追加した。

disable条件:

```txt
先頭slideの上へ
最後slideの下へ
slideが1件だけ
reorder保存中
project readyでない
offline sync中
asset import中
caption保存中
その他Drive操作中
```

保存先:

```txt
Drive project manifest.json の slides[] 配列順
index.json.projects[].updatedAt
manifest.json.updatedAt
```

変更しないもの:

```txt
asset file
assetId
assetFileId
caption
durationSeconds
Drive assets/ 内のファイル
confirmed store
```

`reorderDriveProjectSlides()` は、更新前に`index.json`と`manifest.json`を再読込し、`orderedSlideIds`が現在のslideId集合と完全一致することを検証する。欠落、重複、存在しないslideId、件数不一致はinvalidで止める。更新後もmanifest / indexを再読込し、保存されたslide順が指定順と一致することを再検証する。自動修復はしない。

## Playerとの関係

再生順の流れ:

```txt
Drive manifest slides order
-> offline sync
-> confirmed store slides order
-> player playback order
```

Player側に特別な並び替えlogicは追加しない。offline sync後にconfirmed storeへ保存された順番をそのまま使う。

## 確認済みコマンド

ローカルで確認済み:

```txt
npm run lint
npm run build
git diff --check
```

## Production / iPad確認項目

```txt
Project Aで画像順を変更する
Project Aをoffline syncする
/player/?projectId=<Project A>で新しい順番を確認する
next / previousが新しい順番で動く
swipeが新しい順番で動く
自動送り10秒が新しい順番で進む
transition animationが破綻しない
captionがslideに紐づいたまま維持される
production mode + lock中でも新しい順番でswipeできる
Project Bでも同じ確認をする
自動送りのなし / 5秒 / 10秒 / 15秒 / 20秒 / 30秒 / 1分を確認する
PWA再起動後に自動送り設定が復元される
console errorがない
```

## 既知の制約

```txt
reorderはdrag-and-dropではなく上へ/下へボタンのみ
画像順変更後のiPad反映にはoffline syncが必要
Drive assets/ 内のファイル名やDrive folder上の表示順は再生順に使わない
confirmed storeはreorder保存時に直接更新しない
動画は未対応
transition種類・durationの選択UIは未対応
```
