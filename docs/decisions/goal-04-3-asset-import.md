# 第4-3 素材追加・assets保存 設計決定メモ

* 対象プロジェクト: `ipad-slideshow-pwa`
* 対象フェーズ: 第4ゴール / 第4-3 素材追加・assets保存
* 現在のスライス: 第4-3-4 manifest反映設計
* ステータス: 第4-3-4 実装前設計確定
* 最終更新日: 2026-06-05
* 参照元:
  * `docs/decisions/goal-04-drive-workspace.md`
  * `docs/decisions/goal-04-drive-workspace-create.md`
  * `docs/decisions/goal-04-2-project-create.md`
  * `docs/verification/goal-04-2-project-create-completion.md`
  * `docs/verification/goal-04-3-1-asset-import-foundation-completion.md`

---

## 1. 目的

第4-3では、Google Photos Pickerで選んだ写真を、Drive上の既存プロジェクト配下に保存し、`manifest.json.slides[]` と結びつける。

Google Photos Pickerは素材の取り込み元として扱う。

Driveの `projects/{projectId}/assets/` は保存先として扱う。

`manifest.json` はプロジェクトの正本として扱う。

正本とは、後で表示や同期の判断に迷ったとき、最終的に信頼するデータのこと。

Google Photosの `baseUrl` は期限付きの取得URLなので、`manifest.json` には保存しない。

---

## 2. 第4-3全体の基本方針

第4-3全体では、次の順序で素材追加を行う。

```text
Photos取得
→ Drive assets/ 保存
→ Drive metadata検証
→ 最新manifest再読込
→ slides[] append
→ manifest保存
→ 再読込検証
```

ただし、第4-3-2ではこの全体フローのうち、Google Photos Pickerで1件を選択し、表示用画像bytesを取得し、形式とサイズを検証するところまでに限定する。

---

## 3. 第4-3-2のスコープ

第4-3-2で行うこと:

```text
- Photos権限つきtoken取得
- Picker session作成
- pickingConfig.maxItemCount: "1"
- pickerUri + "/autoclose" を別ウィンドウまたは別タブで開く
- pollingConfigに従って session を待つ
- mediaItems.list の結果を1件として検証
- mediaItem.id / type / mediaFile.baseUrl / mediaFile.mimeType / createTime を検証
- baseUrl + "=w2732-h2732" から画像bytesを取得
- 取得レスポンスの Content-Type を検証
- 10MB上限を検証
- /admin に取得結果と診断を表示
- Photos Picker session を後片付けする
```

第4-3-2で行わないこと:

```text
- Drive assets/ upload
- Drive asset metadata検証
- manifest.json 再読込
- manifest.json.slides[] append
- manifest.json 保存
- 保存後のmanifest再読込検証
- projectSummary / projectDetails の楽観更新
- 画像プレビュー表示
- IndexedDB同期
- オフライン本番再生
```

楽観更新とは、Driveやmanifestの保存確認が終わる前に、UIだけ先に「保存済み」のように見せる更新のこと。第4-3-2では行わない。

---

## 4. Photos token方針

通常のGoogle接続は `drive.file` のまま維持する。

素材追加開始時だけ、次のscopeを一時的に要求する。

```text
drive.file
photospicker.mediaitems.readonly
```

Photos権限つきtoken要求では既存の次の定数・関数を使う。

```text
DRIVE_AND_PHOTOS_PICKER_SCOPES
hasGrantedDriveFileAndPhotosPickerScopes()
```

Photos権限つきtoken要求では次を指定する。

```text
scope: DRIVE_AND_PHOTOS_PICKER_SCOPES
include_granted_scopes: true
prompt: "consent"
```

Photos権限つきtokenは素材追加フロー内だけで使う。

```text
- accessTokenRef には保存しない
- googleStatus は更新しない
- googleMessage は更新しない
- driveFileGranted は更新しない
- Drive状態はリセットしない
- project状態はリセットしない
```

第4-3-2では `google-auth.ts` は原則変更しない。

---

## 5. Picker session lifecycle

session作成bodyは以下のみ。

```json
{
  "pickingConfig": {
    "maxItemCount": "1"
  }
}
```

静止画像だけを選ばせる追加フィールドは入れない。

静止画像かどうかは取得後に `mediaItem.type === "PHOTO"` で検証する。

完了条件は `sessions.get` の `mediaItemsSet === true`。

完了後に `mediaItems.list?pageSize=2` を1回だけ呼ぶ。

結果の扱い:

```text
0件:
- cancelled

1件 かつ nextPageTokenなし:
- metadata検証へ進む

2件以上:
- invalid

nextPageTokenあり:
- invalid
```

作成済みsessionは、成功・キャンセル・invalid・errorのどの場合でも `sessions.delete` を試す。

`sessions.delete` の失敗は主処理結果を上書きしない。

---

## 6. 状態モデル

第4-3-2で `AssetImportStatus` に `selected` を追加する。

`selected` の意味:

```text
- Google Photos Pickerで1件選択済み
- mediaItem metadata検証済み
- 表示用画像bytes取得済み
- Content-Type検証済み
- 10MB上限検証済み
- Drive保存: 未実行
- manifest反映: 未実行
```

`completed` は第4-3-3以降まで温存する。

`completed` は、Drive assets/ 保存、manifest.json.slides[] 反映、Drive再読込・再検証まで成功した状態として扱う。

第4-3-2での分類:

```text
selected:
- Photosから1件取得し、形式とサイズ検証まで成功

cancelled:
- Pickerで0件
- Picker polling timeout
- Photos権限待ちtimeout
- ユーザー中止
- Picker用タブが遷移前に閉じられた
- access_denied

invalid:
- 選択結果が2件以上
- nextPageTokenあり
- PHOTO以外
- mediaItem必須項目不正
- Content-Type不許可
- 10MB超過
- 開始条件違反

error:
- token取得の予期しない失敗
- scope不足
- session作成失敗
- sessions.get失敗
- mediaItems.list失敗
- 画像bytes取得失敗
- popup blocked
- 通信・認証・API失敗
```

---

## 7. assetImportSelection方針

第4-3-2では、成功結果を `assetImportSelection` に保持する。

保持する情報:

```text
- mediaItemIdPart
- mediaItemType
- filename
- sourceMimeType
- sourceCreateTime: string | null
- downloadedContentType
- downloadedSizeBytes
- sizeLimitBytes
- driveSaved: false
- manifestUpdated: false
```

保持しない情報:

```text
- access_token
- Authorization header
- mediaItem.id の全文
- mediaFile.baseUrl
- baseUrl + "=w2732-h2732" のURL
- pickerUri
- sessionId
- Blob
- ArrayBuffer
- Uint8Array
- object URL
```

`assetImportSelection` は完全成功時だけセットする。

`cancelled / invalid / error` では常に `null` にする。

---

## 8. 画像bytesと検証

画像取得URL:

```text
mediaFile.baseUrl + "=w2732-h2732"
```

取得時はPhotos権限つきtokenをAuthorization headerに付ける。

```text
Authorization: Bearer <Photos権限つきtoken>
```

fetchには以下を明示する。

```text
cache: "no-store"
credentials: "omit"
```

Content-Typeは正規化し、以下だけ許可する。

```text
image/jpeg
image/png
image/webp
```

10MB上限はPhotos元ファイルではなく、実際に取得した表示用画像bytesに対して適用する。

内部上限:

```text
10 * 1024 * 1024 = 10485760 bytes
```

`downloadedBytes > sizeLimitBytes` の場合に超過。

ちょうど10MBは許容する。

画像bytesはReact stateに保存しない。

---

## 9. pollingとtimeout

Picker待機全体には既存の15秒Drive操作timeoutを使わない。

Photos Picker用に独立した待機制御を持つ。

`pollInterval`:

```text
- 有効ならその値
- 不正なら3秒
- 1秒未満なら1秒に丸める
```

`timeoutIn`:

```text
- 有効ならその値
- 0s なら即 cancelled
- 不正なら120秒
- 300秒超なら300秒に制限
```

`sessions.get` ごとに最新の `pollingConfig` を読み直す。

ただし、総待機時間は開始時刻から最大300秒で打ち切る。

polling待機はAbortSignal対応の `abortableSleep()` で実装する。

---

## 10. 排他制御と中止

素材追加専用の状態を持つ。

```text
assetImportInFlightRef
isAssetImportInFlight
assetImportAbortRef
assetImportRequestIdRef
```

Drive操作とは内部的に分離する。

UI上は、Drive操作と素材追加を相互排他にする。

中止ボタンは処理中だけ表示する。

中止ボタン文言は常に:

```text
素材追加を中止
```

中止時は、Driveやmanifestには触らない。

---

## 11. UI方針

`AssetImportPanel` に実行可能な「素材を追加」ボタンを追加する。

`canImportAssets` はproject ready導線条件のまま維持する。

実行可能条件は `canStartAssetImport` として別に計算する。

```text
canImportAssets:
- projectStatus === "ready"
- driveProjectReadyContext !== null

canStartAssetImport:
- canImportAssets === true
- isDriveOperationInFlight === false
- isAssetImportInFlight === false
- projectDetails !== null
- projectDetails.slideCount < 50
```

`canStartAssetImport` と `assetImportBlockedReason` は `AppProviders` で一元計算する。

開始ボタン文言:

```text
idle:
- 素材を追加

selected:
- 別の写真を選ぶ

cancelled:
- もう一度選択

invalid:
- 別の写真を選ぶ

error:
- もう一度試す

requestingPhotosPermission / openingPicker / waitingForSelection / downloadingFromPhotos:
- 素材追加処理中
```

保存を示唆する文言は使わない。

第4-3-2では画像プレビューを表示しない。

完成版のプレビューはGoogle Photosの `baseUrl` ではなく、Drive保存済みassetを元に表示する。

---

## 12. 静的PWAとしての通信方針

このプロジェクトは静的export前提。

第4-3-2では、Photos Picker APIと画像bytes取得はブラウザからGoogle APIへ直接fetchする。

使わない:

```text
- Next.js API route
- server action
- server proxy抽象化
```

---

## 13. 第3パッチの対象範囲

第3パッチでは、主に `src/app/app-providers.tsx` に素材追加フローの状態管理と Photos Picker連携呼び出しを追加する。

追加予定:

```text
- AssetImportStatus に selected を追加
- assetImportStatusLabels に selected を追加
- AssetImportSelection 型を AppProviders 側に追加
- assetImportSelection state を追加
- isAssetImportInFlight state を追加
- canStartAssetImport を追加
- assetImportBlockedReason を追加
- startAssetImport() を追加
- cancelAssetImport() を追加
- pendingPhotosTokenRequestRef を追加
- currentAssetImportAccessTokenRef を追加
- currentAssetImportSessionIdRef を追加
- assetImportAbortRef を追加
- assetImportRequestIdRef を追加
- Photos token callback 分岐を追加
- Photos token timeout 120秒を追加
- cleanupPhotosPickerSessionOnce() を追加
- sanitizeAssetImportDiagnostics() を追加
- abortableSleep() を追加
- waitForPhotosPickerSelection() を追加
```

第3パッチでは、まだ `AssetImportPanel` のUI変更は最小限または未実施でよい。

ただし、Contextに `startAssetImport / cancelAssetImport / canStartAssetImport / assetImportBlockedReason / isAssetImportInFlight / assetImportSelection` を公開する。

第4パッチで `AssetImportPanel` にボタン・中止ボタン・結果summary表示を入れる。

---

## 14. 第4-3-2の禁止事項

第4-3-2では、次を禁止する。

```text
- Photos権限つきtokenを accessTokenRef に保存する
- Photos token成功時に Drive/project状態をリセットする
- Photos token失敗時に通常Google接続状態を壊す
- Drive assets/ upload をする
- manifest.json を読む
- manifest.json を更新する
- projectSummary / projectDetails を楽観更新する
- 画像bytesをReact stateに保存する
- baseUrl / pickerUri / full mediaItem.id / token をUIやdiagnosticsに出す
- 第4-3-2で google-drive.ts を変更する
- 第4-3-2で google-auth.ts を変更する
```


---

## 15. 第4-3-3 Drive assets/ 保存方針

第4-3-3では、第4-3-2で実装したGoogle Photos Picker選択フローを延長し、検証済み画像をDrive上の既存プロジェクト配下 `assets/` に保存する。

第4-3-3で行うこと:

```text
- Photos Pickerで1件選択する
- mediaItem metadataを検証する
- Photosから画像Blobを取得する
- Content-Typeを検証する
- 10MB上限を検証する
- Drive assets/ に画像ファイルをuploadする
- upload後にDrive files.getでasset metadataを再取得する
- Drive asset metadataを検証する
- assetImportStatusを savedToDrive にする
- assetImportSelectionにDrive保存済み情報を保持する
```

第4-3-3で行わないこと:

```text
- manifest.json を読む
- manifest.json を更新する
- manifest.json.slides[] append
- 保存後manifest再読込検証
- projectSummary / projectDetails の楽観更新
- Drive保存済みassetの自動削除
- Drive保存済みassetの自動修復
- リロード後の未反映asset復旧
- 未反映assetの再検出
- 複数素材の連続追加
```

第4-3-3では、Drive保存は成功しても、manifest反映は未実行である。

そのため、第4-3-3の正常終了状態は `completed` ではなく `savedToDrive` とする。

---

## 16. Drive保存フロー

第4-3-3では、Drive保存は `startAssetImport()` の同一フロー内で行う。

```text
素材を追加
→ Photos権限つきtoken取得
→ Picker session作成
→ 1件選択
→ 画像Blob取得・検証
→ Drive assets/ upload
→ Drive files.get
→ Drive asset metadata検証
→ savedToDrive
```

「写真を選んだ後、別ボタンでDrive保存する」方式にはしない。

理由は、第4-3-2の安全設計として、画像bytes、baseUrl、Photos token、full mediaItem.id をReact stateに保持していないため。

Drive uploadには、同一フローで取得したPhotos権限つきtokenを使う。

Photos権限つきtokenは、引き続き `accessTokenRef` には保存しない。

---

## 17. 画像Blob方針

第4-3-3では、Photosから取得した画像本体を、一時的な `Blob` として扱う。

`Blob` は `startAssetImport()` 実行中のローカル変数としてだけ保持する。

React stateには保存しない。

```text
Photos画像fetch
→ response.ok確認
→ Content-Type検証
→ response.blob()
→ blob.sizeで10MB上限検証
→ Drive uploadへ渡す
→ 処理終了後に保持しない
```

`Content-Length` が取得できる場合は早期検証に使ってよい。

ただし、最終的なサイズ判定は `blob.size` を使う。

---

## 18. Drive asset metadata方針

Drive `assets/` に保存する画像ファイルには、アプリ管理用metadataを付ける。

Drive上の保存ファイル名は、Photos元ファイル名ではなく、アプリ側で発行する `assetId` を使う。

```text
<assetId>.<ext>
```

拡張子は、検証済みContent-Typeから決める。

```text
image/jpeg -> .jpg
image/png  -> .png
image/webp -> .webp
```

Drive asset file の `appProperties` は最小限にする。

```text
app: ipad-slideshow-pwa
role: asset
schemaVersion: 1
workspaceId: <workspaceId>
projectId: <projectId>
assetId: <assetId>
source: googlePhotosPicker
```

`appProperties` に入れないもの:

```text
- sourceFilename
- sourceMimeType
- sourceCreateTime
- mediaItemId
- baseUrl
- pickerUri
- token
```

Photos由来の表示情報は、第4-3-3ではDrive metadataに保存しない。

元ファイル名、sourceMimeType、sourceCreateTime は、後続のmanifest反映パッチで扱う。

---

## 19. Drive asset metadata検証

Drive upload後は、uploadレスポンスだけで成功扱いにしない。

Drive `files.get` で作成済みasset metadataを再取得し、期待値と照合する。

検証する項目:

```text
- fileId を取得できる
- name が <assetId>.<ext> と一致する
- mimeType が期待した画像MIME typeと一致する
- parents に project.assetsFolderId が含まれる
- appProperties.app が ipad-slideshow-pwa
- appProperties.role が asset
- appProperties.schemaVersion が 1
- appProperties.workspaceId が一致する
- appProperties.projectId が一致する
- appProperties.assetId が一致する
- size を取得できる
- size が検証済みdownloadedSizeBytesと一致する
```

この検証が成功した場合だけ、`assetImportStatus` を `savedToDrive` にする。

---

## 20. savedToDrive状態

第4-3-3で `AssetImportStatus` に `savedToDrive` を追加する。

`savedToDrive` の意味:

```text
- Photos選択済み
- 画像形式・サイズ検証済み
- Drive assets/ upload 完了
- Drive asset metadata検証完了
- manifest反映: 未実行
```

`completed` は第4-3-4以降まで温存する。

`completed` は、Drive保存、manifest反映、保存後の再読込・再検証まで成功した状態として扱う。

`savedToDrive` は完全完了ではなく、manifest未反映の中間状態として扱う。

`savedToDrive` 後は、追加の素材追加を開始できないようにする。

ブロック理由:

```text
Drive保存済みの素材がmanifest未反映です。後続パッチでmanifest反映を実装するまで、追加の素材追加は開始できません。
```

---

## 21. assetImportSelection拡張方針

第4-3-3では、`assetImportSelection` にDrive保存済み情報を追加する。

Drive保存前:

```text
driveSaved: false
manifestUpdated: false
```

Drive保存後:

```text
driveSaved: true
manifestUpdated: false
assetId
assetIdPart
assetFileId
assetFileIdPart
driveFilename
driveMimeType
driveSizeBytes
```

UIに表示してよいもの:

```text
- assetIdPart
- assetFileIdPart
- driveFilename
- driveMimeType
- driveSizeBytes
- Drive保存: 完了
- Drive asset metadata検証: 完了
- manifest反映: 未実行
```

UIに表示しないもの:

```text
- full Drive fileId
- full mediaItem.id
- baseUrl
- pickerUri
- token
- Blob
- 画像bytes本体
```

full `assetFileId` は後続manifest反映で使う可能性があるため、内部状態としては保持する。

ただし、UIには `assetFileIdPart` だけ表示する。

---

## 22. 失敗・中止・自動削除方針

第4-3-3では、Drive asset保存専用のエラー型を追加する。

想定名:

```text
DriveProjectAssetSaveError
```

このエラーでは、次を区別できるようにする。

```text
- Drive asset file が作成されていない失敗
- Drive asset file が作成済みの可能性がある失敗
```

Drive asset file が作成済みの可能性がある場合でも、自動削除はしない。

自動修復もしない。

diagnostics には次の趣旨を出す。

```text
Drive asset file が作成済みの可能性があります。
manifest反映は未実行です。
自動削除・自動修復は行いません。
```

中止ボタンはDrive upload中も維持する。

ただし、Drive upload開始後に中止しても、作成済みassetの自動削除はしない。

---

## 23. リロード後の扱い

`savedToDrive` は現在セッション内の一時状態として扱う。

ページリロード後に、Drive上の未反映assetを自動復旧・再検出しない。

第4-3-3で行わないこと:

```text
- Drive assets/ 内の未反映asset検索
- manifestとの照合
- 未反映assetのUI復元
- 未反映assetの自動削除
- 未反映assetの自動修復
```

リロード後の未反映asset検出や復旧は、後続パッチで扱う。

---

## 24. 第4-3-3の実装分割

第4-3-3は、次の順に分割して実装する。

```text
パッチ1:
- decision doc更新
- 実コード変更なし

パッチ2:
- google-photos-picker.ts
- fetchAndValidatePickedPhoto() が一時Blobを返せるようにする
- Driveにはまだ触らない

パッチ3:
- google-drive.ts
- saveDriveProjectAsset() を追加
- DriveProjectAssetSaveError を追加
- app-providers.tsx にはまだ接続しない

パッチ4:
- app-providers.tsx にDrive保存フローを接続
- AssetImportStatus に savedToDrive を追加
- assetImportSelection を拡張
- AssetImportPanel を savedToDrive 表示に対応する
```


---

## 25. 第4-3-4 manifest反映方針

第4-3-4では、第4-3-3でDrive `assets/` に保存したassetを、プロジェクト正本である `manifest.json.slides[]` に反映する。

第4-3-4で行うこと:

```text
- Drive保存済みassetをmanifestへ登録する
- manifest.json をDriveから読む
- manifest本文を検証する
- slides[] が50件未満であることを確認する
- slides[] に1件appendする
- manifest.json をDrive files.update multipartで更新する
- index.json の対象project.updatedAtを同じ時刻に更新する
- 更新後にmanifest.jsonとindex.jsonを再読込する
- 再読込済み本文を再検証する
- projectSummary / projectDetailsを再検証済みmanifest由来で更新する
- assetImportStatusを completed にする
```

第4-3-4で行わないこと:

```text
- 画像プレビュー表示
- /player での画像表示
- 複数素材一括追加
- Drive assets/ の未反映asset自動探索
- リロード後の savedToDrive 復旧
- 自動削除
- 自動修復
- ETag / revisionId による強い同時編集制御
- 競合merge UI
- rollback
```

第4-3-4の正常終了状態は `completed` とする。

`completed` は、Drive保存、manifest反映、index updatedAt同期、保存後の再読込・再検証まで成功した状態として扱う。

---

## 26. 第4-3-4の同一フロー方針

第4-3-4では、manifest反映を別ボタンにはしない。

`startAssetImport()` の同一フロー内で、Drive保存後にmanifest反映まで続ける。

```text
素材を追加
→ Photos権限つきtoken取得
→ Picker session作成
→ 1件選択
→ 画像Blob取得・検証
→ Drive assets/ upload
→ Drive asset metadata検証
→ manifest.json 読込
→ manifest本文検証
→ slides[] append
→ manifest.json 更新
→ index.json updatedAt 更新
→ manifest.json / index.json 再読込
→ 再検証
→ completed
```

第4-3-3の `savedToDrive` は、第4-3-4では途中状態として扱う。

Drive保存後にmanifest反映へ進むことで、manifest未反映assetが残る余地を減らす。

ただし、manifest反映に失敗した場合でも、Drive保存済みassetは自動削除しない。

---

## 27. manifest slide初期値

第4-3-4で `manifest.json.slides[]` にappendするslide objectの初期値は固定する。

```text
slideId:
- 新規UUID

assetId:
- Drive保存時に発行した assetId

assetFileId:
- Drive保存済みassetの full Drive fileId

assetName:
- Photos元ファイル名
- 取得できない場合は Driveファイル名

mimeType:
- Drive保存済みassetの MIME type

source:
- googlePhotosPicker

sourceMimeType:
- Photos mediaFile.mimeType

sourceMediaItemId:
- full mediaItem.id
- UI / diagnostics には出さない

sourceCreateTime:
- Photos createTime がある場合だけ保存

durationSeconds:
- 10

caption:
- 空文字

createdAt / updatedAt:
- manifest更新時刻の同一ISO文字列
```

full `sourceMediaItemId` はmanifest内部の正本データとして保存する。

ただし、React state、UI、diagnosticsには full `mediaItem.id` を保存・表示しない。

`assetImportSelection` には引き続き `mediaItemIdPart` だけを保持する。

---

## 28. manifest更新前検証

manifest更新前には、Driveから最新の `manifest.json` を読む。

Provider上の `projectDetails` は正本として扱わない。

Driveから読んだmanifest本文に対して、最低限次を検証する。

```text
- JSONとして読める
- JSON objectである
- app が ipad-slideshow-pwa
- role が projectManifest
- schemaVersion が対応範囲内
- workspaceId が期待値と一致する
- projectId が期待値と一致する
- title / createdAt / updatedAt が取得できる
- slides が配列である
- slides.length < 50
```

`slides.length >= 50` の場合はappendしない。

この場合、Drive asset保存済みであっても、manifest反映は失敗として扱う。

---

## 29. manifest.json 更新方式

`manifest.json` は既存Drive fileなので、新規作成ではなく既存 `project.manifestFileId` を更新する。

更新には Drive `files.update` の multipart upload を使う。

更新対象:

```text
fileId:
- project.manifestFileId

metadata:
- name: manifest.json
- mimeType: application/json
- appProperties は projectManifest として期待値を維持する

body:
- slides[] に1件appendした新しいmanifest JSON本文
```

更新後は、upload responseだけで成功扱いにしない。

Driveから `manifest.json` を再読込し、本文を再検証する。

---

## 30. index.json updatedAt同期

manifestにslideを追加する場合、`manifest.json.updatedAt` と `index.json.projects[0].updatedAt` を同じ時刻に更新する。

理由は、project summary側の `updatedAt` とmanifest本文の `updatedAt` を整合させるため。

更新対象:

```text
manifest.json:
- slides[] に1件append
- updatedAt を更新

index.json:
- projects[0].updatedAt を同じ時刻に更新
```

`projectSummary / projectDetails` は楽観更新しない。

Drive上の `manifest.json` と `index.json` を更新し、その後の再読込・再検証に成功してからUI状態へ反映する。

---

## 31. 2ファイル更新順序

第4-3-4では、Drive上の2ファイルを次の順で更新する。

```text
1. manifest.json
2. index.json
```

理由は、Drive API上ではこの2更新を1つのトランザクションにしないため。

途中失敗時は、`index.json` だけ先に更新されてmanifestにslideが無い状態より、manifestにslideが入っていてindexの `updatedAt` だけ古い状態の方がまだ実データとして自然である。

想定する中間状態:

```text
manifest更新前に失敗:
- Drive asset保存済み
- manifest未反映
- index未更新

manifest更新後 / index更新前後に失敗:
- Drive asset保存済み
- manifest反映済みの可能性あり
- index updatedAt 不整合の可能性あり
- 自動削除・自動修復はしない
```

---

## 32. 更新後再検証とUI反映

manifest更新後は、Driveから `manifest.json` と `index.json` を再読込する。

再読込した本文を検証し、次を確認する。

```text
- manifest.json本文が有効である
- index.json本文が有効である
- index.json.projects[0] が対象projectである
- manifest.json.updatedAt と index.json.projects[0].updatedAt が一致する
- slides[] に今回追加したslideが存在する
- slide.assetId が保存済みassetIdと一致する
- slide.assetFileId が保存済みasset fileIdと一致する
- slide.source が googlePhotosPicker
- slide.mimeType が保存済みDrive asset MIME typeと一致する
```

再検証に成功した場合だけ、`projectSummary / projectDetails` を更新する。

`projectSummary / projectDetails` は、再読込済みmanifest由来の結果から作る。

---

## 33. manifest反映失敗時の扱い

manifest反映や再検証に失敗しても、Drive保存済みassetは自動削除しない。

自動修復もしない。

失敗時diagnosticsには、次の趣旨を出す。

```text
Drive asset file は作成済みです。
manifest反映は完了していません、または完了確認できていません。
index.json updatedAt が未更新または不整合の可能性があります。
自動削除・自動修復は行いません。
```

Drive保存後のmanifest反映失敗は、`status: error` として扱う。

ただし、ユーザーに「何も起きなかった」と誤解させない。

---

## 34. 第4-3-4の実装分割

第4-3-4は、次の順に分割して実装する。

```text
パッチ1:
- decision doc更新
- 実コード変更なし

パッチ2:
- google-drive.ts
- manifest/index 更新用の高レベル関数を追加
- app-providers.tsx にはまだ接続しない

パッチ3:
- app-providers.tsx
- startAssetImport() を completed まで延長
- AssetImportPanel の completed 表示を整える
```

実際にDrive上のmanifest/index更新が走るのは、パッチ3でProviderに接続してからとする。
