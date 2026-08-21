# スライドショー

iPadで安定して本番再生するためのスライドショーPWAです。

PC側でGoogle Drive上のworkspace / project / manifest / assetsを管理し、iPad側ではDriveから取得した再生用コピーをIndexedDBに保存して、offline-firstで再生します。大容量動画は端末へ本体保存せず、online時にDrive streamingで再生します。最優先は、学校現場・イベント現場で本番中に止まらないことです。

## Documentation

現在のdocs入口は[`docs/README.md`](docs/README.md)です。最新の作業引き継ぎは`docs/current-context.md`、dated handoffは当時の実装・acceptanceを保存するhistorical recordとして扱います。正式productionはVercelのみで、package managerは`pnpm@10.34.4`です。

## 現在の到達点

現在はVercel productionでの運用を前提に、Drive連携からoffline playbackまでの主要な縦線が通っています。

完了済み:

- Vercel productionで公開中
- Google OAuth / `drive.file` scope接続
- Google Drive workspace / project作成と再確認
- Google Photos Pickerから素材追加
- Drive assets保存、`manifest.json` / `index.json`反映
- Drive snapshot取得、IndexedDB staging write、confirmed store promotion
- `/player/` でIndexedDB confirmed Blobからoffline-first再生
- next / previous / 自動送り / swipe操作
- Service Workerによるapp shell cache
- iPad実機PWA offline shell / player recovery確認
- `/admin/` でproject単位ローカル削除、保存容量、browser storage estimate、app shell cache状態確認
- `/player/` のiPad横向き再生UI polish
- 複数project playback準備、project selector、`/player/?projectId=...`
- Vercel productionでProject A / Project Bのoffline sync、confirmed store複数保持、player selector、project指定再生を確認
- `/player/` 本番モード、操作ロック、lock中の左右swipe navigation、2秒長押しロック解除
- `/player/` captionテロップoverlay、`/admin/` slide別テロップ編集
- Google Photos Pickerから複数写真を順次Drive保存し、成功分をbatchでmanifest反映
- `/player/` 自動送り間隔選択、なし/5秒/10秒/15秒/20秒/30秒/1分、localStorage保存
- `/player/` slide transition animation、next / previous / swipe / 自動送りでfade + slight horizontal slide
- `/admin/` slide順の上へ/下へ変更、drag-and-drop並び替え、複数slide一括削除、slide複製
- `manifest.json.slides[]` 配列順を再生順のsource of truthとして保存
- `/admin/` drag handle表示を「≡」のみへ簡略化し、aria-label / titleは維持
- `/player/` のcaptionテロップ下帯をiPad PWAでも残るように背景指定を強化
- Google Photos Pickerのユーザー認証・選択待ちアプリ側timeoutを30分に延長
- `/admin/` から選択中projectの写真だけをGoogle Photosの新規albumへ書き出せる。画像captionはexport画像にburn-inする。動画slideは作品に残し、このiPadへの保存とPlayer再生はできるが、Google Photosへは書き出さない。Production上の実Google Photosで新規album exportと画像caption burn-inを確認済み。images-only仕様のPreview確認は未実施
- `/admin/` で選択中projectのunused Drive asset cleanup preview / readiness / preflight / confirm previewを表示
- cleanup preview / preflight / confirm previewはread-onlyで、Drive file、Player snapshot、IndexedDBを変更しない
- fresh preflight、明示confirm、順次DELETE、partial failure停止を経た未参照app-managed JPEG / PNG / WebPの物理削除と、実Google Driveでの動作確認
- `/admin/` からローカル動画をDrive assetとして追加し、動画slideをmanifestへ保存
- ローカルMP4/MOVを1ファイル5GB以下までresumable uploadで追加
- MP4/MOVのoffline Blob保存上限を50 MiBとし、50 MiB超〜5GB以下は`remoteOnly` metadataとしてconfirmed storeへ保持
- remoteOnly MP4/MOVをonlineかつGoogle接続済みの場合にDrive streamingで再生
- Vercel production / 実iPadで、当初再生できなかった同じ約3GB MOVの`remoteOnly` Drive streaming再生に成功し、旧2GB上限を超える実データ経路を確認
- 画像／動画混在再生、offline Blob動画、動画slideごとのduration override
- remote video再生失敗時の手動retryと、slide / project / snapshot変更時のstale result guard
- retry可否、owner key、generation、source identityをpure helper化し、Vitest 1 file / 22 testsで検証
- `/admin/history` でproject別の公開履歴、current公開状態、revision詳細を確認
- current published revisionは最新日時ではなく、`manifest.publication.currentRevisionId`を正本として特定
- current revisionとcurrent manifestの比較による「未公開編集あり」表示
- Drive current manifestの保存と分離した明示的publish、immutable revision作成
- publishではrevision作成とread-backを先に完了し、current manifestのpublication更新をcommit pointとして検証
- rollback impact previewでslide、title、target assetのfresh metadata、offline / remoteOnly影響を確認
- rollback実行前のfresh execution preflightと、`ready`状態だけを対象にしたverified rollback実行
- rollbackは過去revisionへpointerを戻さず、過去内容を復元した新しいrollback revisionを作成
- rollback後はcurrent manifest本文とpublicationを更新し、indexは対象projectのtitle / `updatedAt`だけをmirror
- publish / rollbackの共通write guard、orphanを自動削除しない部分失敗方針、成功後も別操作とするoffline sync
- disposable projectの実Google Driveでpublish、未公開編集、republish、rollbackまで確認
- confirmed snapshot publication provenanceの`publishedMatch` / `unpublishedChanges` / `unpublished` / `needsInspection` / `legacyUnknown`と、stale sync時にprevious confirmed snapshotを保持するreview fix
- 実Google Driveでpublish / unpublished edit / republish / rollback後の各offline syncとpublication provenanceを確認し、Goal 6完了
- rollback pipelineのproduction moduleを直接検証するunit testを含む、Vitest 24 files / 669 tests
- mainへのpush、pull request、手動実行でtest / lint / production buildを行うGitHub Actions CI

## 公開URL

```text
https://ipad-slideshow-pwa.vercel.app/
```

正式な本番運用・deployment先はVercel productionのみです。GitHub Pages deployは廃止済みですが、test / lint / production buildを行うGitHub Actions CIは継続します。manifest / icon / Service Workerを含む配信pathはroot前提です。

## 現在使える画面

- `/` トップ画面
- `/settings` Google接続、Drive workspace確認、IndexedDB疎通確認
- `/admin` Drive project、画像／ローカル動画追加、slide順・テロップ・動画duration override編集、Google Photos新規album書き出し、offline / remoteOnly状態確認、offline sync、confirmed store、storage管理、unused Drive asset cleanup preview / explicit physical delete。最上部headerと作品カードは写真 / 動画件数を表示し、confirmed copyがある作品だけ「再生」、未保存なら「このiPadに保存」へ誘導する
- `/admin/history` project別公開履歴一覧、current公開状態と未公開編集表示、revision詳細、rollback影響確認、fresh preflightを経たverified rollback実行
- `/player` 画像／Blob保存済み動画のoffline-first再生、remoteOnly動画のonline Drive streaming、remote video手動retry、project selector、自動送り設定、本番モード、操作ロック、テロップ表示。URLの`projectId`を再生対象のauthorityとする

## 重要な運用方針

- iPadホーム画面PWAで安定して動くことを優先する
- access tokenは保存しない、表示しない、console出力しない
- access tokenはProvider内部のメモリ上にだけ保持する
- ページrefresh後のGoogle接続は、明示的な「Googleへ接続」で再接続する。page loadやGIS readyではtoken requestを開始せず、アカウント選択画面を自動では開かない
- 60分接続維持は未解決である。実装前architectureは`docs/design/google-connection-60-minute-session.md`。Gate 0はFAIL。Phase 1 hostingはPASS。session本体は実装済みではない
- Google OAuth scopeは原則`https://www.googleapis.com/auth/drive.file`
- Google Photos export開始時だけ専用token clientで`https://www.googleapis.com/auth/photoslibrary.appendonly`を要求し、`include_granted_scopes`はfalseにする。Photos exportの認可は操作開始時だけである
- Google Photos exportはDrive publish / offline sync / 「このiPadに保存」と別操作であり、source Drive素材を更新しない
- Google Photos exportは自動retryしない
- Client SecretとAPIキーは作らない、使わない
- Drive上のworkspace / project / manifest / assetsをsource of truthにする
- slide再生順はDrive `manifest.json.slides[]` の配列順をsource of truthにする
- Drive current manifestへの編集保存と明示的publishは別操作とし、保存だけでは公開履歴を増やさない
- `manifest.publication.currentRevisionId`をcurrent published revisionの正本とし、最新日時から推測しない
- publish / rollbackはimmutable revisionを作成し、rollbackでも過去revisionを書き換えず新しいrevisionを作る
- rollbackはasset本体を複製、削除、復元せず、検証済み参照とfresh metadataをrevisionへ記録する
- publish / rollback成功だけではiPad confirmed snapshotやplayer sessionは変わらない
- iPadへ反映するには対象projectの明示的なoffline syncとconfirmed promotionが必要
- confirmed snapshotはoffline sync時点のpublication provenanceを保持し、公開版一致、未公開編集あり、未公開、要確認、旧形式を区別する
- publication provenanceの確認失敗だけではcurrent manifestの同期や再生を止めず、sanitized warningとして扱う
- Goal 6以前のlegacy snapshotは再生可能なまま旧形式と表示し、次回の明示的offline sync成功時にprovenance付きrecordへ自然に置換する
- revision fileや部分失敗で残ったorphanは自動削除せず、履歴確認と明示的な回復判断を優先する
- Drive file ID、operation ID、canonical hash全文、checksum値をUIへ表示しない
- Photos Pickerから追加したslideは現在のDrive `manifest.json.slides[]` の末尾へ選択順でappendする
- IndexedDBはiPad端末内のoffline playback用コピーとして扱う
- Cache StorageはService Workerのapp shell cacheとして扱う
- iPad側のローカル削除ではGoogle Drive上のデータを削除しない
- Drive上の画像順・caption変更をiPad再生へ反映するには、対象projectのoffline syncを実行する
- Drive上のslide削除・複製をiPad再生へ反映するにも、対象projectのoffline syncを実行する
- Drive cleanup preview / readiness / preflight / confirm previewはread-onlyで、Player snapshotやIndexedDBを変更しない
- unused Drive assetの物理削除は、fresh preflightと明示confirmを通った未参照JPEG / PNG / WebPだけを対象とし、MP4/MOVは対象外にする
- offline保存対象assetの上限は50 MiBとし、これは端末ストレージ全体の上限ではない
- 50 MiB超〜5GB以下のMP4/MOVは`remoteOnly`としてmetadataのみをconfirmed storeへ保持し、動画本体はIndexedDBへ保存しない
- 5GB超またはsize不明の動画は安全側で再生対象外にし、自動削除・自動修復しない
- remoteOnly MP4/MOVはofflineでは再生できず、onlineかつGoogle接続済みの場合だけDrive streamingで再生する
- MOVはWebKitのnative playbackへ渡し、codec/containerのclient-side transcodeは行わない
- Google Photos Picker経由の動画上限は50MBのままとし、5GB対応はローカルファイル追加だけに適用する
- online復帰やGoogle再接続だけでは自動retryせず、再生失敗時はユーザー操作による手動retryを使う
- 動画はmuted autoplayを基本とし、自動unmuteしない
- streamingの内部識別子や取得先をUI、docs、consoleへ出さない

## ローカル起動

このリポジトリは`pnpm@10.34.4`を使用します。

Corepackを利用する場合の初回install:

```bash
corepack enable
pnpm install --frozen-lockfile
```

```bash
pnpm dev
```

ローカル確認URL:

```text
http://localhost:3000/
```

## ビルド確認

```bash
pnpm test
pnpm lint
pnpm build
```

Corepackを使わない環境では、`npx -y pnpm@10 <command>`でも同じpnpm 10系の検証を実行できます。

`next/font`がGoogle Fontsをビルド時に取得するため、ネットワーク制限下では`pnpm build`がFonts取得で失敗することがあります。

## CI

mainへのpush、pull request、手動実行でGitHub ActionsのCIが動きます。

実行内容:

1. `pnpm install --frozen-lockfile`
2. `pnpm test`
3. `pnpm lint`
4. `pnpm build`

workflow名は`CI`、job名は`Test, lint, and build`です。branch protection / Rulesetsでrequired checkにする設定はGitHub側の別作業です。

GitHub ActionsはCI専用です。正式な本番deploymentはVercelで行い、GitHub Pagesへのdeploy workflowは使用しません。

## 次の作業候補

1. 60分Google接続維持は未解決。Gate 0 FAIL。Phase 1 hosting migration PASS。`output:"export"`撤去とApp Router Route HandlerはPreview accepted。session本体は実装済みではない
2. publication writeのupdate応答不明、current競合、index warningを、承認済みplanに従って専用disposable workspaceと一時的なPreview-only harnessで実Google Drive確認する
3. MOVのexactly 5GB / 5GB + 1 byteの実ファイル境界と、意図的な再生失敗後のmanual retry実機経路を確認する

## 最新ハンドオフ

- `docs/handoffs/2026-08-20-google-photos-export-handoff.md`
- `docs/acceptance/google-photos-export-acceptance.md`
- `docs/handoffs/2026-08-08-mov-video-5gb-handoff.md`
- `docs/handoffs/2026-08-05-unused-asset-delete-execution-handoff.md`
- `docs/handoffs/2026-07-31-offline-publication-provenance-handoff.md`
- `docs/handoffs/2026-07-28-publish-history-rollback-completion-handoff.md`
- `docs/handoffs/2026-07-12-video-playback-retry-tests-ci-handoff.md`
- `docs/handoffs/2026-06-22-vercel-existing-production-confirmation-handoff.md`
- `docs/handoffs/2026-06-13-unused-asset-delete-preflight-handoff.md`
- `docs/handoffs/2026-06-13-unused-asset-delete-readiness-ui-handoff.md`
- `docs/handoffs/2026-06-13-orphan-asset-cleanup-preview-handoff.md`
- `docs/handoffs/2026-06-13-player-admin-polish-fixes-handoff.md`
- `docs/handoffs/2026-06-12-slide-dnd-delete-duplicate-handoff.md`
- `docs/handoffs/2026-06-12-player-auto-advance-transition-and-slide-reorder-handoff.md`
- `docs/handoffs/2026-06-12-caption-telop-and-batch-asset-import-handoff.md`
- `docs/handoffs/2026-06-12-production-mode-and-operation-lock-handoff.md`
- `docs/handoffs/2026-06-12-multi-project-playback-preparation-handoff.md`
- `docs/handoffs/2026-06-12-advanced-offline-storage-controls-handoff.md`
- `docs/handoffs/2026-06-10-offline-storage-management-ui-handoff.md`
- `docs/handoffs/2026-06-10-ipad-pwa-offline-shell-verification-handoff.md`
- `docs/handoffs/2026-06-10-pwa-offline-shell-local-recovery-handoff.md`
