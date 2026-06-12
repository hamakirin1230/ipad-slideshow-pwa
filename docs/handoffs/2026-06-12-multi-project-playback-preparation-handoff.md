# Multi-project playback preparation handoff

Date: 2026-06-12
Project: `ipad-slideshow-pwa`

## 目的

この handoff は、複数 project の offline playback に向けた準備として、confirmed store に複数 project を残せるようにし、`/player/` で再生対象 project を選択できるようにした状態を記録する。

前回までの `/player/` は、ready な offline sync state が2件以上あると invalid として扱っていた。

今回の変更では、複数 ready project を異常扱いせず、再生対象を選ぶ導線へ進めるようにした。

## 今回の到達点

追加・変更した内容:

```txt
confirmed store promotion 時に他 project の confirmed records を削除しない
offline playback snapshot helper が projectId 指定を受け取れる
ready project が複数ある場合は projectSelectionRequired を返す
/player/ に project selector を追加
/player/?projectId=... で対象 project を直接開ける
最後に選んだ projectId を localStorage に保存する
/admin/ confirmed projects から「このprojectを再生」で /player/?projectId=... へ遷移できる
```

## 変更ファイル

```txt
src/lib/offline-staging-promotion.ts
src/lib/offline-playback-snapshot.ts
src/app/player/use-offline-playback-snapshot.ts
src/app/player/page.tsx
src/app/admin/offline-confirmed-store-panel.tsx
```

## 設計上の整理

### confirmed store promotion

これまでは promotion 時に、同期中 project 以外の confirmed records を削除していた。

今回からは削除対象を以下に限定する。

```txt
同一 projectId の obsolete confirmed assets
同一 projectId の obsolete confirmed asset blobs
```

削除しないもの:

```txt
他 project の confirmed project
他 project の confirmed assets
他 project の confirmed asset blobs
他 project の offline sync state
```

これにより、将来複数 project を端末内に保存しておける。

### playback snapshot

`readOfflinePlaybackSnapshot()` は、任意の `projectId` を受け取れる。

```txt
projectId 未指定 + ready project 0件:
  empty

projectId 未指定 + ready project 1件:
  ready

projectId 未指定 + ready project 2件以上:
  projectSelectionRequired

projectId 指定 + 対象 project ready:
  ready

projectId 指定 + 対象 project が ready ではない:
  projectSelectionRequired
```

`projectSelectionRequired` には、選択候補として以下を含める。

```txt
projectId
projectTitle
slideCount
assetCount
assetBlobCount
syncedAt
sourceUpdatedAt
syncRunId
```

### last played projectId

`/player/` 側では、最後に選んだ projectId を以下の key で localStorage に保存する。

```txt
ipad-slideshow:last-playback-project-id
```

保存するのは projectId のみ。

保存しないもの:

```txt
access_token
Blob
Drive raw response
manifest raw object
```

### URL 指定

`/admin/` からは以下の URL へ遷移する。

```txt
/player/?projectId=<encoded projectId>
```

`/player/` は URL query の `projectId` を localStorage より優先し、その projectId を last played として保存する。

## UI

### /player/

ready project が複数あり、選択対象が未指定または無効な場合:

```txt
再生するprojectを選択してください
```

各 project には以下を表示する。

```txt
project title
projectId short display
slides
assets
asset blobs
syncedAt
sourceUpdatedAt
```

再生中に複数 project が保存されている場合は、上部 overlay に project 選択へ戻る icon button を表示する。

### /admin/

`confirmed projects` の各 project に以下を追加した。

```txt
このprojectを再生
```

このボタンは IndexedDB や Drive を変更せず、対象 projectId 付きで `/player/` を開くだけ。

## 確認済み

ローカルで確認済み:

```txt
npm run lint
npm run build
git diff --check
Browser で /player/?projectId=test-project を開く
Browser で /admin/ を開く
console error なし
```

ローカル環境には confirmed project がないため、project selector の実データ表示は未確認。
実データ確認は、複数 project を offline sync した後に `/player/` で行う。

## 次の確認候補

```txt
Vercel production で project A を offline sync
project B を offline sync
/admin/ confirmed projects に2件残ることを確認
/player/ で project selector が表示されることを確認
project A / B を選んで再生できることを確認
last played projectId が次回起動で効くことを確認
```
