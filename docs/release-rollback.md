# 公開履歴・ロールバック設計

## 目的

この文書は、iPad slideshow PWA の公開履歴とロールバック方針を整理するための運用設計である。今回の段階ではコード挙動を変更しない。

## 本番運用対象

- 本番運用対象は Vercel production。
- production alias は `https://ipad-slideshow-pwa.vercel.app/`。
- GitHub Pages は本番ではない。
- GitHub Pages workflow は削除せず、手動実行用途として残す。
- main push の本番反映先は Vercel production。

GitHub Pages は履歴または手動確認用途として扱う。GitHub Pages の過去 deployment が残っていても、本番状態の判定には使わない。

## 公開履歴の単位

公開履歴は最低限、以下の対応関係で追跡する。

- Git commit SHA
- Vercel production deployment
- production alias が指す deployment
- 必要に応じた handoff docs
- 必要に応じた Drive workspace data の状態

Git commit / Vercel deployment と Drive workspace data は別の状態である。Git / Vercel rollback を行っても、Drive workspace 内の `workspace.json`、`index.json`、project `manifest.json`、asset metadata、asset file は自動では巻き戻らない。

## 「公開済み」と呼ぶ条件

ある commit を本番公開済みと呼ぶには、少なくとも以下を確認する。

- Vercel production deployment が Ready。
- production alias が期待する deployment を指している。
- deployment の対象 commit が期待する Git commit SHA と一致している。
- `/`、`/settings`、`/admin`、`/player` の最低限の表示確認が済んでいる。
- iPad ホーム画面 PWA で確認できないものは、本番完了扱いにしない。

Drive / OAuth / offline sync / iPad 実機に依存する確認は、ローカル build 成功や Vercel Ready だけでは代替しない。

## ロールバック対象

### アプリコード rollback

アプリコード起因の障害では、以下を状況に応じて選ぶ。

- GitHub main を過去 commit 相当に戻す。
- 問題 commit を打ち消す revert commit を作る。
- Vercel production deployment を過去 deployment へ rollback する。

どれを使うかは、障害範囲、緊急度、main の履歴を保つ必要性、Vercel Dashboard での操作可否によって判断する。Codex は必要な場合に revert commit 作成までは担当できるが、push や Vercel Dashboard 操作はユーザーが行う。

### Drive workspace data rollback

Drive workspace data には以下が含まれる。

- `workspace.json`
- `index.json`
- project `manifest.json`
- asset metadata
- confirmed store へ反映される Drive 側データ

現時点で Drive data rollback の専用実装は未整備である。Drive data の不整合を戻す場合は、Git / Vercel rollback とは別に、Drive 側の状態を確認し、必要な修正方針を決める。

### 端末内状態

端末内状態には以下が含まれる。

- iPad PWA の IndexedDB
- Cache Storage
- offline sync 済み confirmed store
- Service Worker cache

これらは Vercel rollback だけでは戻らない。アプリコードを戻しても、iPad 側の confirmed store や cache が古い / 壊れた状態のまま残ることがある。player 反映は既存どおり offline sync 経由で行う。

## ロールバック手順案

### 1. 障害範囲を判定する

- アプリコード起因か。
- Drive workspace data 起因か。
- 端末内 cache / offline data 起因か。
- OAuth / Google Cloud / Vercel env 起因か。

### 2. 現在状態を記録する

- 現在の Git commit。
- 現在の Vercel deployment。
- production alias が指す deployment。
- 画面症状。
- iPad 実機での症状。
- Drive workspace の変更有無。

この記録に token、secret、credential の値を含めない。

### 3. rollback 方針を選ぶ

- revert commit。
- Vercel deployment rollback。
- Drive data 修正。
- 端末側 cache / offline data 再同期。
- 複合対応。

Git / Vercel rollback と Drive data rollback と端末内状態のリセットは別物として扱う。

### 4. rollback を実施する

- Codex は必要なら revert commit 作成まで担当する。
- push はユーザーが行う。
- Vercel Dashboard 操作はユーザーが行う。
- Google Cloud Console 操作はユーザーが行う。
- Drive data を変更する場合は、変更対象と影響範囲を先に明確にする。

### 5. rollback 後に確認する

- Vercel production deployment が Ready。
- production alias が期待する deployment を指している。
- `/settings` が表示できる。
- `/admin` が表示できる。
- `/player` が表示できる。
- Google sign-in が期待どおり動く。
- Drive workspace ready 判定が期待どおり動く。
- offline sync が期待どおり動く。
- iPad ホーム画面 PWA で期待どおり動く。

## 禁止事項

- access token を保存しない。
- access token を表示しない。
- access token を console 出力しない。
- Authorization header を UI / docs / logs に出さない。
- Drive raw response を UI / docs / logs に出さない。
- download URL や Blob 本体を UI / docs / logs に出さない。
- Client Secret / API キーは作らない、使わない。
- Drive file 物理削除は未実装。
- Drive file delete API は未実装。
- cleanup preview / preflight / confirm preview は read-only。
- rollback docs で secret や credential の値を例示しない。

## 今後の候補

- release manifest の導入。
- Drive workspace snapshot の導入。
- admin 上の release history 表示。
- rollback 前チェックリスト。
- rollback 後チェックリスト。
- iPad PWA cache reset 手順。
- Playwright screenshot smoke test。

## Mock visual check route

- `/visual-check/admin-cleanup` は、`/admin` cleanup preview 周辺をスクリーンショットレビューするための mock-only 表示確認ページ。
- 実データ、Google認証、Drive API、端末内保存は使わない。
- cleanup preview table、preflight eligible / blocked list、confirm preview、空状態を固定mockで確認する。
- 本番確認の最終判断は、Vercel production と iPad ホーム画面 PWA 実機確認で行う。
