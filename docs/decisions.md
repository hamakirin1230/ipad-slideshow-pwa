# 決定事項ログ

## 2026-05-27

### プロジェクト目的

iPadで安定して再生できるスライドショーPWAを作る。  
最優先は、学校現場・イベント現場の本番中に止まらないこと。

### 初期版の技術方針

- Next.js / TypeScript / Tailwind CSS / shadcn/ui を使う
- 初期版は完全静的PWAとして作る
- GitHub Pagesで公開する
- API Routes、Server Actions、SSRは初期版では使わない
- GitHub Pages Project site前提で作る

### GitHub方針

- GitHubユーザー名: `hamakirin1230`
- リポジトリ名: `ipad-slideshow-pwa`
- 公開予定URL: `https://hamakirin1230.github.io/ipad-slideshow-pwa/`
- 初期はpublic repositoryで進める
- mainブランチ中心で進める
- GitHub Desktopを使う

### ローカル作業場所

Windows:

`C:\Users\syokota\src\ipad-slideshow-pwa`

MacBook予定:

`/Users/<Macユーザー名>/src/ipad-slideshow-pwa`

### 第1-1の範囲

第1-1では、Windows 11上でNext.jsアプリを起動し、トップ、管理、再生、設定のダミー画面を表示する。  
READMEとdocs骨格、初期リスク登録も第1-1に含める。

### 第1-1で入れるPWA骨格

- `manifest.json`
- 仮アイコン
- 基本メタタグ
- iPadホーム画面追加を意識したアプリ名

Service Workerは第1-1では入れない。

### アプリ表示名

- name: `スライドショー`
- short_name: `スライドショー`

### Next.js設定

GitHub Pages Project site前提で、初期から次を入れる。

- `output: "export"`
- `basePath: "/ipad-slideshow-pwa"`
- `trailingSlash: true`
- `images.unoptimized: true`

### MacBook対応

Windowsで第1ゴール完了後、第1.5としてMacBookでclone・起動・ビルド確認を行う。

### 未決事項

- 公開履歴・ロールバック機能の扱い
- 動画ファイルのサイズ上限
- 動画の長さ上限
- 推奨ビットレート
- 画像長辺2048px方針の実機検証
- 本番モード・操作ロックの実装時期