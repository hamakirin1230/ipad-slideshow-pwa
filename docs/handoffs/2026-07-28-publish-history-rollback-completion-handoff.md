# Publish history / rollback completion handoff

Date: 2026-07-28

Status: Goal 5 complete

## 1. 完了概要

Goal 5では、Drive current manifestへの編集保存と、管理者が確認した内容を公開版として確定する明示的publishを分離した。publishは再生内容とfresh asset metadataをimmutable revisionへ記録し、`manifest.publication.currentRevisionId`でcurrent published revisionを明示する。

`/admin/history`ではproject別の公開履歴、current公開状態、未公開編集、revision詳細を確認できる。rollbackは過去revisionのimpact preview、fresh execution preflight、最終確認を経て、過去revisionを書き換えずに新しいrollback revisionを作成する。

publish / rollbackはDrive側の状態遷移である。成功してもiPadのconfirmed snapshotやplayer sessionは自動更新せず、反映には既存のoffline syncとconfirmed promotionが別途必要である。

## 2. 現在の正本

| 層 | authority | 更新契機 |
| --- | --- | --- |
| 1. Drive current manifest | projectの現在の編集内容とpublication metadataの正本。次回offline syncが読む最新版で、未公開編集を含み得る | `/admin`での編集保存、publishのpublication commit、rollbackのtarget由来本文とpublication commit |
| 2. Drive current published revision | `manifest.publication.currentRevisionId`が一意に指すimmutable revision。最新日時から推測しない | 明示的publishまたはrollbackで新revisionを検証後、current manifestのpublicationをcommit |
| 3. IndexedDB staging snapshot | offline sync中の候補。validationとpromotionが終わるまではplayer採用版ではない | 管理者が対象projectのoffline syncを明示実行 |
| 4. IndexedDB confirmed snapshot | iPad端末で検証済みとして採用されたoffline playback snapshot | staging全体のvalidation成功後、1 transactionでpromotion |
| 5. player session snapshot | 現在のplayer sessionが実際に読み込んでいるconfirmed snapshot | playerのproject / snapshot読込時。Drive writeやpromotionだけで実行中sessionが自動置換されるとは限らない |

`index.json`はproject一覧と表示用mirrorであり、current published revisionのauthorityではない。current publicationは必ずcurrent manifestのpublicationから解決する。

## 3. Drive構造

```text
projects/{projectId}/
├─ manifest.json
├─ assets/
└─ history/
   └─ revisions/
      └─ {revisionId}.json
```

folderとfileは名前だけで選ばず、親、MIME type、trashed状態と、`app`、`role`、`schemaVersion`、`workspaceId`、`projectId`、必要なidentityを含むrole metadataで検証する。history / revisions folderや同じrevision IDの候補が重複した場合は、自動選択、自動rename、自動削除を行わずblocking conflictとして停止する。

revision fileはimmutableとして扱い、既存revisionの本文やmetadataをupdateしない。rollbackからhistory / revisions folderを自動作成せず、fresh preflightで既存の一意かつ正式なfolderを確認する。

## 4. publish invariant

1. current manifest、project location、履歴状態、参照asset metadataをfresh readする。
2. preflight成功後だけrevision ID、operation IDと内部write planを確定する。
3. immutable revisionをcurrent manifestより先に作成する。
4. 作成したrevisionの正式metadata、canonical本文、hashをread-backする。
5. current manifestの`modifiedTime`、content canonical hash、`currentRevisionId`を更新直前に再検証する。
6. current manifestのpublication更新をpublishのcommit pointとする。
7. current manifestを正式parserでread-backし、publication全fieldとrevision内容の一致を確認してから成功とする。

revision作成後にcurrent競合やmanifest commit失敗が起きた場合、revisionはorphanとして残り得る。自動cleanup、自動rollback、自動再更新は行わず、履歴確認とfresh preflightからの明示的な再実行を求める。

## 5. rollback invariant

- target revisionはimmutableのまま変更しない。
- rollbackのたびに現在時刻の新しいrevisionを作る。
- 新revisionは`operation=rollback`とする。
- `restoredFromRevisionId`は選択したtarget revisionを指す。
- `previousRevisionId`はrollback直前のcurrent published revisionを指す。
- target revisionのtitle、slide順、caption、duration、asset参照と再生内容を復元する。
- app、schema、workspace、project、`createdAt`はcurrent projectのidentityを維持する。
- `updatedAt`はrollbackの`publishedAt`へ更新する。
- revisionのasset metadataはtarget保存値を盲信せず、fresh Drive metadataから再構築する。
- asset Blobは取得せず、asset本体の複製、更新、削除、復元を行わない。
- current manifest本文をtarget由来の再生内容へ置換し、new rollback revisionを指すpublicationを同時にcommitする。
- index mirrorは対象projectのtitle / `updatedAt`だけを更新し、他projectとidentity fieldを維持する。

## 6. UI flow

### publish

1. `/admin`でDrive current manifestへ編集内容を保存する。
2. 「公開前確認」でfresh manifest、asset、履歴状態を検証する。
3. project、slide / asset数、remoteOnly数、previous revision、warningを確認する。
4. offline syncが別操作であることを確認して明示的publishを実行する。
5. revision作成とcurrent publicationのread-back検証後だけ公開成功を表示する。

### rollback

1. **impact preview**: `/admin/history`のrevision詳細から、title、slide、asset、未公開編集、offline / remoteOnly影響をread-onlyで確認する。
2. **execution preflight review**: checkbox確認後、current、target、asset、index、Drive locationをfresh readし、preview guardとの一致を再検証する。
3. **final execution**: sanitizedな最終reviewを確認して、新rollback revision、current manifest commit、index mirrorを実行する。

実行可能なのはimpact previewを再計算しても`ready`の状態だけである。degraded、blocked、noChange、stale、error、previewなし、owner不一致ではwrite planを生成しない。

## 7. failure matrix

| 状態 | current manifest | revision | 結果 |
| --- | --- | --- | --- |
| revision作成前失敗 | 不変 | なし | fresh確認から再実行 |
| revision作成後競合 | 不変 | orphanが残る | 要確認 |
| manifest update応答不明・read-back一致 | 更新済み | 存在 | 成功へ収束 |
| manifest update応答不明・不一致 | 不明または不変 | 存在 | 要確認 |
| manifest成功・index失敗 | 更新済み | current | success-with-warning |
| duplicate / invalid folder | 不変 | 作成しない | blocking conflict |

index warningはrollback本体のcommitを取り消さない。current manifestとnew rollback revisionがread-back済みなら本体成功を維持し、index mirrorだけを要確認として案内する。

## 8. concurrency / idempotency

fresh preview guardとexecution write planは、最低限次を固定して比較する。

- current manifestの`modifiedTime`
- current manifestのcontent canonical hash
- current manifestの`currentRevisionId`
- target revisionのcanonical content
- target assetのfresh metadata
- index本文と対象project record
- project / manifest / assets / indexのlocation metadata
- operation ID
- revision ID

同じprepared planの明示retryではoperation IDとrevision IDを再利用する。同じrevision IDと完全一致するfileは`alreadyPrepared`、current本文とpublicationの完全一致は`alreadyCommitted`として収束する。部分一致、duplicate、expected currentの変更は自動上書きしない。

publish / rollbackはAppProvidersの共通publication write guardで同一画面内の同時実行を防ぐ。ただし、これは複数tabや別端末を含む競合を完全に防止する仕組みではない。Drive updateにHTTP conditional requestを使用していないため、fresh readとwriteの間にはcheck-to-write競合窓が残る。

## 9. security / privacy

次の値は永続保存、公開result、通常UI、文書、consoleへ含めない。

- access token
- Authorization / Bearer header
- raw Drive response / error
- Drive API URL
- upload URL
- session ID
- Google profile
- UI上のDrive file / folder ID
- UI上のoperation ID
- UI上のcanonical hash全文
- UI上のchecksum値

access tokenはAppProviders内部の`accessTokenRef`にだけ保持し、preflight guardとwrite planもProvider内部のrefに限定する。ContextとUIへ返すpreview、review、success、warning、failureはsanitizedな案内値だけにする。

## 10. 検証結果

このhandoffでは次をユーザー確認済みの事実として記録する。

```text
HEAD:
c2f1aefa5ce7315585f0e35ecbfa4f6729c5a292

pnpm:
10.34.4

tests:
24 files / 669 tests passed

lint:
passed

build:
passed

static pages:
12
```

recent commits:

```text
0f0b5ee016833494272ebb28308a5bd1c02694c9
feat: add rollback impact preview

95b9594ae71215af401f7f487df3117c77760cdd
feat: execute verified project rollback

c2f1aefa5ce7315585f0e35ecbfa4f6729c5a292
test: cover verified rollback pipeline
```

2026-07-28にユーザー側で、commit `c2f1aefa...`のGitHub status success、Vercel production READY、production alias反映を確認済み。確認対象のVercel deployment IDは`dpl_8pePvk95CznvUWaaTPb758j8dJGW`である。これはCodexが今回productionへ接続して再確認した事実ではない。

## 11. 実Google Drive未確認範囲

- rollback write pipelineの実Google Drive acceptance testは未実施である。
- unit testとlocal browser確認は完了している。
- 最初のacceptance testはdisposable projectで行う。
- production本番projectを最初の試験対象にしない。
- Codexは今回、実Google Driveのread / writeやproduction状態の再確認を行っていない。

## 12. 手動acceptance checklist

1. disposable projectを作成する。
2. assetを追加する。
3. initial publishを実行する。
4. revision 1の作成とcurrent表示を確認する。
5. title / caption / orderを変更してDrive current manifestへ保存する。
6. 「未公開編集あり」表示を確認する。
7. second publishを実行する。
8. revision 2の作成とcurrent表示を確認する。
9. revision 1のrollback impact previewを開く。
10. slide / title / asset impactと、remoteOnlyがある場合の案内を確認する。
11. previewやpublish / rollback成功だけではoffline syncが自動開始されないことを確認する。
12. execution preflightを実行する。
13. final reviewからrollbackを実行する。
14. 過去revisionとは別の新しいrollback revisionが作成されたことを確認する。
15. target revisionが変更されていないことを確認する。
16. current publicationが新rollback revisionを指すことを確認する。
17. current manifestがtargetの再生内容になり、indexはtitle / `updatedAt`だけmirrorされたことを確認する。
18. iPad confirmed snapshotがまだ変わっていないことを確認する。
19. 対象projectのoffline syncを明示実行し、confirmed snapshotへpromotionする。
20. playerでrollback後の内容とoffline再生を確認する。
21. remoteOnly動画がある場合、onlineかつGoogle接続時だけ再生可能であることを確認する。

## 13. destructive / abnormal test policy

通常acceptanceでは、次を故意に壊さない。

- Drive folder重複
- revision file改変
- metadata改変
- current update途中の通信遮断
- index update途中の通信遮断
- asset削除

これらの分岐はunit testで確認済みである。実Driveで異常系を試験する場合は、通常acceptanceとは分離し、専用test workspace、復旧手順、観測項目、停止条件を先に設計する。

## 14. 残存リスク

- Drive APIのHTTP conditional updateを使用していないため、fresh checkからwriteまでに競合窓が残る。
- 複数tabや別端末からの同時操作を完全には防止していない。
- update応答不明からread-backで収束する経路を実Google Driveでは未確認である。
- manifest成功後のindex warning経路を実Google Driveでは未確認である。
- confirmed snapshotは対応するcurrent published revision IDを保持していない。
- revision retention / archive / deletionは未実装である。
- orphan cleanupは未実装で、自動削除しない。
- production dataを最初のacceptance試験に使用してはならない。

## 15. 次の推奨作業

第一候補は、ユーザー側のGoogle接続環境で行う次の作業である。

```text
Disposable projectによるGoal 5 acceptance test
```

Codexは実Google Driveへ接続してこのacceptanceを実行しない。ユーザーが上記checklistを進め、結果とsanitizedな状態だけを記録する。

コード側の次候補は次の設計である。

```text
confirmed snapshot publication provenanceの設計
```

これはIndexedDB schema、offline sync、confirmed promotion、player表示へ影響する。今回のdocs-only commitへ混ぜず、新しいGoalとしてauthority、migration、failure recovery、privacyを先に確定する。
