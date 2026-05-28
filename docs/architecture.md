# アーキテクチャメモ

## 基本方針

初期版は、GitHub Pagesで公開する完全静的PWAとして作る。

サーバー側処理には依存しない。  
Next.jsのAPI Routes、Server Actions、SSRは初期版では使わない。

## 全体構成

| 領域 | 方針 |
| --- | --- |
| アプリ本体 | Next.js静的PWA |
| 公開先 | GitHub Pages Project site |
| ソース管理 | GitHub |
| UI | Tailwind CSS / shadcn/ui |
| 素材取り込み元 | Google Photos Picker |
| 素材・manifest保存先 | Google Drive |
| iPad内保存 | IndexedDB Blob中心 |
| 認証 | Google OAuth 2.0 / Google Identity Services |

## GitHub Pages

公開予定URL:

`https://hamakirin1230.github.io/ipad-slideshow-pwa/`

Project siteとして公開するため、Next.jsには以下を設定する。

- `basePath: "/ipad-slideshow-pwa"`
- `output: "export"`
- `trailingSlash: true`
- `images.unoptimized: true`

## ルーティング

第1-1では以下の画面を作る。

- `/` トップ画面
- `/admin` 管理画面ダミー
- `/player` 再生画面ダミー
- `/settings` 設定画面ダミー

GitHub Pages公開時は、実際のURL上では `/ipad-slideshow-pwa/` 配下で動く。

## PCとiPadの役割

### PC

- ワークスペース管理
- プロジェクト管理
- 素材取り込み
- 画像最適化
- manifest編集
- 公開処理

### iPad

- 公開済みmanifestの取得
- 素材の同期
- オフライン再生前の検証
- 本番再生
- ローカルデータ削除

iPad側では、Drive上のデータ削除は行わない。

## Google Drive

初期版では、共有ドライブではなく管理者のマイドライブを使う。

想定構成:

`任意の保存先フォルダ/Slideshow Projects/`

その中に以下を持つ。

- `workspace.json`
- `index.json`
- `projects/`

各プロジェクトは1つのスライドショーに対応する。

## manifest

manifestがスライドショー構成の正本になる。

- PC側は `draft.manifest.json` を編集する
- 公開時に `published.manifest.json` を作る
- iPadは `published.manifest.json` のみを見る

## PWA

第1-1では以下のみを入れる。

- `public/manifest.json`
- 仮アイコン
- 基本メタタグ
- iPadホーム画面追加を意識した表示名

Service Workerは第1-1では入れない。  
キャッシュ制御は後続の同期・オフライン再生設計が固まってから扱う。

## セキュリティ方針

- アクセストークンは永続保存しない
- Google Driveスコープは `drive.file` 中心にする
- GitHubには写真、動画、manifest、学校関係データ、秘密情報を置かない
- Drive全体アクセスは避ける