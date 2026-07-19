# 公開履歴と安全なrollback設計

Date: 2026-07-12
Status: Goal 5 設計確定（実装前）

## 1. 現行構造の監査結果

### 1.1 調査した主な実装・文書

- `README.md`
- `docs/handoffs/2026-07-12-video-playback-retry-tests-ci-handoff.md`
- `docs/decisions/goal-04-drive-workspace.md`
- `docs/decisions/goal-04-drive-workspace-create.md`
- `docs/decisions/goal-04-2-project-create.md`
- `docs/decisions/goal-04-3-asset-import.md`
- `docs/decisions/goal-04-5-offline-sync-indexeddb.md`
- `docs/handoffs/2026-06-13-unused-asset-delete-preflight-handoff.md`
- `src/lib/google-drive.ts`
- `src/lib/drive-workspace.ts`
- `src/lib/drive-offline-staging-snapshot.ts`
- `src/lib/drive-offline-staging-orchestration.ts`
- `src/lib/drive-offline-staging-sync-runtime.ts`
- `src/lib/offline-schema.ts`
- `src/lib/offline-staging-write.ts`
- `src/lib/offline-staging-validation.ts`
- `src/lib/offline-staging-promotion.ts`
- `src/lib/offline-confirmed-store-snapshot.ts`
- `src/lib/offline-playback-snapshot.ts`
- `src/app/app-providers.tsx`
- `src/app/admin/page.tsx` と `src/app/admin/*-panel.tsx`

### 1.2 現在のDrive構造

```text
iPad Slideshow PWA Workspace/
├─ workspace.json
├─ index.json
└─ projects/
   └─ {projectId}/
      ├─ manifest.json
      └─ assets/
         └─ asset files
```

`workspace.json` はworkspaceの身分証明、`index.json` はproject一覧、個別の `manifest.json` はproject title、slide情報、再生順の正本である。`index.json.projects[]` は `projectFolderId`、`manifestFileId`、`assetsFolderId`、`manifestPath`、作成・更新日時を持つ。

Drive itemはfilenameだけでなく `appProperties` の `app`、`role`、`schemaVersion`、`workspaceId`、必要な場合は `projectId` / `assetId` で識別・検証される。workspace直下の必須itemとproject直下の必須itemは、親、名前、MIME type、role、ID整合性を検証する。検索はrole metadataと親を用い、候補取得上限を2件にしてduplicateを異常として扱う。projectの通常読込では `index.json` に保持したDrive file IDを主参照とし、pathは補助情報である。

OAuth scopeは `drive.file` であり、アプリが作成またはアプリ経由で開いたfileを扱う設計である。history folderとrevision fileもアプリ自身が作成するため、この制約と整合する。ただしユーザーがDrive UIでコピー・移動・metadata変更したfileを当然に再取得できるとは仮定しない。

### 1.3 現在のmanifest保存フロー

project作成は、最新 `index.json` 読込、project folder作成、`manifest.json` 作成、`assets/` 作成、`index.json` 再読込、競合相当の再検証、index更新、更新後再読込・検証の順で行う。部分失敗時は作成済みitemを記録し、自動削除・自動修復しない。

素材追加、title、caption、duration、並び順、slide削除、slide複製は、概ね次の順である。

1. current `manifest.json` を再読込・検証する。
2. 変更後manifestを生成して同じDrive fileへ上書きする。
3. `index.json` を再読込・検証する。
4. 対象projectのtitle / `updatedAt` 等を同期してindexを上書きする。
5. 両方を再読込し、更新結果を検証する。

Driveにはtransactionがないため、manifest成功後にindexが失敗する部分更新はあり得る。現行UIはその可能性を明示し、Drive再確認を促す。manifest更新には `updatedAt` による再読込はあるが、HTTP条件付き更新、expected `modifiedTime`、checksum、operation IDによる厳密なoptimistic concurrencyはまだない。

asset追加はasset file作成が先である。後続manifest反映に失敗すると未参照assetが残り得る。cleanup preview / delete preflightはfresh manifestとfresh asset metadataを取得して分類するread-only設計であり、物理削除は未実装である。この「fresh dataで再検証し、結果を表示し、自動修復しない」方針はpublish / rollbackでも再利用する。

### 1.4 現在のoffline sync / confirmed promotionフロー

offline syncはDrive current manifestをfile IDで読み、manifestのworkspace / project / schema / title / slideを検証する。各参照assetについてDrive metadataを個別取得し、ID、MIME type、親、role、workspaceId、projectId、assetId、sizeを検証する。

画像と50MB以下の対応videoはmetadataとBlobをstagingへ保存する。上限超過videoはBlobを保存せず、`remoteOnly` 相当のmetadataとしてstagingへ残す。取得済みsnapshotをstaging storesへ書いた後、complete snapshot validationを通し、1つのIndexedDB transactionでconfirmed project / assets / asset blobsへpromotionする。失敗時や新しいsync runに追い越された場合、以前のconfirmed snapshotを維持する。

playerはconfirmed storeから読み出したsnapshotを使用する。Drive current manifestの保存、history作成、rollbackだけでは、既存player sessionやconfirmed storeは変化しない。通常のoffline syncとpromotionが完了し、playerが新しいconfirmed snapshotを読み込んだ時点で初めて再生へ反映される。

### 1.5 現在「公開」に相当する操作

現行実装には明示的な公開版、公開履歴、`currentRevisionId` はない。運用上もっとも近いものは `/admin` でDrive current manifestを保存する操作だが、これは編集保存であり公開とは定義されていない。offline syncは端末への配布、confirmed promotionは端末内での採用、player読込は再生sessionでの採用であって、Drive上の公開操作ではない。

したがって現行では次だけが区別される。

- Drive上の最新版: current `manifest.json`
- iPadへ同期中の候補: IndexedDB staging snapshot
- iPadで採用済みの版: confirmed snapshot
- player使用中の版: playerが読み込んだconfirmed snapshot

「編集保存」と「明示的な公開版」は区別されていない。

## 2. 用語定義

| 用語 | 定義 |
| --- | --- |
| 編集保存 | `/admin` の変更をDrive current `manifest.json` へ保存すること。公開履歴は増やさない。 |
| Drive current manifest | 次回offline syncが取得するprojectの最新版。未公開編集を含み得る。 |
| 公開 | 管理者が明示操作し、検証済みcurrent manifestをimmutable revisionとして記録し、そのrevisionをcurrent published revisionとして宣言すること。 |
| 公開revision | 公開時点のmanifest本文とasset参照metadataを持つimmutable JSON file。 |
| current published revision | current manifestに明示された `currentRevisionId` が指す公開revision。最新日時とは限らない。 |
| offline sync | Drive current manifestとassetを読み、iPadのstaging snapshotを作る配布操作。公開とは別操作。 |
| confirmed snapshot | staging validation後にpromotionされた、端末内の採用済みoffline snapshot。 |
| player使用中snapshot | player sessionが現在読み込んでいるconfirmed snapshot。promotion直後でも自動的なsession置換は保証しない。 |
| rollback | 過去revisionを素材として、現在時刻の新しいrevisionとcurrent manifestを作る操作。過去fileへのpointer切替ではない。 |

## 3. 推奨する公開モデル

保存と公開を分離し、明示的な「公開」操作を設ける。

保存ごとに履歴化すると、caption微修正やdrag reorderまで公開履歴となり、本番投入点という意味が失われる。学校・イベント本番の安定運用では、管理者が確認した境界を明示する価値が高い。未公開変更という追加状態は生じるが、current manifest本文のhashとcurrent published revisionのmanifest hashを比較すれば表示できる。

公開はDrive側だけの状態遷移とする。公開時にiPadへ自動pushせず、offline sync、staging、confirmed promotion、player採用を独立させる。

履歴内容は案Bを採用する。manifest本文に加え、参照assetのDrive file ID、MIME type、size、更新識別子、offline disposition、duration情報を保存し、asset本体は複製しない。

- 案Aは軽いが、assetの削除・差替え・metadata変化を公開時点と比較できない。
- 案Bは現行offline syncのmetadata検証を再利用でき、容量を抑えながらdegraded / unavailableを判定できる。
- 案Cは独立性が高い一方、Drive容量、時間、50MB超video、`drive.file` ownership、部分失敗を大きく複雑化するため採用しない。

## 4. 推奨する履歴データモデル

revision IDは、UTC時刻とUUIDを分離して保持する。`revisionId` 自体はUUID v4、表示・並び順は `publishedAt`、同時刻のtie-breakは `revisionId` とする。filenameは時刻と短いrandom suffixを含む人間可読形式にできるが、filename、Drive file ID、revision IDのいずれも相互の代用にしない。client clockは信頼境界ではないため、作成後のDrive `createdTime` もloader側の補助的な並び順・監査値として保持し、極端なclock skewは警告する。

```ts
type ProjectPublishOperation = "publish" | "rollback";
type RevisionAssetAvailability = "offlineEligible" | "remoteOnly" | "unsupported";

type ProjectPublishRevisionAsset = {
  assetId: string;
  assetFileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
  md5Checksum: string | null;
  availability: RevisionAssetAvailability;
  referencedBySlideIds: string[];
};

type ProjectPublishRevision = {
  app: "ipad-slideshow-pwa";
  role: "projectPublishRevision";
  schemaVersion: 1;
  revisionId: string;
  workspaceId: string;
  projectId: string;
  publishedAt: string;
  operation: ProjectPublishOperation;
  restoredFromRevisionId?: string;
  previousRevisionId: string | null;
  operationId: string;
  sourceManifestFileId: string;
  sourceManifestModifiedTime: string | null;
  sourceManifestUpdatedAt: string | null;
  sourceManifestSchemaVersion: number | null;
  manifestContentHash: string;
  slideCount: number;
  assetCount: number;
  remoteOnlyAssetCount: number;
  assets: ProjectPublishRevisionAsset[];
  manifest: ProjectManifestSnapshot;
};
```

`ProjectManifestSnapshot` は公開対象の再生内容であり、current pointerである `publication.currentRevisionId` はhash対象外に正規化する。同じassetを複数slideが参照する場合、`assets` は `assetFileId` 単位で一意にし、`referencedBySlideIds` でduplicate参照を表す。slideの `durationSeconds` とruntime metadataはmanifest本文にも保持される。

初期版では `publishedBy`、notes、app version、source snapshot IDを必須にしない。とくに `publishedBy` のためにGoogle profileや個人情報を新規取得・保存しない。app versionは安定したbuild識別子を既に安全に供給できる段階でoptional追加を検討する。

checksumは2種類を区別する。`manifestContentHash` はcanonical JSONのFNV-1a 64-bit hashを変更検知に使う。このhashは決定的な比較用であり、署名・認証・改ざん防止には使用しない。assetはDrive metadataで得られるchecksumが存在する場合だけ保存し、存在しない場合は `null` とする。公開のために大容量assetを再downloadしてhash計算しない。

## 5. Drive上の保存構造

既存current manifestの場所とfile IDを維持し、project直下にhistory folderを1つ追加する。

```text
projects/{projectId}/
├─ manifest.json                 # mutable current manifest
├─ assets/
└─ history/                     # role: projectHistory
   └─ revisions/
      └─ {revisionId}.json
```

初期実装をさらに小さくする場合、`revisions/` を省略してrevision fileを `history/` 直下へ置いてよい。ただし構造は最初に固定し、後から混在させない。本設計の推奨は将来のorphan / operation記録拡張を妨げない二階層である。

追加するDrive roleは既存のcamelCase命名に合わせて `projectHistory`、`projectPublishRevisions`、`projectPublishRevision` とする。各itemに `app`、`role`、`schemaVersion`、`workspaceId`、`projectId` を付与し、revision fileには検索・一覧用 `revisionId`、`operation`、`publishedAt` も付ける。revision本文を正本とし、metadataと本文の一致を検証する。

検索は親folder + app + role + workspaceId + projectIdで行う。history必須folderは候補0件なら未導入、1件なら検証、2件以上ならduplicateとして書込みを停止する。revision一覧はparentとroleでpage取得し、初期UIは最新50件だけ表示する。Drive上では削除せず、取得上限と保存保持を混同しない。

## 6. current revisionの管理方法

`currentRevisionId` のsource of truthはcurrent `manifest.json` の新しいoptional metadataに置く。

```ts
type ProjectManifestPublication = {
  currentRevisionId: string;
  currentManifestContentHash: string;
  publishedAt: string;
};

type ProjectManifest = ExistingProjectManifest & {
  publication?: ProjectManifestPublication;
};
```

理由は、current本文とそれを公開済みと宣言するpointerを同じfile content updateで切り替えられるためである。project専用metadata fileを新設すると二重正本と部分失敗が増える。Drive `appProperties` は検索・識別向けであり、更新可能なpublication stateの主保存先にはしない。`index.json` には一覧表示高速化のため `currentRevisionId`、`publishedAt` を将来mirrorしてよいが、authorityにはしない。mirror不一致時はmanifestを優先し、indexを自動修復しない。

未導入projectでは `publication` をoptionalにし、履歴なしとして扱う。read-only Goal 5-1 / 5-2ではschema変更前のcurrent判定として、正規化したcurrent manifest hashと各revisionの `manifestContentHash` の一致を「推定current」と表示してよい。ただし同一内容を再公開した複数revisionを一意に選べないため、永続的な方式にはしない。「最新publishedAt = current」は採用しない。

## 7. publishフロー

推奨フローは次のとおり。

1. 管理者が明示的に公開を選ぶ。
2. fresh current manifest、manifest file metadata、index、参照asset metadataを取得する。
3. schema、project、slide上限、asset参照、MIME、size、parent、roleをpreflightする。
4. current manifestの正規化hash、expected manifest `modifiedTime`、expected previous `currentRevisionId` を固定する。
5. `operationId` と `revisionId` を生成する。同じretryでは再利用する。
6. 同じ `operationId` / `revisionId` のrevisionがないことを検索する。存在すれば本文一致を検証して再利用する。
7. immutable revision fileを作成する。
8. 作成したrevision本文とDrive metadataを再読込・検証する。
9. current manifestがexpected `modifiedTime` / hash / currentRevisionIdから変わっていないことを再確認する。
10. current manifest本文は保ったまま `publication` を新revisionへ切り替え、条件付き更新する。
11. current manifestを再読込して本文hashとpointerを検証する。
12. `index.json` のpublication mirrorを更新する場合は最後に行い、再検証する。

公開時点のimmutable revisionを先に安全に確保し、current切替をcommit pointとする。history file作成だけでcurrent切替前ならorphan revisionであり、公開完了とは表示しない。

## 8. rollbackフロー

rollbackは「選択した過去版を元に、現在時刻の新しい公開版を作る」操作である。過去revisionをmutable currentとして直接参照せず、過去fileも変更しない。

```text
過去revision選択
→ fresh preflight
→ impact previewと確認
→ rollback operation用の新revisionをimmutable作成
→ current manifest本文 + publication pointerを新revisionへ更新
→ Drive側検証
→ 管理者が通常のoffline syncを別操作で実行
→ staging validation
→ confirmed promotion
→ playerが新confirmed snapshotを採用
```

新revisionは `operation: "rollback"`、`restoredFromRevisionId`、rollback直前の `previousRevisionId` を持つ。これによりrollback直前の最新版も履歴に残り、rollback自体をundo可能で、履歴が単調追加になる。

初期rollbackで復元するものは、選択revisionのproject manifest再生内容と、その内容を指す新しいpublication metadataだけである。titleをmanifestの一部として戻す場合、`index.json` のtitle / `updatedAt` mirrorも追随させるが、index自体を過去版へ丸ごと戻さない。

rollback対象外:

- workspace metadataと `workspace.json`
- `index.json` の他projectやworkspace全体
- Drive asset file本体の削除、復元、複製
- asset Drive metadataの書換え
- IndexedDB staging / confirmed storeの直接書換え
- playerが現在表示しているsnapshotの強制置換
- localStorage上の自動送り、本番モード等のplayer設定
- Service Worker cache / Cache Storage
- 複数project一括rollback
- 履歴revisionへのpointer切替だけでcurrent manifestを書き換えない方式

## 9. offline syncとの関係

状態は次の5層として表示・診断する。

1. Drive current manifest: 次回sync対象。未公開変更を含み得る。
2. Drive current published revision: `publication.currentRevisionId` が指す監査済み版。
3. iPad staging snapshot: sync途中の候補。再生には使わない。
4. iPad confirmed snapshot: validation / promotion済みの端末採用版。
5. player使用中snapshot: 現sessionが読み込んでいる版。

公開またはrollback成功は1と2だけを更新する。iPadへはpushせず、通常のoffline syncを明示実行する。将来、confirmed snapshotに `sourcePublishedRevisionId` を追加すれば端末の版を正確に表示できるが、これはIndexedDB schema変更を伴うため今回およびread-only初期段階の非目標とする。当面は `sourceUpdatedAt` / `syncedAt` を補助表示に留め、「公開版と一致」と断定しない。

## 10. asset整合性

revision単位のread-only状態を次のように定義する。

- `ready`: 全参照assetが存在し、ID、role、project、parent、MIME type、size、保存済みchecksum / modifiedTime（存在する範囲）がrevision metadataと一致する。
- `degraded`: 再生可能性は残るがmetadata変化、checksum未取得、未対応asset、offline非対象、または一部検査未完了がある。`remoteOnly` 自体は想定状態であり、それだけではdegradedにしない。offlineでは利用不可であることを別表示する。
- `unavailable`: 参照assetが見つからない、権限外、trashed、wrong project / parent、MIME変更など、少なくとも一つのslideを安全に復元・同期できない。

duplicate参照は同じassetを複数slideが意図的に参照するため異常ではない。manifest内で同一 `slideId` が重複する場合はinvalidとする。unused assetはrevisionの整合性ではなくcurrent projectのcleanup候補であり、履歴状態へ混ぜない。

一覧取得時に全revision × 全assetを走査しない。保存済みsummaryをまず表示し、整合性は次の二段階にする。

1. 一覧: revision本文のcached summaryと、前回check結果があればその時刻付き結果を表示する。未検査は `notChecked` と明示し、ready扱いしない。
2. 詳細 / rollback前: 選択revisionだけfresh asset metadataをlazy取得する。rollback preflightでは全参照assetを必須検査し、古いcheck結果を実行根拠にしない。

check結果をrevision fileへ追記するとimmutable性を壊すため、初期版ではsession memoryまたは別のmutable check cacheを使う。永続cacheは後続設計とし、revision本文の `ready / degraded / unavailable` を書き換えない。

## 11. concurrency

最低限、次のoptimistic concurrency guardを組み合わせる。

- preflight開始時とcurrent切替直前のmanifest file `modifiedTime` 一致
- 正規化manifest canonical hash一致（FNV-1a 64-bit。security判定には使わない）
- expected `currentRevisionId` 一致（履歴導入前は `null`）
- revision作成前後のtarget revision / asset metadata再検証
- `operationId` と `revisionId` によるidempotency
- UIの単一in-flight guardは誤操作防止として維持するが、複数tab対策とはみなさない

Drive更新で利用可能ならHTTP precondition / ETagを最終writeに使う。利用できない場合でも、write直前再読込とwrite後再検証は必須だが、check-to-write間の競合窓が残ることを明記する。Goal 5-3着手前にDrive APIの条件付きupload対応を小さなspikeで確認し、未確認のまま「競合を完全防止」と表現しない。

preflight結果には `checkedAt`、expected manifest modifiedTime / hash / currentRevisionId、target revisionIdを持たせる。実行時にすべて再検証し、古いpreflightを拒否する。rollback確認中にcurrentが変わった場合は確認を破棄し、最初からやり直す。二重実行は同じoperation IDを再利用し、同内容のrevisionが既にあれば新規作成しない。

## 12. 部分失敗と回復

Driveにtransactionがないため、書込み順序を次に固定する。

1. fresh preflight
2. immutable revision作成
3. revision再読込・検証
4. expected current再検証
5. current manifest本文 + `publication` pointer更新（commit point）
6. current再読込・検証
7. optionalなindex mirror更新
8. index再読込・検証

失敗別の扱い:

| 失敗点 | 残る状態 | 回復 |
| --- | --- | --- |
| revision作成前 | current不変 | 同じpreflightから再実行せず、fresh preflightする。 |
| revision作成応答不明 | revisionがある可能性 | `operationId` / `revisionId` で検索し、本文一致なら再利用。不一致・duplicateなら停止。 |
| revision検証失敗 | invalid / incomplete revision候補 | currentを切り替えない。orphanとして診断し、自動削除しない。 |
| current更新前の競合 | immutable orphan revision | current不変。orphanを表示し、fresh preflight。 |
| current更新応答不明 | currentが切替済みの可能性 | currentとrevisionを再読込し、pointer / hash一致なら成功として収束。不一致なら停止。 |
| current成功、index失敗 | publish本体は成功、index mirror stale | manifestをauthorityとして成功-with-warning。indexを自動修復せず、明示retryでexpected stateを確認してmirrorだけ更新。 |
| history成功、current失敗 | orphan revision | 公開失敗。retryは同revisionを再利用し、expected currentが変わっていれば拒否。 |

revisionには作成途中のmutable statusを書かない。完全なrevision fileを一回のmultipart uploadで作り、本文検証に合格したものだけpointer対象にする。「incomplete」はrevision本文の状態ではなく、metadata / 本文不一致、検証失敗、currentから未参照というloader分類で識別する。

## 13. migration

既存projectを一括更新しない。read-only履歴読込ではhistory folder 0件を正当な未導入状態として扱い、folderを自動作成せず「公開履歴なし」と表示する。history folder作成は最初の明示的公開の準備でだけ行う。

推奨移行は、最初の明示的公開時にその時点のfresh current manifestをinitial revisionとして作成し、`publication.currentRevisionId` を追加する方式である。これは管理者の意図がある時だけ1 projectずつ更新できる。自動baseline一括作成やmigration buttonは初期版では不要である。

最初の公開前の過去状態は復元できないことをUIで明記する。履歴機能導入だけを理由にDrive asset、index、IndexedDBを変更しない。

## 14. security / privacy

revision、appProperties、診断、UI、docsへ次を保存・表示しない。

- access token、Authorization header
- Drive API raw response、raw error
- streaming URL、download URL、内部API URL
- Photos Picker sessionId
- Blob URL、Range / Content-Rangeの実値
- local device固有情報
- 新規取得したGoogle profile、氏名、メール、user ID

Drive file IDはrevision内部の参照整合性に必要だが、UIでは全文を出さず、安全な短縮表示または論理 `assetId` を使う。revision IDはsecretではないがDrive file IDとは分離する。history itemは `drive.file` scope内でアプリが作成・管理し、public sharingやserver proxyを追加しない。エラーは分類済みの一般文言と回復手順だけを履歴UIへ出す。

## 15. 非目標

- このGoalでのpublish / rollback runtime実装
- Drive asset本体の版別複製、削除、復元
- history fileの編集・削除・compact / archive
- workspace全体または複数project一括rollback
- Service Worker / Cache Storage変更
- IndexedDB schema、staging、confirmed store、player runtime変更
- localStorage設定の復元
- server proxy、public sharing、OAuth scope拡張
- production data、Google Cloud Console、Vercel設定、GitHub Rulesetsの操作
- revision notes編集、個人識別可能なpublisher記録

保存保持は当面無制限とし、初期一覧は最新50件をpage取得・表示する。物理削除は別設計が合意されるまで行わない。

## 16. 段階的実装計画

### Goal 5-1: revision foundationとread-only loader

- pureなrevision schema / parse / validate / canonical hash helper
- revision ID / filename規則
- history / revisions folderとDrive role metadataの定義・検証
- history未導入、duplicate folder、invalid revision、orphanの分類
- 最新50件のread-only page loader
- asset summaryはrevision本文から読み、Drive asset一括検査はしない
- pure helper unit test
- runtime UIなし。必要なら認証不要visual-checkだけ

この段階ではcurrent manifest schema、index、Drive asset、IndexedDBを更新しない。folder作成をread-only loaderへ混ぜず、0件を「履歴なし」として返す。Drive folder作成はGoal 5-3のpublish準備で行うか、5-1内でも明示的な別commandとして分離する。

### Goal 5-2: read-only公開履歴UI

- `/admin/history` を追加する
- 公開日時、operation、slide / asset / remoteOnly数、current推定、整合性状態、詳細
- loading、empty、notChecked、degraded、unavailable、error
- 選択revisionだけのlazy integrity check
- delete、edit、rollback実行なし

既存 `/admin` はproject作成、素材、playlist編集、offline sync、storage、cleanupで既に責務が多い。`/admin` には選択projectの短いsummaryと `/admin/history` への導線だけを置く。

### Goal 5-3: 明示的publish

- manifest `publication` schemaとindex optional mirror
- publish preflight / confirmation UI
- immutable revision作成と再検証
- expected modifiedTime / hash / currentRevisionId guard
- operation ID / revision ID idempotency
- current manifest commit point
- partial failure / orphan検出と明示retry
- 初回publish時migration

### Goal 5-4: rollback preflightと確認UI

- target revision schema / hash validation
- fresh asset metadata lazy check
- missing / changed / remoteOnly / offline対象のimpact preview
- current変更、preflight stale検知
- rollback後に通常offline syncが必要という明示
- read-only previewのみ。実行handlerなし

### Goal 5-5: rollback実行

- 過去revisionを元に新revisionを作成
- `operation: "rollback"` / `restoredFromRevisionId`
- current manifest本文 + pointerの切替
- concurrency、idempotency、応答不明時の収束
- orphan / stale index mirrorの回復導線
- offline syncは別操作のまま維持

この5分割は、read path、表示、publish write、rollback read/preflight、rollback writeを分離できるため維持する。

## 17. 未決事項

推奨モデルを変える重大な未決事項はない。実装前に次だけを小さく確認する。

1. Drive multipart / media updateで利用できるETagまたはHTTP preconditionと、ブラウザからの実際のresponse header可視性。
2. asset metadataのchecksum fieldが現在の対象fileで取得可能な範囲。取得不能時は `modifiedTime + size` にfallbackし、強い同一性を断定しない。
3. history folderを `history/revisions` の二階層で開始する最終確認。将来拡張を優先する本設計では二階層を推奨する。
4. canonical JSONの仕様。object key sort、array order維持、`publication` 除外、UTF-8、改行規則をtest fixtureで固定する。

いずれもGoal 5-1 / 5-3の詳細実装判断で閉じられ、今回の推奨方針を複数案へ戻すものではない。

## 18. Goal 5-1Aの具体的スコープ

Goal 5-1AはGoal 5-1のうちpure foundationだけに限定して実装した。

- `src/lib/publish-history/project-publish-revision.ts` を追加
- revision / asset schema、parser、validator、canonical manifest hash input生成、ID / filename helperを実装
- `src/lib/publish-history/project-publish-revision.test.ts` を追加
- Drive read / write、folder作成、UI、manifest / index schema更新は行わない

commit例:

```text
feat: add publish revision schema helpers
```

read-only Drive loaderとrole検索は、そのpure foundationがtestで固定された次commitに分ける。これにより最初のruntime差分を小さくし、Driveへの書込みを一切伴わずschema判断をレビューできる。

### Goal 5-1A 実装結果

Goal 5-1AではschemaVersion 1のpure revision schema、既存manifest validatorを再利用するparser、summary / asset整合性検証、canonical JSON、FNV-1a 64-bit canonical hash、pure revision ID helperを実装した。hashは変更検知用でありsecurity用途ではない。Drive loader / role metadata、current manifest schema変更、Drive read / write、UIはまだ実装していない。

### Goal 5-1B 実装結果

Goal 5-1Bでは既存の履歴構造だけを読むDrive loaderを追加した。`projectHistory` / `projectPublishRevisions` / `projectPublishRevision` roleを厳格検証し、folderやrevision IDの重複時は自動選択しない。一覧は最新50件までのmetadataだけをpage取得し、本文は詳細取得時だけschemaとmetadataの一致を検証する。revision Drive file IDとraw errorはpublic resultへ返さない。folder / file作成、Drive write / delete、`currentRevisionId`、UIはまだ実装していない。

### Goal 5-2A 実装結果

Goal 5-2Aでは `/admin/history` にread-only UIを追加した。project選択後の初期取得と明示的な手動再読込ではmetadata一覧だけを読み、revision本文は有効なitemの詳細選択時だけ取得・検証する。current判定、publish / rollback操作、自動retry / polling、Drive writeは行わない。access tokenはAppProviders内のrefに維持し、Drive file ID、assetのDrive内部ID、raw errorを画面へ出さない。

### Goal 5-3A 実装結果

Goal 5-3Aでは、明示的publishのDrive書込み前に実行するpure preflightとwrite planを実装した。入力は検証済みcurrent manifest、fresh asset metadata、履歴状態、expected current state、呼出側が生成した時刻・revision ID・operation IDだけであり、access token、Drive API URL、raw response、Blob、UI stateは受け取らない。preflight自身はfetch、Drive create/update、folder作成、manifest保存を行わない。

preflightは既存 `parseProjectManifest` とrevision parser / canonical helperを再利用し、manifestのproject/workspace、source canonical hash、manifest file `modifiedTime`、expected `currentRevisionId`、履歴metadata、参照assetの完全一致を検査する。assetは `assetId` 昇順でrevisionへ格納し、manifestのslide順、caption、`durationSeconds`、video runtime metadataは変更しない。同じmanifestとasset metadataなら入力asset順に依存しないcanonical revision本文になる。

`remoteOnly` はcurrent manifestの保存fieldではない。fresh metadataのMIME typeとsizeを正本とし、検証済み `video/mp4` かつsizeが50 MiBを超える場合だけ `true` と導出する。image、50 MiB以下のvideo、size不明のassetは `false` を期待し、入力値との不一致をblocking errorにする。size、modifiedTime、checksumが不明の場合はwarningとし、正しく導出されたremoteOnly assetを含む場合もwarningだけでplan生成を許可する。

履歴未構成、またはreadyだが有効revisionが0件ならinitial publishとして `previousRevisionId: null` とする。履歴未構成時のplanはhistory / revisions folderのensureを要求するが、このGoalでは作成しない。有効revisionがある場合はread-only一覧から渡された最新のvalid metadataを `previousRevisionId` とし、日時からrevision IDを推測しない。公開日時が直前より前ならerror、同時刻ならwarningである。公開日時とpreflight確認日時は現時点ではclient clockから呼出側が渡すため、将来Drive server timeへ置換可能なinputとして分離した。

operation IDはrevision IDと独立した `pubop_<UTC compact timestamp>_<8 lowercase hex>` 形式である。helper内でrandom値を生成せず、時刻とsuffixを呼出側から受け取る。同じretryでは同じoperation IDとrevision IDを再利用する前提である。

write planはexpected manifest `modifiedTime` / canonical hash / `currentRevisionId`、folder ensure要否、immutable revision filename / canonical body / hash / appProperties、将来のpublication metadata、固定step順を保持する。step順はhistory folder確保、revisions folder確保、revision file作成、revision再検証、current manifest更新、current manifest再検証である。immutable revisionを先に確保し、`updateCurrentManifest` をcommit pointとする方針を維持する。

revision fileのappPropertiesは `app`、`role=projectPublishRevision`、`schemaVersion`、`workspaceId`、`projectId`、`revisionId`、`operation=publish`、`publishedAt` のstring値だけを計画する。URL、token、raw manifest、asset metadataは含めない。

current manifestへ将来追加する `currentRevisionId`、`publishedAt`、`publicationOperationId` はwrite plan上のpure型だけで表現した。正式manifest schema変更、Drive write、publish UI、confirmation dialog、Provider、offline sync、player、rollbackはまだ未実装であり、次Goalへ分離する。
