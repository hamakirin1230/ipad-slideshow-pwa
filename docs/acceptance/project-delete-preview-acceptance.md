# Project delete Preview acceptance

Date: 2026-08-22

Status:
Preview PASS.
This document remains Preview evidence only.
Production acceptance was later performed and is recorded in [`project-delete-production-acceptance.md`](project-delete-production-acceptance.md).

対象機能:
「作品を削除」

- Google Drive上の選択中作品を削除する
- Drive完全成功後だけ、このiPadの同一作品コピーを連動削除する
- Google Photos exportは削除対象外である

これはPreview上の実iPad destructive acceptanceである。Preview観測内容をProduction evidenceへ書き換えない。Production acceptanceは[`project-delete-production-acceptance.md`](project-delete-production-acceptance.md)を参照する。

temporary Preview hostname / URL、deployment ID、access token、session ID、Drive ID、projectId、raw API errorは記録しない。不要なcommit SHAも記録しない。

## Scope

対象は、Adminで選択中の1作品に対する明示confirmation付き削除である。

- 削除対象は選択中作品だけである
- Google Driveがsource of truthである
- project rootはDrive Trashであり、アプリから永久DELETEしない
- Drive削除がstrict completedのときだけ、このiPadの同一作品コピーを1回削除する
- standaloneの「このiPadのコピーを削除」は、Driveを消さずlocal copyだけ消す別機能として残る
- Google Photos export / Photos OAuth / Photos sessionは変更しない
- 削除後に別作品を自動選択しない
- 削除後に`checkProject()`を自動実行しない
- automatic retry / repair / rollbackは行わない

## Implemented Preview acceptance

2026-08-22、Vercel Previewと実iPadでdestructive acceptanceを実施した。Preview deploymentはREADYだった。temporary Preview URLとdeployment IDは記録しない。

削除前に、対象作品の「このiPad」保存コピーが実在することを端末保存データで確認した。選択中作品から「作品を削除」を実行し、confirmationを経て削除workflowが正常完了した。Drive削除成功後に、このiPadのコピーも連動削除された。操作全体は正常に動作した。acceptance観測中のPreview直近runtime error / warning / fatalは0件だった。

| 項目 | 結果 |
| --- | --- |
| 削除対象は選択中作品のみ | PASS |
| 明示confirmationあり | PASS |
| confirmationに対象作品名が出る | PASS |
| Drive上のスライド / 素材 / 公開履歴が削除対象である説明 | PASS |
| このiPadコピーもDrive完全成功後に削除する説明 | PASS |
| Googleフォトへ書き出した写真は削除しない説明 | PASS |
| アプリから元に戻せない説明 | PASS |
| 削除前にこのiPadコピーが存在することを端末保存データで確認 | PASS |
| 作品削除workflow正常完了 | PASS |
| このiPadコピーの連動削除正常 | PASS |
| destructive UIが正常に動作 | PASS |
| 削除作品が作品一覧から消える | PASS |
| 他作品は保持される | PASS |
| 削除後に別作品を自動選択しない | PASS |
| Drive project rootはアプリ上のactive workspaceから外れる | PASS |
| standalone「このiPadのコピーを削除」は別機能として維持 | PASS |
| Google Photos exportデータには影響しない | PASS |
| acceptance観測中にPreview runtime error / warning / fatalなし | PASS |

## Implementation contracts recorded during acceptance

- index removal verify前のfailureではlocal copyを削除しない
- partialFailureではlocal copyを削除しない
- local clear可能なのはstrict completedだけである。`status === "completed"` かつ `indexRemoved === true` かつ `projectRootTrashed === true` かつ `authRequired === false`
- local clear failure時もDrive成功をrollbackしない。indexへ再追加せず、project rootを復元しない
- project root削除はDrive Trash（`trashed: true`）であり、永久DELETEではない
- unused asset物理削除の永久DELETEとは別契約である
- automatic retry / repair / rollbackなし
- 他projectへsilent fallback / auto-selectなし
- Photos OAuth / session / export非干渉
- app shell cacheは削除しない
- 他projectのconfirmed offline dataは変更しない

Drive project rootのTrash化は、実装契約およびunit testで`PATCH {"trashed":true}`を使う。このPreview acceptanceでは、Google Drive UIでTrashフォルダを目視確認した記録はない。実装契約・unit test済みと、実Drive UIでのTrash目視確認済みを混同しない。ProductionでのTrash UI目視確認は[`project-delete-production-acceptance.md`](project-delete-production-acceptance.md)を参照する。

## Code / test coverage that is not real-device failure injection

次のfailure pathはunit / integration test coverageがある。このPreview acceptanceではreal-device failure injectionを実施していない。PASS扱いしない。

- preflight block
- stale owner / selection change block
- index write failure
- trash partialFailure
- post-index 401 / 403 `authRequired` partialFailure
- local IndexedDB clear failure
- ambiguous Drive response
- retry / rollback禁止の確認（実機で失敗を注入して禁止挙動を見たものではない）

## Not accepted / not verified

このPreview文書の記録時点では以下を未実施とした。後続のProduction destructive acceptanceは[`project-delete-production-acceptance.md`](project-delete-production-acceptance.md)を参照する。この文書はPreview evidenceとして残す。

- Google Drive UIで削除済みproject rootがTrashにあることの目視確認。このPreview観測では未実施
- 上記failure pathのreal-device failure injection
- 実時間でGoogle session absolute expiryを跨いだ実機確認。このproject delete acceptanceとは別件で未確認
- Google Photos video-only 0-photo実機acceptance。このproject delete acceptanceとは別件で未確認

このPreview functional acceptanceをProduction confirmationへ昇格させない。
