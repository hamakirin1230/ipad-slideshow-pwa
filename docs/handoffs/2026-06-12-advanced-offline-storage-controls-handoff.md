# Advanced offline storage controls handoff

Date: 2026-06-12
Project: `ipad-slideshow-pwa`

## 目的

この handoff は、`/admin/` の confirmed offline store panel に、端末ストレージ概要と Service Worker app shell cache 管理を追加した状態を記録する。

前回までに、IndexedDB confirmed store の project / asset / asset Blob 件数、project ごとの保存容量、project 単位ローカル削除までは確認できるようになっていた。

今回の変更では、その後続として **ブラウザ全体の storage estimate と PWA app shell cache の状態を `/admin/` で確認できるようにした**。

## 今回の到達点

`/admin/` の `confirmed offline store` panel に以下を追加した。

```txt
端末ストレージ概要セクション
navigator.storage.estimate() の usage / quota / usage ratio 表示
navigator.storage.persisted() の状態表示
usageDetails が取れる場合の内訳表示
Cache Storage の cache count / total entries 表示
app shell cache の存在確認
app shell cache entry count 表示
app shell cache の sample request path 表示
app shell cache 削除ボタン
```

## 変更ファイル

```txt
src/lib/offline-storage-management.ts
src/app/admin/offline-confirmed-store-panel.tsx
```

## 設計上の整理

### IndexedDB と Cache Storage を分けて扱う

今回の UI では、保存先を明確に分けて表示する。

```txt
IndexedDB:
  offline playback 用の project / asset metadata / asset Blob / sync state

Cache Storage:
  Service Worker による app shell cache
  manifest / icons / Next.js static chunks など

Google Drive:
  workspace / project / manifest / assets の source of truth
```

`app shell cache を削除` は Cache Storage のみを対象にする。

削除しないもの:

```txt
IndexedDB の project
IndexedDB の asset metadata
IndexedDB の asset Blob
IndexedDB の sync state
Google Drive 上の workspace / project / manifest / assets
```

### app shell cache 名

現在の app shell cache 名:

```txt
ipad-slideshow-pwa-app-shell-v1
```

`public/sw.js` と同じ名前を `src/lib/offline-storage-management.ts` 側にも持たせている。

将来 cache version を変える場合は、両方を同時に更新する。

## UI 操作

### 端末ストレージを確認

`/admin/` で以下を押す。

```txt
confirmed offline store
-> 端末ストレージ概要
-> 端末ストレージを確認
```

表示される主な値:

```txt
storage usage
storage quota
usage ratio
app cache entries
browser storage estimate 対応状況
persistent 状態
usageDetails
Cache Storage 対応状況
cache count
total entries
app shell cache の有無
```

### app shell cache を削除

`app shell cache` が存在する場合だけ、削除ボタンを有効にする。

確認 dialog で以下を明示する。

```txt
削除対象は Service Worker の app shell cache
IndexedDB の offline playback data は削除しない
Google Drive 上のデータは削除しない
```

削除後は storage snapshot を再取得し、cache が消えた状態を表示する。

## 既知の制約

### Cache Storage の bytes は直接表示しない

ブラウザ標準 API では Cache Storage の各 cache ごとの byte size を直接返さない。

今回の UI では以下で代替する。

```txt
navigator.storage.estimate() の全体 usage
Cache Storage の cache count
Cache Storage の request entry count
app shell cache sample URL
```

### localhost では app shell cache が存在しない場合がある

Service Worker registration は production build 中心のため、local dev の `/admin/` では app shell cache が 0 件になることがある。

本番確認では Vercel production の PWA として一度オンラインで起動した後に `/admin/` で確認する。

## 確認済み

ローカルで確認済み:

```txt
npm run lint
npm run build
git diff --check
Browser で /admin/ を開く
端末ストレージ概要が表示される
端末ストレージを確認ボタンで usage / quota / Cache Storage 情報が表示される
console error なし
```

## 次の候補

次に自然なのは以下。

```txt
multi-project playback preparation
README / current-context の最新化
Vercel production で app shell cache 管理UIの実機確認
```
