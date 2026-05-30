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

## 第1〜第3ゴール完了時点の設計判断

このセクションは、第1ゴールから第3ゴールまでで確定した設計判断、完了確認、今後守るべき制約を記録する。作業ログではなく、第4ゴール以降で迷ったときに参照する判断台帳として扱う。

### プロジェクト全体の優先順位

このPWAの最優先は、学校現場・イベント現場の本番中に止まらないことである。

そのため、初期版では派手なAI演出や複雑な自動化よりも、次を優先する。

* iPadホーム画面PWAで安定して起動・閲覧・操作できること
* オフライン再生に向けた構成を崩さないこと
* 同期状態をユーザーに分かりやすく表示すること
* 誤操作を防ぐこと
* Google Drive権限を最小限にすること
* GitHub Pages上で壊れない静的PWA構成にすること

### 技術構成

初期版は、完全静的PWAとして作る。

採用する主な技術は次の通り。

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

初期版では、Next.jsのAPI Routes、Server Actions、SSRは使わない。

理由は、GitHub Pagesに静的サイトとして公開する前提であり、サーバー側処理に依存すると構成が複雑になり、iPad本番運用時の切り分けも難しくなるためである。

### GitHub Pages構成

GitHub PagesはProject siteとして扱う。

そのため、Next.jsの `basePath` は次で固定する。

```ts
basePath: "/ipad-slideshow-pwa"
```

公開URLは次である。

```text
https://hamakirin1230.github.io/ipad-slideshow-pwa/
```

ローカル開発時も、`basePath` の影響でページURLには `/ipad-slideshow-pwa` が付く。

例:

```text
http://localhost:3000/ipad-slideshow-pwa/auth-test
```

### 第1ゴールの決定事項と完了確認

第1ゴールでは、GitHub Pagesに公開したPWAをiPadのホーム画面から起動できる状態まで確認した。

完了確認済みの内容は次の通り。

* WindowsでNext.jsアプリを起動できた
* `/`, `/admin`, `/player`, `/settings` のダミー画面を作成した
* READMEとdocs骨格を作成した
* `risk-register.md` を作成した
* `npm run lint` が成功した
* `npm run build` が成功した
* GitHubへcommit / pushした
* GitHub Actionsでbuild / deployが成功した
* GitHub Pages公開URLがWindowsブラウザで開けた
* iPad Safariで公開URLが開けた
* iPadホーム画面にPWAを追加した
* iPadホーム画面からPWAとして起動できた
* Safariのアドレスバーが出ないPWA表示を確認した
* PWA内で `/admin`, `/player`, `/settings` へ遷移できた

### MacBook開発環境の決定事項

MacBook側の開発環境も確認済みである。

MacBookでの作業場所は次で固定する。

```text
/Users/yokotashigehiro/src/ipad-slideshow-pwa
```

MacBook側の作業方針は次である。

```text
コード編集: Cursor
ターミナル: Cursor内蔵ターミナル
Git操作: GitHub Desktop
```

MacBook側では次を確認済みである。

* GitHub Desktopでclone済み
* Cursorでプロジェクトを開けた
* `npm install` 成功
* `npm run dev` 成功
* `/`, `/admin`, `/player`, `/settings` 確認済み
* `npm run build` 成功
* 不要な `package-lock.json` 差分は破棄済み
* GitHub DesktopのChangesが空であることを確認済み

### 第2ゴールの決定事項と完了確認

第2ゴールでは、外部保存やGoogle連携に入る前に、ローカル仮データで画面設計を確認する方針とした。

作成した仮データ構造は次の3層である。

* Project
* Asset
* SlideItem

第2ゴールでは次を完了した。

* `src/lib/mock-data.ts` を作成した
* `/admin` にプロジェクト一覧、素材一覧、本編スライド順を表示した
* `/player` に再生プレビュー、再生前チェック、スライド順リストを表示した
* `/` と `/settings` に第2ゴール時点の状態を反映した
* `npm run lint` が成功した
* `npm run build` が成功した
* commit / push済み
* GitHub Actions deploy成功
* 公開URLで反映確認済み
* iPadホーム画面PWAで4画面確認済み
* MacBookでclone / dev / build確認済み

第2ゴールでは、Google連携、Drive保存、Photos Picker、IndexedDB保存、Service Worker、オフライン本番再生、動画、テロップ、本番モードなどは実装対象外とした。

### 第3ゴールの目的

第3ゴールでは、Google OAuthのToken modelを使い、Google Drive連携の準備ができるかを検証した。

第3ゴールで確認する範囲は次に限定した。

* Google認証ボタンを押せること
* Googleアカウント選択・必要な同意画面が表示されること
* `access_token` を受け取れること
* `drive.file` scopeが許可済みか確認できること
* 画面に「Google Drive連携の準備ができています」と表示できること
* `access_token` を永続保存しないこと
* リロード後やPWA開き直し後に未接続へ戻ること
* PCローカル、GitHub Pages公開版、iPadホーム画面PWAで確認すること

第3ゴールでは、Driveフォルダ作成、workspace.json作成、index.json作成、manifest保存、Google Photos Picker連携、実画像・実動画同期、Drive APIによるファイル操作は行わない。

### Google OAuthのscope判断

第3ゴールで要求するGoogle scopeは次の1つだけとする。

```text
https://www.googleapis.com/auth/drive.file
```

次のscopeは追加しない。

* `openid`
* `email`
* `profile`
* `drive`
* `drive.readonly`
* `drive.metadata`
* `drive.appdata`

理由は、現時点ではGoogleプロフィール情報やGoogle Drive全体へのアクセスは不要であり、権限を最小限に保つためである。

`drive.file` は、このアプリで作成・選択したファイルに限定して扱うためのscopeであり、第4以降のDriveワークスペース作成に向けた最小権限として採用する。

### Google Identity Services Token model

Google OAuthは、Google Identity ServicesのToken modelを使う。

認証リクエストでは次の方針を採用する。

```ts
scope: "https://www.googleapis.com/auth/drive.file"
prompt: "select_account"
include_granted_scopes: false
```

`consent` は毎回強制しない。

理由は、毎回同意画面を強制すると確認時の体験が重くなり、本番運用時の挙動ともずれるためである。

### OAuth検証ページ

OAuth検証用ページは `/auth-test` として作成した。

`/settings` には、開発用ページとして `/auth-test` へのリンクを追加した。

OAuth実装コードは `/settings` に直接入れず、`/auth-test` に隔離する。

理由は、設定画面を本番利用者向けの情報画面として保ち、OAuth検証の一時的な状態やエラー表示を混ぜないためである。

### OAuth関連ファイル構成

第3ゴールでは、OAuth処理を1ファイルに直書きせず、次の構成に分けた。

```text
src/app/auth-test/page.tsx
src/app/auth-test/auth-test-panel.tsx
src/lib/google-auth.ts
```

役割は次の通り。

* `src/app/auth-test/page.tsx`

  * ページ全体の説明、注意書き、レイアウトを担当する
* `src/app/auth-test/auth-test-panel.tsx`

  * Google認証ボタン、接続状態表示、Google公式スクリプト読み込み、token一時保持、エラー表示を担当する
* `src/lib/google-auth.ts`

  * `drive.file` scope定数、OAuth関連型、scope確認補助関数を担当する

`/auth-test/page.tsx` 全体を `'use client'` にはしない。

理由は、ブラウザ上で動かす必要がある部分だけをクライアントコンポーネントに分け、ページ全体を不要にクライアント側へ寄せないためである。

### Google公式スクリプトの読み込み

Google認証用ライブラリは、`/auth-test` のみでGoogle公式スクリプトを読み込む。

```text
https://accounts.google.com/gsi/client
```

自前コピー、npm代替、全ページ読み込みは行わない。

理由は、OAuth検証に必要なページだけで外部スクリプトを読み込み、影響範囲を狭くするためである。

### access_tokenの扱い

`access_token` は永続保存しない。

保存禁止の対象は次の通り。

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

`useState` には、表示用の状態だけを入れる。

理由は、`access_token` は一時的な通行証であり、画面表示や永続保存の対象にすると漏えいリスクが増えるためである。

### 接続状態リセット

第3ゴールでの「接続状態リセット」は、Google側の許可取り消しではない。

行うことは次の通り。

* メモリ上の `access_token` を消す
* 画面を未接続に戻す
* `drive.file` scope表示を未確認に戻す

行わないことは次の通り。

* `google.accounts.oauth2.revoke()` を呼ぶ
* Googleアカウント側の許可を取り消す

画面文言は「この画面の接続状態をリセット」とする。

理由は、「Google連携を解除する」という表現にすると、Googleアカウント側の許可取り消しまで行うように誤解されるためである。

### GitHub Pages公開版での環境変数

ローカルでは `.env.local` に次を設定する。

```text
NEXT_PUBLIC_GOOGLE_CLIENT_ID
```

`.env.local` はGit管理対象外とし、commitしない。

GitHub Pages公開版では、GitHub Repository Variablesに次を設定する。

```text
NEXT_PUBLIC_GOOGLE_CLIENT_ID
```

GitHub Actionsのbuild時には、Repository VariablesをNext.jsへ渡す。

```yaml
env:
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: ${{ vars.NEXT_PUBLIC_GOOGLE_CLIENT_ID }}
```

`Client ID` はGitHubの `Secrets` ではなく、`Repository Variables` に入れる。

理由は、`NEXT_PUBLIC_` で始まる値はブラウザ側で使う公開前提の値であり、Client IDはClient Secretではないためである。

ただし、Client IDの実値をコード、docs、チャット、workflowに直書きしない。

### Google Cloud Console設定

Google Cloudでは、個人Googleアカウントで開発用プロジェクトを作成した。

プロジェクトの方針は次の通り。

* Organizationなし
* Billingなし
* OAuth同意画面はExternal / テスト中
* Test usersは個人Googleアカウントのみ
* App logoは未設定
* Google Drive APIは有効化済み
* APIキーは作らない
* Service Accountは作らない
* Client Secretは使わない

OAuth Client IDはWeb applicationとして作成した。

Authorized JavaScript originsには次を入れる。

```text
http://localhost
http://localhost:3000
https://hamakirin1230.github.io
```

Authorized redirect URIsは空にする。

GitHub Pagesのoriginとして、次は入れない。

```text
https://hamakirin1230.github.io/ipad-slideshow-pwa/
```

理由は、Authorized JavaScript originsに登録するのはoriginであり、`/ipad-slideshow-pwa/` はpathだからである。

### 第3ゴールの完了確認

第3ゴールでは、次を確認済みである。

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

以上により、第3ゴールは完了扱いとする。

### 第4以降で守る制約

第4以降では、次の制約を守る。

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
