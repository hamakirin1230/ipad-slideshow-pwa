# ロードマップ

## 第1ゴール: PWAの土台を作る

GitHub Pagesに公開したPWAを、iPadのホーム画面から起動できる状態にする。

### 第1-1: Windows 11でNext.jsアプリを起動する

- Windows 11上に開発環境を用意する
- GitHubリポジトリを作成してcloneする
- Next.js / TypeScript / Tailwind / shadcn/ui の雛形を作る
- GitHub Pages Project site前提の設定を入れる
- トップ、管理、再生、設定のダミー画面を作る
- PWA骨格を作る
- READMEとdocs骨格を作る
- ローカル表示とビルドを確認する

### 第1-2: GitHubへpushする

- GitHub Desktopで差分を確認する
- 小さな単位でcommitする
- `main` ブランチへpushする

### 第1-3: GitHub Pagesで公開する

- GitHub Actionsで静的ビルドする
- GitHub Pagesに公開する
- 公開URLを確認する

### 第1-4: iPadでPWA起動を確認する

- iPad Safariで公開URLを開く
- ホーム画面に追加する
- ホーム画面からPWAとして起動する
- トップ、管理、再生、設定の入口を確認する

## 第1.5ゴール: MacBookで開発環境を再現する

Windowsで第1ゴール完了後に実施する。

- MacBookにNode.js、VS Code、GitHub Desktopを用意する
- `/Users/<Macユーザー名>/src/ipad-slideshow-pwa` にcloneする
- `npm install` を行う
- `npm run dev` で起動する
- `npm run build` が成功する

## 第2ゴール: ローカル仮データで画面設計を進める

- 管理画面の情報設計を作る
- 再生画面の基本UIを作る
- 仮データでプロジェクト一覧、素材一覧、再生画面を表示する

## 第3ゴール: Google OAuth

- Google Identity Servicesを導入する
- アクセストークンは永続保存しない
- Drive APIの最小権限方針を検証する

## 第4ゴール: Google Driveワークスペース

- Drive上にワークスペースを作る
- `workspace.json` と `index.json` を扱う
- プロジェクトフォルダとmanifestを作る

## 第5ゴール: Google Photos Picker

- Googleフォトから候補素材を取り込む
- 候補素材トレイを作る
- 重複取り込みを防ぐ

## 第6ゴール: iPad同期とオフライン再生

- 公開済みmanifestを取得する
- 画像・動画をiPad内に保存する
- 同期状態を検証する
- オフライン再生テストを行う

## 第7ゴール: 本番向け機能

- テロップ
- 動画再生
- ピンチズーム
- ランダム再生
- 公開履歴
- ロールバック
- 本番モード
- 操作ロック