# スライドショー

iPadで安定して再生するためのスライドショーPWAです。

このプロジェクトでは、PCでスライドショーを管理・編集し、iPadでは同期・検証・再生を行うことを目指します。
最優先は、学校現場・イベント現場で本番中に止まらないことです。

## 現在の到達点

現在は第1-1です。

- Windows 11上でNext.jsアプリを起動する
- トップ、管理、再生、設定のダミー画面を作る
- GitHub Pages Project site前提の設定を入れる
- PWA骨格としてmanifestと仮アイコンを用意する
- READMEとdocs骨格を作る
- 初期リスクをrisk-registerに整理する

## 使用技術

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- npm
- GitHub
- GitHub Pages

## 公開予定URL

https://hamakirin1230.github.io/ipad-slideshow-pwa/

## ローカル起動

npm run dev

ローカル確認URL:

http://localhost:3000/ipad-slideshow-pwa/

## ビルド確認

npm run build

## 第1-1で作る画面

- / トップ画面
- /admin 管理画面ダミー
- /player 再生画面ダミー
- /settings 設定画面ダミー

## 第1-1では未実装

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

## ドキュメント

- docs/requirements.md
- docs/roadmap.md
- docs/setup-windows.md
- docs/decisions.md
- docs/architecture.md
- docs/data-flow.md
- docs/risk-register.md