# 第4-3 素材追加・assets保存 設計決定メモ

* 対象プロジェクト: `ipad-slideshow-pwa`
* 対象フェーズ: 第4ゴール / 第4-3 素材追加・assets保存
* 現在のスライス: 第4-3-2 Google Photos Picker選択まで
* ステータス: 第4-3-2 実装前設計確定
* 最終更新日: 2026-06-04
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

grep -n "^## 7\. assetImportSelection方針" docs/decisions/goal-04-3-asset-import.md >/dev/null && echo "Section 7 already exists. No append was done." || cat >> docs/decisions/goal-04-3-asset-import.md <<'EOF'

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
