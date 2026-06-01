# 第4ゴール Google Driveワークスペース設計決定メモ

* 対象プロジェクト: ipad-slideshow-pwa
* 対象フェーズ: 第4-1 Google Driveワークスペース設計 / 第1スライス実装前
* ステータス: 設計判断済み・第1スライス実装準備中
* 最終更新日: 2026-06-01

## 第4-1 Google Drive ワークスペース設計

### 目的

第4ゴールでは、Google Drive上にこのPWA専用のワークスペースを作成し、後続のプロジェクトmanifest保存に進むための安全な土台を作る。

ただし、第4-1では実装に入らず、Driveワークスペースの設計判断を先に固定する。
この段階では、Google Photos Picker、実画像・実動画同期、IndexedDB保存、オフライン本番再生、プロジェクトmanifest保存は対象外とする。

最優先の前提は以下。

* iPad本番中に止まらないこと
* 本番再生は最終的にオフラインのiPad単体で動くこと
* Google Driveは管理・同期・復元のために使い、本番中の再生依存先にしないこと
* Google OAuth scopeは `https://www.googleapis.com/auth/drive.file` のみを維持すること
* access tokenは保存しないこと
* ユーザーの誤操作やDrive上の不整合を見逃さないこと

---

### Driveワークスペースの単位

Driveワークスペースは、接続中のGoogleアカウントのマイドライブ配下に1つだけ作成する。

初期版では、以下は対象外とする。

* プロジェクトごとの複数ワークスペース
* iPad端末ごとの複数ワークスペース
* 学校・イベントごとの複数ワークスペース
* 共有ドライブ
* 他人から共有されたフォルダ
* Google Classroom等と連携した共有領域

理由は、初期版で複数ワークスペースや共有領域を扱うと、どのDrive領域が正本なのか分かりにくくなり、権限・所有者・削除権限・同期状態の設計が複雑になるため。

---

### ワークスペースの作成方式

ワークスペースは、ユーザーが `/settings` で明示的に「Driveワークスペースを作成」を押した場合のみ作成する。

PWA起動時、画面遷移時、Google接続直後に自動作成しない。
また、作成ボタン押下時には、作成前に必ずDrive上の候補を再検索する。

作成前の判定は以下。

* 候補0件: 新規作成してよい
* 候補1件: 新規作成せず、その候補を検証して使用する
* 候補2件以上: 新規作成せず、要確認として停止する

作成中はボタンを無効化し、二重作成を防ぐ。

---

### Drive上の初期構成

第4初期版でDrive上に作成する構成は以下に固定する。

```text
iPad Slideshow PWA Workspace/
├─ workspace.json
├─ index.json
└─ projects/
```

第4では、`projects/{projectId}/manifest.json` はまだ作成しない。
サンプルプロジェクト、仮manifest、仮スライド、素材情報もDriveへ書き込まない。

将来的な構成は以下を想定する。

```text
iPad Slideshow PWA Workspace/
├─ workspace.json
├─ index.json
└─ projects/
   └─ {projectId}/
      ├─ manifest.json
      └─ assets/
```

ワークスペース直下に共有 `assets/` フォルダは作らない。
素材は将来的に各プロジェクト配下の `assets/` に所属させる。

---

### `workspace.json` の役割

`workspace.json` は、DriveフォルダがこのPWA用の正しいワークスペースであることを確認するための身分証明書として扱う。

入れる情報は最小限にする。

```json
{
  "app": "ipad-slideshow-pwa",
  "role": "workspace",
  "schemaVersion": 1,
  "workspaceId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "createdAt": "2026-05-30T00:00:00.000Z",
  "updatedAt": "2026-05-30T00:00:00.000Z"
}
```

`workspace.json` には、以下を入れない。

* プロジェクト一覧
* スライド一覧
* 素材一覧
* Google Photos情報
* IndexedDB同期状態
* Googleアカウントのメールアドレス
* Googleアカウントの名前
* Googleプロフィール情報
* Google user id

---

### `index.json` の役割

`index.json` は、ワークスペース内のプロジェクト一覧を示す目次として扱う。

第4初期版では、空のプロジェクト一覧のみを持つ。

```json
{
  "app": "ipad-slideshow-pwa",
  "role": "index",
  "schemaVersion": 1,
  "workspaceId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "projects": [],
  "createdAt": "2026-05-30T00:00:00.000Z",
  "updatedAt": "2026-05-30T00:00:00.000Z"
}
```

`index.json` には、各プロジェクトの詳細なスライド順、素材詳細、画像・動画本体、オフライン保存状態を入れない。
個別プロジェクトの詳細は、後続フェーズで `projects/{projectId}/manifest.json` に持たせる。

将来の `index.json` では、`manifestPath` だけに依存せず、Drive fileIdを主参照にする。
`manifestPath` は人間向けの補助情報として扱う。

---

### `appProperties` の扱い

Drive上の以下4点すべてに `appProperties` を付ける。

```text
workspace root folder
workspace.json
index.json
projects/ folder
```

共通で持たせる情報は以下。

```text
app: "ipad-slideshow-pwa"
workspaceId: "<uuid>"
schemaVersion: "1"
role: "<役割>"
```

roleは以下のように分ける。

```text
workspace root folder: "workspaceRoot"
workspace.json: "workspace"
index.json: "index"
projects/ folder: "projectsRoot"
```

`appProperties` はDrive上で候補を検索・診断するための札として使う。
ただし、正本はJSON本文とDrive構造の整合確認とする。

`appProperties` とJSON本文の `workspaceId` が一致しない場合は、使用不可として停止する。

---

### ID設計

`workspaceId` と将来の `projectId` は、アプリがUUIDで自動生成する。

Driveフォルダ名、プロジェクトタイトル、ユーザー入力値からIDを作らない。
一度作成したIDは変更しない。

Drive上のフォルダ名やプロジェクトタイトルは表示用であり、内部識別には使わない。

---

### JSONファイル形式

`workspace.json` と `index.json` は、Google DocsやGoogle Sheetsではなく、通常のJSONファイルとしてDriveに保存する。

MIME typeは `application/json` とする。

Google Docs、Google Sheets、Google Apps Scriptは使わない。
Drive上での手動編集はサポート対象外とする。

JSONが壊れていた場合は、自動修復せず、要確認として停止する。

---

### schemaVersion

第4初期版では、`schemaVersion: 1` のみ対応する。

以下の場合は使用不可として停止する。

* `schemaVersion` がない
* `schemaVersion` が `1` ではない
* `schemaVersion` が文字列など、想定外の型である
* `workspace.json` と `index.json` の `schemaVersion` が一致しない

非対応versionを見つけた場合、自動変換・自動修復・上書きをしない。
古いPWAが将来versionのDriveデータを壊さないことを優先する。

---

### JSON検証方針

`workspace.json` と `index.json` は厳密に検証する。

`workspace.json` の必須項目。

```text
app: "ipad-slideshow-pwa"
role: "workspace"
schemaVersion: 1
workspaceId: string
createdAt: string
updatedAt: string
```

`index.json` の必須項目。

```text
app: "ipad-slideshow-pwa"
role: "index"
schemaVersion: 1
workspaceId: string
projects: []
createdAt: string
updatedAt: string
```

以下の場合は使用不可として停止する。

* 必須項目がない
* 型が違う
* `role` が違う
* `workspaceId` が一致しない
* `schemaVersion` が非対応
* `projects` が配列ではない

アプリは不足値を勝手に補完しない。
エラー表示では、どのファイルのどの項目が問題かを具体的に示す。

---

### 作成成功条件

ワークスペース作成は、以下4点すべてが作成され、Driveから再読込され、整合確認できた場合のみ成功とする。

```text
workspace root folder
workspace.json
index.json
projects/ folder
```

単にフォルダを作れただけでは成功扱いにしない。
Drive APIへの書き込み成功だけでも成功扱いにしない。

成功条件は以下。

* root folder が存在する
* `workspace.json` が存在し、読める
* `index.json` が存在し、読める
* `projects/` フォルダが存在する
* 4点すべての `workspaceId` が一致する
* `workspace.json` と `index.json` の `schemaVersion` が `1`
* roleが期待値と一致する
* `appProperties` とJSON本文の整合が取れる

---

### Driveワークスペースの再発見

2回目以降は、tokenやDrive fileIdを保存せず、Google接続後にDriveを検索してワークスペースを再発見する。

検索時は、フォルダ名だけを信用しない。
`appProperties` で候補を絞り、`workspace.json` 本文とDrive構造で最終判定する。

判定は以下。

* 候補0件: ワークスペース未作成
* 候補1件: 整合確認後、使用可能
* 候補2件以上: 要確認として停止
* 候補はあるが不整合: 使用不可として停止
* 非対応version: 使用不可として停止

ゴミ箱内の項目は候補に含めない。
`trashed = false` 相当の条件で、通常のDrive上に存在する項目のみを扱う。

---

### 複数候補・不整合時の扱い

複数候補が見つかった場合、アプリは自動選択しない。
ユーザーに候補を選ばせるUIも第4初期版では出さない。
複数候補がある状態で新規作成もしない。

ただし、ユーザーの道が途絶えないように、読み取り専用の診断表示と復旧導線を出す。

表示する内容。

* 見つかった候補一覧
* フォルダ名
* 作成日時
* 更新日時
* workspaceIdの一部
* 状態
* 対応手順
* 再確認ボタン

第4初期版では以下を行わない。

* 候補を選んで使用する
* アプリから候補を削除する
* アプリから候補を統合する
* 複数候補があるまま新規作成する
* 壊れたワークスペースを自動修復する

基本方針は「停止するが、詰みにしない」。

---

### 作成失敗時の残骸処理

同じ作成処理中に失敗した場合は、その処理で今まさに作成したDrive項目だけを、可能な範囲で削除またはゴミ箱移動する。

一方で、次回起動時や再確認時に見つかった壊れたワークスペース候補は、自動削除・自動修復しない。

理由は、その候補が本当に不要なものかをアプリだけでは断定できないため。

---

### Drive書き込みの自動リトライ

第4初期版では、Driveへの書き込み系操作を自動リトライしない。

自動リトライしない操作。

* ワークスペース作成
* `workspace.json` 作成
* `index.json` 作成
* `projects/` 作成
* 将来の `index.json` 更新
* 将来の `manifest.json` 保存

通信エラーに見えても、Drive側では作成が完了している可能性がある。
そのため、失敗後は自動で再書き込みせず、「Drive状態を再確認」をユーザーが明示的に押して、現在のDrive状態を読み直す。

---

### 同期済み判定

Drive APIの書き込みリクエストが成功しただけでは「同期済み」と表示しない。

書き込み後にDriveから再読込し、期待した内容と一致した場合のみ、Driveワークスペース準備済みとして扱う。

第4では「同期済み」という広い表現は避ける。
表示は「Driveワークスペース準備済み」に限定する。

---

### `createdAt` / `updatedAt` の扱い

JSON本文に `createdAt` / `updatedAt` は入れるが、同期判定・競合判定・正しさの判定には使わない。

用途は以下に限定する。

* 人間向けの表示
* 診断表示
* 説明用の補助情報

同期・競合判定にはDrive file metadataの `version` や必要に応じて `modifiedTime` を使う。
iPadのローカル時刻は信用しすぎない。

---

### 同時編集・競合

第4初期版では、複数端末・複数ブラウザによる同時編集はサポートしない。

ただし、競合検出は行う。

Driveから `index.json` や `workspace.json` を読んだ時点で、Drive file metadataの `version` または `modifiedTime` を保持する。
更新直前に再確認し、読み込み時からDrive側が変わっていた場合は、上書きせず競合として停止する。

第4初期版では、自動マージ・ユーザー選択によるマージ・差分統合は行わない。

---

### Drive fileId / folderId の保持

第4初期版では、Drive fileId / folderId はアプリ実行中のメモリにだけ保持する。

保存しないもの。

* `workspaceFolderId`
* `workspaceJsonFileId`
* `indexJsonFileId`
* `projectsFolderId`
* Driveワークスペース準備済みという判定結果
* 最後のDrive確認結果

PWAを閉じたりリロードした後は、次回Google接続後にDrive検索から再発見する。

Drive fileIdはaccess tokenとは別物だが、第4ではローカル永続保存しない。
IndexedDB等への保存は、後続のオフライン設計フェーズで改めて判断する。

---

### Google接続状態とDrive状態

Google接続状態とDriveワークスペース状態は、アプリ実行中だけの共有状態として持つ。

`localStorage` / IndexedDB / Cookieには保存しない。

リロード後、PWA開き直し後は以下に戻す。

```text
Google未接続
このセッションではDrive未確認
```

前回のDrive確認結果を使って「準備済み」と表示しない。
このセッションで実際にDriveを確認した場合のみ、その状態を表示する。

---

### 画面責務

Drive接続・Driveワークスペース確認・Driveワークスペース作成は `/settings` に集約する。

`/admin` と `/player` にはDrive操作ボタンを置かず、状態表示だけにする。

```text
/settings
  Google接続
  Driveワークスペース確認
  Driveワークスペース作成
  Driveワークスペース状態表示

/admin
  Driveワークスペース状態の読み取り表示
  既存mock-data表示は第4では残してよい

/player
  Drive操作なし
  本番再生データ状態の表示
```

`/player` は将来のオフライン本番再生画面として、Drive接続から切り離す。

---

### 本番再生とDriveの責務分離

`/player` は本番中にDrive APIを呼ばない前提にする。

Driveは管理・同期・復元のための場所であり、本番再生の依存先ではない。
本番中の再生は、将来的にIndexedDBなどに保存されたローカルの検証済みデータを使う。

第4ではまだIndexedDB保存やオフライン本番再生は実装しない。
ただし、責務分離は先に固定する。

以下の表現は第4では使わない。

* 本番再生可能
* オフライン再生可能
* すべて同期済み
* 準備完了

第4で表示してよいのは以下。

* Driveワークスペース未作成
* Driveワークスペース作成中
* Driveワークスペース準備済み
* Driveワークスペース要確認
* 本番再生データ未準備
* オフライン再生未対応

---

### Drive状態のステータス

第4初期版では、Drive状態を曖昧なOK/NGではなく、明示的なステータスとして管理する。

最低限必要な状態。

```text
notConnected
  Google未接続

checking
  Drive確認中

notCreated
  ワークスペース未作成

creating
  ワークスペース作成中

ready
  Driveワークスペース準備済み

multipleCandidates
  候補が複数あり要確認

invalidWorkspace
  候補はあるが構造・JSON・IDに問題あり

unsupportedVersion
  schemaVersion が非対応

authRequired
  tokenなし、期限切れ、再接続が必要

operationFailed
  Drive操作に失敗。再確認が必要
```

状態ごとに表示する操作を限定する。

例。

```text
notConnected:
  Google接続

notCreated:
  Driveワークスペースを作成
  Drive状態を再確認

ready:
  Drive状態を再確認
  Google接続を解除

multipleCandidates:
  対応手順を表示
  Drive状態を再確認

invalidWorkspace:
  問題の詳細を表示
  対応手順を表示
  Drive状態を再確認

authRequired:
  Google再接続

operationFailed:
  Drive状態を再確認
```

状態に合わない危険な操作は出さない。
特に、`multipleCandidates` や `invalidWorkspace` の状態で新規作成・削除・自動修復ボタンを出さない。

---

### Googleアカウント情報

第4初期版では、Googleアカウントのメールアドレス、名前、プロフィール情報を取得・保存・表示しない。

理由は、第3で `openid` / `email` / `profile` scopeを使わないと決めているため。
`workspace.json` はGoogleアカウントではなく、Drive内のPWA用ワークスペースだけを識別する。

---

### 削除・リセット操作

第4初期版では、Driveワークスペース削除・初期化・自動掃除の操作をアプリ内に置かない。

置いてよい操作。

* Google接続を解除
* Drive状態を再確認
* 対応手順を表示

置かない操作。

* Driveワークスペースを削除
* `workspace.json` を削除
* `index.json` を削除
* `projects/` を削除
* 壊れた候補をアプリが削除
* Driveワークスペースを初期化

「Google接続を解除」は、access tokenをメモリから消して未接続に戻すだけであり、Drive上のファイルは消さない。

---

### 既存mock-dataとの関係

第4初期版では、`/admin` や `/player` の既存mock-data表示をDriveデータに全面置換しない。

第4でやること。

* `/settings` でGoogle接続
* Driveワークスペース確認
* Driveワークスペース作成
* `workspace.json` / `index.json` / `projects/` の整合確認
* Driveワークスペース準備済み表示
* `/admin` と `/player` にDrive状態を読み取り表示

第4ではまだやらないこと。

* `/admin` のプロジェクト一覧をDrive `index.json` から読む
* `/player` をDrive `manifest.json` から動かす
* mock-dataを全面撤去する
* 実プロジェクト作成UIを完成させる
* 本番再生データを作る

---
### 第4 第1スライス: Drive確認・再発見・状態表示

第4実装は、一度にDriveワークスペース作成まで進めず、最初のスライスではDrive確認・再発見・状態表示までに限定する。

このスライスでは、Google Driveへの書き込みは行わない。
`workspace.json`、`index.json`、`projects/` の作成も行わない。
`/settings` に「Driveワークスペースを作成」ボタンも表示しない。

#### 第1スライスでやること

* `/settings` をGoogle接続とDrive状態確認の正式導線にする
* `/auth-test` はOAuth単体確認用の開発ページとして残す
* Google接続状態とDrive状態をアプリ内Providerで共有する
* `access_token` はProvider内部の `useRef` にのみ保持する
* `access_token` を画面、console、localStorage、IndexedDB、Cookieに出さない・保存しない
* Google接続直後にDrive確認を自動実行しない
* ユーザーが `/settings` で「Drive状態を確認」を押した場合のみDrive APIを呼ぶ
* Drive APIは `gapi.client` ではなく、`fetch` でDrive REST API v3を直接呼ぶ
* Google Driveワークスペース候補を `appProperties` で検索する
* フォルダ名だけでは候補扱いしない
* ゴミ箱内の項目は候補に含めない
* root候補検索は最大2件までに絞る
* 2件取得した場合は「2件以上」として `multipleCandidates` 扱いにする
* root候補が1件の場合は、配下の `workspace.json`、`index.json`、`projects/` まで厳格に検証する
* 子要素は `appProperties.role` で識別し、名前とMIME typeを検証項目にする
* 同じroleの子要素が複数ある場合は自動選択せず `invalidWorkspace` とする
* `/admin` と `/player` にはDrive状態の短い読み取り専用表示だけを追加する

#### 第1スライスでやらないこと

* Driveワークスペース作成
* `workspace.json` 作成
* `index.json` 作成
* `projects/` フォルダ作成
* Driveワークスペース削除
* Driveワークスペース修復
* 候補を選択して使用するUI
* Google接続直後のDrive自動確認
* Drive書き込みの自動リトライ
* `gapi.client` の導入
* APIキーの作成・利用
* Client Secretの作成・利用
* `/admin` や `/player` でのDrive操作ボタン表示
* mock-data撤去
* プロジェクト作成
* `manifest.json` 保存
* Google Photos Picker
* IndexedDB保存
* オフライン本番再生

#### 第1スライスの状態管理方針

Google接続状態とDrive状態は分けて管理する。

Google接続状態は、Google認証スクリプトの準備、未接続、接続中、接続済み、scope不足、Client ID未設定、認証エラーを表す。

Drive状態は、このセッションでは未確認、確認中、ワークスペース未作成、Driveワークスペース準備済み、候補が複数あり要確認、構造・JSON・IDに問題あり、schemaVersion非対応、再接続が必要、Drive操作失敗を表す。

Google接続を解除した場合は、`access_token` だけでなくDrive確認結果も初期状態に戻す。
過去のDrive確認結果を使って、接続解除後に「準備済み」と表示し続けない。

#### 第1スライスの表示方針

詳細診断と操作は `/settings` に集約する。

`/settings` には、Google接続、Google接続解除、Drive状態確認、Google再接続、Drive状態、診断メッセージを表示する。

`/admin` と `/player` には、Drive状態の短い読み取り専用表示だけを出す。
Drive操作ボタン、削除ボタン、修復ボタン、候補選択UIは出さない。

画面やconsoleに以下は出さない。

* `access_token`
* token response全文
* Drive APIの生レスポンス全文
* 生のerror object
* fileId / folderId の全文
* `workspace.json` / `index.json` の全文

#### 第1スライスの候補検索方針

root候補は、フォルダ名ではなく `appProperties` を主条件として検索する。

検索条件の考え方は以下。

```text
mimeType = 'application/vnd.google-apps.folder'
and trashed = false
and appProperties has { key='app' and value='ipad-slideshow-pwa' }
and appProperties has { key='role' and value='workspaceRoot' }
```

root候補は最大2件まで取得する。
0件なら `notCreated`、1件なら中身を検証、2件取得した場合は `multipleCandidates` とする。

2件取得した場合でも、画面では「候補が2件あります」と断定しない。
実際には3件以上存在する可能性があるため、「Driveワークスペース候補が2件以上あります」と表示する。

候補1件の場合は、root folderだけでは `ready` にしない。
必ず配下の `workspace.json`、`index.json`、`projects/` を確認し、JSON本文、Drive metadata、`appProperties`、`workspaceId`、`role`、`schemaVersion` の整合が取れた場合のみ `ready` とする。

#### 第1スライスの完了条件

第1スライスは、以下を確認できたら完了とする。

* `/settings` でGoogle接続できる
* `drive.file` scopeを確認できる
* `/settings` でDrive状態確認を手動実行できる
* 正規ワークスペースがない場合に `notCreated` を表示できる
* Drive API認証エラー時に `authRequired` を表示できる
* Drive API失敗時に `operationFailed` を表示できる
* `/admin` にDrive状態の短い読み取り専用表示が出る
* `/player` にDrive状態の短い読み取り専用表示が出る
* PWA再起動後はGoogle未接続・Drive未確認に戻る
* `npm run lint` が成功する
* `npm run build` が成功する

第1スライスではDrive書き込みを行わないため、実Drive上で `ready` に到達することは必須完了条件にしない。
`ready`、`invalidWorkspace`、`unsupportedVersion` の判定ロジックは実装してよいが、実Driveでの `ready` 到達確認は次の作成スライスで行う。

#### 第1スライス追加決定

第1スライス実装前の追加・修正決定は以下。

* Drive状態に `unchecked` を追加する
* 第4中は同一 Google Web OAuth Client ID を使う
* Drive APIでは `fields` を明示し、必要最小限だけ取得する
* root候補はマイドライブ直下に限定しない
* 子要素検証はrootフォルダ直下に限定する
* Drive検索は `corpora=user` / `spaces=drive` / `pageSize=2` を明示する
* 想定外ファイルは警告に留め、`ready` 判定を妨げない
* 必須roleごとに最大2件検索する
* `workspace.json` / `index.json` の `size` 上限を設ける
* `size` 未取得なら `invalidWorkspace`
* Drive確認は15秒程度でタイムアウトする
* Providerは `AppProviders` client component に置く
* `/settings` はDrive操作部分だけ client component に分離する
* `/admin` / `/player` は状態表示だけ client component で差し込む
* Drive確認は同時に1本だけにし、古い結果を反映しない


### 第4の完了条件

第4は、Driveワークスペースの作成・再発見・整合確認・状態表示までで完了とする。

第4で完了にすること。

* `/settings` でGoogle接続できる
* Driveワークスペース候補を検索できる
* 候補0件なら「未作成」と表示できる
* ユーザー操作でワークスペースを作成できる
* `workspace.json` / `index.json` / `projects/` を作成できる
* 4点すべてに `appProperties` を付与できる
* 作成後にDriveから再読込できる
* JSON本文とDriveメタデータの整合確認ができる
* `ready` / `notCreated` / `multipleCandidates` / `invalidWorkspace` / `unsupportedVersion` などを表示できる
* `/admin` と `/player` にDrive状態を読み取り表示できる
* PWA再起動後は未接続に戻る
* 再接続後にDriveワークスペースを再発見できる

第4ではまだやらないこと。

* プロジェクト作成
* `manifest.json` 保存
* スライド順保存
* 画像・動画同期
* Google Photos Picker
* IndexedDB保存
* オフライン本番再生
* mock-data撤去

---

### 第4の確認項目

ローカルで確認すること。

* `npm run lint` 成功
* `npm run build` 成功
* `/settings` でGoogle接続できる
* `/settings` でDriveワークスペース確認・作成・再確認ができる
* 作成後にDriveから再読込し、整合確認できる
* `/admin` と `/player` にDrive状態が表示される

GitHub Pages公開版で確認すること。

* `/settings` でClient ID設定済み表示
* Google接続成功
* Driveワークスペース確認成功
* Driveワークスペース作成成功
* Driveワークスペース再確認成功

iPadホーム画面PWAで確認すること。

* `/settings` を開ける
* Google接続成功
* Driveワークスペース確認成功
* Driveワークスペース作成成功
* PWAを閉じて開き直すと未接続に戻る
* 再接続後にDriveワークスペースを再発見できる

---

### 次フェーズ

第4完了後、次フェーズで `projects/{projectId}/manifest.json` の設計に進む。

その際に改めて検討すること。

* プロジェクト作成UI
* `index.json` へのプロジェクト追加
* `manifest.json` のスキーマ
* スライド順保存
* 素材参照設計
* Google Photos Picker連携
* IndexedDB保存
* オフライン本番再生前チェック
* mock-data撤去タイミング

