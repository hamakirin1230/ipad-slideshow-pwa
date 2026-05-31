# iPad用スライドショーPWA制作プロジェクト 引き継ぎ資料

このチャットは、iPad用スライドショーPWA制作プロジェクトの続きです。  
以後の回答では、この引き継ぎ資料を前提コンテキストとして扱ってください。

## 1. プロジェクトの最重要方針

このプロジェクトの最重要方針は以下です。

- iPadホーム画面PWAで安定して動くことを最優先にする
- 本番中に止まらないことを最優先にする
- 最終的にオフラインのiPadだけでスライドショーを本番再生できるようにする
- 初期版は完全静的PWAとし、API Routes / Server Actions / SSR は使わない
- GitHub Pages Project site 前提を崩さない
- `basePath: "/ipad-slideshow-pwa"` を維持する
- Google OAuth scope は原則 `https://www.googleapis.com/auth/drive.file` のみ
- `openid` / `email` / `profile` / `drive` / `drive.readonly` / `drive.metadata` / `drive.appdata` は安易に追加しない
- access token は保存しない、表示しない、console出力しない
- access token は localStorage / IndexedDB / Cookie / docs / ログに出さない
- Client Secret は作らない、使わない
- APIキーは作らない、使わない
- iPadホーム画面PWAで確認できないものは完了扱いにしない

## 2. リポジトリ情報

対象リポジトリ:

```text
hamakirin1230/ipad-slideshow-pwa
```

公開URL:

```text
https://hamakirin1230.github.io/ipad-slideshow-pwa/
```

ローカル作業場所:

```text
/Users/yokotashigehiro/src/ipad-slideshow-pwa
```

作業方針:

```text
コード編集: Cursor
ターミナル: Cursor内蔵ターミナル
Git操作: GitHub Desktop
```

## 3. 現在の到達点

以下は完了済みです。

- 第1ゴール: PWA基盤
- 第1.5ゴール: MacBook開発環境確認
- 第2ゴール: ローカル仮データUI
- 第3ゴール: Google OAuth Token model
- 第4-1 Google Driveワークスペース設計グリル
- 第4 第1スライスの設計グリル
- 第4 第1スライス 第1実装単位

第4 第1スライスの第1実装単位として、以下を完了済みです。

```text
src/lib/drive-workspace.ts 新規追加
npm run lint 成功
npm run build 成功
commit / push 済み
GitHub Actions 確認済み
```

commit message は以下。

```text
Add Drive workspace structure validation
```

## 4. 今回の第4 第1スライスの目的

第4 第1スライスでは、Driveワークスペースの作成には進みません。

目的は以下です。

```text
Google接続後、ユーザーが /settings で「Drive状態を確認」を押したときだけDrive APIを呼び、
候補0件・1件・2件以上・不整合を判定して画面に表示できること。
ただし、Driveワークスペース作成・修復・選択・保存は一切しない。
```

第1スライスでやること:

- `/settings` をGoogle接続とDrive状態確認の正式導線にする
- `/auth-test` はOAuth単体確認用の開発ページとして残す
- Google接続状態とDrive状態をアプリ内Providerで共有する
- `access_token` はProvider内部の `useRef` にのみ保持する
- `access_token` を画面、console、localStorage、IndexedDB、Cookieに出さない・保存しない
- Google接続直後にDrive確認を自動実行しない
- ユーザーが `/settings` で「Drive状態を確認」を押した場合のみDrive APIを呼ぶ
- Drive APIは `gapi.client` ではなく、`fetch` でDrive REST API v3を直接呼ぶ
- Google Driveワークスペース候補を `appProperties` で検索する
- フォルダ名だけでは候補扱いしない
- ゴミ箱内の項目は候補に含めない
- root候補検索は最大2件までに絞る
- 2件取得した場合は「2件以上」として `multipleCandidates` 扱いにする
- root候補が1件の場合は、配下の `workspace.json`、`index.json`、`projects/` まで厳格に検証する
- 子要素は `appProperties.role` で識別し、名前とMIME typeを検証項目にする
- 同じroleの子要素が複数ある場合は自動選択せず `invalidWorkspace` とする
- `/admin` と `/player` にはDrive状態の短い読み取り専用表示だけを追加する
- 詳細診断と操作は `/settings` に集約する
- `/admin` と `/player` にはDrive操作ボタンを置かない
- Google接続解除時は、tokenだけでなくDrive確認結果も未確認に戻す
- Drive検索上限は名前付き定数にする
- 第1スライスでは `ready` の実Drive到達確認を必須にしない

第1スライスでやらないこと:

- Driveワークスペース作成
- `workspace.json` 作成
- `index.json` 作成
- `projects/` フォルダ作成
- Driveワークスペース削除
- Driveワークスペース修復
- 候補を選択して使用するUI
- Google接続直後のDrive自動確認
- Drive書き込みの自動リトライ
- `gapi.client` の導入
- APIキーの作成・利用
- Client Secretの作成・利用
- `/admin` や `/player` でのDrive操作ボタン表示
- mock-data撤去
- プロジェクト作成
- `manifest.json` 保存
- Google Photos Picker
- IndexedDB保存
- オフライン本番再生

## 5. 第4 第1スライスで合意した設計判断

### 5.1 OAuth / Provider

- Google接続処理と `access_token` の所有者はProviderに一本化する
- `/auth-test` と `/settings` で別々にtokenを持たない
- `/auth-test` は残すが、Providerの状態確認ページに落とす
- `DriveSessionProvider` はroot配下に置く
- ただし、Google Identity Services script はアプリ起動時に自動ロードしない
- `/settings` または `/auth-test` でユーザーがGoogle接続ボタンを押したときだけ遅延ロードする
- GIS script 読み込みはProvider経由の単一 lazy loader に集約する
- UIコンポーネント側に `<Script>` は置かない
- `layout.tsx` はServer Componentのまま維持し、`providers.tsx` だけClient Componentにする
- `layout.tsx` に `"use client"` は付けない

### 5.2 token取り扱い

- Contextには `accessToken` も `getAccessToken()` も公開しない
- Drive API呼び出しはProvider内部の操作関数からだけ行う
- `src/lib/google-drive.ts` の薄い関数にtokenを渡すとしても、Provider内部の実装詳細に閉じ込める
- `drive.file` scope不足時はtokenを即破棄し、Drive APIは呼ばない
- token取得時に `expires_in` が返ってきた場合、Provider内部で `tokenExpiresAtMsRef` のようなメモリ上の期限だけを保持する
- token期限は永続保存しない
- Drive確認前に期限切れ・期限間近を判定する
- 期限60秒前から `authRequired` 扱いにする
- `401` / `403` / tokenなしは、即 `authRequired`、token破棄、自動再試行なし

### 5.3 Google接続状態とDrive状態

Google接続状態とDrive状態は1つに混ぜず、別statusとして設計する。

例:

```text
googleStatus:
  missingClientId
  disconnected
  loadingScript
  readyToConnect
  requesting
  connected
  scopeMissing
  authRequired
  error

driveStatus:
  notConnected
  notChecked
  checking
  notCreated
  ready
  multipleCandidates
  invalidWorkspace
  unsupportedVersion
  authRequired
  operationFailed
```

Drive状態には `notChecked` を正式追加する。

状態遷移:

```text
初期表示 / リロード後:
  Google未接続 + Drive notConnected

Google接続成功後:
  Google接続済み + Drive notChecked

「Drive状態を確認」押下後:
  checking

検証成功:
  ready

候補0件:
  notCreated

候補2件以上:
  multipleCandidates

候補1件だが構造不整合:
  invalidWorkspace

schemaVersion非対応:
  unsupportedVersion
```

Google接続成功直後は必ず `driveStatus = "notChecked"` にし、Drive自動確認はしない。

### 5.4 Drive確認ボタン

`/settings` の「Drive状態を確認」ボタンは、次の条件をすべて満たす場合だけ有効にする。

```text
googleStatus === "connected"
driveStatus !== "checking"
accessTokenRef.current が存在する
token期限が60秒以上残っている
```

それ以外では無効化し、理由を短く表示する。

例:

```text
Google未接続: 先にGoogle接続してください
token期限切れ: Google再接続が必要です
checking中: Drive確認中です
```

### 5.5 Drive API境界

`src/lib/google-drive.ts` は次の責務に限定する。

```text
fetchでDrive REST APIを呼ぶだけ
tokenを受け取るが保存しない
rawレスポンスを安全な型へ削る
Drive検索クエリを専用関数で組み立てる
fieldsを用途別に最小化する
Drive API呼び出しに15秒timeoutを入れる
```

`google-drive.ts` でやってはいけないこと:

- raw `Response` を外に返す
- Google API raw response 全文を外に返す
- tokenを保存する
- tokenをconsole出力する
- raw error objectをUIへ流す
- Drive fileId / folderIdをUIやContextへ出す

Drive APIの `fields` は用途別に最小化する。

取得してよいものの例:

```text
id
name
mimeType
appProperties
createdTime
modifiedTime
size
```

取得しないもの:

```text
owners
permissions
webViewLink
iconLink
thumbnailLink
parents
```

Drive API呼び出しには `AbortController` を使い、各API呼び出しのtimeoutを15秒にする。  
timeout時は `operationFailed`、自動再試行なし。

### 5.6 Drive検索条件

root候補検索は以下をすべて満たすものだけにする。

```text
mimeType = application/vnd.google-apps.folder
trashed = false
'root' in parents
appProperties.app = "ipad-slideshow-pwa"
appProperties.role = "workspaceRoot"
appProperties.schemaVersion = "1"
```

取得上限:

```text
ROOT_WORKSPACE_SEARCH_LIMIT = 2
```

root候補は、0件・1件・2件以上で以下のように扱う。

```text
0件:
  notCreated

1件:
  子要素検証へ進む

2件以上:
  multipleCandidates
```

3件以上が内部的に渡されても、2件以上として `multipleCandidates`。

子要素検索はroleごとに最大2件取得する。

```text
workspace role:
  0件: workspaceJsonMissing
  1件: 名前・MIME type・appProperties検証へ
  2件以上: workspaceJsonDuplicate

index role:
  0件: indexJsonMissing
  1件: 名前・MIME type・appProperties検証へ
  2件以上: indexJsonDuplicate

projectsRoot role:
  0件: projectsRootMissing
  1件: 名前・MIME type・appProperties検証へ
  2件以上: projectsRootDuplicate
```

取得上限:

```text
CHILD_ROLE_SEARCH_LIMIT = 2
```

### 5.7 Driveワークスペース判定

子要素の名前・MIME type・roleは完全一致・case-sensitive。

```text
workspace.json:
  name === "workspace.json"
  mimeType === "application/json"
  appProperties.role === "workspace"

index.json:
  name === "index.json"
  mimeType === "application/json"
  appProperties.role === "index"

projects:
  name === "projects"
  mimeType === "application/vnd.google-apps.folder"
  appProperties.role === "projectsRoot"
```

`Workspace.json`、`workspace.JSON`、`Projects`、`projects/` のような表記揺れは採用しない。

rootフォルダ名は参考表示のみで、`ready` 判定条件にはしない。  
子要素の `workspace.json` / `index.json` / `projects` は名前も検証する。

### 5.8 workspaceId

4点すべての `appProperties.workspaceId` と、`workspace.json` / `index.json` 本文の `workspaceId` は完全一致必須。

対象:

```text
workspace root folder
workspace.json
index.json
projects/
workspace.json 本文
index.json 本文
```

欠落・型違い・不一致は `invalidWorkspace`。

第1スライスの `workspaceId` 検証は、空でない文字列 + 全箇所一致までにする。  
UUID形式の厳格保証は、作成スライス側で担保する。

`workspaceId` は問題発生時だけ末尾8文字程度の短縮表示可。  
Driveの `fileId` / `folderId` は常に非表示。

### 5.9 schemaVersion

`appProperties.schemaVersion` は文字列 `"1"`。  
JSON本文の `schemaVersion` は数値 `1`。

以下は不正:

```text
appProperties.schemaVersion: 1
JSON本文 schemaVersion: "1"
```

型違いは `invalidWorkspace`。  
JSON本文で `schemaVersion: 2` のように、数値だが非対応の場合だけ `unsupportedVersion`。

`unsupportedVersion` は、数値の `schemaVersion` が存在し、かつ `1` ではない場合だけに限定する。  
それ以外のJSON不備は `invalidWorkspace`。

### 5.10 JSON本文検証

第1スライスでも、`workspace.json` / `index.json` の本文検証まで必須。  
フォルダ構造だけで `ready` にはしない。

JSON本文取得は、metadata検証後に `alt=media` で別取得する。  
metadataだけで `ready` にはしない。

`workspace.json` の必須項目:

```text
app: "ipad-slideshow-pwa"
role: "workspace"
schemaVersion: 1
workspaceId: string
createdAt: string
updatedAt: string
```

`index.json` の必須項目:

```text
app: "ipad-slideshow-pwa"
role: "index"
schemaVersion: 1
workspaceId: string
projects: 配列
createdAt: string
updatedAt: string
```

`index.json.projects` は、第1スライスでは配列であることだけを検証する。  
空配列必須にはしない。  
中身の詳細検証は、プロジェクトmanifest設計フェーズまで先送りする。

`createdAt` / `updatedAt` は、存在する文字列かだけ検証し、同期・競合・正しさ判定には使わない。

JSON本文のトップレベルはobject必須。  
`null`、配列、文字列、数値、boolean は `invalidWorkspace`。

JSON本文は、必須キーは厳格検証、追加キーは許可する。  
追加キーは無視し、表示・保持しない。

### 5.11 JSONサイズ上限

`workspace.json` / `index.json` の本文読み込みは各64KB上限。

```text
JSON_FILE_SIZE_LIMIT_BYTES = 64 * 1024
```

サイズ上限はAPI層と判定層の両方で見る。

- `google-drive.ts` 側で、Drive metadata の `sizeBytes` が64KBを超えていれば本文取得前に止める
- `drive-workspace.ts` 側でも、渡された `workspaceJsonText` / `indexJsonText` のUTF-8バイト数が上限超過なら `invalidWorkspace`

判定層では `TextEncoder` を使ってUTF-8バイト数で判定する。

### 5.12 diagnostics

不整合診断は、raw情報ではなく安全な診断コード + 説明文に限定する。

`drive-workspace.ts` 側では `DriveDiagnosticCode` のunion型を使う。  
UI文言とは分離する。  
判定ロジック内に日本語UI文言を直接埋め込まない。

候補0件はエラーではなく、`notCreated` の正常系状態として扱う。  
診断コードを付ける場合も深刻度は `info`。

`operationFailed` は通信・API・timeout・想定外レスポンス専用に限定する。  
Drive構造不整合とは混ぜない。

不整合診断は可能な範囲で複数返す。  
`unsupportedVersion` が検出された場合は専用statusとして優先する。

status判定優先順位:

```text
1. root候補0件
   => notCreated

2. root候補2件以上
   => multipleCandidates

3. root候補1件だが、子要素の欠落・重複・metadata不整合がある
   => invalidWorkspace

4. 子要素metadataは成立しているが、JSON本文に数値の非対応schemaVersionがある
   => unsupportedVersion

5. JSON本文のparse失敗・必須項目不足・型違い・workspaceId不一致
   => invalidWorkspace

6. すべて通過
   => ready
```

### 5.13 `/settings` / `/admin` / `/player`

`/settings` に置く操作は第1スライスでは以下だけ。

```text
Google接続
Google接続を解除
Drive状態を確認 / 再確認
```

`notCreated` になっても、Driveワークスペース作成ボタンは出さない。  
表示例:

```text
このアプリが確認できるDriveワークスペースは見つかりません。
作成機能は次のスライスで追加します。
```

`/admin` と `/player` は、Contextの状態を読むだけにする。

- `checkDriveWorkspace()` を呼ばない
- Google接続ボタンを置かない
- Drive確認ボタンを置かない
- OAuth script読み込みを起こさない
- 表示は短くする
- 必要なら「詳細は設定で確認」とだけ出す

`/player` は将来の本番再生画面なので、Drive操作・Google接続と責務を混ぜない。

### 5.14 ready表示

`ready` は、同一セッション内でユーザーが手動確認し、Drive構造検証まで通った場合だけに限定する。

Google接続直後、リロード後、前回確認済みだった場合は `ready` にしない。

`ready` 状態でProviderに残すのは最小限。

残してよいもの:

```text
driveStatus: "ready"
summaryMessage
checkedAt
必要なら rootフォルダ名
```

残さないもの:

```text
Drive fileId / folderId
workspaceId
JSON本文
Drive API raw response
子要素の詳細一覧
```

## 6. 追加済みファイル

以下のファイルを追加済み。

```text
src/lib/drive-workspace.ts
```

責務:

```text
Drive APIを呼ばない
Reactに依存しない
tokenを受け取らない
Drive fileId / folderIdを受け取らない
取得済みの安全なDrive候補メタデータとJSON本文文字列だけを受け取る
status付きの安全な判定結果だけを返す
```

主なexport:

```text
DRIVE_WORKSPACE_APP_ID
DRIVE_WORKSPACE_SCHEMA_VERSION
DRIVE_WORKSPACE_SCHEMA_VERSION_PROPERTY
ROOT_WORKSPACE_SEARCH_LIMIT
CHILD_ROLE_SEARCH_LIMIT
JSON_FILE_SIZE_LIMIT_BYTES
DRIVE_FOLDER_MIME_TYPE
JSON_MIME_TYPE
WORKSPACE_JSON_NAME
INDEX_JSON_NAME
PROJECTS_ROOT_NAME

SafeDriveItem
DriveDiagnosticCode
DriveDiagnostic
SafeWorkspaceCandidatePreview
RootCandidateClassification
ValidateWorkspaceStructureInput
DriveWorkspaceStructureResult

classifyWorkspaceRootCandidates()
validateWorkspaceStructure()
getUtf8ByteLength()
```

実装後、以下を確認済み。

```text
npm run lint 成功
npm run build 成功
commit / push 済み
GitHub Actions 確認済み
```

## 7. 直近で次にやること

次の実装単位は、以下で合意済み。

```text
第2実装単位:
src/lib/google-drive.ts 新規追加だけ
```

第2実装単位でやること:

- Drive REST APIを `fetch` で呼ぶ薄い関数を作る
- Drive検索クエリ生成を専用関数に集約する
- `fields` を最小化する
- 15秒timeoutを入れる
- raw responseを外に出さない
- raw error objectを外に出さない
- Google API responseを安全な型へ変換する
- Drive `fileId` / `folderId` は `google-drive.ts` 内部でAPI呼び出し中だけ使う
- `drive-workspace.ts` に渡す前に、IDやraw情報を落とした `SafeDriveItem` へ変換する
- tokenは引数で受け取るが保存しない
- tokenを画面・console・storageに出さない

第2実装単位でまだやらないこと:

- Provider追加
- `layout.tsx` 変更
- `/settings` 変更
- `/auth-test` 変更
- `/admin` 変更
- `/player` 変更
- Google接続状態管理
- Drive状態UI表示
- Driveワークスペース作成
- docs更新

第2実装単位の完了条件候補:

```text
src/lib/google-drive.ts 新規追加
npm run lint 成功
npm run build 成功
commit / push
GitHub Actions確認
```

## 8. まだ残っている作業順序

第4 第1スライスの残り作業は、以下の順で進める。

```text
1. src/lib/google-drive.ts 新規追加
2. DriveSessionProvider追加
3. root layout配下にProviderを追加
4. /settings に settings-drive-panel.tsx のようなClient Componentを追加
5. /auth-test をProvider参照型に整理
6. /admin と /player に読み取り専用Drive状態表示を追加
7. docs更新
8. npm run lint
9. npm run build
10. ローカル確認
11. GitHub Pages確認
12. iPadホーム画面PWA確認
```

## 9. 注意事項

次のチャットでは、いきなり大きく実装しないでください。

まず、以下だけ確認してください。

```text
1. 第2実装単位の目的
2. 実装する範囲
3. 実装しない範囲
4. 変更予定ファイル
5. 実装方針が第1実装単位と矛盾しないか
```

その後、ユーザーの指示を待ってください。

また、前チャットで `docs/current-context.md` はGitHub default branch上では見つからず、未読でした。  
実装前にローカルで存在確認だけ行う方針です。存在しなければ、それだけで設計全体は止めず、別タスクとして復旧・作成に回します。

## 10. 回答スタイル

ユーザーが「グリルして」「この案をグリルして」「計画を詰めて」「設計をストレステストして」と言った場合は、grill-me方針で進めてください。

- 結論を急がない
- 1問ずつ厳しく問いを出す
- 各質問には推奨回答と理由を添える
- 既に決まっていることを繰り返し質問しない
- 方針違反や危険なスコープ拡大があれば明確に止める
- 明示的に実装を求められるまで実装しない

新人社会人でも分かるように、専門用語は必要に応じて噛み砕いて説明してください。  
ただし、実装判断は甘くしないでください。
