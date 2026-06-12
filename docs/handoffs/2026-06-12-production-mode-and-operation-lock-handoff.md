# Production mode and operation lock handoff

Date: 2026-06-12
Project: `ipad-slideshow-pwa`

## 目的

この handoff は、`/player/` に本番モードと操作ロックを追加し、iPadを会場・学校現場で置きっぱなしにする前提の誤操作防止まで進めた状態を記録する。

今回の目的はセキュリティではなく、本番再生中の accidental tap / swipe による状態変更を防ぐこと。

## 前提として確認済み

Vercel productionで以下を確認済み:

```txt
Project A / Project Bを識別できるtitle管理
複数Drive projectの作成
既存projectの切り替え
選択中projectへの素材追加
選択中projectのoffline sync
confirmed storeに複数projectを保持
/player/のproject selector
/player/?projectId=<Project A>でproject指定再生
/player/?projectId=<Project B>でproject指定再生
```

## 今回の到達点

追加・変更した内容:

```txt
/player/にPlayerPresentationModeを追加
/player/にPlayerInteractionLockを追加
normal modeの再生UIに本番モード開始ボタンを追加
production mode ONで通常操作UIを非表示
production mode ONでlockもON
lock中はtap / swipe / next / previous / project selector戻り / playback toggleを無効化
lock中も自動送りは継続
右上の2秒長押しでlock解除
lock解除後もproduction modeは維持
production mode OFFでlockもOFF
production modeはlocalStorageへ保存
lock状態はlocalStorageへ保存しない
```

## 変更ファイル

```txt
src/app/player/page.tsx
README.md
docs/current-context.md
docs/handoffs/2026-06-12-production-mode-and-operation-lock-handoff.md
```

## 設計上の整理

### presentation mode

追加した状態:

```ts
type PlayerPresentationMode = "normal" | "production";
```

保存key:

```txt
ipad-slideshow:player-presentation-mode
```

保存する値:

```txt
normal
production
```

保存しないもの:

```txt
access_token
Blob
Drive raw response
manifest raw object
lock解除操作の内部状態
```

### interaction lock

追加した状態:

```ts
type PlayerInteractionLock = "unlocked" | "locked";
```

lock状態は永続化しない。

PWA再起動後にproduction modeが復元されても、lockは`unlocked`から始まる。

### 自動送り

手動操作の`goToNextSlide()`とは別に、タイマー用の`advanceToNextSlide()`を追加した。

これにより、lock中は手動next / previousを止めつつ、自動送りだけ継続できる。

## UI

normal mode:

```txt
既存のtop overlay
project selectorへ戻るbutton
play / pause
reload
admin / home
previous / next
progress
本番モードbutton
```

production mode:

```txt
スライド画像を全面表示
通常操作UIを非表示
右上に小さい本番モード/ロックUI
lock中は「長押しでロック解除」
unlock後は「ロック」「本番終了」
```

## 確認済み

ローカルで確認済み:

```txt
npm run lint
npm run build
git diff --check
Browserで /player/ を開く
Browserで offline data不足時のblocking messageを確認
Browser console errorなし
```

ローカルブラウザにはconfirmed projectがないため、以下はVercel production / iPad PWAの実データ環境で確認する:

```txt
production mode ON/OFF
2秒長押しunlock
/player/?projectId=<Project A>
/player/?projectId=<Project B>
```

## 次の作業候補

```txt
動画再生
テロップ
公開履歴
ロールバック
```
