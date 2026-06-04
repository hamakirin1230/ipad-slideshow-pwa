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
```
