# Offline publication provenance handoff

Date: 2026-07-31

Status: Goal 6 implemented and locally verified

Implementation commit: `feat: track offline publication provenance`（このhandoffを含むcommit。SHAはcommit後の完了報告を正本とする）

## 1. Goal

明示的offline syncで取得したDrive current manifestが、current published
revisionとどの関係にあるかをconfirmed snapshotへsanitized metadataとして保存する。
provenanceは出所表示であり、同期本文、publish状態、再生可否を変更しない。

## 2. Authority

1. Drive current manifest: offline syncが実際に同期する内容。未公開編集を含み得る。
2. Drive current published revision: `manifest.publication.currentRevisionId`
   が指すimmutable exact revision。日時や一覧順から推測しない。
3. IndexedDB staging snapshot: validation / promotion前の候補。
4. IndexedDB confirmed snapshot: この端末で最後にatomic promotionされた内容。
5. player session snapshot: 実行中sessionが読み込んだconfirmed snapshot。

publish / rollback後もconfirmed snapshotとplayer sessionは自動更新しない。反映には
管理者による明示的offline syncが必要である。

## 3. Status matrix

| 表示status | 意味 | playback |
| --- | --- | --- |
| `publishedMatch` | 正式なcurrent revisionとcurrent manifest本文が一致 | 許可 |
| `unpublishedChanges` | publication/revisionは整合するがcurrent manifest本文が公開版と異なる | warning付きで許可 |
| `unpublished` | current manifestにpublicationがない | 許可 |
| `needsInspection` | exact revision、history、publication対応を正式確認できない | warning付きで許可 |
| `legacyUnknown` | Goal 6以前のprovenance field欠落record | 再同期推奨で許可 |

`legacyUnknown`は永続値ではない。field欠落をread/view層でnormalizeする。
`needsInspection` reasonは`currentRevisionMissing`、
`publicationInconsistent`、`historyStructureInvalid`、
`historyUnavailable`、`publicationInvalid`のsanitized enumだけである。

## 4. Resolution and failure policy

current manifestは正式parserで検証する。publicationがある場合だけexact loaderへ
`currentRevisionId`を渡し、revision ID、publishedAt、operation、
revision source content hashとpublication content hashを照合する。その後、
publicationを除いたcurrent content hashが一致すれば`publishedMatch`、
不一致なら`unpublishedChanges`とする。

history未設定、revision欠落・重複・不正、history read失敗は
`needsInspection` warningへ変換し、正常なcurrent manifest / asset syncを継続する。
Abortはwarningへ変換せず処理全体を中止する。

current manifest自体の不正、identity不一致、asset metadata不正、必須image Blob
失敗、staging validation / promotion失敗、stale manifestは従来どおりsync失敗である。

## 5. Migration

- `OFFLINE_DB_VERSION=1`を維持
- `OFFLINE_SCHEMA_VERSION=1`を維持
- object store変更なし
- `OfflineProject`と`OfflineSyncState`へのoptional field追加のみ
- background migration、起動時rewrite、自動削除なし
- legacy recordは再生可能なまま`legacyUnknown`表示
- 次回の明示的sync成功時にprovenance付きrecordへ自然に置換
- 既存`sourceRevisionId`をpublish revision IDへ流用しない

## 6. Stale manifest guard

asset取得前にmanifest metadata/body/metadataを読み、formal metadata、
Drive `modifiedTime`、publicationを除くcontent hash、publication有無と
revision ID / publishedAt / operation / content hash署名を内部固定する。

全asset metadata / Blob取得後、staging write前に同じsequenceを再実行する。
modifiedTimeだけの変更を含むいずれかの差異で`staleManifest`として停止する。
staging write、confirmed mutation、auto retryは行わず、比較値、hash、Drive IDを
UIへ出さず手動再同期を案内する。

## 7. Staging and confirmed promotion

new runtime staging projectには必ずprovenanceを設定する。present fieldはstrict
runtime validationし、legacy staging fixtureのfield欠落だけは互換目的で許容する。

promotionは既存のsingle IndexedDB transactionを維持し、staging projectから
confirmed projectへprovenanceをcopyし、ready sync stateへ同一値を保存する。
projectとready stateのpresent provenance不一致はatomic invariant違反として
invalid/corrupt相当の診断にする。assets / Blobにはprovenanceを保存しない。
stale syncRun、other-project isolation、obsolete cleanup、remoteOnly metadataを維持する。

## 8. Admin and player

管理画面はsync成功summaryとconfirmed projectごとにstatus badge、説明、
sanitized revision情報を表示する。`unpublishedChanges`、
`needsInspection`、`legacyUnknown`は明示的warning / 再同期案内を表示し、自動修復しない。

player project selectionは全projectのbadge/messageを表示する。ready playerは通常の
controls/status領域だけでbadgeを表示し、warning時だけ説明する。provenanceだけで
playbackを止めず、production modeやcontrols非表示時のslide面へ常時overlayを追加しない。
sessionの自動reloadも追加していない。

## 9. Security

public provenance/view/resultへaccess token、Authorization/Bearer、Drive API URL、
Drive file/folder ID、operation ID、sync/session ID、canonical hash、checksum、
raw manifest/revision/metadata/response/errorを含めない。revision IDはlogical
publish identityとして必要な表示だけに限定する。access tokenのprovider/runtime
境界は変更していない。

## 10. Unchanged areas

Drive manifest/revision schema、publish/rollback write、retention、cleanup、
OAuth、Google Cloud、asset upload/delete、Photos Picker、IndexedDB stores、
Service Worker、app shell cache、50 MiB policy、remoteOnly判定、remote stream /
retry lifecycle、package dependencies、lock/swipe/auto advanceは変更していない。
videoの`muted`、`playsInline`、`autoPlay`、`controls={false}`、
`preload="auto"`を維持する。

## 11. Local verification

- Goal 6 target: 11 files / 56 tests passed
- full Vitest: 36 files / 726 tests passed
- ESLint: passed
- Next.js production build: passed
- static generation: 12/12 pages（route tableは10 routes）
- local browser 768x1024: `/admin`と`/player`の空状態が表示され、
  framework overlay、console error、横overflowなし
- `git diff --check`: commit直前に再実行

最初のsandbox buildはGoogle Fonts取得制限で失敗し、ネットワーク許可付きの同一buildを
再実行して成功した。実Google Drive read/write、GitHub Actions、Vercel、
production、iPad実機browser acceptanceは未実施である。local browserには
provenance fixtureを投入していないため、status別表示はunit test確認である。

## 12. User acceptance checklist

最初のacceptanceはdisposable projectを使用し、production本番projectを使わない。

1. Goal 6以前のconfirmed snapshotを開く。
2. `legacyUnknown` / 旧形式表示を確認する。
3. 未publish projectをoffline syncする。
4. `unpublished`表示を確認する。
5. initial publishを実行する。
6. offline syncを明示実行する。
7. `publishedMatch`表示を確認する。
8. title / caption / orderを変更してcurrent manifestへ保存する。
9. publishせずoffline syncする。
10. `unpublishedChanges`表示を確認する。
11. playerで未公開編集warningと再生内容を確認する。
12. second publishを実行する。
13. offline syncを明示実行する。
14. `publishedMatch`へ戻ることを確認する。
15. rollbackを実行する。
16. offline sync前はconfirmed snapshotが自動更新されないことを確認する。
17. offline syncを明示実行する。
18. `operation=rollback`表示を確認する。
19. restored-from revision表示を確認する。
20. remoteOnly動画の既存online再生を確認する。
21. offline Blob動画の既存offline再生を確認する。

追加で768x1024の`/admin`、`/player`、project selection cardを確認し、横overflow、
44px未満の主要touch target、production slide面の常時warningがないことを確認する。

## 13. Remaining risks

- Drive metadata/bodyは別requestであり、二重metadata guardでもDrive側の非atomic read
  自体は残る。`modifiedTime`と正式body再検証でmixed snapshotを安全側に停止する。
- provenance inspection failureは意図的にsync継続するため、history障害中のsnapshotは
  `needsInspection`となり、運用者の再同期または履歴確認が必要である。
- local browser fixtureは作成しておらず、status別表示と実iPad touch操作は未確認。
  empty-stateで確認した既存Buttonの可視heightは32pxであり、44px touch targetは
  Goal 6固有の新規操作を追加しなかったため変更していない。実機acceptanceで要確認。
- 実Google Driveのhistory permission/read failure分類はmock unit testのみ確認済み。

## 14. Blocking review fix: stale sync state restoration

Goal 6 reviewで、`staleManifest`時にsync stateが
`ready -> syncing -> failed`となり、confirmed project / assets / Blobが残っていても
playerのready候補から外れる問題を修正した。

orchestrationは`markOfflineSyncing`より前に対象projectの完全なprevious sync stateを
内部取得する。`staleManifest`では`markOfflineSyncFailed`を呼ばず、今回の
`syncRunId`がcurrent stateを所有している場合だけ、previous recordをそのまま復元する。
previous stateがなかった場合は今回作成したtemporary `syncing` recordを削除する。
別runへ所有権が移っていれば何も書かず`stale-sync-run`とし、restore失敗も成功扱いしない。

この分岐はstaging write、promotion、confirmed project / assets / Blob変更、auto retryを
行わない。したがってprevious ready snapshotはproject selection候補、previous
publication provenance、remoteOnly slide、offline Blob slideを維持したまま再生できる。
public summaryはsanitized `staleManifest`案内だけを返し、previous record、run identity、
Drive ID、hash、`modifiedTime`比較値を公開しない。

manifest metadataのparent検証も、`projectFolderId`を含むことだけではなく、parentsが
正確に1件で`parents[0] === projectFolderId`であることへ強化した。欠落、空配列、
別folder、追加parent、duplicate parentは正式検証失敗とする。asset metadataの
既存parent policyは変更していない。

### Review-fix local verification

- focused target: 6 files / 62 tests passed
- full Vitest: 36 files / 742 tests passed
- ESLint: passed
- Next.js production build: passed
- static generation: 12/12 pages（route tableは10 routes）
- `git diff --check`: passed

最初のsandbox buildはGoogle Fonts取得制限だけで失敗し、ネットワーク許可付きの
同一pnpm 10 buildを再実行して成功した。実Google Drive read/write、GitHub Actions、
Vercel、production、iPad実機acceptanceはこのreview fixでも実施していない。
