# 決定事項インデックス

このファイルは、プロジェクト全体の主要な決定事項を短く参照するための索引である。
詳細な作業ログ、完了確認、実装経緯は `docs/decisions/` 配下のフェーズ別ファイルに分離する。

## プロジェクト目的

iPadで安定して再生できるスライドショーPWAを作る。
最優先は、学校現場・イベント現場の本番中に止まらないこと。

初期版では、派手な機能より以下を優先する。

* iPadホーム画面PWAで安定して起動・閲覧・操作できること
* オフライン再生に向けた構成を崩さないこと
* 同期状態をユーザーに分かりやすく表示すること
* 誤操作を防ぐこと
* Google Drive権限を最小限にすること
* GitHub Pages上で壊れない静的PWA構成にすること

## 技術方針

採用技術は以下。

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui
* npm
* GitHub
* GitHub Desktop
* GitHub Pages
* Google Drive
* Google Photos Picker
* Google OAuth 2.0
* IndexedDB

初期版は完全静的PWAとして作る。
Next.jsのAPI Routes、Server Actions、SSRは初期版では使わない。

## GitHub Pages構成

GitHub PagesはProject siteとして扱う。

Next.jsの `basePath` は以下で固定する。

```ts
basePath: "/ipad-slideshow-pwa"
```

公開URLは以下。

```text
https://hamakirin1230.github.io/ipad-slideshow-pwa/
```

GitHub Pages向けに以下のNext.js設定を維持する。

* `output: "export"`
* `basePath: "/ipad-slideshow-pwa"`
* `trailingSlash: true`
* `images.unoptimized: true`

## 作業環境

MacBookでの作業場所は以下。

```text
/Users/yokotashigehiro/src/ipad-slideshow-pwa
```

MacBook側の作業方針は以下。

```text
コード編集: Cursor
ターミナル: Cursor内蔵ターミナル
Git操作: GitHub Desktop
```

## 第1ゴール: PWA基盤

詳細: `docs/decisions/goal-01-pwa-baseline.md`

決定事項:

* `/`, `/admin`, `/player`, `/settings` の基本画面を作成する。
* READMEとdocs骨格を作成する。
* `risk-register.md` を作成する。
* iPadホーム画面PWAとして起動できる状態を第1ゴールの完了条件にする。
* Service Workerは第1-1では入れない。
* アプリ表示名は `スライドショー` とする。

完了確認:

* GitHub Actions build / deploy成功
* GitHub Pages公開URLで表示確認
* iPad Safariで表示確認
* iPadホーム画面に追加
* iPadホーム画面PWAとして起動確認
* PWA内で `/admin`, `/player`, `/settings` へ遷移確認
* `npm run lint` 成功
* `npm run build` 成功

## 第1.5ゴール: MacBook開発環境

詳細: `docs/decisions/goal-01-pwa-baseline.md`

決定事項:

* MacBookでも同じリポジトリをcloneして開発できる状態にする。
* コード編集はCursor、Git操作はGitHub Desktopを使う。
* ターミナルはCursor内蔵ターミナルを使う。

完了確認:

* GitHub Desktopでclone済み
* Cursorでプロジェクトを開けた
* `npm install` 成功
* `npm run dev` 成功
* `/`, `/admin`, `/player`, `/settings` 確認済み
* `npm run build` 成功
* GitHub DesktopのChangesが空であることを確認済み

## 第2ゴール: ローカル仮データUI

詳細: `docs/decisions/goal-02-mock-data-ui.md`

決定事項:

* 外部保存やGoogle連携に入る前に、ローカル仮データで画面設計を確認する。
* 仮データ構造は以下の3層にする。

  * Project
  * Asset
  * SlideItem
* 第2ではGoogle連携、Drive保存、Photos Picker、IndexedDB保存、Service Worker、オフライン本番再生、動画、テロップ、本番モードは対象外とする。

完了確認:

* `src/lib/mock-data.ts` 作成
* `/admin` にプロジェクト一覧、素材一覧、本編スライド順を表示
* `/player` に再生プレビュー、再生前チェック、スライド順リストを表示
* `/` と `/settings` に状態反映
* iPadホーム画面PWAで4画面確認
* `npm run lint` 成功
* `npm run build` 成功
* commit / push / deploy成功

## 第3ゴール: Google OAuth Token model

詳細: `docs/decisions/goal-03-google-oauth-token-model.md`

決定事項:

* Google OAuthはGoogle Identity ServicesのToken modelを使う。
* OAuth検証用ページは `/auth-test` とする。
* OAuth実装コードは `/settings` に直接入れず、`/auth-test` に隔離する。
* Google公式スクリプトは `/auth-test` のみで読み込む。
* Google Drive APIは第3ではまだ呼ばない。

Google scopeは以下の1つだけにする。

```text
https://www.googleapis.com/auth/drive.file
```

以下のscopeは追加しない。

* `openid`
* `email`
* `profile`
* `drive`
* `drive.readonly`
* `drive.metadata`
* `drive.appdata`

認証リクエスト方針:

```ts
scope: "https://www.googleapis.com/auth/drive.file"
prompt: "select_account"
include_granted_scopes: false
```

`consent` は毎回強制しない。

## OAuth関連ファイル構成

詳細: `docs/decisions/goal-03-google-oauth-token-model.md`

第3ゴールではOAuth処理を以下に分ける。

```text
src/app/auth-test/page.tsx
src/app/auth-test/auth-test-panel.tsx
src/lib/google-auth.ts
```

`/auth-test/page.tsx` 全体を `'use client'` にはしない。
ブラウザ上で動かす必要がある部分だけをクライアントコンポーネントに分ける。

## access_tokenの扱い

`access_token` は永続保存しない。

保存・出力禁止の対象:

* 画面表示
* console出力
* localStorage
* IndexedDB
* OPFS
* Cookie
* GitHub
* docs
* ログ

実装上、`access_token` の実値は `useRef` にだけ保持する。
`useState` には表示用の状態だけを入れる。

## 接続状態リセット

第3ゴールでの「接続状態リセット」は、Google側の許可取り消しではない。

行うこと:

* メモリ上の `access_token` を消す
* 画面を未接続に戻す
* `drive.file` scope表示を未確認に戻す

行わないこと:

* `google.accounts.oauth2.revoke()` を呼ぶ
* Googleアカウント側の許可を取り消す

画面文言は「この画面の接続状態をリセット」とする。

## GitHub Pages公開版での環境変数

ローカルでは `.env.local` に以下を設定する。

```text
NEXT_PUBLIC_GOOGLE_CLIENT_ID
```

`.env.local` はGit管理対象外とし、commitしない。

GitHub Pages公開版では、GitHub Repository Variablesに以下を設定する。

```text
NEXT_PUBLIC_GOOGLE_CLIENT_ID
```

GitHub Actionsのbuild時には、Repository VariablesをNext.jsへ渡す。

```yaml
env:
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: ${{ vars.NEXT_PUBLIC_GOOGLE_CLIENT_ID }}
```

`Client ID` はGitHubの `Secrets` ではなく、`Repository Variables` に入れる。
ただし、Client IDの実値をコード、docs、チャット、workflowに直書きしない。

## Google Cloud Console設定

詳細: `docs/decisions/goal-03-google-oauth-token-model.md`

方針:

* 個人Googleアカウントで開発用プロジェクトを作成
* Organizationなし
* Billingなし
* OAuth同意画面はExternal / テスト中
* Test usersは個人Googleアカウントのみ
* App logoは未設定
* Google Drive APIは有効化済み
* APIキーは作らない
* Service Accountは作らない
* Client Secretは使わない

OAuth Client IDはWeb applicationとして作成する。

Authorized JavaScript origins:

```text
http://localhost
http://localhost:3000
https://hamakirin1230.github.io
```

Authorized redirect URIsは空にする。

GitHub Pagesのoriginとして以下は入れない。

```text
https://hamakirin1230.github.io/ipad-slideshow-pwa/
```

理由は、Authorized JavaScript originsに登録するのはoriginであり、`/ipad-slideshow-pwa/` はpathだからである。

## 第3ゴール完了確認

詳細: `docs/decisions/goal-03-google-oauth-token-model.md`

完了確認:

* ローカル `/auth-test` でGoogle認証成功
* ローカルで `access_token` を受け取れた
* ローカルで `drive.file` scope許可済みを確認できた
* ローカルでリセット後に未接続へ戻る
* ローカルでリロード後に未接続へ戻る
* GitHub Pages公開版 `/auth-test` でClient ID設定済み表示を確認
* GitHub Pages公開版でGoogle認証成功
* GitHub Pages公開版で `drive.file` scope許可済みを確認
* GitHub Pages公開版でリロード後に未接続へ戻る
* iPadホーム画面PWAで `/auth-test` を開けた
* iPadホーム画面PWAでClient ID設定済み表示を確認
* iPadホーム画面PWAでGoogle認証成功
* iPadホーム画面PWAで `access_token` を受け取れた
* iPadホーム画面PWAで `drive.file` scope許可済みを確認
* iPadホーム画面PWAで接続状態リセット後に未接続へ戻る
* iPadホーム画面PWAを閉じて開き直すと未接続へ戻る
* `npm run lint` 成功
* `npm run build` 成功
* commit / push / deploy成功
* GitHub DesktopのChangesが空であることを確認済み

## 第4以降で守る制約

第4以降では、以下を守る。

* Google scopeは原則 `drive.file` のまま進める
* `profile` / `email` / `openid` を安易に追加しない
* `drive` や `drive.readonly` を安易に追加しない
* `access_token` を永続保存しない
* tokenの実値を画面、console、docs、ログに出さない
* Client Secretを作らない、使わない
* Drive API操作は、第4で目的を絞って段階的に追加する
* iPadホーム画面PWAで失敗したものは完了扱いにしない
* GitHub Pagesの `basePath` 前提を崩さない
* 公開版で必要な `NEXT_PUBLIC_` 値は、GitHub Repository Variablesからbuild時に渡す

## 第4-1 Google Driveワークスペース設計

詳細: `docs/decisions/goal-04-drive-workspace.md`

このセクションは第4-1の整理後に追記する。

第4-1では、Google Drive上にPWA専用ワークスペースを作るための設計判断を記録する。
第4では、プロジェクトmanifest保存、Google Photos Picker、実画像・実動画同期、IndexedDB保存、オフライン本番再生はまだ対象外とする。

## 未決事項

* 公開履歴・ロールバック機能の扱い
* 動画ファイルのサイズ上限
* 動画の長さ上限
* 推奨ビットレート
* 画像長辺2048px方針の実機検証
* 本番モード・操作ロックの実装時期
* Service Worker導入時期
* IndexedDB保存設計
* Google Photos Picker連携設計
* オフライン本番再生前チェック
* プロジェクトmanifest設計
