# Publication write 異常系 acceptance 計画

Date: 2026-08-09

Status:

- Gate 0承認済み。browser origin単位のoffline baseline clarificationも反映済み。
- temporary Preview-only fault harnessはacceptance専用branchで実装後、同branchから完全撤去済み。
- fault harnessはproduction mainへmergeしておらず、撤去commit後のacceptance branch treeは当時のmainと同一。
- repository docsには、実Google DriveでCase A / B / Cを実行・完了した結果記録がない。異常系acceptanceは完了扱いにしない。

## 1. 目的と範囲

実Google Drive上の専用disposable workspaceで、publication writeの次の3経路を安全かつ決定的に確認する。

- A. rollback current manifest updateのresponse unknown相当から、fresh read-back一致により`committed`へ収束する
- B. rollback write plan作成後のcurrent変更を`stalePlan`として検出し、古いplanで上書きしない
- C. rollback revisionとcurrent manifestの正式commit後にindex mirrorだけが失敗しても、rollback本体を成功のまま`indexStatus: "warning"`へ収束させる

この計画は試験設計だけを対象とする。Gate 0承認前にfault injection codeを作らず、実Google Driveへの異常系writeも行わない。

### 非目標

- production本番projectまたは既存production dataでの試験
- 通常production deployment、production alias、mainへのdebug hook追加
- Drive itemの手作業による削除、revision本文やrole metadataの改変
- OAuth scope変更、public sharing、server proxy、token永続化
- publish / rollback / offline syncの自動retryまたは自動repair追加
- orphan revisionの自動削除
- publish current manifest updateのresponse unknown収束確認

最後の項目は重要である。現行のpublish側`commitProjectPublishManifestWithAdapter`は、`updateCurrentManifest`例外を`currentManifestUpdateFailed`へ分類し、その例外後にread-backを続行しない。一方、rollback側`commitProjectRollbackManifestWithAdapter`はupdate例外を記録した後も`readCommittedManifest`を実行し、一致すれば`status: "committed"`を返す。したがってAは、実装済みの回復semanticsを持つrollback current manifest commitだけを対象とする。publishにも同じ保証があるとは扱わない。

## 2. 調査した現行実装とテスト

### Production modules / UI boundary

| file | acceptanceで使う現行semantics |
| --- | --- |
| `src/lib/publish-history/project-publish-workflow.ts` | publishはrevision prepare後にmanifest commitを行う。manifest commit失敗は`stage: "commitManifest"`として返る |
| `src/lib/publish-history/project-publish-manifest-commit.ts` | publish commit直前にmanifest `modifiedTime`、content canonical hash、`currentRevisionId`を比較する。update例外後のread-back収束は実装していない |
| `src/lib/publish-history/project-rollback-execution-preflight.ts` | rollback planを実行前にfresh readし、preview/write planのguardと比較する。不一致は`code: "stalePlan"`、`recoverability: "conflict"` |
| `src/lib/publish-history/project-rollback-write-plan.ts` | `expectedCurrent`、target revision、asset metadata、index、locationを固定し、write順を定義する |
| `src/lib/publish-history/project-rollback-workflow.ts` | `revalidateBeforeRevision` → revision作成・検証 → `revalidateBeforeManifestCommit` → current manifest commit・検証 → index mirror・検証。index失敗だけはworkflow成功の`indexStatus: "warning"` |
| `src/lib/publish-history/project-rollback-manifest-commit.ts` | currentの完全一致は`alreadyCommitted`。update例外後もfresh read-backし、完全一致なら`committed`、不一致なら`currentManifestUpdateUnknown` / `requiresInspection` |
| `src/lib/publish-history/project-rollback-index-mirror.ts` | index metadata/bodyをfresh readし、expected metadata、canonical hash、対象project recordを比較してからtitle / `updatedAt`だけを更新し、read-backする |
| `src/lib/publish-history/project-publish-manifest-commit-adapter.ts` | current manifest writeは`updateCurrentManifest`から`updateDriveJsonFileContent`へ渡る。faultはこの共通low-level helperへ恒久追加しない |
| `src/app/app-providers.tsx` | pending preview/write planはrefだけに保持し、同一画面内のpublish / rollbackを`projectPublicationWriteInFlightRef`で直列化する。複数tabは共有guardではない |
| `src/app/admin/history/publish-history-client.tsx` | rollback conflictはsanitized error、index warningは「rollback完了・index mirror要確認」として表示する |

### Existing unit tests

| test | 既に固定されている期待値 |
| --- | --- |
| `project-rollback-manifest-commit.test.ts` | updateがthrowしてもread-backが完全一致すれば`committed`。不一致なら`currentManifestUpdateUnknown`。current guard不一致ではwriteしない |
| `project-rollback-workflow.test.ts` | 最初のrevalidate失敗ではrevision / manifest writeを行わない。index mirror失敗はmanifest成功を維持して`indexStatus: "warning"` |
| `project-rollback-execution-preflight.test.ts` | preview/write plan guardとfresh snapshotの差異を停止させる |
| `project-publish-manifest-commit.test.ts` | publishの`modifiedTime`、content hash、`currentRevisionId` conflictと`alreadyCommitted`を固定する |
| `project-publish-workflow.test.ts` | publish revision prepareとmanifest commitの順序、failure stageを固定する |
| `project-rollback-ui.test.ts` | conflict / requiresInspectionは`canRetry: false`、success / warning resultは内部planやhashを公開しない |
| `project-rollback-provider-ui.test.ts` | rollback guard / planがProvider ref内にあり、public resultがsanitizedであることを固定する |

## 3. 検証対象のinvariant

1. Drive current manifestは現在の編集内容とpublication metadataのauthorityである。
2. current published revisionは最新日時ではなく、`manifest.publication.currentRevisionId`が指すimmutable revisionである。
3. rollbackは過去revisionへpointerを戻さず、過去内容から新しい`operation: "rollback"` revisionを作る。
4. rollback current manifest commit成功の判定には、新manifest本文とpublicationのfresh read-back完全一致が必要である。
5. rollback write planの`expectedCurrent`は次を比較する。
   - manifest file `modifiedTime`
   - publicationを除くcontent canonical hash
   - `currentRevisionId`
6. rollback revalidationはcurrentだけでなく、target revision canonical body / hash、target asset metadata、index metadata / canonical hash / project record、project / manifest / assets location metadataも比較する。
7. rollback workflowはcurrent manifest commit・検証後だけindex mirrorへ進む。
8. index mirror失敗はrollback revisionやcurrent manifestを巻き戻さず、`indexStatus: "warning"`とする。
9. publish / rollback成功だけではIndexedDB confirmed snapshot、player session、offline sync stateを自動更新しない。
10. IndexedDB confirmed snapshotはbrowser origin単位であり、production originとVercel Preview originの間では共有されない。
11. conflict、requiresInspection、warningはraw Drive値を公開せず、自動retry・自動repairしない。

## 4. 安全境界

### Workspace isolation

- acceptance専用Google accountまたは、既存production dataへ触れないことを確認済みの試験accountを使用する
- production本番workspaceを開かない。試験開始前にproduction project名が画面にないことを2名確認またはoperator + reviewerで確認する
- 1つの専用disposable workspaceに、`case-b-current-conflict`、`case-a-response-unknown`、`case-c-index-warning`の3 projectを作る
- 各caseは別projectを使用し、前caseのDrive状態を次caseのbaselineとして流用しない
- 一つのcaseがpass、safe recovery完了、または明示的abortedになるまで次caseへ進まない
- Drive file / folderをGoogle Drive UIやAPI consoleから手作業で削除しない
- revision file、manifest / indexのraw JSON、role metadata、parents、sharingを手作業で編集しない

### Privacy / evidence

次をscreen capture、docs、issue、commit message、console、session toggleへ記録しない。

- access token、Authorization / Bearer
- Drive file ID、folder ID、operation ID
- canonical hash全文、checksum、raw response body
- raw Drive API URL、upload URL
- Google profile、session ID

記録可能なのはcase alias、時刻、revision件数の増減、`publish` / `rollback`、`created` / `committed` / `warning`などのsanitized state、project titleの試験用ラベル、pass / fail / stop理由だけとする。UIにlogical revision IDが表示されても、結果docsへ転記しない。

### Global stop conditions

次のいずれかで即時停止し、そのcaseをfailまたはblockedとして記録する。次caseへ進まない。

- production workspace/projectを選択した疑いがある
- faultがdefault OFFでない、別caseのfaultがarmed、または1回を超えて発火した
- fault branchがproduction aliasへ向いている、またはpreview deploymentであることを確認できない
- token、Drive ID、raw URL、raw response、hash全文がUI / console / docsへ露出した
- target revision、asset file、role metadata、sharing、他projectのindex recordが変化した
- offline syncが自動開始した、confirmed snapshotまたはplayer sessionが自動変化した
- Drive read-backが一意・正式に判定できない
- unexpected orphan / duplicate revision、duplicate folder、invalid metadataを検出した
- Cのindex recovery用memory planを失った、またはfresh index guardが一致しない
- operatorが現在のcase stateをsanitizedに説明できない

停止後は自動retry、自動repair、削除を行わない。faultをdisarmし、preview deploymentで追加writeを止め、sanitizedな観測だけを残してplan reviewへ戻る。

## 5. Disposable Drive remote baseline

Gate 1では、各case projectをDrive上で次の同一論理状態にする。

1. JPEG / PNG / WebPの最小画像assetを1〜2件だけ追加する。動画は使わない。
2. title / captionを`baseline-v1`として保存し、initial publishする。これを「target revision」と呼ぶ。
3. titleまたはcaptionを`current-v2`へ正式UIで変更し、second publishする。これを「pre-case current revision」と呼ぶ。
4. `/admin/history`でcurrentがsecond publish revision、targetがinitial publish revisionであることを確認する。
5. current manifest、current revision、history folder / revisions folder、index target project record、asset metadata、project / manifest / assets locationがすべて正式・一意であることを通常UIから確認する。
6. index title / `updatedAt`がcurrent manifestと一致し、他projectのrecordが変わっていないことを確認する。

Gate 1のbaseline evidenceには、case alias、asset / slide数、history件数、current operation=`publish`、current/targetの相対ラベル、index整合=`ready`だけを記録する。ID、hash、raw JSONは記録しない。production originで明示的offline syncを行い`publishedMatch`を確認する場合も、それはDrive remote状態確認の補助に限る。production originのIndexedDB confirmed snapshotは、別originであるVercel Preview deployment上のCase A / C offline baselineの代用にはならない。

### Same-origin offline baselineの定義

各caseの「offline confirmed snapshot unchanged」は、そのcaseを実際に実行するbrowser originで、case開始直前に固定したconfirmed snapshotとの比較を意味する。confirmed project / assets / Blob / 保存済みprovenanceをsanitizedに確認し、異なるoriginのsnapshot同士は比較しない。

- Case A / CはGate 4でVercel Preview origin上に作るbaselineを使う。
- Case BはBを実行するoriginで明示的offline syncと`publishedMatch`を確認してからbaselineを固定し、Tab A / Tab Bの両方を同一originで開く。

## 6. Preview-only fault injection設計

Gate 0承認後、AとCだけに一時fault-injection branchを作る。Bにはfault injectionを使わない。

### 共通guard

- mainへmergeしないacceptance専用branchに限定する
- Vercel Preview deploymentだけを作り、production aliasへ昇格しない
- preview環境だけで有効にするpublic boolean build guardと、同一browser session内の明示toggleの両方が一致したときだけarmできるようにする
- build guardもsession toggleもdefault OFFとする
- toggle値はcase名と`armed` / `consumed`だけとし、token、project / Drive ID、operation ID、revision IDを含めない
- faultは1回のadapter invocationだけをinterceptし、発火時に`consumed`へ遷移する
- fault stateはsessionStorageに置いてよいが、write plan、access token、Drive IDはsessionStorage / localStorage / IndexedDBへ置かない
- preview-only controlはfault名、OFF / armed / consumedだけを表示し、console logを出さない
- faultがarmedの間は対象case以外のpublish / rollback操作を禁止する
- browser reload、session終了、project変更でarmed stateを解除する。Cのrecovery planはmemoryだけなので、Cではrecovery完了までreloadしない

browser origin単位のbaseline補足は、このCのmemory-only plan、session / reload制約、fault timing、recovery semanticsを変更しない。

### Aの最小injection point

`commitProjectRollbackManifestInDrive`が作る`ProjectPublishManifestCommitAdapter`の`updateCurrentManifest`だけをacceptance branchでwrapする。

1. 元の`updateCurrentManifest`を実行し、`updateDriveJsonFileContent`が正常resolveするまで待つ。
2. A faultがarmedなら、その1回を`consumed`にする。
3. adapter callerへsanitizedなsynthetic errorをthrowする。error本文をUI / consoleへ出さない。
4. `commitProjectRollbackManifestWithAdapter`の現行catchが`updateThrew = true`にした後、既存の`readCommittedManifest`を実Google Driveへ実行する。

faultは実Drive write成功後、client側へadapter成功を返す前に発生させる。write前throwはAを検証しないため禁止する。共通`updateDriveJsonFileContent`やfetch全体へhookせず、rollback current manifest adapterだけに限定する。

### Cの最小injection point

`mirrorProjectRollbackIndexInDrive`から使う`ProjectRollbackIndexMirrorAdapter.update`だけをacceptance branchでwrapする。

1. 現行`mirrorProjectRollbackIndexWithAdapter`にfresh metadata / body / expected project guardを実行させる。
2. desired index body生成後、元のindex `update`を呼ぶ直前にC faultを`consumed`へする。
3. 元のDrive updateを呼ばずsynthetic errorをthrowする。
4. 現行処理に旧indexをread-backさせ、mirror resultをfailureへ分類させる。
5. `executePreparedProjectRollbackWithAdapter`がrollback本体の成功を維持し、`indexStatus: "warning"`を返すことを確認する。

faultはrollback revision作成、2回目のrevalidate、current manifest update、current manifest read-back成功より後で、index writeより前に発生する。manifest commit前のthrowはCを検証しないため禁止する。

### Cの明示的recovery control

C faultがarmedな場合だけ、acceptance harnessは実行中の同一`ProjectRollbackWritePlan`をmemory refに保持できる。永続化やpublic resultへの露出はしない。

warning確認後、operatorがfault=`consumed` / OFFを確認してから、別の明示controlで既存`mirrorProjectRollbackIndexInDrive`を同じplanに対して1回だけ呼ぶ。この関数はfresh index metadata / bodyを読み、planの`expectedMetadata`、`expectedCanonicalHash`、`expectedProject`との一致を確認してからtitle / `updatedAt`だけをmirrorする。

- fresh guard不一致ではwriteせず停止する
- `mirrored`または`alreadyMirrored`だけをrecovery成功とする
- recoveryをworkflow成功に続けて自動実行しない
- recovery controlをproduction codeへ残さず、fault branchと一緒に破棄する
- memory planを失った場合は手作業でindexを修正せず、caseを停止してworkspaceをそのまま保持する

## 7. 推奨実行順

1. B. current conflict
2. A. manifest update response unknown
3. C. rollback manifest commit後のindex warning

Bは通常UIだけで完結し、Tab Aのrollback revisionすら作らない最小リスクcaseである。Aはfaultを使うが、成功時はmanifest / revision / indexが正常に収束する。Cは意図的にindex mirror不整合を残し、明示recoveryが必要なため最後に実行する。

## 8. Case B: current conflict

### 1. 何を検証するか

Tab Aでrollback execution reviewとwrite planを準備した後、Tab Bが同じprojectを正式publishした場合、Tab Aが`stalePlan`でrevision作成前に停止し、Tab Bのcurrentを古いrollback planで上書きしないことを確認する。

### 2. 対象state transition / invariant

`executePreparedProjectRollbackWithAdapter`の最初の`revalidateBeforeRevision`と、`revalidateProjectRollbackWritePlanInDrive`の`expectedCurrent`比較を対象とする。planはmanifest `modifiedTime`、content canonical hash、`currentRevisionId`を固定する。fresh snapshotはさらにtarget revision、asset、index、locationも比較する。

### 3. 通常UIのみで決定的に再現可能か

可能。2 tabまたは2 browser sessionを同じGoogle account / disposable projectへ接続する。共有in-flight guardに依存せず、各sessionの正規UI操作だけを使う。

### 4. Fault injection point

不要。fault branchを使わず、現在のproduction相当buildでも実行可能である。ただし全caseを同一preview deploymentで行う場合、fault toggleがOFFであることを先に確認する。

### 5. Fault timing

faultなし。順序は次のとおり。

1. Tab Aでtarget revisionのimpact previewを`ready`にする。
2. Tab Aでconfirmationsを完了し、execution preflight後の最終reviewを`prepared`にする。
3. Tab Bで同じcurrent内容を明示publishする。新しいpublish revisionと`currentRevisionId`が作られるが、playback contentとindex title / `updatedAt`は変えない。
4. Tab Bのpublish成功とfresh historyを確認する。
5. Tab Aでprepared rollbackを実行する。

### 6. Drive上で実際に変更されるもの

- Tab Bの新しいimmutable publish revision
- Tab B publishによるcurrent manifest publicationとmanifest file `modifiedTime`

同じcontentをrepublishするため、content canonical hash、title、slides、index target recordは変えない。

### 7. 変更されてはいけないもの

- Tab A由来のrollback revision
- Tab A planによるcurrent manifest本文 / publication
- index target record、他project record
- target revision、asset file / metadata、folder metadata、sharing

### 8. UIで期待するsanitized result

Tab Aは`stage: "revalidateBeforeRevision"`由来の「rollback revision作成前の最新状態確認に失敗しました。」を表示し、conflictとしてprepared reviewを再利用不可にする。raw guard値、Drive ID、hash、operation IDを表示しない。

### 9. Drive read-backで確認する内容

- current manifestはTab Bのpublish resultと一致する
- current contentはpre-case contentのまま
- publication operationは`publish`
- index title / `updatedAt`はbaselineと整合したまま
- Tab Aのtarget由来本文へ変わっていない

### 10. History / current revisionで確認する内容

- history件数はTab B publish分だけ1件増える
- currentはTab Bの新publish revision
- Tab Aの新rollback revisionは存在しない
- target revisionはimmutableのまま

### 11. Offline confirmed snapshot

Bを実行するoriginでcase開始直前に固定したconfirmed snapshotをbaselineとする。Tab B publishとTab A conflictだけではoffline syncが始まらず、confirmed project / assets / Blob、保存済みprovenance、player sessionがそのsame-origin baselineから変わらないことを確認する。Tab A / Tab Bは同一originを使う。

### 12. Recovery手順

Tab Aのprepared reviewを破棄し、画面をfresh reloadしてhistory/currentを再読込する。追加rollbackは実行しない。必要なら新しいpreviewが生成可能なことだけを確認し、case終了とする。

### 13. Stop condition

Tab Bのpublishが正常完了しない、indexが変わる、Tab Aがrollback revisionを作る、Tab Aがcurrentを上書きする、raw値が露出する、offline stateが変わる場合は即停止する。

### 14. Pass / fail criteria

PassはTab Aが`stalePlan`相当のconflictでrevision作成前に停止し、Drive上の唯一の差分がTab Bの正規publishであり、currentがTab Bのまま維持されること。offline unchangedはB実行origin上でcase直前に固定したbaselineとの比較で判定する。Tab Aがwriteした場合、単なるUI owner mismatchだけでDrive guardを通っていない場合、またはsame-origin confirmed snapshotが変化した場合はfail。

### 15. 試験後cleanup

projectを一貫したpublish済み状態のまま凍結する。Drive itemを削除せず、case結果をsanitizedに記録して次caseの別projectへ進む。

## 9. Case A: manifest update response unknown

### 1. 何を検証するか

実Google Driveへのrollback current manifest updateを成功させた直後、client adapterだけをresponse unknown相当へし、既存のfresh read-backが完全一致を確認して`status: "committed"`へ収束することを確認する。

### 2. 対象state transition / invariant

`commitProjectRollbackManifestWithAdapter`の`updateCurrentManifest` catch、`readCommittedManifest`、`manifestEquals`と、rollback workflowのmanifest成功後index mirror遷移を対象とする。

### 3. 通常UIのみで決定的に再現可能か

不可能。DevToolsのoffline切替やrequest abortでは、write前・write中・response後を決定的に区別できない。preview-only one-shot injectionを第一候補とする。

### 4. 最小fault injection point

rollback専用`ProjectPublishManifestCommitAdapter.updateCurrentManifest` wrapper。元のDrive updateがresolveした後だけsynthetic errorをthrowし、既存rollback commit関数のread-back recoveryをそのまま走らせる。

### 5. Fault timing

Drive current manifest writeの後、adapter success returnの前。revision作成・検証と2回目のrevalidateは既に成功済みである。write前throwは禁止する。

### 6. Drive上で実際に変更されるもの

- 新しいimmutable rollback revision
- current manifest本文、`updatedAt`、publication
- read-back収束後に通常実行されるindex target projectのtitle / `updatedAt`

### 7. 変更されてはいけないもの

- target revisionと既存revision
- asset file / metadata、history / revisions folder metadata
- indexの他project recordとidentity field
- workspace metadata、sharing、OAuth、offline stores

### 8. UIで期待するsanitized result

通常のrollback成功表示。`revisionStatus: "created"`、`manifestStatus: "committed"`、indexは`mirrored`またはfresh stateが既に一致する場合だけ`alreadyMirrored`。response unknownやsynthetic errorのraw本文を表示しない。fault controlはAが`consumed`であることだけを示す。

### 9. Drive read-backで確認する内容

- current manifestはtarget由来のtitle / slide順 / caption / duration / asset参照を持つ
- publication operationは`rollback`
- publicationが指すnew revisionとmanifest contentが一致する
- index target recordはcurrent manifestのtitle / `updatedAt`に一致する
- 他project recordは不変

### 10. History / current revisionで確認する内容

- history件数が1件増える
- new revisionは`operation: "rollback"`
- restored-fromは選択target、previousはpre-case currentを指す
- new revisionがcurrentで、target revisionはimmutableのまま

結果docsでは実IDを記録せず、相対関係だけを記録する。

### 11. Offline confirmed snapshot

Gate 4でPreview origin上に固定したCase A confirmed snapshotをbaselineとする。rollback成功だけではoffline syncが始まらず、confirmed project / assets / Blob、保存済みprovenance、player content / sessionがそのsame-origin baselineのままであることを確認する。

### 12. Recovery手順

成功へ収束した場合はretryしない。faultをOFFにし、画面をfresh reloadしてhistory/current/indexを再確認する。read-backが一致せず`currentManifestUpdateUnknown`になった場合は自動retryせず、caseを停止してhistory/currentのsanitized状態だけを確認する。

### 13. Stop condition

faultがwrite前に発火した、Aが`consumed`にならない、`committed`へ収束しない、duplicate/orphanを検出した、index warningが併発した、raw値が露出した、offline stateが変わった場合は停止する。

### 14. Pass / fail criteria

PassはA faultが1回だけpost-writeで発火し、実Drive read-back完全一致によりworkflowが通常成功し、revision/current/indexが一貫し、Preview originのsame-origin confirmed snapshotが変化しないこと。単にfaultなしで成功した場合、write前throw、manual retryで成功した場合はAのpassにしない。

### 15. 試験後cleanup

projectを新rollback revisionがcurrentの一貫状態で保持する。削除や追加rollbackを行わず、faultをdisarmしてsanitized結果を記録する。

## 10. Case C: rollback manifest commit成功後のindex warning

### 1. 何を検証するか

rollback revisionとcurrent manifestが正式commit・read-back済みの後、index mirror writeだけが失敗したとき、rollback本体を取り消さず`indexStatus: "warning"`へ収束することを確認する。その後、明示操作とfresh index guardでindexだけを安全に回復する。

### 2. 対象state transition / invariant

`executePreparedProjectRollbackWithAdapter`の`commitCurrentManifest`成功後の`mirrorIndex` failure branch、`mirrorProjectRollbackIndexWithAdapter`のfresh guard、`buildSanitizedRollbackSuccess`、history UI warning表示を対象とする。

### 3. 通常UIのみで決定的に再現可能か

不可能。manifest commitとindex updateの間に偶然通信を切る方法は非決定的であり、current commit前に失敗する危険がある。preview-only one-shot injectionを第一候補とする。

### 4. 最小fault injection point

`ProjectRollbackIndexMirrorAdapter.update` wrapper。fresh index guardとdesired body生成後、実index writeを呼ぶ直前にthrowする。rollback workflowやmanifest adapterにはC faultを入れない。

### 5. Fault timing

new rollback revision作成・検証、2回目のrevalidate、current manifest update、current manifest read-back成功の後。index writeの前。

### 6. Drive上で実際に変更されるもの

warning観測時点では次だけが変わる。

- 新しいimmutable rollback revision
- current manifest本文、`updatedAt`、publication

index target recordはpre-caseの旧title / `updatedAt`のまま残る。明示recovery成功時に限り、そのtarget recordのtitle / `updatedAt`だけが更新される。

### 7. 変更されてはいけないもの

- target revisionと既存revision
- asset file / metadata、folder metadata、sharing
- indexの他project record、workspace-level field、identity field
- rollback済みcurrent manifestを旧状態へ自動rollbackする処理
- offline confirmed snapshotとplayer session

### 8. UIで期待するsanitized result

「rollback完了・index mirror要確認」と「rollback本体は成功しました。index mirrorは要確認です。自動的な巻き戻しは行っていません。」を表示する。public resultは`manifestStatus: "committed"`、`indexStatus: "warning"`。refresh成否は記録するが、warning表示を置き換えてはならない。

### 9. Drive read-backで確認する内容

warning直後:

- current manifestはnew rollback revisionと完全一致する
- current publication operationは`rollback`
- index target recordは意図どおりpre-case mirrorのまま
- indexの他project recordは不変

recovery後:

- current manifestとrevisionはwarning直後から不変
- index target recordのtitle / `updatedAt`だけがcurrentへ一致
- index全体が正式parserでready

### 10. History / current revisionで確認する内容

- warning直後からnew rollback revisionがcurrent
- history件数が1件増え、target revisionは不変
- recoveryはrevisionを追加せず、current revisionも変えない
- index failureを理由にrollback revisionを取り消さない

### 11. Offline confirmed snapshot

Gate 4でPreview origin上に固定したCase C confirmed snapshotをbaselineとする。warning直後もrecovery後もoffline syncを実行せず、confirmed project / assets / Blob、保存済みprovenance、player sessionがそのsame-origin baselineから自動変化しないことを確認する。

### 12. Recovery手順

1. warning、AではなくC faultの`consumed`、current/historyの正式commitを確認する。
2. browser reloadやproject変更をせず、C faultをOFFにする。
3. acceptance-only明示recovery controlを1回押す。
4. memory内の同一planで`mirrorProjectRollbackIndexInDrive`を実行し、fresh metadata/body/expected project guardを通す。
5. `mirrored`または`alreadyMirrored`を確認する。
6. その後初めてfresh reloadし、project ready、history current、manifest/index整合を確認する。

guard不一致、memory plan喪失、session reload、unexpected index changeではrecovery writeを行わず停止する。Drive UIやraw APIでindexを手修正しない。

### 13. Stop condition

manifest commit前にfaultが発火する、indexがwarning観測前に更新される、warningが表示されない、workflowがrollback本体を失敗扱いまたは巻き戻す、recovery guardが不一致、他project recordが変わる、offline stateが変わる場合は停止する。

### 14. Pass / fail criteria

Passには両方が必要である。

1. injected index write failure後もrollback revision/current manifestが正式currentで、UIが`indexStatus: "warning"`を表示する。
2. 明示recoveryがfresh guardを通り、revision/currentを変えずindex target recordだけを整合状態へ戻す。

さらに、Preview originのsame-origin confirmed snapshotがwarning直後もrecovery後も変化しないことを確認する。manifest commit前失敗、indexが自動repairされた、rollbackが自動rollbackされた、recoveryがstale planを無条件使用した場合はfail。

### 15. 試験後cleanup

index recoveryとfresh reloadで正常状態へ戻ったことを確認後、projectを凍結する。recoveryできない場合はworkspaceをそのまま保持し、削除・手修正せずblockedとして終了する。

## 11. Caseごとのsanitized evidence template

```text
case: A | B | C
preview deployment: verified preview only
baseline: ready | not ready
browser origin: production | preview | other sanitized label
same-origin offline baseline: fixed immediately before case | not ready
fault: not used | armed once | consumed once | unexpected
history count: unchanged | +1 expected | unexpected
current operation: publish | rollback | unchanged
manifest result: unchanged | committed | conflict | requires inspection
index result: unchanged | mirrored | warning | recovered | requires inspection
offline confirmed snapshot: unchanged | unexpected change
player session: unchanged | unexpected change
recovery: not needed | completed | stopped
stop reason: none | sanitized reason
acceptance: pass | fail | blocked
```

project/revisionの実ID、hash、raw response、URL、tokenは添付しない。screen captureは必要領域だけを切り出し、address bar、DevTools Network、account profileを含めない。

## 12. 試験後の全体cleanup

- case projectとworkspaceは、全結果docsがreviewされるまでDrive上に保持する
- Drive file / folder、orphan revisionを手作業または自動で削除しない
- production alias、production env、mainへfault codeを入れない
- preview deploymentを停止し、preview-only envを解除する
- fault branchをmainへmergeせず破棄する
- cleanupとしてDrive itemを削除する必要が生じた場合は、このacceptanceとは別のreview済みplanを作る。現時点のdefaultは「disposable workspaceを試験証跡として保持」である

## 13. Gate sequence

### Gate 0: plan review

- この文書の対象、Aがrollback限定であること、Bの2-session順序、Cの明示recoveryをreviewする
- workspace isolation、記録禁止情報、global stop conditions、case ownerを承認する
- Gate 0承認前はfault injection codeを作らない

Exit: reviewerがplanを明示承認し、未解決事項が0件。

Gate 0は承認済みであり、browser origin単位のbaseline補足はGate 1開始前のreview clarificationとして記録する。Gate 0をやり直さず、fault injection設計やrecovery semanticsも変更しない。

### Gate 1: disposable workspace準備

- acceptance専用workspaceとcase別3 projectを作る
- 各projectでtarget revisionとpre-case current revisionを準備する
- current / history / index / assets / locationが正常であることを確認し、Drive remoteのsanitized baselineを記録する
- production originでoffline syncと`publishedMatch`を確認する場合はremote状態確認の補助とし、Case A / CのPreview-origin offline baselineの代用にしない

Exit: 3 projectすべてがSection 5のDrive remote baselineを満たす。

### Gate 2: 必要なpreview-only fault injection実装

- acceptance専用branchでA post-write fault、C index pre-write fault、C明示recovery controlを実装する
- default OFF、preview build guard、session toggle、one-shot、no-log、no-secretを実装する
- fault code commitはacceptance結果docs commitと分離する

Exit: code reviewでinjection timing、one-shot、scope、非露出、no-productionを確認する。

### Gate 3: local tests / full tests / lint / build

- Aが実adapter write resolve後に1回だけthrowするfocused test
- Cがindex adapter update呼出し前に1回だけthrowし、manifest success後のwarningになるfocused test
- default OFF、wrong case、consumed、reload/disarm、C recovery guard failureのtests
- forbidden valueがtoggle / public result / consoleへ出ないtest
- 既存rollback manifest commit / workflow / index mirror / provider UI tests
- full Vitest、pnpm 10 lint、pnpm 10 production build、`git diff --check`

Exit: focused / full tests、lint、build、diff checkがすべてpass。

### Gate 4: preview deployment確認

- Vercel Preview deploymentであることを確認する
- production aliasへ昇格していないことを確認する
- default OFFで通常rollbackが変化しないことをsanitized test projectで確認する
- fault controlにsecret / ID入力欄やconsole出力がないことを確認する
- faultをdefault OFFのままarmedせず、Case A projectをPreview originで明示的にoffline syncし、`publishedMatch`を確認する
- 同じくfaultをarmedせず、Case C projectをPreview originで明示的にoffline syncし、`publishedMatch`を確認する
- Case A / Cそれぞれのconfirmed project / assets / Blob / 保存済みprovenanceをsanitizedに確認し、Preview-origin baselineとして固定する

Exit: preview-only、default OFF、fault未arm、production非影響、Case A / CのPreview-origin baselineが確認済み。

### Gate 5: case-by-case real Drive acceptance

各caseで、実際にcaseを実行するbrowser originのconfirmed snapshotをcase開始直前のbaselineとして扱う。異なるoriginのsnapshotを代用または比較対象にしない。

1. Bを実行するoriginで明示的offline syncと`publishedMatch`を確認し、same-origin baselineを固定する。Tab A / Tab Bを同一originで開いてBを実行し、passまたはsafe stopをreviewする
2. B終了承認後だけ、Gate 4のCase A Preview-origin baselineを使ってAを実行し、passまたはsafe stopをreviewする
3. A終了承認後だけ、Gate 4のCase C Preview-origin baselineを使ってCを実行し、warningと明示recoveryまでreviewする

各caseでbaseline →操作→UI result→Drive read-back→history/current→same-origin offline unchanged→recovery→cleanupを個別sign-offする。

Exit: B/A/Cがpass、またはいずれかでstopして以後未実行であることが明確。

### Gate 6: fault branch破棄

- faultをdisarmし、preview deploymentとpreview-only envを停止する
- fault branchをmainへmergeしない
- production alias / main / permanent configにfault hookがないことを確認する
- Drive disposable workspaceは削除せず、結果review完了まで保持する

Exit: callableなfault deploymentがなく、production codeへfault hookが混入していない。

### Gate 7: acceptance結果だけdocsへ反映

- cleanなmain系baseからdocs-only branchを作る
- Section 11のsanitized templateだけで結果を記録する
- fault code commitと結果docs commitを分離し、fault branchのcodeを取り込まない
- 未実施、fail、blockedをpass扱いしない

Exit: docs-only diffがreviewされ、実施済み範囲とremaining riskが正確にcurrent docsへ反映される。

## 14. Gate 0 review checklist（承認済み）

- [x] Aをrollback current manifest commit限定とする理由を承認した
- [x] Bで同一contentの通常republishを使い、indexを変えず`currentRevisionId`を変える順序を承認した
- [x] C faultがmanifest read-back後 / index write前であることを承認した
- [x] C recoveryで同一planをmemoryだけに保持し、明示的にfresh index guardを通すことを承認した
- [x] disposable workspace / case別project / no-delete方針を承認した
- [x] global stop conditionsとsanitized evidence policyを承認した
- [x] fault branchをmergeせず、production aliasへ昇格しないことを承認した

Gate 0は承認済み。今回のorigin clarificationを反映したうえでGate 1から進め、Gate 2より前にfault injection codeを作らない。
