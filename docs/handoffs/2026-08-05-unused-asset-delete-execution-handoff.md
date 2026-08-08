# Unused asset delete execution handoff

Date: 2026-08-05

## 実装内容

- `/admin` のunused asset cleanupに、prepare / confirm / executeの3段階によるGoogle Drive asset物理削除を追加した。
- 既存のread-only cleanup previewとdelete preflightを維持し、preflight済みselectionが完全一致する場合だけconfirmへ進める。
- pending delete planは`AppProviders`内部の`useRef`だけに保持し、React state、localStorage、sessionStorage、IndexedDBへ保存しない。
- pending planにはaccess tokenを含めず、workspace/project owner、対象asset、prepare時metadata fingerprintだけを保持する。
- UI向けreview/resultはassetName、size、短縮assetFileId、固定status/reasonだけに限定する。

## fresh revalidation境界

execute開始前に対象全件について既存preflightを再実行する。

- fresh manifest再読込
- manifest上のassetFileId参照数再計算
- fresh Drive metadata再取得
- selection set完全一致
- prepare時metadata fingerprint一致
- workspaceId / projectId / role / schemaVersion / assetId検証
- parentが選択中projectのassetsFolderId 1件だけであること
- `referenceSlideCount === 0`
- `trashed !== true`
- MIME typeが`image/jpeg`、`image/png`、`image/webp`のいずれか

全件検証後も、各DELETE直前に対象1件について同じfresh preflightを再実行する。参照追加、metadata変更、owner変更、app管理条件不一致があれば、そのassetを削除せず後続も停止する。manifestやmetadataの自動修復は行わない。

## DELETE API

- Google Drive `files.delete`を使用する。
- file IDは`encodeURIComponent`してURLへ組み込む。
- Authorization headerはDELETE helper内部だけで使用する。
- HTTP 204だけを`deleted`として扱う。
- 404は`notFound`、403/500/その他非204は`deleteRejected`として失敗扱いにする。
- raw response bodyは読まない。
- DELETEは並列化せず順次実行する。
- retryは行わず、最初の失敗またはrace検出時点で後続を`notAttempted`にする。

## partial failure

- 既に`deleted`になったDrive fileは復元しない。
- rollback API、自動retry、自動修復は追加していない。
- resultは`deleted` / `failed` / `blocked` / `notAttempted`を区別する。
- UIには「Drive上に一部削除済みの状態が残っています」と表示する。
- completedまたはpartial failure後にcleanup previewを1回だけ再読込し、次の手動操作のsource of truthとする。
- preview再読込に失敗してもdelete resultは保持し、専用メッセージを表示する。

## owner guardと排他

- delete専用request ID、access token identity、workspace/project ownerをstate更新前に確認する。
- project切替、workspace reset、Google切断、古いrunではdelete stateを更新しない。
- selection変更、preview再実行、preflight再実行、owner reset、delete終端でpending planを破棄する。
- delete中は既存の共通Drive operation guardを使用し、preview、preflight、asset import、slide edit、offline sync、project変更、workspace再確認を開始不可にする。
- publish / rollback入口にも共通Drive operation guardを適用した。

## security boundary

- access tokenは`AppProviders`内部refとAPI callのローカル引数だけで扱う。
- UI result/reviewにfull Drive file ID、assetId、workspaceId、projectId、manifestFileId、assetsFolderIdを含めない。
- Authorization、Bearer、raw Drive URL、raw response body、raw error、appProperties、parents、hash、checksumをUIやdiagnosticsへ出さない。
- Blob、thumbnail、preview画像は取得しない。

## 変更していない領域

- OAuth scope
- manifest / index schema
- Drive file naming、asset upload
- IndexedDB schema、confirmed/staging store
- Service Worker、player、remoteOnly、video playback
- publication provenance、publish write、rollback write
- offline sync runtime/progress

## focused tests

- prepare時のpreflight有無、eligible/blocked、selection/owner一致
- execute開始時と各DELETE直前のfresh preflight
- metadata fingerprint、参照追加、wrong project/parent/role
- JPEG / PNG / WebP eligible、MP4 blocked
- DELETE 204 / 404 / 403 / 500、URL encode、raw body非読込
- sequential delete、最初の失敗で停止、partial result、retryなし
- sanitized review/result、Provider ref-only plan、古いrequest guard
- cancel時DELETEなし、completed/partial後preview再読込、再読込失敗時result保持
- destructive button条件、role/status、aria-live

## browser / iPad acceptance

実Google Driveでのbrowser/iPad acceptanceは未実施。

確認項目:

- `/admin`で画像unused assetを選択し、preflight後だけ削除buttonが有効になる。
- confirmに件数、合計サイズ、完全削除、取り消し不可、非変更対象が表示される。
- cancelでDELETEが送信されず、選択が維持される。
- completed / partial failure / blocked / failureとitem statusが読める。
- full Drive IDやtoken等が画面・consoleへ露出しない。
- completed / partial failure後にcleanup previewが1回更新される。
- iPad横向きでconfirm、result、横スクロール表を安全に操作できる。
