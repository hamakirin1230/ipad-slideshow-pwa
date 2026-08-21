# 2026-08-20 Google Photos Export 引き継ぎ

Updated: 2026-08-21

このファイルは、iPad用スライドショーPWA制作プロジェクト `ipad-slideshow-pwa` のGoogle Photos export completion handoffです。Git commit SHA、temporary Preview URL、token、Drive / Photos IDは記録しません。

## Current authority

Google Photos export is images-only.
Video slides remain in the project and can be saved/played on this iPad,
but are skipped for Google Photos export.

- 書き出し対象は写真だけ（`image/jpeg` / `image/png` / `image/webp`）
- `video/mp4` / `video/quicktime`はunsupported errorにせずskipする
- album順は元project内の写真相対順
- 動画だけの作品はexportしない。空albumを作らない。Photos OAuthも開始しない
- 画像は再encodeし、captionをburn-inする
- Google Photos exportの正式pathでは動画5GiB limitを使わない。画像200 MiBは維持。Drive動画5GiBは変更しない
- 重複判定は書き出す写真だけ。動画duplicateだけではblockしない
- Drive publication / 「このiPadに保存」 / Player動画再生は変更しない
- caption font sizeはimageHeight基準。最大2行。truncateなし。長文のみ縮小
- 2026-08-21 images-only + caption normalization Preview acceptance passed
- 2026-08-21 images-only + caption normalization Production acceptance passed
- 動画だけの作品の実機acceptanceは未実施。contract / test済み。passedとは書かない

過去のJPEG caption burn-in v1 / v2と、2026-08-21 Production acceptanceはhistorical evidenceとして残す。当時の「動画もstream uploadする」記述は現行仕様ではない。

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
- 同じ写真Drive assetを複数slideで使う作品は`duplicateSlidesUnsupported`でblockする。動画duplicateだけではblockしない
- 画像: export用画像へcaptionを焼き込む。空captionでもraw original bytesは送らず再エンコードする
- 非空captionは最大2行。全文が収まらなければsilent truncationせず`imageRenderFailed`
- font sizeはimageHeight基準。短いcaptionでlandscapeだけ極端に大きくしない
- 動画: Google Photosへは書き出さない。作品・Drive・「このiPadに保存」・Playerには残る
- image 200 MiB以下。Google Photos exportの正式pathでは動画5GiB limitを使わない。Drive動画5GiBは維持
- 写真0件ならexportを開始しない。Photos token request / upload / album createをしない
- automatic retry / automatic publish / automatic repairは禁止
- Google Photos export失敗でもDrive source、publication、offline store、Playerを変更しない
- access tokenは非永続。React state / storage / Cookie / URL / UI / console / diagnosticsへ出さない

## 3. 実装済み内容

- `/admin` の「Googleフォトへ書き出す」review / confirm / progress / 完了UI
- Drive fresh preflightとwrite直前revalidation
- 画像は1枚ずつDrive読出 → Canvas再エンコード → rendered Blob → resumable upload
- JPEGはJPEG（quality 0.93）、PNGはPNG、WebPはWebP、encode不可時はPNG fallback
- 動画slideはexport planから除外する。upload token / resumable upload / batchCreate / album addへ渡さない
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
- MP4 / MOVはGoogle Photos export planへ入れない
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
- 実動画のGoogle Photos export（現行仕様では対象外。動画はskipする）
- 動画だけの作品で「書き出せる写真がありません」を出す経路の実機acceptance
- 実ネットワーク中断からのresume
- 200 MiB画像境界
- Drive動画の5 GiB境界
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
- 動画はCanvas renderしない。Google Photosへはuploadしない
- access tokenは非永続化する
- automatic retry禁止
- automatic publish禁止
- automatic repair禁止
- raw IDs / tokens / URLs / errorsをユーザー向け表示しない

## 13. Images-only + caption normalization Preview acceptance

2026-08-21 images-only Preview acceptance passed.

作業ブランチは`feature/google-photos-images-only`。このPreviewはProduction confirmationへ昇格させない。

確認した作品は写真5件 / 動画1件 / 全6スライド。

確認できたもの:

- export reviewは元のスライド数 6件、書き出す写真 5件、対象外の動画 1件
- Google Photos albumに写真5件のみ
- 今回のPhotos exportで動画はuploadされていない
- 写真の相対順を維持
- caption burn-in成功
- Drive上の写真・動画は変更なし
- 動画は作品に残る
- 「このiPadに保存」契約は維持
- Player動画契約は維持

caption normalizationの実機確認:

- portrait: 「もっちゅりんが美味しかった」
- landscape: 「おいしそう」
- small source image: 「もも」

旧width-basedよりportrait / landscapeの視覚サイズ差が明確に改善。user acceptanceは「いい感じに仕上がりました」。

Google connection 60-minute session Phase 2は停止中のまま。mainへは未merge。pushしていない記録はgit状態を正とする。

## 14. Images-only + caption normalization Production acceptance

2026-08-21 images-only + caption normalization Production acceptance passed.

main / Production deploymentで確認した。Preview-only evidence（v1 / v2 caption差分、Previewの個別caption文字列）はこのProduction confirmationへ含めない。

確認した作品は写真5件 / 動画1件 / 全6スライド。

確認できたもの:

- Google Photos exportは写真のみ
- reviewは書き出す写真 5件、対象外の動画 1件
- 新規albumには写真のみ
- 今回のPhotos exportで動画はuploadされていない
- 写真の相対順を維持
- caption burn-in成功
- imageHeight基準のcaption normalization実機確認
- portrait / landscape / small imageで見た目改善
- existing installed PWA正常
- Player動画の既存挙動も問題なし
- user acceptanceは全部OK

動画だけの作品でOAuth / upload / album作成へ進まない経路はcontract / test済み。実機acceptanceは未実施。passedとは書かない。
