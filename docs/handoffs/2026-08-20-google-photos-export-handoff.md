# 2026-08-20 Google Photos Export 引き継ぎ

Updated: 2026-08-21

このファイルは、iPad用スライドショーPWA制作プロジェクト `ipad-slideshow-pwa` のGoogle Photos export completion handoffです。Git commit SHA、temporary Preview URL、token、Drive / Photos IDは記録しません。

## 1. Branch / 目的

作業ブランチ:

`feature/google-photos-export`

目的:

選択中のDrive作品を、Google Photosの新規albumへ書き出す。公開URL作成、Drive publication、offline sync、「このiPadに保存」とは別操作である。

Save != Drive Publish != Google Photos Export != このiPadに保存

## 2. 現行契約

- Google Driveはsource of truthのまま
- 毎回新しいGoogle Photos albumを作成する。既存albumの更新 / 同期 / 上書きは対象外
- write直前にfresh Drive revalidationを行う。不一致は`sourceChanged`としてPhotos writeを開始しない
- 同じDrive assetを複数slideで使う作品は`duplicateSlidesUnsupported`でblock
- 画像: export用画像へcaptionを焼き込む。空captionでもraw original bytesは送らず再エンコードする
- 非空captionは最大2行。全文が収まらなければsilent truncationせず`imageRenderFailed`
- 動画: Canvasへ入れない。Drive range stream → resumable upload。caption burn-inなし
- image 200 MiB以下、videoは既存アプリ制約の5 GiB以下
- automatic retry / automatic publish / automatic repairは禁止
- Google Photos export失敗でもDrive source、publication、offline store、Playerを変更しない
- access tokenは非永続。React state / storage / Cookie / URL / UI / console / diagnosticsへ出さない

## 3. 実装済み内容

- `/admin` の「Googleフォトへ書き出す」review / confirm / progress / 完了UI
- Drive fresh preflightとwrite直前revalidation
- 画像は1枚ずつDrive読出 → Canvas再エンコード → rendered Blob → resumable upload
- JPEGはJPEG（quality 0.93）、PNGはPNG、WebPはWebP、encode不可時はPNG fallback
- 動画はDrive Range streamのままupload
- `mediaItems.batchCreate` → 全件成功後のみ `albums.create` → `albums.batchAddMediaItems`
- 専用GoogleTokenClient
- scopeは`photoslibrary.appendonly`のみ
- `include_granted_scopes: false`
- Drive token client / Photos Picker token flowと分離
- rendered image Blobは現在の1枚だけ非永続ref保持
- success / sourceChanged / cancel / resume不可でcleanup

このブランチには、先に作ったVercel Blob版Web公開実験は含めていない。

## 4. Code audit結果

2026-08-21時点のruntimeに対するcode auditで確認したこと。手動acceptanceではない。

- caption silent truncationを禁止
- caption全文が2行以内に入らなければ`imageRenderFailed`
- WebP encode probeは1x1 canvas + `toBlob`
- full-size canvasの`toDataURL` probeなし
- JPEG / PNGではWebP probeなし
- image source Blob生成時の追加merged buffer copyを削減
- MP4 / MOVはDrive range stream → resumable uploadのまま
- Photos export専用GoogleTokenClient
- scopeは`photoslibrary.appendonly`のみ
- `include_granted_scopes: false`
- Drive token client / Photos Picker token flowと分離
- rendered image Blobは現在の画像1枚だけref保持
- success / sourceChanged / cancel / resume不可等でcleanup
- access token非永続化

## 5. Vercel Preview READY確認

Google Photos exportのPreview deploymentはREADYを確認済み。temporary Preview URLは記録しない。

Productionは引き続き既存mainのまま。このbranchはまだProductionへmerge / promoteしていない。

## 6. v1 manual acceptance

2026-08-21、Vercel Previewから実Google Photosへ、JPEG画像2枚を新規albumへexportした。

確認できたもの:

- slide順が1枚目 → 2枚目で維持
- 1枚目の画像そのものに `photo-1-burned-v1` が焼き込まれて表示
- 2枚目の画像そのものに `photo-2-burned-v1` が焼き込まれて表示

## 7. v2 manual acceptance

1枚目captionだけを`photo-1-burned-v2`へ変更して保存し、2枚目は`photo-2-burned-v1`のまま、新しいGoogle Photos albumへ再exportした。

確認できたもの:

- 新albumの1枚目は画像そのものが `photo-1-burned-v2`
- 新albumの2枚目は画像そのものが `photo-2-burned-v1`
- 過去export済み画像のstale再利用ではなく、最新captionから再生成された画像がexportされる

## 8. manual未確認項目

確認済みへ昇格しない。

- Google Photos descriptionへのcaption保存の目視確認
- Drive原画像が不変であることの今回の手動再確認
- WebP実画像export
- PNG alpha実画像export
- EXIF orientation実画像export
- 実動画のGoogle Photos export
- 実ネットワーク中断からのresume
- 200 MiB画像境界
- 5 GiB動画境界
- OAuth consent画面上でscope文言を目視確認したこと

既存の未確認事項も解決済みにしない。

- multi-tab publication race
- exact 5 GiB境界
- publication abnormal write A/B/C
- PWA new install

## 9. main merge前状態

- 作業ブランチは`feature/google-photos-export`
- `origin/main` はHEADのancestor
- feature側だけがahead
- merge commitによる取り込みはしていない
- このbranch上のproduct-experience変更は、Google Photos作業より前から意図して積まれたcommitである
- Preview / 実Google Photosの画像caption burn-in acceptanceは完了
- Production acceptanceはまだ未実施
- mainへは未merge

詳細な段階別evidenceは[`../acceptance/google-photos-export-acceptance.md`](../acceptance/google-photos-export-acceptance.md)を参照する。

## 10. Production acceptance

未実施。

Productionへ未反映であり、正式Production URL上でのGoogle Photos export再確認はまだ行っていない。成功扱いしない。

## 11. 既存のaccept済み領域

今回のGoogle Photos作業で再オープンしない。

- Goal 6 offline publication provenance
- publish / rollback
- unused Drive asset physical deletion
- MOV support / video up to 5 GiB
- product-ready finalization Production acceptance
- selected project playback

既存accepted behaviorに具体的なregression evidenceがない限り、勝手に変更しない。

## 12. 重要な制約

- Google Driveはsource of truthのまま
- Google Photos exportはDrive publication authorityを変更しない
- Google Photos export成功 / 失敗で `manifest.publication.currentRevisionId` を変更しない
- offline confirmed / stagingを変更しない
- Player selectionを変更しない
- Google Photos export失敗時もDrive原本を変更しない
- 動画はCanvas renderしない
- access tokenは非永続化する
- automatic retry禁止
- automatic publish禁止
- automatic repair禁止
- raw IDs / tokens / URLs / errorsをユーザー向け表示しない
