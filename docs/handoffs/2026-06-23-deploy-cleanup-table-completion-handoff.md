# Deploy and cleanup table completion handoff

## Date

2026-06-23

## Summary

Vercel production を現在の本番運用対象として固定し、GitHub Pages deploy workflow は手動実行用途に降格した。あわせて `/admin` の unused asset cleanup preview 周辺を、横スクロールで安全に読める表示へ補強した。

## Completed

### Deploy整理

- Vercel production を本番運用対象として確認済み。
- Vercel production URL: `https://ipad-slideshow-pwa.vercel.app/`
- Vercel Production env:
  - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` 設定済み。
  - `GITHUB_PAGES=true` 未設定。
- Google Cloud OAuth Authorized JavaScript origins に `https://ipad-slideshow-pwa.vercel.app` 登録済み。
- GitHub Pages deploy workflow は削除せず、`workflow_dispatch` のみに変更済み。
- main push では GitHub Pages deploy workflow は自動実行されない。
- Vercel production は main push で更新される。
- HTTPS push 認証問題は、`origin` を SSH remote に変更して解消済み。

関連commit:

- `f870674 docs: record existing Vercel production state`
- `5ab3ac6 ci: make GitHub Pages deploy manual`

### UI修正

- `/admin` の unused asset cleanup preview table 横スクロール表示を修正済み。
- 長い assetName / fileId / assetId / mimeType / timestamp / blocked reason が admin page 全体を押し広げないよう補強済み。
- 表、preflight eligible / blocked list、confirm preview は横スクロール内で表示する。
- truncate された値は `title` で確認可能。
- delete / preflight / confirm preview の挙動は変更していない。
- Drive file delete API は未実装のまま。
- Drive file 物理削除は未実装のまま。
- Drive / Photos Picker / offline sync / IndexedDB / player ロジックは未変更。

関連commit:

- `3a64ecc fix: stabilize asset cleanup table scrolling`

## Verification

- `npm run lint`: pass
- `npm run build`: pass
- `git diff --check`: pass
- `/admin`: local dev server で HTTP 200 を確認。
- cleanup table 修正時の HTML 確認では、`access_token` / `Authorization` / `Bearer` / raw URL 系文字列の露出なし。
- Playwright 同梱ブラウザ未インストール、system Chrome headless 起動失敗のため、スクリーンショットによる視覚確認は未実施。

## Current deployment state

- 本番運用対象は Vercel production。
- production alias は `https://ipad-slideshow-pwa.vercel.app/`。
- GitHub Pages workflow は Actions 画面から手動実行可能な状態で残す。
- GitHub Pages の過去deploymentが残っていても問題ない。

## Safety boundaries

- GitHub Pages workflow は手動実行用途として残す。
- main push の本番反映先は Vercel production。
- cleanup preview / preflight / confirm preview は read-only。
- Drive file物理削除は未実装。
- Drive file delete API は未実装。
- access token / Authorization header / raw Drive response / Blob本体をUIやログに出さない。
- player反映は既存どおり offline sync 経由。

## Next candidates

1. `/admin` cleanup preview 周辺の小さなUI polish
2. 動画再生の設計
3. 公開履歴・ロールバック設計
4. docs整理
