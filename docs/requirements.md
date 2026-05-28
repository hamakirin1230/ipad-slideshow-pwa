# 要件メモ

## 目的

iPadで安定して閲覧・操作できるスライドショーPWAを作る。

最優先は、学校現場・イベント現場の本番中に止まらないこと。派手な演出やAI機能より、再生の安定性、同期の確実性、誤操作防止を重視する。

## 想定利用

- PCでスライドショーを管理・編集する
- iPadでは同期、検証、再生を行う
- 本番時はオフラインでも再生できる状態を目指す
- iPadはSafari通常タブではなく、ホーム画面に追加したPWAから起動する

## 初期版の技術前提

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- GitHub Pages
- Google Drive
- Google Photos Picker
- Google OAuth 2.0
- IndexedDB

## 第1ゴール

GitHub Pagesに公開したPWAを、iPadのホーム画面から起動できる状態にする。

## 第1-1の完了条件

- Windows 11 PCに Node.js LTS / VS Code / GitHub Desktop を入れる
- GitHubに public repository `ipad-slideshow-pwa` を作る
- `C:\Users\<Windowsユーザー名>\src\ipad-slideshow-pwa` にcloneする
- リポジトリ直下に Next.js / TypeScript / Tailwind / shadcn/ui の雛形を作る
- GitHub Pages Project site前提の `basePath` と静的export設定を入れる
- `/`, `/admin`, `/player`, `/settings` のワイヤーフレーム寄りダミー画面を作る
- `manifest.json`、仮アイコン、基本メタタグを入れる
- READMEとdocs骨格を作る
- `risk-register.md` に初期リスクを入れる
- `npm run dev` でPCブラウザ表示を確認する
- `npm run build` が成功する

## 第1-1では実装しないこと

- Google OAuth
- Google Drive連携
- Google Photos Picker連携
- 画像・動画アップロード
- iPad同期
- IndexedDB保存
- Service Worker
- オフライン本番再生
- 動画再生
- テロップ編集
- 公開履歴・ロールバック

## 非機能要件

- iPad本番再生中に止まらないことを優先する
- GitHub Pages Project siteで壊れないパス設計にする
- Drive APIの権限は最小化する
- iPad側の削除操作はローカルデータ削除に限定する
- 本番前に同期状態とオフライン再生可否を確認できるようにする