# Project delete Production acceptance

Date: 2026-08-22

Status:
Production destructive acceptance PASS.

対象:
「作品を削除」

これはVercel Productionと実iPadでのdestructive acceptanceである。Preview evidenceは[`project-delete-preview-acceptance.md`](project-delete-preview-acceptance.md)として残す。この文書をPreview confirmationの書き換えとはしない。

temporary deployment URL、deployment ID、access token、session ID、Drive ID、projectId、raw API errorは記録しない。不要なcommit SHAも記録しない。

## Scope

対象は、Adminで選択中の1作品に対する明示confirmation付き削除である。

- Google Drive上の選択中作品だけを削除する
- Google Driveがsource of truthである
- project rootは永久DELETEではなくDrive Trashである
- Drive完全成功後だけ、このiPadの同一作品コピーを削除する
- Google Photos exportは削除対象外である
- standaloneの「このiPadのコピーを削除」は、Driveを消さずlocal copyだけ消す別機能として残る
- 他作品へsilent fallback / auto-selectしない
- 削除後に`checkProject()`を自動実行しない
- automatic retry / repair / rollbackなし

## Implemented Production acceptance

2026-08-22、Vercel Productionと実iPadでdestructive acceptanceを実施した。ProductionはREADYで、`/admin`は200だった。temporary deployment URLとdeployment IDは記録しない。

削除前に、対象作品の「このiPad」保存コピーが存在することを端末保存データで確認した。選択中作品の「作品を削除」を実行し、confirmationを経て削除workflowが正常完了した。削除作品は作品一覧から消え、他作品は保持され、別作品を自動選択しなかった。Drive完全成功後にこのiPadコピーも削除された。Google Photos exportデータへの影響はなかった。standalone「このiPadのコピーを削除」は別機能のままだった。Google Drive UIで、削除対象project rootがTrashに入っていることを目視確認した。acceptance観測中のProduction runtime error / warning / fatalは0件だった。

| 項目 | 結果 |
| --- | --- |
| confirmationに対象作品名が出る | PASS |
| Drive上のスライド / 素材 / 公開履歴を削除対象と説明 | PASS |
| このiPadコピーもDrive完全成功後に削除する説明 | PASS |
| Googleフォトへ書き出した写真は削除しない説明 | PASS |
| アプリから元に戻せない説明 | PASS |
| 削除前にこのiPadコピーが存在することを確認 | PASS |
| destructive workflow正常完了 | PASS |
| 削除作品が作品一覧から消える | PASS |
| 他作品は保持される | PASS |
| 削除後に別作品を自動選択しない | PASS |
| このiPadコピーの連動削除 | PASS |
| Google Photos exportデータには影響しない | PASS |
| standalone「このiPadのコピーを削除」は別機能として維持 | PASS |
| Google Drive UIで対象project rootがTrashにあることを目視確認 | PASS |
| acceptance観測中にProduction runtime error / warning / fatalなし | PASS |

このProduction acceptanceでは、Google Drive UIで削除対象project rootがTrashにあることを目視確認済みである。Preview acceptanceではその目視確認を記録していない。Preview evidenceと混同しない。

## Implementation contracts recorded during acceptance

- index removal verify前のfailureではlocal copyを削除しない
- partialFailureではlocal copyを削除しない
- local clear可能なのはstrict completedだけである。`status === "completed"` かつ `indexRemoved === true` かつ `projectRootTrashed === true` かつ `authRequired === false`
- local clear failure時もDrive成功をrollbackしない。indexへ再追加せず、project rootを復元しない
- project root削除はDrive Trashであり、永久DELETEではない
- unused asset物理削除の永久DELETEとは別契約である
- automatic retry / repair / rollbackなし
- 他projectへsilent fallback / auto-selectなし
- Photos OAuth / session / export非干渉
- app shell cacheは削除しない
- 他projectのconfirmed offline dataは変更しない

## Code / test coverage that is not Production real-device failure injection

次のfailure pathはunit / integration test coverageがある。このProduction acceptanceではreal-device failure injectionを実施していない。Production PASS項目へ昇格させない。

- preflight block
- stale owner / selection change
- index write failure
- trash partialFailure
- post-index 401 / 403 `authRequired` partialFailure
- local IndexedDB clear failure
- ambiguous Drive response
- retry / rollback禁止

## Not accepted / not verified

- 上記failure pathのProduction real-device failure injection
- 実時間でGoogle session absolute expiryを跨いだ実機確認。このproject delete acceptanceとは別件で未確認
- Google Photos video-only 0-photo実機acceptance。このproject delete acceptanceとは別件で未確認
