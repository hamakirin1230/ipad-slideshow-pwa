# 動画再生設計

Date: 2026-06-27

## 目的

iPad用スライドショーPWAで、動画assetをスライドショーに含められるようにするための設計方針を整理する。

今回の段階では実装しない。コード挙動、Drive連携、offline sync、IndexedDB schema、player再生ロジックは変更しない。

初期実装では安全側に倒す。

- 静止画再生を壊さない。
- 既存のoffline-first playerを壊さない。
- Drive tokenや取得用URLを永続化しない。
- access token、Authorization header、Drive raw response、取得用URL、Blob本体、Blob URLをUI / docs / logsに出さない。
- iPadホーム画面PWAで確認できないものを完了扱いにしない。

## 前提

- 本番運用対象はVercel production。
- production aliasは `https://ipad-slideshow-pwa.vercel.app/`。
- GitHub Pagesは本番ではなく、手動確認または履歴用途。
- OAuth scopeは原則 `https://www.googleapis.com/auth/drive.file`。
- Google Photos Picker使用時だけ `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` を追加要求する既存方針を維持する。
- Player反映は既存どおりoffline sync経由。
- `/player/` はconfirmed storeからoffline-firstで読む。
- Drive file物理削除とDrive file delete APIは未実装のまま。
- cleanup preview / preflight / confirm preview はread-onlyのまま。

## 対象動画形式

検討対象は以下。

- `video/mp4`
- `video/quicktime`
- `video/webm`

初期対応候補は `video/mp4` に限定する。

理由:

- iPad Safari / ホーム画面PWAでの互換性を優先できる。
- admin取り込み、offline sync、player再生、fallback確認の範囲を狭くできる。
- unsupported判定とrollback時の切り分けを単純化できる。

`video/quicktime` と `video/webm` は、将来対応または取り込み時変換候補として扱う。初期実装で取り込む場合でも、player再生対象にしないか、unsupported reasonを明示してskip / fallbackする。

## Asset model

既存のasset metadataは、`assetId` を安定キーにして、Drive fileIdをsource metadataとして持つ。動画対応でもこの関係を維持する。

既存互換を壊さない追加方針:

- 既存image assetはそのまま再生できる。
- 既存slideの `assetId`、`caption`、`durationSeconds`、`order` は意味を変えない。
- 新規fieldはoptionalから始め、古いconfirmed store / manifestを読めるようにする。
- schema移行が必要な場合は、古いrecordをunsupported扱いにせず、既存imageとして解釈できる範囲を保つ。

追加候補:

```ts
type AssetKind = "image" | "video";

type PlaybackPolicy = {
  muted: boolean;
  playsInline: boolean;
  controls: boolean;
  maxPlaybackSeconds?: number;
  loop?: boolean;
  fallbackAfterMs?: number;
};
```

metadata候補:

- `assetKind`: `image` / `video`
- `mimeType`: Drive metadataまたはBlobのMIME type
- `durationMs`: 動画duration
- `width` / `height`: 表示判断とposter比率確認用
- `fileSize`: Drive metadataまたはBlob size
- `thumbnail` / `poster`: poster生成またはDrive thumbnail由来の表示情報
- `playbackPolicy`: muted、playsInline、controls、duration capなど
- `sort order`: 既存どおりslide orderを正とする
- `enabled` / `disabled`: adminで再生対象から外す余地
- `unsupportedReason`: 再生不可、形式未対応、サイズ超過、duration超過、metadata不足など

初期案:

- `assetKind` がない既存assetは `image` とみなす。
- `video/mp4` 以外は `unsupportedReason` を持たせ、playerではskipまたはfallback表示する。
- `durationMs` が取れない動画は初期実装ではunsupportedに倒す。
- `poster` がない動画は、admin / playerでfallback UIを出せるようにする。

## Drive / sync方針

Driveは管理・同期元、IndexedDB confirmed storeは本番再生元として扱う。動画でもこの境界は変えない。

重要点:

- access tokenはProvider内部の `useRef` のみで扱う。
- tokenはlocalStorage / IndexedDB / Cookie / docs / logsへ保存しない。
- Drive file取得用URLは保存しない。
- Blob本体やBlob URLはUI / logs / docsに出さない。
- offline sync経由でconfirmed storeへ反映する。
- `/player/` はDrive APIやOAuth状態に依存しない。

動画は容量が大きいため、初期実装ではサイズ上限を必ず設ける。

初期案:

- 1動画あたりの最大サイズを設定する。
- 1projectあたりの動画総容量上限を設定する。
- offline sync前に推定容量をadminで見せる。
- サイズ超過や形式未対応はsync全体を壊さず、unsupported assetとして診断に残す。
- confirmed storeへ昇格するのは、project / asset metadata / Blob対応が検証済みのものだけ。

partial state方針:

- staging storeに書き込み途中のデータをplayerの再生元にしない。
- 動画Blob取得失敗時は、対象assetをfailed / unsupportedとして扱うか、sync run全体をfailedにするかを実装前に決める。
- 既存imageが正常なら、動画1件の失敗で静止画再生を巻き添えにしない設計を優先する。
- unsupported videoはplayerでskip、またはposter / fallbackを短時間表示して次へ進む。

## Player再生方針

iPad Safari / ホーム画面PWAを前提にする。ローカルブラウザ確認だけでは完了扱いにしない。

初期案:

- 動画は `muted` + `playsInline`。
- `controls` は出さない。
- autoplay失敗時はposterまたはfallbackを短時間表示して次へ進む。
- 動画終了時に次のslideへ進む。
- duration上限を超える動画は上限で切り上げて次へ進む。
- iPadホーム画面PWA確認を完了条件にする。

検討項目:

- muted autoplayの成立条件。
- `playsInline` の指定。
- controlsの有無。
- 1動画の最大再生時間。
- 動画終了時のnext slide遷移。
- 再生失敗時のfallbackとskip。
- loop可否。
- poster表示。
- image / video混在時の順序。
- Low Power ModeやSafari制限。
- PWAホーム画面での挙動。

player実装時の注意:

- 現在のplayerはimage preloadとobject URL lifecycleを前提にしているため、video用のobject URL lifecycleを別途設計する。
- object URLは不要になったら必ずrevokeする。
- video再生失敗時にauto advanceが止まったままにならないよう、timeout fallbackを持つ。
- production mode / lock / swipe / caption telop overlayを壊さない。
- lock中もswipe移動できる既存方針を維持する。

## Admin UI方針

adminでは、動画assetと画像assetを明確に区別する。

表示候補:

- asset kind: image / video
- mimeType
- duration
- fileSize
- playback eligibility
- unsupported reason
- poster / thumbnailの有無
- sync対象かどうか

cleanup previewでの扱い:

- 動画assetも、未参照assetならcleanup preview上に表示する。
- preview / preflight / confirm previewの削除挙動は変えない。
- Drive file delete APIは未実装のまま。
- Drive file物理削除は未実装のまま。
- 長いfile name、mimeType、duration、unsupported reasonは横スクロールtable内で確認できるようにする。

admin取り込みでの初期案:

- `video/mp4` だけ取り込み候補にする。
- `video/quicktime` / `video/webm` はunsupportedまたは将来変換候補として表示する。
- サイズ上限、duration上限、iPad PWA未確認の注意をadminで明示する。

## Rollback / release方針

`docs/release-rollback.md` の方針に従い、Git / Vercel rollback、Drive workspace data、端末内状態を分けて扱う。

動画対応時に注意すること:

- アプリコードrollbackだけでは、Drive workspace dataやiPad IndexedDBは戻らない。
- Vercel deployment rollbackだけでは、confirmed storeに残った動画assetや古いBlobは戻らない。
- Drive workspace data rollbackには、`workspace.json`、`index.json`、project `manifest.json`、asset metadata、動画asset fileが関係する。
- offline sync済み端末では、動画assetがconfirmed storeに残る可能性がある。
- unsupported assetの解釈がバージョンで変わる場合、古いアプリでどう表示されるか確認する。
- iPad PWAではCache Storage / IndexedDB resetやoffline sync再実行が必要になる場合がある。

公開済み扱いにする条件:

- Vercel production deploymentがReady。
- production aliasが期待するdeploymentを指している。
- 対象commitが期待するGit commit SHAと一致している。
- `/settings`、`/admin`、`/player` の最低限表示確認が済んでいる。
- iPadホーム画面PWAで動画混在projectを確認できている。
- offline sync、PWA再起動、production mode、lock、swipe、caption telopが期待どおり動く。

## 段階的実装案

### Phase 1: docs only

- 今回。
- 動画再生の設計とリスク整理のみ。
- コード挙動は変更しない。

### Phase 2: schema / validation

- asset kind、mimeType、duration、size、poster、unsupported reasonのschema拡張。
- 既存image assetとの後方互換確認。
- staging validation / confirmed validationの拡張。
- lint / build。

2026-06-27実施範囲:

- Drive manifest slideのschema groundworkとして、optionalな `type`、`fileSize`、`durationMs`、`unsupportedReason` を認識する。
- `type` 不在の既存assetは `image` として扱う。
- `type: "image"` + `image/jpeg` / `image/png` / `image/webp` は従来どおり画像assetとして扱う。
- `type: "video"` + `video/mp4` はrecognized video candidateとして扱う。ただしplayer再生、download、offline保存は未実装のため `videoPlaybackNotImplemented` を付与できる。
- `type: "video"` + `video/quicktime` / `video/webm` / その他 `video/*` は `unsupportedVideoMimeType` を付与できる。
- `unsupportedReason` はmanifest明示値よりmimeTypeからの機械判定を優先する。
- offline schemaにもoptionalな `type`、`durationMs`、`unsupportedReason` を追加し、既存confirmed store recordの後方互換性を保つ。
- offline syncは画像assetのみをdownload対象にする。video assetを見つけても動画download / IndexedDB保存 / player再生へは進めず、画像assetのoffline syncは継続する。
- video assetはstaging snapshotのconfirmed再生対象から除外し、diagnosticsにskip理由を残す。
- `/visual-check/admin-cleanup` にmock-onlyのvideo rowを追加した。

Phase 2でまだ実装していないこと:

- `<video>` rendering。
- autoplay / playsInline / ended / error handling。
- video download。
- video Blob / Blob URL生成。
- IndexedDBへの動画Blob保存。
- Cache Storageへの動画保存。
- Drive media downloadの動画対応。
- Photos Picker scope変更。
- admin上の本格的なvideo asset表示。
- player slide progression変更。

### Phase 3: admin visibility

- admin上で動画assetを識別。
- mimeType、duration、fileSize、unsupported reasonを表示。
- `/visual-check/admin-cleanup` のmock更新。
- cleanup previewの表示確認。

2026-06-27実施範囲:

- `/admin` のproject slide一覧で `type`、`durationMs`、`fileSize`、`unsupportedReason` を表示する。
- video assetのpreview枠は認識状態のみを表示し、preview Blob取得へ進めない。
- cleanup preview table / preflight eligible list / preflight blocked list / confirm previewに、mimeType由来のtypeとunsupported reasonを横スクロール内で表示する。
- `/visual-check/admin-cleanup` に `video/mp4`、`video/quicktime`、`video/webm`、unknown MIME typeのmock rowを追加し、長いduration / unsupported reasonの崩れを確認できるようにする。

Phase 3でまだ実装していないこと:

- `<video>` rendering。
- autoplay / playsInline / ended / error handling。
- video download。
- video Blob / Blob URL生成。
- IndexedDBやCache Storageへの動画保存。
- Drive media downloadの動画対応。
- Photos Picker scope変更。
- player slide progression変更。
- Drive file物理削除またはDrive file delete API。

### Phase 4: offline sync

- 動画assetのoffline保存方針を実装。
- size上限とproject合計容量上限。
- sync失敗時の扱い。
- unsupported videoをconfirmed storeへどう残すか、または残さないかを決める。

### Phase 5: player playback

- muted + playsInline のvideo rendering。
- ended / error / timeout handling。
- poster / fallback。
- image / video混在再生。
- iPadホーム画面PWA確認。

### Phase 6: polish / limits

- poster生成またはthumbnail利用。
- duration cap。
- admin warning。
- release / rollback checklist更新。
- Playwright screenshot smoke testやmock visual check拡張。

## 未解決事項

- 動画サイズ上限。
- 1projectあたりの動画総容量上限。
- 最大duration。
- poster生成方法。
- thumbnailをDrive metadataから取るか、自前生成するか。
- `video/quicktime` 対応有無。
- `video/webm` 対応有無。
- offline保存容量上限。
- iPad実機でのautoplay挙動。
- Low Power Modeでの挙動。
- PWA cache reset手順。
- IndexedDB reset手順。
- 既存 `workspace.json` / `index.json` / `manifest.json` との互換性。
- unsupported assetをconfirmed storeへ残すか、sync対象から外すか。
- 動画Blob取得失敗時にsync run全体をfailedにするか、部分成功にするか。

## 禁止事項

- access tokenを保存しない。
- access tokenを表示しない。
- access tokenをconsole出力しない。
- Authorization headerをUI / docs / logsに出さない。
- Drive raw responseをUI / docs / logsに出さない。
- Drive file取得用URLをUI / docs / logsに出さない。
- Blob本体やBlob URLをUI / docs / logsに出さない。
- Client Secret / APIキーは作らない、使わない。
- Drive file物理削除は実装しない。
- Drive file delete APIは実装しない。
- cleanup preview / preflight / confirm previewを実削除処理へ変えない。
- 今回は動画再生を実装しない。
