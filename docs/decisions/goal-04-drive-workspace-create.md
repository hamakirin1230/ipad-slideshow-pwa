# 第5コミット Driveワークスペース作成 決定メモ

* 対象プロジェクト: `ipad-slideshow-pwa`
* 対象フェーズ: 第4ゴール / 第5コミット Driveワークスペース作成
* 参照元: `docs/decisions/goal-04-drive-workspace.md`
* このファイルの扱い: 第5コミットの作成フロー、作成失敗時対応、手動削除方針についてはこのファイルを優先する。

---

## 1. 目的

第5コミットでは、Google Drive上にこのPWA用の最小ワークスペースを作成する。

作成対象は以下4点に固定する。

```text
iPad Slideshow PWA Workspace/
├─ workspace.json
├─ index.json
└─ projects/
```

作成APIが成功しただけでは成功扱いにしない。  
作成後に既存のDrive確認フローを再実行し、metadata とJSON本文の検証まで通って `ready` になった場合のみ成功とする。

---

## 2. 第5コミットのスコープ

第5コミットでやること。

```text
- /settings に Driveワークスペース作成ボタンを追加する
- 作成前にDrive状態確認を再実行する
- root候補0件、つまり notCreated の場合だけ作成する
- workspace root folder を作成する
- workspace.json を作成する
- index.json を作成する
- projects/ folder を作成する
- 作成後にDrive状態確認を再実行する
- ready になった場合だけ成功扱いにする
- 失敗時は安全な診断文と手動削除手順を表示する
```

第5コミットでやらないこと。

```text
- 自動削除
- 自動修復
- 自動リトライ
- 既存候補への上書き
- 複数候補からの自動選択
- manifest.json 作成
- プロジェクト作成
- 素材保存
- Google Photos Picker 連携
- IndexedDB 同期
- オフライン本番再生
- Vercel公開検証
```

Vercel公開検証は、第5コミットがGitHub Pages公開版とiPadホーム画面PWAで通った後、別コミットで扱う。

---

## 3. 作成対象

作成する4点は以下。

```text
1. workspace root folder
2. workspace.json
3. index.json
4. projects/ folder
```

root folder だけを作って止める小分けはしない。  
root folder だけを作ると、アプリ自身が「rootはあるが必須ファイルがない」不完全なDrive状態を作るため。

---

## 4. 作成前再確認

作成ボタンを押した時点の画面状態が `notCreated` でも、その状態を信用しない。  
作成処理の中で必ず既存のDrive確認フローを再実行する。

```text
1. ユーザーが「Driveワークスペースを作成」を押す
2. Drive状態を creating にする
3. 操作ボタンを無効化する
4. 既存のDrive確認フローを再実行する
5. 結果が notCreated の場合だけ4点作成へ進む
6. notCreated 以外なら作成せず、その確認結果を表示する
```

作成前再確認で `notCreated` 以外になった場合は、作成失敗とは呼ばない。  
Driveへ何も書いていないため、手動削除手順も原則出さない。

---

## 5. Drive作成API方針

Drive APIでは `fields` を明示し、必要最小限だけ取得する。

```text
root folder 作成:
fields=id,name,mimeType,createdTime,modifiedTime,appProperties

workspace.json 作成:
fields=id,name,mimeType,createdTime,modifiedTime,appProperties,size

index.json 作成:
fields=id,name,mimeType,createdTime,modifiedTime,appProperties,size

projects/ folder 作成:
fields=id,name,mimeType,createdTime,modifiedTime,appProperties
```

作成レスポンス全文は保持・表示しない。  
Drive fileId / folderId の全文も画面に出さない。

---

## 6. workspace root folder 作成

workspace root folder は `parents` を指定せずに作成する。  
初期作成場所は、Google Drive APIの標準挙動に任せる。

metadata は以下の方針とする。

```ts
{
  name: "iPad Slideshow PWA Workspace",
  mimeType: "application/vnd.google-apps.folder",
  appProperties: {
    app: "ipad-slideshow-pwa",
    role: "workspaceRoot",
    schemaVersion: "1",
    workspaceId
  }
}
```

作成後の再発見では、フォルダ名ではなく `appProperties` を主条件にする。  
同名フォルダが既にあっても、`appProperties` がなければ正式候補にはしない。

---

## 7. workspaceId

`workspaceId` は、作成前再確認で `notCreated` が確定した後、4点作成の直前に1回だけ生成する。

```ts
const workspaceId = crypto.randomUUID();
```

同じ `workspaceId` を以下すべてに使う。

```text
workspace root folder appProperties.workspaceId
workspace.json appProperties.workspaceId
index.json appProperties.workspaceId
projects/ appProperties.workspaceId

workspace.json body.workspaceId
index.json body.workspaceId
```

失敗後に `workspaceId` を永続保存して再利用しない。  
次回はDrive再確認で現物を確認する。

---

## 8. createdAt / updatedAt

4点作成の直前に `now` を1回だけ生成する。

```ts
const now = new Date().toISOString();
```

同じ値を以下に使う。

```text
workspace.json.createdAt
workspace.json.updatedAt
index.json.createdAt
index.json.updatedAt
```

`createdAt` / `updatedAt` は診断用の補助情報であり、同期判定や正しさの判定には使わない。

---

## 9. JSON本文

`workspace.json` は以下の最小フィールドに固定する。

```json
{
  "app": "ipad-slideshow-pwa",
  "role": "workspace",
  "schemaVersion": 1,
  "workspaceId": "<same uuid>",
  "createdAt": "<same now>",
  "updatedAt": "<same now>"
}
```

`index.json` は以下の最小フィールドに固定する。

```json
{
  "app": "ipad-slideshow-pwa",
  "role": "index",
  "schemaVersion": 1,
  "workspaceId": "<same uuid>",
  "projects": [],
  "createdAt": "<same now>",
  "updatedAt": "<same now>"
}
```

余計なフィールドは入れない。  
`projects` は空配列 `[]` に固定する。

JSON本文は2スペース整形 + 末尾改行で保存する。

```ts
const workspaceJsonText = `${JSON.stringify(workspaceBody, null, 2)}\n`;
const indexJsonText = `${JSON.stringify(indexBody, null, 2)}\n`;
```

---

## 10. schemaVersion の型

Drive `appProperties.schemaVersion` は文字列 `"1"` に固定する。

```ts
appProperties: {
  schemaVersion: "1"
}
```

JSON本文の `schemaVersion` は数値 `1` に固定する。

```json
{
  "schemaVersion": 1
}
```

metadata とJSON本文で型を混同しない。

---

## 11. workspace.json / index.json の作成方式

`workspace.json` と `index.json` は、`files.create` + `uploadType=multipart` で作成する。

`metadata` とJSON本文を同一リクエストで送る。  
`uploadType=media` は使わない。  
`FormData` も使わない。

`multipart/related` body を明示的に組み立てる。

```ts
const boundary = `-------ipad-slideshow-pwa-${crypto.randomUUID()}`;

const body = [
  `--${boundary}`,
  "Content-Type: application/json; charset=UTF-8",
  "",
  JSON.stringify(metadata),
  `--${boundary}`,
  "Content-Type: application/json; charset=UTF-8",
  "",
  jsonText,
  `--${boundary}--`,
  "",
].join("\r\n");
```

header は以下の方針とする。

```ts
headers: {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": `multipart/related; boundary=${boundary}`,
}
```

---

## 12. projects/ folder 作成

`projects/` は通常のDrive folderとして `files.create` で作成する。  
必ず `parents: [workspaceRootFolderId]` を指定する。

```ts
{
  name: "projects",
  mimeType: "application/vnd.google-apps.folder",
  parents: [workspaceRootFolderId],
  appProperties: {
    app: "ipad-slideshow-pwa",
    role: "projectsRoot",
    schemaVersion: "1",
    workspaceId
  }
}
```

---

## 13. 作成順序

作成順序は以下に固定する。

```text
1. 作成前Drive確認
2. workspace root folder 作成
3. workspace.json 作成
4. index.json 作成
5. projects/ folder 作成
6. 作成後Drive確認
7. ready なら成功
```

作成APIの戻り値は最終状態の正本にしない。  
最終的なDrive状態は、作成後Drive確認の結果だけで決める。

---

## 14. 作成中状態と二重実行防止

作成ボタン押下から作成後再確認の完了まで、Drive状態は `creating` に固定する。

細かい進行状況は、状態名ではなく診断文で表示する。

```text
- 作成前にDrive状態を再確認しています
- workspace root folder を作成しています
- workspace.json を作成しています
- index.json を作成しています
- projects/ folder を作成しています
- 作成後にDrive状態を再確認しています
```

Drive操作は `AppProviders` 内で単一実行にする。  
`checking` と `creating` を同時に走らせない。

`creating` 中は以下を無効化する。

```text
- Driveワークスペース作成ボタン
- Drive状態を再確認ボタン
- Google接続を解除ボタン
```

第5コミットでは作成中キャンセル機能を入れない。

---

## 15. AbortSignal / timeout / 古い結果破棄

作成前後のDrive確認は既存どおり15秒程度でタイムアウトする。  
4点作成の各Drive書き込みも、1リクエストごとに15秒程度でタイムアウトする。

```text
作成前Drive確認: 15秒程度
root folder 作成: 15秒程度
workspace.json 作成: 15秒程度
index.json 作成: 15秒程度
projects/ folder 作成: 15秒程度
作成後Drive確認: 15秒程度
```

4点作成APIすべてに `AbortSignal` を渡す。  
`requestId` で古い結果を破棄し、古い結果を画面に反映しない。

---

## 16. 失敗時の扱い

作成途中で失敗した場合は、自動削除しない。  
自動リトライもしない。  
自動再確認もしない。

失敗時の状態分類は以下。

```text
401 / 403:
  authRequired

その他のHTTPエラー / timeout / network error:
  operationFailed
```

ただし、`authRequired` でも `operationFailed` でも、途中までDrive項目が作成済みの可能性がある場合は、手動確認・手動削除手順を表示する。

作成途中で失敗した場合の表示方針。

```text
Driveワークスペース作成に失敗しました。
この作成処理中に、一部のDrive項目が作成された可能性があります。

作成済みの可能性:
- workspace root folder
- workspace.json
- index.json

対応:
1. Google Driveを開く
2. 「iPad Slideshow PWA Workspace」を探す
3. 不要な場合は、そのフォルダごと手動で削除する
4. 削除後、この画面で「Drive状態を再確認」を押す
```

作成済みの可能性は、役割名ベースで表示する。  
fileId全文、API生レスポンス、生エラー、JSON本文全文は表示しない。

---

## 17. 手動削除方針

手動削除が必要な場合は、個別ファイルではなく、workspace root folder ごと削除するよう案内する。

```text
Google Driveで「iPad Slideshow PWA Workspace」を確認してください。
このアプリで作成された可能性があるフォルダを開き、
中に workspace.json / index.json / projects の一部または全部がある場合、
不要ならフォルダごと削除してください。
削除後、この画面で「Drive状態を再確認」を押してください。
```

削除対象の目安。

```text
- 名前が「iPad Slideshow PWA Workspace」
- 中に workspace.json / index.json / projects の一部または全部がある
- このアプリの作成操作直後にできた可能性がある
```

削除しないもの。

```text
- 自分で別用途で作った同名フォルダ
- 中身を確認できず、このアプリのものと判断できないフォルダ
```

手動削除後は、必ず以下の流れで復帰する。

```text
Drive状態を再確認
↓
notCreated を確認
↓
再作成を許可
```

削除後に自動で作成を再開しない。

---

## 18. 作成後再確認と成功条件

4点作成APIがすべて成功した場合は、作成後に既存Drive確認フローを自動実行する。

```text
4点作成API成功
↓
Drive状態確認を再実行
↓
ready なら成功
ready 以外なら成功扱いにしない
```

`ready` 以外の場合は、再確認結果をDrive状態に反映する。

```text
invalidWorkspace:
  構造・JSON・IDに問題あり

multipleCandidates:
  候補が2件以上あり要確認

unsupportedVersion:
  schemaVersion 非対応

authRequired:
  Google再接続が必要

operationFailed:
  Drive操作失敗

notCreated:
  作成後に候補を発見できなかったため、作成失敗扱い
```

作成後 `ready` になった場合に保持・表示するDrive状態は、作成APIの戻り値ではなく、作成後再確認で得た `ready` 結果だけにする。

---

## 19. 表示文言

成功表示は以下に限定する。

```text
Driveワークスペース準備済み
Driveワークスペースを確認できました
```

使ってよい補助表示。

```text
本番再生データ未準備
オフライン再生未対応
```

使わない表示。

```text
同期済み
すべて同期済み
準備完了
本番再生可能
オフライン再生可能
```

第5コミットで完成するのはDrive上の土台だけであり、本番再生やオフライン再生はまだできない。

---

## 20. console / 画面に出さない情報

Drive作成処理の成功・失敗・レスポンスを console に出さない。  
必要な情報は、安全な診断文としてUI状態に持たせる。

出さないもの。

```text
- access_token
- token response全文
- Drive API response全文
- error object全文
- fileId / folderId 全文
- workspace.json / index.json 本文全文
- multipart body全文
- Authorization header
```

---

## 21. 実装責務分担

`src/lib/google-drive.ts`

```text
- createWorkspaceRootFolder(...)
- createWorkspaceJsonFile(...)
- createIndexJsonFile(...)
- createProjectsFolder(...)
- createDriveWorkspace(...)
- Drive API fetchの細部
- metadata / body の組み立て
```

`src/app/app-providers.tsx`

```text
- access_token useRef の保持
- createWorkspace() の公開
- Drive状態を creating にする
- 作成前Drive確認
- notCreated のときだけ作成
- 作成後Drive確認
- Drive操作の単一実行制御
- timeout / AbortSignal / requestId制御
- 古い結果を反映しない制御
```

`src/app/settings/drive-settings-panel.tsx`

```text
- 作成ボタンの表示
- 作成中の無効化
- 診断文表示
- 手動削除手順表示
```

---

## 22. 完了条件

第5コミットの必須完了条件。

```text
- npm run lint 成功
- npm run build 成功
```

ローカル確認。

```text
- /settings でGoogle接続できる
- Drive状態確認で notCreated を確認できる
- Driveワークスペースを作成できる
- 作成後再確認で ready になる
- Drive作成ボタンが二重実行されない
- /admin と /player に読み取り専用のDrive状態が出る
- 接続解除で Google未接続 / Drive未確認 / scope未確認 に戻る
- 再接続後、Drive状態確認で既存ワークスペースを再発見して ready になる
```

GitHub Pages公開版確認。

```text
- GitHub Actions deploy 成功
- /settings でGoogle接続できる
- Drive状態確認で作成済みワークスペースを再発見して ready になる
- /admin と /player に読み取り専用のDrive状態が出る
```

iPadホーム画面PWA確認。

```text
- /settings を開ける
- Google接続できる
- Drive状態確認で作成済みワークスペースを再発見して ready になる
- PWAを閉じて開き直すと Google未接続 / Drive未確認 に戻る
- 再接続後、Drive状態確認で ready に戻る
```

iPadホーム画面PWAで失敗した場合は、第5コミット完了扱いにしない。

---

## 23. Vercel公開検証

Vercel公開検証は第5コミットに含めない。  
GitHub Pages公開版とiPadホーム画面PWAで第5コミットが通った後、別コミットで扱う。

想定する別コミット。

```text
第5.5: Vercel公開検証
```

第5.5で扱う候補。

```text
- Vercel Project作成
- Vercel Environment Variables 設定
- Google OAuth Authorized JavaScript origins 追加
- basePath 方針の検討
- Vercel版のiPadホーム画面PWA確認
```
