# Google Photos export acceptance

Date: 2026-08-21

Status:
Preview / real Google Photos image-caption acceptance passed.
Production acceptance not yet performed.

この文書は、`feature/google-photos-export` のGoogle Photos書き出しについて、local validation、code audit、Preview確認、実Google Photos手動確認を段階別に記録する。各段階で再実行していない操作を、その段階の確認結果へ含めない。Production acceptanceは未実施であり、成功扱いしない。

## Scope

対象は、選択中Drive projectをGoogle Photosの新規albumへ書き出す機能である。

- `/admin` から「Googleフォトへ書き出す」
- 画像captionはexport用画像へburn-in
- 動画captionはburn-inしない
- 動画はDrive range streamのままresumable upload
- Drive publish / offline sync / 「このiPadに保存」とは別操作
- export失敗でもDrive publication / offline store / Playerを変更しない

Vercel Blob版Web公開実験は対象外である。

## Automated / local validation

docs整理後のlocal validation結果:

- full Vitest: 75 files / 1088 tests passed
- lint: passed
- build: passed
- git diff checks: passed

これはlocal validationであり、実Google PhotosまたはProduction上のacceptanceとは別のevidenceである。

## Code audit

runtime HEADに対するcode auditで確認した契約。これは手動acceptanceではない。

- 非空captionが2行に全文収まらない場合はsilent truncationせず、`imageRenderFailed`にする
- WebP encode capabilityの確認は1x1 canvasの`toBlob`だけを使い、full-size canvasの`toDataURL`は使わない
- JPEG / PNG sourceではWebP probeを実行しない
- image source Blobはstream chunkから直接構築し、追加のmerged buffer copyを置かない
- MP4 / MOVはCanvasへ入れず、Drive range streamからresumable uploadする
- Photos exportは専用GoogleTokenClientを使う
- 要求scopeは`photoslibrary.appendonly`のみ
- `include_granted_scopes`はfalse
- Drive token clientおよびPhotos Picker token flowとは分離する
- rendered image Blobは現在の画像1枚だけを非永続refに保持する
- success / sourceChanged / cancel / resume不可ではrendered Blobを破棄する
- access tokenはReact state / Context / storage / Cookie / URL / UI / console / diagnosticsへ出さない

## Preview verification

Vercel Preview上でGoogle Photos exportの実行経路を使い、後述の実Google Photos manual acceptanceを行った。Preview deploymentはREADYだった。temporary Preview URLは記録しない。

Productionへは未反映であり、Preview確認をProduction確認へ昇格させない。

## Real Google Photos manual acceptance

2026-08-21、Vercel Previewから実Google Photosへ書き出した結果だけを記録する。確認していない項目は確認済みへ昇格させない。

### v1

JPEG画像2枚の作品を、Google Photosの新規albumへexportした。

| 対象 | 結果 |
| --- | --- |
| 新規album作成 | OK |
| slide順（1枚目 → 2枚目） | OK |
| 1枚目画像そのものに `photo-1-burned-v1` が焼き込まれている | OK |
| 2枚目画像そのものに `photo-2-burned-v1` が焼き込まれている | OK |

### v2

1枚目captionだけを`photo-1-burned-v2`へ変更して保存し、2枚目は`photo-2-burned-v1`のまま、新しいGoogle Photos albumへ再exportした。

| 対象 | 結果 |
| --- | --- |
| 新albumの1枚目画像そのものが `photo-1-burned-v2` | OK |
| 新albumの2枚目画像そのものが `photo-2-burned-v1` | OK |
| 過去export済み画像のstale再利用ではなく、最新captionから再生成された画像がexportされる | OK |

## Security / data boundary

- Save != Drive Publish != Google Photos Export != このiPadに保存
- Google Photos exportの成功 / 失敗はDrive publication authorityを変更しない
- Google Photos exportの成功 / 失敗はoffline confirmed / staging storeを変更しない
- access tokenは非永続であり、画面・永続保存・docsへ出さない
- Drive ID、Google Photos media item ID、album ID、upload token、session URL、raw API errorをユーザー向け表示へ出さない方針を維持する

この境界はcode / docs契約であり、OAuth consent画面のscope文言目視は未実施である。

## Video non-regression

動画経路はcode / test contractとして、Drive range stream → resumable uploadのままである。Canvas render、全ファイルBlob化、数GB動画の一括読込は行わない。

実動画のGoogle Photos exportは今回のmanual acceptance対象外である。

## Explicitly unverified items

次は今回確認済みへ昇格しない。

- Google Photos descriptionへのcaption保存の目視確認
- Drive原画像が不変であることの今回の手動再確認
- WebP実画像export
- PNG alpha実画像export
- EXIF orientation実画像export
- 実動画のGoogle Photos export
- 実ネットワーク中断からのresume
- 200 MiB画像境界
- 5 GiB動画境界
- OAuth consent画面上でのscope文言目視

既存の未確認事項も解決済みへしない。

- multi-tab publication race
- exact 5 GiB upload境界
- publication abnormal write A/B/C
- PWA new install

## Main merge前 feedback fix

2026-08-21のGoogle Photos v1 / v2 evidence自体は有効である。caption burn-inの手動確認結果は、その時点のruntime HEADに対する記録として残す。

その後のPreview再確認で、次は成立した。

- 全作品カードの写真 / 動画件数
- 「この作品を再生」で選択中作品をPlayer再生

60分silent restoreは成立しなかった。`prompt: ""` でも `prompt: "none"` でも、refresh時にGoogleアカウント選択画面が一瞬表示されて消え、その後未接続になった。page-loadからGIS token clientをsilent実行してrefresh persistenceを実現する試みは中止し、page-load silent token requestは撤去した。

現在の契約:

- refresh後は明示的な手動Google再接続が必要
- 自動account chooser / popup / consent UIは、ユーザーの明示操作なしには開始しない
- access token非永続を維持する
- 「60分接続維持」は未解決である
- 別branchでOAuth authorization code flow / backend方式を検討対象とする

この文書を「新HEADもmanual acceptance済み」とは読まない。Google Photos v1 / v2は以前のruntime evidenceとして保持する。Production acceptanceは引き続き未実施である。

## Production acceptance

未実施。

Productionへ未反映であり、Production上のGoogle Photos export smoke check、正式URLでの再export、Production OAuth経路の再確認はまだ行っていない。この欄を成功扱いにしない。
