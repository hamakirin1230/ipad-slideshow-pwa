# 第4-2 プロジェクト作成 設計決定メモ

* 対象プロジェクト: `ipad-slideshow-pwa`
* 対象フェーズ: 第4ゴール / 第4-2 プロジェクト作成設計
* ステータス: 設計判断済み・第1スライス実装前
* 最終更新日: 2026-06-03
* 参照元:

  * `docs/decisions/goal-04-drive-workspace.md`
  * `docs/decisions/goal-04-drive-workspace-create.md`
  * `docs/verification/goal-04-1-drive-create-completion.md`

---

## 1. 目的

第4-2では、Google Driveワークスペースが `ready` になった後、最初のスライドショープロジェクトを1件だけ安全に作成できるようにする。

この段階では、プロジェクトの「入れ物」と「目次登録」までを扱う。

プロジェクト作成後、`/admin` で作成済みプロジェクトを読み取り表示できることを目標にする。

ただし、スライド追加、素材保存、Google Photos Picker連携、IndexedDB同期、オフライン本番再生は第4-2では扱わない。

---

## 2. 第4-2のスコープ

第4-2でやること。

```text
- /admin でプロジェクト作成ボタンを出す
- Driveワークスペース ready を前提にする
- index.json.projects が空の場合だけ1件作成できる
- projects/{projectId}/ フォルダを作成する
- projects/{projectId}/manifest.json を作成する
- projects/{projectId}/assets/ フォルダを作成する
- index.json にプロジェクト1件を登録する
- 作成後にDriveから再読込して整合確認する
- /admin に作成済みプロジェクトを読み取り表示する
- 作成済みプロジェクトが1件以上ある場合は追加作成を止める
```

第4-2でやらないこと。

```text
- 複数プロジェクト作成
- プロジェクト名入力
- プロジェクト名変更
- プロジェクト削除
- スライド追加
- 素材追加
- 再生設定編集
- Google Photos Picker連携
- IndexedDB同期
- オフライン本番再生
- Driveファイルの自動削除
- Driveデータの自動修復
- 作成失敗時の自動リトライ
```

---

## 3. 用語

### index.json

`index.json` は、ワークスペース内のプロジェクト一覧を示す目次として扱う。

第4-2では、`index.json.projects` に最大1件だけ登録する。

### manifest.json

`manifest.json` は、1つのスライドショープロジェクトの正本として扱う。

正本とは、あとで表示や同期の判断に迷ったとき、最終的に信頼するデータのこと。

第4-2では、プロジェクトの身分証明と空のスライド一覧だけを持つ。

### appProperties

`appProperties` は、Google Drive上のファイルやフォルダに付けるアプリ専用の札として扱う。

ファイル名やフォルダ名ではなく、`appProperties` によって、このアプリの管理対象か、どのワークスペース・どのプロジェクトに属するかを判断する。

---

## 4. プロジェクト作成の定義

第4-2でいうプロジェクト作成は、以下4点を1セットとして扱う。

```text
1. projects/{projectId}/ フォルダ
2. projects/{projectId}/manifest.json
3. projects/{projectId}/assets/ フォルダ
4. index.json へのプロジェクト登録
```

Drive上の構成は以下。

```text
iPad Slideshow PWA Workspace/
├─ workspace.json
├─ index.json
└─ projects/
   └─ {projectId}/
      ├─ manifest.json
      └─ assets/
```

素材本体は第4-2では保存しない。

`assets/` は将来の画像・動画保存に備えた入れ物として作成する。

---

## 5. プロジェクト数

第4-2初期版では、プロジェクト作成は1件だけに制限する。

```text
- index.json.projects が空なら、1件だけ作成できる
- index.json.projects が1件以上なら、追加作成しない
- 複数プロジェクト対応は後続フェーズに分離する
```

理由は、複数プロジェクトを許可すると、プロジェクト一覧UI、再生対象選択、削除、並び順、重複名、最終選択プロジェクトなどの設計が必要になるため。

第4-2では、まず1件のプロジェクトを安全に作成・再読込・表示できることを優先する。

---

## 6. projectId

`projectId` は、アプリがUUIDで自動生成する。

```ts
const projectId = crypto.randomUUID();
```

`projectId` は、ユーザー入力値やプロジェクト名から作らない。

一度作成した `projectId` は変更しない。

---

## 7. プロジェクト名 title

第4-2初期版では、プロジェクト名入力欄を出さない。

作成される `title` は以下に固定する。

```text
新しいスライドショー
```

プロジェクト名変更は後続フェーズに分離する。

`title` は `index.json` と `manifest.json` の両方に入れる。

ただし、正本は `manifest.json.title` とする。

`index.json.title` は、`/admin` の一覧表示用コピーとして扱う。

第4-2初期版で `index.json.title` と `manifest.json.title` が食い違った場合、自動修復せず、診断表示で停止する。

---

## 8. Drive上のフォルダ名

Drive上のプロジェクトフォルダ名は、ユーザー向けタイトルではなく `projectId` に固定する。

```text
projects/
└─ {projectId}/
   ├─ manifest.json
   └─ assets/
```

理由は、プロジェクト名をフォルダ名にすると、後で名前変更、同名、記号、絵文字、空白、長い名前の扱いが必要になるため。

ユーザーに見せる名前は `title`、Drive上の安定した置き場所は `projectId` で分担する。

---

## 9. index.json のプロジェクト情報

`index.json` は軽い目次に限定する。

`index.json.projects[]` の1件分は以下。

```json
{
  "projectId": "<projectId>",
  "title": "新しいスライドショー",
  "projectFolderId": "<Drive folderId>",
  "manifestFileId": "<Drive fileId>",
  "assetsFolderId": "<Drive folderId>",
  "manifestPath": "projects/{projectId}/manifest.json",
  "createdAt": "<now>",
  "updatedAt": "<now>"
}
```

`manifestFileId`、`projectFolderId`、`assetsFolderId` は、後続フェーズでDrive検索に頼りすぎないために保持する。

`manifestPath` は、人間向けの補助情報として扱う。

`index.json` には以下を入れない。

```text
- スライド一覧
- 素材一覧
- 再生設定
- Google Photos情報
- IndexedDB同期状態
- オフライン保存状態
```

---

## 10. manifest.json の初期内容

新規作成する `manifest.json` は、プロジェクトの身分証明と空のスライド一覧だけに絞る。

```json
{
  "app": "ipad-slideshow-pwa",
  "role": "projectManifest",
  "schemaVersion": 1,
  "workspaceId": "<workspaceId>",
  "projectId": "<projectId>",
  "title": "新しいスライドショー",
  "slides": [],
  "createdAt": "<now>",
  "updatedAt": "<now>"
}
```

この段階で以下は入れない。

```text
- assets
- playbackSettings
- Google Photos由来の情報
- IndexedDB同期状態
- オフライン保存状態
- サムネイル情報
- 公開履歴
```

`slides: []` は最初から入れる。

理由は、「まだスライドがないプロジェクト」を明確に表現できるため。

---

## 11. appProperties

以下3点すべてに Drive `appProperties` を付ける。

```text
projects/{projectId}/ folder
manifest.json
assets/ folder
```

`projects/{projectId}/` folder の `appProperties`。

```text
app: "ipad-slideshow-pwa"
role: "projectRoot"
schemaVersion: "1"
workspaceId: "<workspaceId>"
projectId: "<projectId>"
```

`manifest.json` の `appProperties`。

```text
app: "ipad-slideshow-pwa"
role: "projectManifest"
schemaVersion: "1"
workspaceId: "<workspaceId>"
projectId: "<projectId>"
```

`assets/` folder の `appProperties`。

```text
app: "ipad-slideshow-pwa"
role: "assetsRoot"
schemaVersion: "1"
workspaceId: "<workspaceId>"
projectId: "<projectId>"
```

Drive `appProperties.schemaVersion` は文字列 `"1"` に固定する。

JSON本文の `schemaVersion` は数値 `1` に固定する。

---

## 12. 作成順序

プロジェクト作成は、Drive上の実体を先に作り、最後に `index.json` へ登録する。

作成順序は以下に固定する。

```text
1. Driveワークスペースが ready であることを再確認する
2. index.json を読み、projects が空であることを確認する
3. projectId と now を生成する
4. projects/{projectId}/ フォルダを作成する
5. projects/{projectId}/manifest.json を作成する
6. projects/{projectId}/assets/ フォルダを作成する
7. manifest.json と assets/ を再確認する
8. index.json 書き込み直前に index.json を再読込する
9. projects が空なら、index.json にプロジェクト1件を追加する
10. projects が空でなければ、上書きせず停止する
11. index.json を再読込して登録結果を確認する
12. 全体が確認できた場合だけ成功扱いにする
```

`index.json` はユーザーに見えるプロジェクト一覧への入口なので、更新は最後にする。

実体作成後に `index.json` 更新で失敗した場合、Drive上に「まだ一覧に載っていないプロジェクト候補」が残る可能性がある。

これは好ましくないが、一覧に壊れたプロジェクトを表示するより安全である。

---

## 13. index.json 更新方針

`index.json` へのプロジェクト登録は、既存の `index.json` を更新する方式に固定する。

新しい `index.json` を作り直したり、古い `index.json` を削除して置き換えたりしない。

```text
- 既存の index.json fileId を使う
- files.update でJSON本文を差し替える
- index.json の createdAt は維持する
- index.json の updatedAt はプロジェクト作成時の now に更新する
- projects に1件だけ追加する
- 更新後に index.json を再読込して、登録内容を検証する
```

`index.json` を削除して作り直すと Drive fileId が変わり、参照や診断情報がずれるため避ける。

---

## 14. 競合対策

プロジェクト作成中に、別タブ・別端末・二重クリックなどで `index.json` が変わった場合は、上書きせずに停止する。

```text
1. 作成開始時にDriveワークスペース ready を再確認する
2. index.json を読み、projects が空であることを確認する
3. /admin 側では作成中ボタンを無効化する
4. project folder / manifest.json / assets folder を作る
5. index.json 書き込み直前に、もう一度 index.json を読み直す
6. その時点で projects が空なら、1件追加して保存する
7. projects が空でなければ、上書きせず停止する
8. 停止時も自動削除・自動修復はしない
```

第4-2初期版では1プロジェクトだけ許可するため、`projects` が空でなくなった時点で、作成処理は前提を失う。

---

## 15. 成功条件

プロジェクト作成は、作成APIが成功した時点では成功扱いにしない。

Driveから再読込して全体整合を確認できた場合だけ成功扱いにする。

成功条件は以下。

```text
- index.json を再読込できる
- index.json.projects が1件である
- projects[0].projectId が作成した projectId と一致する
- projects[0].projectFolderId が実在する
- projects[0].manifestFileId が実在する
- projects[0].assetsFolderId が実在する
- manifest.json を再読込できる
- manifest.json の app / role / schemaVersion / workspaceId / projectId / title が期待値と一致する
- manifest.json.slides が空配列である
- project folder / manifest.json / assets folder の appProperties が期待値と一致する
- index.json.title と manifest.json.title が一致する
```

第4-1と同じく、「作ったつもり」ではなく「後から安全に読める状態」を成功条件にする。

---

## 16. 失敗時方針

第4-2初期版では、作成途中失敗時の自動削除・自動修復・自動リトライはしない。

```text
- 作成途中に失敗したら停止する
- 自動削除しない
- 自動修復しない
- 自動リトライしない
- どの段階で失敗したかを診断表示する
- 作成済みの projectId / role / file種別を可能な範囲で表示する
- 手動削除が必要な可能性を案内する
```

失敗例。

```text
- project folder は作れたが manifest.json 作成に失敗
- manifest.json は作れたが assets/ 作成に失敗
- assets/ まで作れたが index.json 更新に失敗
- index.json 更新直前に別端末が先に projects を追加した
- index.json 更新後の再読込検証で不整合が見つかった
```

自動削除を入れると、どこまで消してよいのかを厳密に判断する必要がある。

特に `index.json` 更新後の失敗では、Drive上の実体と一覧登録が絡むため、初期版では自動削除しない。

---

## 17. /admin の役割

プロジェクト作成ボタンは `/admin` に置く。

`/settings` はGoogle接続、Driveワークスペース確認、Driveワークスペース作成、Drive診断表示に限定する。

`/admin` はプロジェクト一覧表示、プロジェクト作成、将来のスライド・素材管理を担当する。

```text
/settings:
- Google接続
- Driveワークスペース確認
- Driveワークスペース作成
- Drive診断表示

/admin:
- Drive状態の読み取り表示
- プロジェクト一覧表示
- プロジェクト作成
- 将来のスライド・素材管理

/player:
- 再生対象の読み取り
- 将来の本番再生
```

---

## 18. /admin のプロジェクト読み取り方針

`/admin` で作成済みプロジェクトを表示するとき、`index.json` だけを信じない。

`manifest.json` と `assets/` まで検証してから、有効なプロジェクトとして表示する。

```text
1. Driveワークスペース ready を確認する
2. index.json を読む
3. projects が空なら「プロジェクト未作成」と表示する
4. projects が1件なら、projectFolderId / manifestFileId / assetsFolderId を使ってDrive実体を読む
5. manifest.json のJSON本文を検証する
6. project folder / manifest.json / assets folder の appProperties を検証する
7. index.json の title と manifest.json の title が一致するか確認する
8. すべて一致した場合だけ「作成済みプロジェクト」として表示する
9. 不整合があれば、編集可能なプロジェクトとして扱わず、診断表示で停止する
```

---

## 19. Drive workspace state と Project state

Driveワークスペース状態とプロジェクト状態は分けて扱う。

```text
Drive workspace state:
- Google Driveワークスペース自体が使えるか
- workspace.json / index.json / projects/ が正しいか
- /settings で主に扱う

Project state:
- index.json にプロジェクトがあるか
- manifest.json が読めるか
- assets/ があるか
- title や projectId が一致するか
- /admin で主に扱う
```

`/settings` は Drive workspace の `ready` までを見る。

`/admin` は Drive workspace `ready` を前提に、Project state を見る。

---

## 20. Project state

第4-2初期版では、Project state の状態名を増やしすぎない。

詳細は診断情報に寄せる。

```text
Project state:
- idle
- checking
- notCreated
- ready
- creating
- invalid
- error
```

意味は以下。

```text
idle:
- まだプロジェクト確認を実行していない

checking:
- index.json / manifest.json / assets/ を確認中

notCreated:
- index.json.projects が空で、プロジェクト未作成

ready:
- 1件のプロジェクトがあり、manifest.json と assets/ まで整合確認済み

creating:
- プロジェクト作成中

invalid:
- Drive上のデータ構造やJSON本文に不整合がある

error:
- 通信失敗、認証切れ、想定外エラーなどで確認不能
```

`missingManifest`、`missingAssets`、`titleMismatch` のような細かい状態名は作らず、`invalid` と診断情報で表現する。

---

## 21. 実装コミット分割案

第4-2は、以下の粒度で分ける。

### 第4-2 第1コミット: プロジェクト作成設計メモ

```text
- docs/decisions/goal-04-2-project-create.md を作成する
- docs/decisions/goal-04-drive-workspace.md に参照を追加する
- docs/decisions.md に参照を追加する
- 実装なし
```

### 第4-2 第2コミット: Project state と読み取り検証

```text
- Project state 型と検証方針の土台を作る
- index.json.projects の読み取り検証を追加する
- /admin で未作成 / 作成済み / invalid を読み取り表示する
- まだプロジェクト作成APIは呼ばない
```

### 第4-2 第3コミット: Drive作成・更新 helper

```text
- project folder 作成 helper
- manifest.json 作成 helper
- assets folder 作成 helper
- index.json 更新 helper
- まだUIから作成しない
```

### 第4-2 第4コミット: /admin からプロジェクト作成

```text
- /admin にプロジェクト作成ボタンを追加する
- 作成前にDriveワークスペースと index.json を再確認する
- 1件制限を実装する
- 作成後にDriveから再読込して整合確認する
- 成功時のみ ready 扱いにする
- 失敗時は診断表示で停止する
```

### 第4-2 第5コミット: 公開版・iPad確認

```text
- MacBookローカルで確認する
- GitHub Pages公開版で確認する
- iPadホーム画面PWAで確認する
- verification doc を追加する
```

---

## 22. 第4-2 第1コミットの完了条件

第4-2 第1コミットは docs-only とする。

完了条件は以下。

```text
- 3ファイルの差分を目視確認する
- commitする
- pushする
- GitHub上で以下3ファイルが読めることを確認する
  - docs/decisions/goal-04-2-project-create.md
  - docs/decisions/goal-04-drive-workspace.md
  - docs/decisions.md
- git status --short が空であることを確認する
```

今回は必須にしない確認。

```text
- npm run lint
- npm run build
- GitHub Pages公開版確認
- iPad PWA確認
```
