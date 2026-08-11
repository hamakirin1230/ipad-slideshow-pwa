# Product-ready finalization acceptance

Date: 2026-08-12

Status: Product-ready finalization accepted in Production, with explicitly recorded remaining unverified/non-blocking items

この文書は、`finalization/product-ready`のmain merge前acceptanceと、その後のProduction acceptanceを記録する。local validation、Preview / iPad手動確認、Production手動確認、過去のacceptance evidenceは別の根拠として扱い、各段階で再実行していない操作をその段階の確認結果へ含めない。merge前acceptanceの作成時点ではProductionへ未反映だった。

## Scope

対象は、`finalization/product-ready`で行った次のproduction readiness整理である。

- production debug routes撤去
- stale product status copy撤去
- production diagnostics sanitization
- player control focus accessibility
- iPad admin navigation / touch target改善
- PWA install metadata整理
- obsolete GitHub Pages path撤去
- Current / Historical docs分類
- obsolete modules / starter assets削除
- production UI terminology整理
- runtime environment / security contract記録

## Automated / local validation

finalizationの最終local validation結果:

- full Vitest: 55 files / 961 tests passed
- lint: passed
- build: passed
- git diff checks: passed
- working tree: clean

これはlocal validationであり、実機または実サービス上のacceptanceとは別のevidenceである。

## Final iPad / Preview signoff

2026-08-12の最終手動確認として、ユーザーから得た結果だけを記録する。

| 対象 | 結果 |
| --- | --- |
| Home | OK |
| Settings | OK |
| Admin | OK |
| History / rollback preview | OK |
| Player | OK |
| PWA existing install | OK |
| PWA new install | 未確認 |

`PWA new install`は失敗ではなく未確認であり、確認済みへ昇格させない。Historyはrollback previewまでの確認であり、実rollbackを今回再実行した記録ではない。Adminでpublishや破壊的なDrive asset物理削除を今回再実行した記録でもない。

## Preview / runtime distinction

latest runtime-changing Previewでは上記のmanual signoffを完了した。その後のruntime environment / security documentation変更は、docs、`.env.example`、`.gitignore`、contract testだけであり、runtime implementationを変更していない。

そのdocs-only変更に対応する新しいVercel Preview deploymentの生成は確認できていない。したがって、最新HEADのPreviewを確認済みとは扱わない。確認済みなのはlatest runtime-changing Previewであり、その後のdocs-only変更はruntime behavior不変である、という境界を維持する。

## Previously accepted evidence preserved

次はrepositoryの既存記録から参照できるacceptance evidenceであり、今回再実行した結果ではない。

- real Google Driveでのpublish / republish / rollback acceptance
- Goal 6 offline publication provenance acceptance
- unused Drive asset physical delete acceptance
- explicit offline sync acceptance
- 約3GB MOVの実iPad Production `remoteOnly` playback
- rollback asset storage-name production preview fix acceptance

詳細は[`../current-context.md`](../current-context.md)と[`../handoffs/`](../handoffs/)のdated evidenceを参照する。既存evidenceからも、exact 5 GiB境界やすべてのMOV codec対応を保証しない。publication abnormal write A/B/Cについて、実Google Driveでの完了記録はない。

## Known remaining exclusions / non-blockers

次は未確認または未解決のまま記録を保持する。いずれも今回のproduct-ready finalization mergeを阻止するfailureとは判定しないが、解決済みとも扱わない。

- PWA new install: 未確認
- multi-tab publication race: known unresolved
- exact 5 GiB upload boundary: 未確認
- publication abnormal write A/B/C: real Google Drive completion recordなし
- Vercel Dashboard固有security settings / Firewall等: 未監査
- CSP / COOP / COEP等security hardening: 未導入であり、別acceptance対象

## Merge readiness conclusion（merge前記録）

`finalization/product-ready`のproduction-readiness changesをacceptし、main mergeへ進める状態と判断した。PWA new installを含む明示的な未確認項目は、merge後も上記の状態で記録を保持する方針とした。

このmerge前判断はProduction反映済みという判断ではなかった。PreviewをProductionへ手動promoteすることを前提とせず、main mergeによる正式なVercel Production deployment後にProduction smoke checkを行う計画だった。

## Production acceptance

Date: 2026-08-12

確認済みのdeployment事実:

- mainへfast-forward merge済み
- Vercel Production deploymentがREADYになったことを確認済み
- Production rootが正常応答することを確認済み
- 撤去したproduction debug routeがProductionに存在しないことを確認済み

実iPadでのProduction smoke check結果:

| 対象 | 結果 |
| --- | --- |
| Production Home | OK |
| Production Settings / Google接続 | OK |
| Production Admin | OK |
| Production History / rollback preview | OK |
| Production Player playback | OK |
| Production existing installed PWA | OK |
| PWA new install | 未確認 |

Historyで確認したのはrollback previewまでであり、今回実rollbackを実行した記録ではない。AdminでpublishやDrive素材の完全削除を今回再実行した記録でもない。existing installed PWAはOKだが、PWA new installは未確認のまま維持する。

このProduction acceptance後も、multi-tab publication race、exact 5 GiB upload boundary、publication abnormal write A/B/Cのreal Google Drive completion、Vercel Dashboard固有security settings / Firewall、CSP / COOP / COEP hardening、PWA new installは、上記の未確認・未解決状態を維持する。

product-ready finalizationはProductionでacceptされた。これは記録した範囲のProduction smoke check完了を意味し、すべての機能、MOV codec、境界条件を完全検証したという意味ではない。
