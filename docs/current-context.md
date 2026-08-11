# iPad用スライドショーPWA 現在の引き継ぎ

Date: 2026-08-12

このファイルは、次にCodexで作業を再開するときの入口です。古い第4-1時点の制約ではなく、2026-08-12時点の実装・運用状態を正とします。

docs全体のCurrent / Historical分類は[`docs/README.md`](README.md)を参照してください。
runtime environmentとVercel security headerの現行契約は[`environment-security.md`](environment-security.md)を参照してください。

2026-06-22時点で、Vercel productionの既存運用を再確認済み。新規Vercel project作成、import、`vercel link` は不要。

## Product-ready finalization status

2026-08-12、`finalization/product-ready`をmainへmergeし、Vercel Production反映後の実iPad smoke checkを完了した。ProductionのHome、Settings / Google接続、Admin、Historyのrollback preview、Player playback、existing installed PWAはOK。PWA new installは未確認のまま保持する。product-ready finalization Production acceptanceは完了しており、remaining exclusionsは[`acceptance/product-ready-finalization-acceptance.md`](acceptance/product-ready-finalization-acceptance.md)を参照する。

## 最重要方針

- iPadホーム画面PWAで安定して動くことを最優先にする
- 本番中に止まらないことを最優先にする
- 最終的にオフラインのiPadだけでスライドショーを本番再生できるようにする
- Vercel productionを現在の本番運用対象にする
- Google OAuth scopeは原則`https://www.googleapis.com/auth/drive.file`のみ
- access tokenは保存しない、表示しない、console出力しない
- access tokenはlocalStorage / IndexedDB / Cookie / docs / logsに出さない
- Client Secretは作らない、使わない
- APIキーは作らない、使わない
- iPadホーム画面PWAで確認できないものは、本番完了扱いにしない
- package managerは`pnpm@10.34.4`に固定し、local validationはpnpm 10で実行する

## 現在の公開先

```text
https://ipad-slideshow-pwa.vercel.app/
```

正式な本番運用・deployment先はVercel productionのみ。
GitHub Pages deployは廃止済み。GitHub Actionsはtest / lint / production buildを行うCIとして継続する。

現在のPWA path:

```text
manifest: /manifest.json
start_url: /
scope: /
icons: /icons/...
service worker: /sw.js
```

`next.config.ts` は常にroot deployment前提で、GitHub Pages用`basePath`分岐は持たない。

## 現行の運用契約

production App Routerに存在する主要route:

```text
/
/settings
/admin
/admin/history
/player
```

`/auth-test`と`/visual-check/*`はproduction App Routerから撤去済みで、現行routeではない。

- Drive current manifestへの編集保存とpublishは別操作で、saveだけではrevisionを作らない
- publish / rollbackはimmutable revisionを作成し、current published revisionは`manifest.publication.currentRevisionId`をauthorityとする
- rollbackは過去revisionへpointerを戻さず、過去内容から新しいrollback revisionを作る
- save / publish / rollbackだけではoffline dataを更新せず、端末反映には明示的offline syncが必要
- publication writeのin-flight guardは同一tab内の直列化であり、既知のmulti-tab raceは未解決
- temporary publication acceptance fault harnessは専用branchで実装後に完全撤去され、production sourceには存在しない

## 現在の到達点

完了済み:

```text
Vercel production移行
Google OAuth / drive.file scope
Drive workspace作成・再確認
Drive project作成・再確認
Google Photos Pickerから素材追加
Google Photos Pickerから複数素材をbatch追加
Drive assets/保存
manifest.json.slides反映
slide.captionをテロップとして編集
index.json updatedAt同期
Drive offline snapshot fetch
IndexedDB staging write
staging validation
confirmed store promotion
/admin offline sync panel
/admin confirmed store inspection
/admin project単位ローカル削除
/admin projectごとの保存容量表示
/admin browser storage estimate表示
/admin app shell cache状態確認・削除
/player confirmed Blob offline-first再生
/player recovery copy
/player iPad横向き再生UI
/player project selector準備
/player production mode
/player operation lock
/player caption telop overlay
/player auto advance interval selector
/player slide transition animation
/admin slide reorder controls
/admin slide drag-and-drop reorder
/admin slide bulk delete
/admin slide duplicate
/admin drag handle compact display
/admin unused Drive asset cleanup preview
/admin unused Drive asset explicit physical delete
unused Drive asset physical deleteの実Google Drive動作確認（未参照app-managed JPEG / PNG / WebPのみ。MP4/MOVは対象外）
明示的publish / immutable revision / rollback impact preview / fresh preflight / verified rollback
manifest.publication.currentRevisionId authorityと、新しいrollback revision作成
実Google Driveでpublish / unpublished change / republish / rollback acceptance
Goal 6 publication provenance（publishedMatch / unpublishedChanges / unpublished / needsInspection / legacyUnknown）
stale sync時にprevious confirmed snapshotを保持するreview fix
実Google Driveでpublish / unpublished edit / republish / rollback後の各offline syncとprovenance acceptance（Goal 6完了）
local MP4/MOV resumable upload（1ファイル5GB以下）
MP4/MOV offline Blob保存（50 MiB以下）
MP4/MOV remoteOnly Drive streaming（50 MiB超〜5GB以下）
Vercel production / 実iPadで約3GB MOVのremoteOnly Drive streaming再生
Service Worker app shell cache
iPad実機 offline shell / player recovery確認
```

## 保存先の整理

### Google Drive

source of truth。

保持するもの:

```text
workspace folder
workspace.json
index.json
projects/{projectId}/manifest.json
projects/{projectId}/assets/
```

### IndexedDB

offline playback用コピー。

DB:

```text
ipad-slideshow-offline
```

confirmed stores:

```text
offlineProjects
offlineAssets
offlineAssetBlobs
offlineSyncState
```

staging stores:

```text
offlineStagingProjects
offlineStagingAssets
offlineStagingAssetBlobs
```

### Cache Storage

Service Workerによるapp shell cache。

代表cache:

```text
ipad-slideshow-pwa-app-shell-v1
```

保存対象:

```text
/
/settings/
/admin/
/player/
/manifest.json
/icons/icon-192.png
/icons/icon-512.png
/_next/static/...
```

## 重要な実装境界

- Drive API呼び出しはProvider内部操作から行う
- access tokenをContextやUIへ公開しない
- Blob本体をReact stateへ載せない
- Drive raw responseやraw snapshotをUI stateへ載せない
- offline sync resultはlightweight summaryだけUIへ返す
- confirmed store inspectionでもBlob本体は画面表示しない
- `/player/` はconfirmed storeからoffline-firstで読む
- `/player/` はconfirmed store内のslide順をそのまま再生順として使う
- Drive上の画像順の正は`manifest.json.slides[]`の配列順
- Photos Pickerから追加したslideは現在の`manifest.json.slides[]`末尾へ、選択順のままappendする
- Drive上のslide削除・複製も`manifest.json.slides[]`だけを変更し、Drive assets/内の画像ファイルは削除・コピーしない
- orphan asset cleanup previewはread-onlyで、`manifest.json.slides[]`から参照されないapp-managed asset filesだけを検出する
- unused assetの物理削除はlocal selection、fresh preflight、明示confirm、execute直前全件preflight、各DELETE直前preflightの順でのみ実行する
- 物理削除対象は選択中projectの`assetsFolderId`直下にあるapp-managedな未参照画像asset（JPEG / PNG / WebP、最大50件）だけで、videoは削除対象外
- Drive `files.delete`は順次実行し、204だけを成功とする。retryせず、最初の失敗で後続を`notAttempted`として停止する
- partial failureでは削除済みfileを復元せず、deleted / failed / blocked / notAttemptedをsanitized resultで表示する
- completed / partial failure後はcleanup previewを1回再読込するが、offline sync、confirmed store更新、player reloadは開始しない
- unused asset物理削除では`manifest.json` / `index.json` / project folder / assets folderを更新・削除しない
- unused asset delete readiness UIは追加済みだが、checkbox選択はUI local stateのみで永続化しない
- unused asset cleanupはpreview + delete-readiness + preflight + confirm + physical delete executionまで実装済み
- preflightはfresh manifest再読込、参照数再計算、Drive metadata再取得を行う
- confirm UIは対象件数、合計サイズ、完全削除、取り消し不可、manifest / index / confirmed store非変更を明示する
- pending delete planはAppProviders内部refだけに保持し、access tokenを含めず永続化しない
- cleanup previewの診断にもaccess token、Authorization header、Drive download URL、raw API URLを含めない
- Player反映は従来どおりoffline sync経由で、cleanup preview自体はPlayer snapshotやIndexedDBを変更しない
- project単位ローカル削除ではDrive上のデータを削除しない
- app shell cache削除ではIndexedDBのproject / asset / Blobを削除しない

## MP4/MOVと動画容量の現在地

2026-08-08時点:

```text
対応playback MIME: video/mp4, video/quicktime
local file import max: 5 * 1024 * 1024 * 1024 bytes
resumable upload chunk: 8 MiB
offline Blob cap: 50 MiB（50 * 1024 * 1024 bytes）
remote stream chunk cap: 32 MiB
Google Photos Picker video cap: 50 MB（変更なし）
```

- MIMEが空または`application/octet-stream`でも、`.mp4` / `.mov`から安全にMIMEを補完する
- 既知MIMEと`.mp4` / `.mov`が矛盾する場合はupload前にrejectし、変換や推測補正を行わない
- 50 MiB以下のMP4/MOVはactual MIMEでBlob取得・検証し、offline confirmed storeへ保存する
- 50 MiB超〜5GB以下はBlobを取得せず、metadataだけを`remoteOnly`としてconfirmed storeへ保持する
- 5GB超とsize不明は再生対象外とし、Drive fileの自動削除・rename・修復を行わない
- remoteOnly sessionはactual MIMEをService Workerへ渡し、Range / Content-Rangeはsafe Numberで扱う
- MOVはiPad/WebKitのnative playbackへ渡し、codec/containerをclient-side transcodeしない
- codec非対応またはmedia errorでは安全な一般案内を表示し、手動retry / previous / nextを維持する
- MP4/MOVはunused asset physical deleteの対象外で、画像だけの削除policyを維持する
- schema、IndexedDB version、publication provenance、publish / rollback authorityは変更しない
- 2026-08-08、Vercel productionと実iPadで、当初再生できなかった同じ約3GB MOVの`remoteOnly` Drive streaming再生に成功した
- MOV containerの実機playback、3GB級remoteOnly streaming、旧2GB上限を超える実データ再生はacceptance済み
- すべてのMOV codecを保証するものではなく、codec互換性は引き続きiPad/WebKit native playbackに依存する。client-side transcodeは行わない

remaining acceptance:

- exactly 5GBの実ファイル
- 5GB + 1 byteの実ファイル
- 意図的な再生失敗後のmanual retry実機経路

## 複数project再生の現在地

2026-06-12時点で準備済み:

```text
confirmed store promotion時に他projectを削除しない
readOfflinePlaybackSnapshot({ projectId }) 対応
ready project複数時はprojectSelectionRequiredを返す
/player/にproject selectorを表示
/player/?projectId=...で対象projectを直接開ける
最後に選んだprojectIdをlocalStorageへ保存
/admin/ confirmed projectsから「このprojectを再生」へ遷移
```

Vercel productionで確認済み:

```text
Project A / Project Bを識別できるtitle管理
複数Drive projectの作成
既存projectの切り替え
選択中projectへの素材追加
選択中projectのoffline sync
confirmed storeに複数projectを保持
/player/のproject selector
/player/?projectId=<Project A>で再生
/player/?projectId=<Project B>で再生
last played projectIdがiPad PWA再起動後も効くこと
```

## 本番モード・操作ロック

2026-06-12時点で追加済み:

```text
/player/でnormal / production modeを切り替え
production modeはlocalStorage key ipad-slideshow:player-presentation-modeに保存
production mode ONでlockもON
production mode OFFでlockもOFF
lock状態は永続化しない
lock中も自動送りは継続
production mode中は通常操作UI、project selector戻り、next/previous button、playback toggleを非表示・無効化
production mode / lock中も左右swipeによるslide navigationは許可
lock中にtapしてもcontrolsは表示しない
lock解除は右上の2秒長押し
lock解除後もproduction modeは維持
```

## テロップ・素材batch追加

2026-06-12時点で追加済み:

```text
既存のslide.captionをテロップ本文として扱う
captionはplain text、保存時trim、上限80文字
/admin/の本編スライド順でslideごとにテロップ編集・個別保存
caption更新はDrive manifest.jsonをsource of truthにする
caption更新後、iPad再生に反映するには対象projectのoffline syncが必要
/player/ではnormal / production / lock中の全てでテロップoverlayを表示
テロップoverlayはpointer-events-noneでswipe操作を邪魔しない
テロップ下帯はiPad PWAでbackdrop-filterが効かなくても残るよう、rgba背景をinline styleで指定する
Photos Pickerは1回最大10件、かつproject全体50 slides上限まで
Photos Pickerのユーザー認証・選択待ちのアプリ側timeoutは30分
download / Drive uploadはitemごとに順次処理
Drive保存成功分が1件以上あればmanifest.jsonへbatch append
batch append後は追加slide群がmanifest末尾に同じ順序で入ったことを再検証する
途中失敗時もDrive保存済みassetの自動削除・自動修復はしない
```

## Player自動送り・transition・画像順変更

2026-06-12時点で追加済み:

```text
/player/の自動送り間隔を端末ごとのlocalStorage設定として保存
localStorage key: ipad-slideshow:player-auto-advance-interval-seconds
選択肢は なし / 5秒 / 10秒 / 15秒 / 20秒 / 30秒 / 1分
初期値は10秒
なしはpauseではなくauto advance timerを張らない状態
production mode / lock中も選択済みintervalで自動送り継続
next / previous / swipe / 自動送りでfade + slight horizontal slide
prefers-reduced-motionでは短いfadeに落とす
/admin/の本編スライド順で上へ / 下へボタンによる画像順変更
先頭の上へ、最後の下へ、1枚だけ、保存中、project未ready、offline sync中、素材追加中、caption保存中はreorder不可
reorder保存先はDrive manifest.json.slides[]の配列順
reorderではasset file / assetId / assetFileId / caption / durationSecondsを変更しない
index.json.projects[].updatedAtも更新し、更新後にmanifest / indexを再読込して再検証
画像順変更後、iPad再生に反映するには対象projectのoffline syncが必要
```

## Admin slide drag-and-drop・一括削除・複製

2026-06-12時点で追加済み:

```text
/admin/の本編スライド順でdrag-and-dropによる画像順変更
drag handleのみでdrag開始し、checkbox / button / textarea操作ではdrag開始しない
drag handleの表示テキストは「≡」のみ、aria-label / titleは「ドラッグして並び替え」を維持する
drag over中に暫定順を表示し、drop時にDrive manifestへ保存
保存失敗時はDrive由来の最新slide順へ戻す
上へ / 下へボタンによるreorderは維持

checkboxで複数slideを選択し、一括削除できる
すべてのslide削除も許可
一括削除はmanifest.json.slides[]から対象slide entryを外すだけで、Drive assets/のasset fileは削除しない
削除成功後は選択をクリア

slide複製はsource slideの直後に新しいslide entryを挿入する
新しいslideId / createdAt / updatedAtを発行する
assetId / assetFileId / assetName / mimeType / caption / durationSeconds / source fieldsはsource slideからコピーする
Drive asset fileはコピーしない
project全体50 slides上限を維持する

delete / duplicate / drag reorderではmanifest.json.updatedAtとindex.json.projects[].updatedAtを更新する
更新後にmanifest / indexを再読込して保存結果を再検証する
不整合時は自動修復しない
project未ready、offline sync中、素材追加中、caption保存中、title保存中、Drive操作中、slide edit保存中はslide edit不可
slide削除・複製・並び替え後、iPad再生に反映するには対象projectのoffline syncが必要
```

## 直近の検証済み

2026-08-08のMOV / 5GB対応でローカル確認済み:

```text
npx -y pnpm@10 exec vitest run（46 files / 889 tests）
npx -y pnpm@10 lint
npx -y pnpm@10 build
git diff --check
```

注意:

```text
ローカル環境にはconfirmed projectがないため、
production mode ON/OFF、lock中swipe navigation、2秒長押しunlock、Project A / Project Bの実データ再生はVercel production / iPad PWA側で確認する。
Photos Picker複数選択、caption保存、offline sync後のテロップ再生もVercel production / iPad PWA側で確認する。
画像順変更、drag-and-drop reorder、複数slide削除、slide複製、変更後offline sync、Playerでのnext / previous / swipe / 自動送り / transitionはVercel production / iPad PWA側でProject A / Project Bそれぞれ確認する。
```

## 次に自然な作業

優先候補:

```text
1. publication write異常系の実Google Drive acceptance
   承認済みplanに従い、専用disposable workspaceと一時的なPreview-only harnessを使う。
   production sourceへfault hookを残さず、caseごとの停止条件とrecoveryを守る
2. MOVのexactly 5GB / 5GB + 1 byte境界と、意図的な再生失敗後のmanual retry実機経路
```

publication write異常系の詳細計画は`docs/acceptance/publication-write-abnormal-acceptance-plan.md`を参照。Gate 0承認後にtemporary harnessを専用branchで実装したが、その後完全撤去済みでmainへmergeしていない。repository docsに実Google DriveでA/B/Cを完了した結果記録はない。

## 最新ハンドオフ

読む順:

```text
docs/handoffs/2026-08-08-mov-video-5gb-handoff.md
docs/handoffs/2026-08-05-unused-asset-delete-execution-handoff.md
docs/handoffs/2026-07-31-offline-publication-provenance-handoff.md
docs/handoffs/2026-07-28-publish-history-rollback-completion-handoff.md
docs/offline-publication-provenance-design.md
docs/handoffs/2026-06-13-player-admin-polish-fixes-handoff.md
docs/handoffs/2026-06-12-slide-dnd-delete-duplicate-handoff.md
docs/handoffs/2026-06-12-player-auto-advance-transition-and-slide-reorder-handoff.md
docs/handoffs/2026-06-12-caption-telop-and-batch-asset-import-handoff.md
docs/handoffs/2026-06-12-production-mode-and-operation-lock-handoff.md
docs/handoffs/2026-06-12-multi-project-playback-preparation-handoff.md
docs/handoffs/2026-06-12-advanced-offline-storage-controls-handoff.md
docs/handoffs/2026-06-10-offline-storage-management-ui-handoff.md
docs/handoffs/2026-06-10-ipad-pwa-offline-shell-verification-handoff.md
docs/handoffs/2026-06-10-pwa-offline-shell-local-recovery-handoff.md
docs/handoffs/2026-06-09-offline-playback-e2e-handoff.md
```

## Goal 6 confirmed snapshot publication provenance

2026-08-08時点で、明示的offline syncがDrive current manifestとcurrent
published revisionの関係をsanitized provenanceとしてstaging、
confirmed project、ready sync stateへ保存する。

```text
publishedMatch: current manifestの再生内容がcurrent published revisionと一致
unpublishedChanges: current publicationは正式だがcurrent manifestに未公開編集あり
unpublished: publication未設定
needsInspection: historyまたはpublication対応を正式確認できない
legacyUnknown: Goal 6以前のfield欠落recordをread/view時にnormalize
```

offline syncの内容authorityは引き続きDrive current manifestであり、published
revision本文への切替、自動publish、自動rollback、自動offline syncは行わない。
asset取得後、staging write前にmanifest metadata、content、publication署名を
再検証し、変化時は`staleManifest`として手動再同期を案内する。

`OFFLINE_DB_VERSION`と`OFFLINE_SCHEMA_VERSION`は1のまま、object store変更、
background migration、legacy recordの自動rewriteはない。publish / rollback後も
offline syncは明示操作であり、実行中player sessionを自動reloadしない。

stale syncでは今回のtemporary stateを失敗状態として残さず、previous confirmed
snapshotとready sync stateを保持するreview fixまで実装済み。実Google Driveでは、
publish -> offline sync、unpublished edit -> offline sync、republish -> offline sync、
rollback -> offline syncの順に各provenanceを確認済みで、Goal 6は完了扱いとする。
