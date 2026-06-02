# 第4-1 Google Driveワークスペース確認 実装引き継ぎ

* 対象プロジェクト: `ipad-slideshow-pwa`
* 対象フェーズ: 第4-1 Google Driveワークスペース設計 / Drive確認・再発見・状態表示
* 現在地: 第4-1 第4コミット完了。次は第5コミット「Driveワークスペース作成」
* 作成日: 2026-06-02
* 前チャットの最終状態: GitHub Actions deploy 成功、GitHub Pages公開版確認済み、iPadホーム画面PWA確認済み

---

## 参照すべき既存ドキュメント

次チャットでは、まず以下を読むこと。

```text
docs/handoffs/2026-06-01-goal-4-start.md
docs/decisions/goal-04-drive-workspace.md
```

`docs/decisions/goal-04-drive-workspace.md` に書かれている内容は、原則として決定事項として扱う。重複して質問しない。矛盾・不足・実装上の曖昧さがある場合だけ確認する。

---

## 固定前提

以下は決定済み。

```text
Google OAuth scope は原則 drive.file のまま
access_token は永続保存しない
Client Secret は使わない
第4中は同一 Google Web OAuth Client ID を使う
Drive APIでは fields を明示し、必要最小限だけ取得する
root候補はマイドライブ直下に限定しない
子要素検証はrootフォルダ直下に限定する
Drive検索は corpora=user / spaces=drive / pageSize=2 を明示する
Drive確認は15秒程度でタイムアウトする
Drive確認は同時に1本だけにし、古い結果を反映しない
Providerは AppProviders client component に置く
/settings はDrive操作部分だけ client component に分離する
/admin / /player は状態表示だけ client component で差し込む
iPadホーム画面PWAで失敗したものは完了扱いにしない
```

---

## ここまでに完了したこと

### 第1コミット: shared provider 化

コミット内容:

```text
Add shared Google and Drive state provider
```

実装したこと。

```text
AppProviders を追加
Google接続状態とDrive状態をContextで共有
access_token は AppProviders 内部の useRef のみに保持
Google認証スクリプトは AppProviders で読み込み
layout.tsx は server component のまま維持
/settings を第4-1の正式導線に更新
/auth-test はProvider利用のOAuth単体確認ページとして維持
/admin / /player に読み取り専用のGoogle/Drive状態表示を追加
```

重要な決定。

```text
Provider外へ access_token を出さない
Google接続成功後もDrive状態は unchecked のまま
Drive確認ボタンはまだ出さない
Drive API通信はまだ入れない
接続解除は「このセッションの一時token削除」のみ
Google側のrevokeはしない
drive.file scope不足なら token は破棄する
```

検証済み。

```text
npm run lint 成功
npm run build 成功
MacBookローカル確認済み
GitHub Pages公開版確認済み
iPadホーム画面PWA確認済み
```

---

### 第2コミット: Drive root候補検索

コミット内容:

```text
Add Drive workspace root discovery
```

実装したこと。

```text
/settings に Drive状態を確認 ボタンを追加
Google接続済みの場合だけDrive確認ボタンを有効化
Drive REST API v3 files.list でroot候補検索
corpora=user
spaces=drive
pageSize=2
fields=files(id,name,mimeType,createdTime,modifiedTime,appProperties)
q は以下4条件:
  mimeType = application/vnd.google-apps.folder
  trashed = false
  appProperties.app = ipad-slideshow-pwa
  appProperties.role = workspaceRoot
```

状態判定。

```text
候補0件: notCreated
候補1件: foundCandidate
候補2件以上: multipleCandidates
```

重要な制御。

```text
Drive確認は同時に1本だけ
15秒timeout
接続解除時にabort
requestIdで古い結果を破棄
401/403 は authRequired
それ以外のDrive API失敗は operationFailed
Drive書き込みなし
子要素検証なし
JSON取得なし
```

検証済み。

```text
npm run lint 成功
npm run build 成功
ローカル確認済み
GitHub Pages公開版確認済み
iPadホーム画面PWA確認済み
```

---

### 第3コミット: root直下の必須子要素metadata検証

コミット内容:

```text
Validate Drive workspace metadata
```

実装したこと。

root候補1件の場合に、root直下の以下3 roleを検索する。

```text
workspace
index
projectsRoot
```

各roleは最大2件検索する。

```text
pageSize=2
fields=files(id,name,mimeType,createdTime,modifiedTime,appProperties,size)
```

検証対象。

```text
workspace.json:
  name === "workspace.json"
  mimeType === "application/json"
  appProperties.app === "ipad-slideshow-pwa"
  appProperties.role === "workspace"
  appProperties.schemaVersion === "1"
  appProperties.workspaceId がUUID形式
  size が取得できる
  size <= 64 KiB

index.json:
  name === "index.json"
  mimeType === "application/json"
  appProperties.app === "ipad-slideshow-pwa"
  appProperties.role === "index"
  appProperties.schemaVersion === "1"
  appProperties.workspaceId がUUID形式
  size が取得できる
  size <= 64 KiB

projects/:
  name === "projects"
  mimeType === "application/vnd.google-apps.folder"
  appProperties.app === "ipad-slideshow-pwa"
  appProperties.role === "projectsRoot"
  appProperties.schemaVersion === "1"
  appProperties.workspaceId がUUID形式
```

4点の `workspaceId` は一致必須。

```text
workspace root folder
workspace.json
index.json
projects/
```

状態判定。

```text
metadataが揃った場合: metadataVerified
不備がある場合: invalidWorkspace
```

まだやっていないこと。

```text
workspace.json本文取得
index.json本文取得
JSON parse
Drive書き込み
Drive作成
想定外ファイル警告
```

検証済み。

```text
npm run lint 成功
npm run build 成功
Windowsローカル確認済み
GitHub Pages公開版確認済み
iPadホーム画面PWA確認済み
```

---

### 第4コミット: workspace.json / index.json 本文取得・JSON検証

コミット内容:

```text
Validate Drive workspace JSON bodies
```

実装したこと。

```text
Drive API files.get?alt=media で workspace.json 本文取得
Drive API files.get?alt=media で index.json 本文取得
JSON本文は画面に表示しない
JSON本文全文、生parse error、生レスポンス、Drive fileId全文も画面に出さない
```

検証内容。

```text
workspace.json:
  JSON objectである
  app === "ipad-slideshow-pwa"
  role === "workspace"
  schemaVersion === 1
  workspaceId がUUID形式
  createdAt がISO 8601風文字列
  updatedAt がISO 8601風文字列

index.json:
  JSON objectである
  app === "ipad-slideshow-pwa"
  role === "index"
  schemaVersion === 1
  workspaceId がUUID形式
  projects が空配列 []
  createdAt がISO 8601風文字列
  updatedAt がISO 8601風文字列
```

`schemaVersion` の扱い。

```text
欠落: invalidWorkspace
型がnumberではない: invalidWorkspace
numberだが1ではない: unsupportedVersion
workspace.json と index.json で不一致: invalidWorkspace
```

`workspaceId` の扱い。

```text
UUID形式必須
metadata側4点とJSON本文2点のすべてで一致必須
```

`createdAt` / `updatedAt` の扱い。

```text
string必須
ISO 8601風の日時文字列必須
時刻の前後関係は判定しない
Drive metadata createdTime / modifiedTime との一致も判定しない
```

`index.json.projects` の扱い。

```text
第4初期版では空配列 [] 必須
配列でも中身がある場合は invalidWorkspace
```

状態判定。

```text
metadata + JSON本文がすべて整合: ready
不正: invalidWorkspace
非対応schemaVersion: unsupportedVersion
```

まだやっていないこと。

```text
Driveワークスペース作成
workspace.json 作成
index.json 作成
projects/ 作成
Drive自動修復
Drive削除
Drive上書き
プロジェクトmanifest作成
素材保存
想定外ファイル警告
```

検証済み。

```text
npm run lint 成功
npm run build 成功
Windowsローカル確認済み
GitHub Desktop Changes は想定3ファイルのみ
commit / push 完了
GitHub Actions deploy 成功
GitHub Pages公開版確認済み
iPadホーム画面PWA確認済み
```

---

## 現在の主な実装ファイル

重要ファイル。

```text
src/app/app-providers.tsx
src/app/settings/drive-settings-panel.tsx
src/lib/google-drive.ts
src/lib/google-auth.ts
src/components/drive-status-summary.tsx
```

`src/app/app-providers.tsx` の責務。

```text
Google接続状態管理
access_token を useRef に保持
Drive状態管理
Drive確認フロー制御
15秒timeout
二重実行防止
接続解除時abort
requestIdによる古い結果破棄
画面に安全な状態・診断文だけ渡す
```

`src/lib/google-drive.ts` の責務。

```text
Drive API fetch処理
root候補検索
子要素metadata検索
metadata検証
JSON本文取得
JSON本文検証
```

`src/app/settings/drive-settings-panel.tsx` の責務。

```text
Google接続ボタン
Drive状態確認ボタン
このセッションの接続解除ボタン
Drive状態表示
候補診断表示
JSON本文を含まない安全な診断表示
```

`/admin` と `/player` の責務。

```text
Google状態 + Drive状態の読み取り専用表示だけ
Drive操作ボタンは置かない
```

---

## 現時点の期待動作

正規Driveワークスペースがまだ未作成の場合。

```text
/settings でGoogle接続できる
drive.file scope が許可済みになる
Drive状態を確認できる
Driveワークスペース未作成 と表示される
Drive作成ボタンはまだ出ない
workspace.json / index.json 本文は画面に表示されない
接続解除で Google未接続 / Drive未確認 / scope未確認 に戻る
/admin と /player は読み取り専用状態表示のみ
```

---

## 注意事項

### Windowsで `.next` キャッシュ不整合が起きた

Windows PCで `/settings` が404になる事象が出たが、`src/app/settings/page.tsx` は存在していた。

解消方法。

```powershell
Ctrl + C
Remove-Item -Recurse -Force .next
npm run dev
```

以後、`.next` 由来の変な404や `.next/dev/types/routes.d.ts` の型エラーが出た場合は、まず `.next` を削除してから再実行する。

---

## 次にやること

次は第5コミットとして、初めてDrive書き込みに入る。

### 第5コミット候補: Driveワークスペース作成

推奨方針。

```text
Driveワークスペース作成として4点すべてを作成する
作成後に既存のDrive確認を再実行し、ready まで確認する
ただし自動削除・修復・manifest作成はまだ入れない
```

作成対象。

```text
workspace root folder
workspace.json
index.json
projects/ folder
```

想定フロー。

```text
1. /settings に「Driveワークスペースを作成」ボタンを追加
2. 作成前に必ずDrive状態確認を再実行
3. root候補0件の場合だけ作成を許可
4. root folder 作成
5. workspace.json 作成
6. index.json 作成
7. projects/ folder 作成
8. 作成後にDrive確認を再実行
9. metadata + JSON本文検証まで通ったら ready
```

まだやらないこと。

```text
部分作成失敗時の自動削除
壊れた候補の自動修復
複数候補からの自動選択
既存候補への上書き
プロジェクトmanifest作成
素材保存
Google Photos Picker連携
IndexedDB同期
オフライン再生
```

---

## 次チャットで最初にグリルすべき論点

最初に確認する質問はこれ。

```text
第5コミットでは、Driveワークスペース作成として4点すべてを作成し、作成後に既存のDrive確認を再実行して ready まで確認する。ただし自動削除・修復・manifest作成はまだ入れない。この前提で進めてよいか？
```

推奨回答。

```text
はい。第5コミットでは4点すべてを作成し、作成後にDrive確認を再実行して ready まで確認する。
root folderだけを作る小分けはしない。
```

理由。

```text
root folderだけ作って止めると、アプリ自身が「rootはあるが必須ファイルがない」壊れたDrive状態を作ることになる。
安全な小分けではなく、不完全状態を意図的に作るだけなので避ける。
```

---

## 第5コミットで詰めるべき未決事項

次チャットでは、実装前に以下を1問ずつグリルする。

```text
Drive作成ボタンの表示条件
作成前再確認の具体的な流れ
作成中ステータス名を追加するか
Drive作成APIのfields
root folder 作成時のparentsをどうするか
workspaceId生成方法
createdAt / updatedAt の生成元
workspace.json / index.json の作成API
projects/ folder の作成API
作成順序
部分失敗時の表示
部分失敗時に自動削除しない場合の診断表示
作成後再確認の扱い
readyにならなかった場合の扱い
GitHub Pages / iPad PWAでの完了条件
```

---

## 第5コミットの暫定完了条件案

```text
npm run lint 成功
npm run build 成功

WindowsまたはMacローカル:
  Google接続できる
  Drive状態確認で notCreated を確認できる
  Driveワークスペースを作成できる
  作成後の再確認で ready になる
  Drive作成ボタンが二重実行されない
  接続解除で Google未接続 / Drive未確認 / scope未確認 に戻る

GitHub Pages公開版:
  Google接続できる
  Drive作成済み環境で ready を確認できる

iPadホーム画面PWA:
  Google接続できる
  Drive作成済み環境で ready を確認できる
  iPadホーム画面PWAで失敗した場合は完了扱いにしない
```

注意: すでにDriveワークスペースを作成した後は、再度「未作成」状態を確認しづらくなる。第5コミットでは、作成前に一度 `notCreated` を確認してから作成すること。

---

## 次チャットへの依頼文例

```text
このチャットは、iPad用スライドショーPWA制作プロジェクト（ipad-slideshow-pwa）の続きです。

まず以下を読んでください。

* docs/handoffs/2026-06-02-goal-4-1-drive-create-start.md
* docs/handoffs/2026-06-01-goal-4-start.md
* docs/decisions/goal-04-drive-workspace.md

前チャットでは、第4-1の第1〜第4コミットまで完了しました。

完了済み:
* AppProvidersによるGoogle/Drive状態共有
* /settings の正式導線化
* /auth-test のProvider利用化
* /admin / /player の読み取り専用状態表示
* Drive root候補検索
* root直下の必須3 role metadata検証
* workspace.json / index.json 本文取得
* JSON本文検証
* metadata + JSON本文整合時の ready 判定

確認済み:
* lint成功
* build成功
* GitHub Actions deploy成功
* GitHub Pages公開版確認済み
* iPadホーム画面PWA確認済み

次は第5コミットとして、Driveワークスペース作成に入ります。
ただし、いきなり実装せず、まず第5コミットの作成フローをグリルしてください。
docs/decisions/goal-04-drive-workspace.md の既存決定事項は原則として決定済みとして扱い、重複質問しないでください。
```
