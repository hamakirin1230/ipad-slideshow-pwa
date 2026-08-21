# Google Photos export acceptance

Date: 2026-08-21

Status:
Preview / real Google Photos image-caption acceptance passed.
2026-08-21 Production acceptance passed.
2026-08-21 images-only + caption normalization Preview acceptance passed.
2026-08-21 images-only + caption normalization Production acceptance passed.

この文書は、Google Photos書き出しについて、local validation、code audit、Preview確認、実Google Photos手動確認、Production確認を段階別に記録する。各段階で再実行していない操作を、その段階の確認結果へ含めない。Previewのv1 / v2 caption差分はPreview evidenceとして維持し、Production confirmationへ昇格させない。

## Scope

対象は、選択中Drive projectの写真だけをGoogle Photosの新規albumへ書き出す機能である。

- `/admin` から「Googleフォトへ書き出す」
- Google Photos export is images-only
- 正式export対象は`image/jpeg` / `image/png` / `image/webp`
- 画像captionはexport用画像へburn-inする。font sizeはimageHeight基準
- 動画slideは作品とDriveと「このiPadに保存」/ Playerに残るが、Google Photosへはskipする
- 動画が存在してもexport全体をblockしない
- 動画だけの作品はexportしない。空albumは作らない。Photos OAuth / upload / album作成へ進まない
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
- MP4 / MOVはGoogle Photos export planへ入れない。upload token / resumable upload / batchCreate / album addへ渡さない
- 写真0件ならPhotos token requestを開始しない
- Photos exportは専用GoogleTokenClientを使う
- 要求scopeは`photoslibrary.appendonly`のみ
- `include_granted_scopes`はfalse
- Drive token clientおよびPhotos Picker token flowとは分離する
- rendered image Blobは現在の画像1枚だけを非永続refに保持する
- success / sourceChanged / cancel / resume不可ではrendered Blobを破棄する
- access tokenはReact state / Context / storage / Cookie / URL / UI / console / diagnosticsへ出さない

## Preview verification

Vercel Preview上でGoogle Photos exportの実行経路を使い、後述の実Google Photos manual acceptanceを行った。Preview deploymentはREADYだった。temporary Preview URLは記録しない。

このPreview確認はProduction confirmationへ昇格させない。Production acceptanceは後述の別sectionで記録する。

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

## Video skip contract

Google Photos exportの現行契約はimages-onlyである。動画経路のDrive range stream → Photos resumable uploadは、正式runtime pathではない。

動画slideは:

- 作品manifestに残る
- Drive assetとして残る
- 「このiPadに保存」できる
- Playerで再生できる

一方Google Photos exportでは:

- unsupported errorにしない
- upload tokenを作らない
- resumable uploadを開始しない
- batchCreate / album addへ渡さない
- 動画だけの作品では空albumを作らない

Drive動画5GiB契約は変更しない。Google Photos exportの正式pathでは動画5GiB limitを使わない。

2026-08-21、混在作品（写真5件 / 動画1件 / 全6スライド）のPreviewとProductionで、動画skipと写真5件だけのalbum作成を確認した。動画だけの作品で「書き出せる写真がありません」を出す契約は維持するが、そのケースの実機acceptanceは未実施である。passedとは書かない。

## Images-only + caption normalization Preview acceptance

2026-08-21 images-only Preview acceptance passed.

Vercel Previewから実Google Photosへ書き出した結果だけを記録する。temporary Preview URL、token、Drive / Photos IDは記録しない。このPreview sectionはPreview evidenceであり、v1 / v2 caption差分と同じくProduction confirmationと区別する。

確認した作品:

- 写真5件 / 動画1件 / 全6スライド

確認できたもの:

| 対象 | 結果 |
| --- | --- |
| Google Photos exportは写真のみ | OK |
| export reviewが元のスライド数 6件、書き出す写真 5件、対象外の動画 1件 | OK |
| 新albumに写真5件のみ作成 | OK |
| 今回のPhotos exportで動画はuploadされていない | OK |
| 写真の相対順を維持 | OK |
| caption burn-in | OK |
| Drive上の写真・動画は変更なし | OK |
| 動画は作品に残る | OK |
| 「このiPadに保存」契約は維持 | OK |
| Player動画契約は維持 | OK |

caption normalizationも実機確認した。確認caption:

- portrait: 「もっちゅりんが美味しかった」
- landscape: 「おいしそう」
- small source image: 「もも」

旧width-based sizingより、portrait / landscapeの視覚サイズ差が明確に改善した。user acceptanceは「いい感じに仕上がりました」。

現行caption契約:

- すべてのexport画像を再encodeする
- captionを画像下部へburn-inする
- 最大2行
- truncateなし
- font sizeはimageHeight基準
- 長文のみ2行に収まるまで縮小する
- background / font / colorは既存維持

## Images-only + caption normalization Production acceptance

2026-08-21 images-only + caption normalization Production acceptance passed.

main / Production deployment上で確認した範囲だけを記録する。Preview-only evidence（v1 / v2 caption差分、Previewで使った個別caption文字列）はこのProduction confirmationへ含めない。token、Drive / Photos ID、temporary URLは記録しない。

確認した作品:

- 写真5件 / 動画1件 / 全6スライド

確認できたもの:

| 対象 | 結果 |
| --- | --- |
| main / Production deployment | 正常 |
| Google Photos exportは写真のみ | OK |
| export reviewが書き出す写真 5件、対象外の動画 1件 | OK |
| 新規albumには写真のみ | OK |
| 今回のPhotos exportで動画はuploadされていない | OK |
| 写真の相対順を維持 | OK |
| caption burn-in | OK |
| imageHeight基準のcaption normalization | OK |
| portrait / landscape / small imageの見た目改善 | OK |
| existing installed PWA | 正常 |
| Player動画の既存挙動 | 問題なし |

user acceptanceは「全部OK」。

動画だけの作品で「Googleフォトへ書き出せる写真がありません。」としてPhotos OAuth / upload / album作成へ進まない経路は、contract / test済みである。実機acceptanceは未実施のまま。passedとは書かない。

## Explicitly unverified items

次は今回確認済みへ昇格しない。

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
- OAuth consent画面上でのscope文言目視
- 60分Google接続維持

既存の未確認事項も解決済みへしない。

- multi-tab publication race
- exact 5 GiB upload境界
- publication abnormal write A/B/C real Drive completion
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

Google Photos v1 / v2はPreview runtime evidenceとして保持する。Productionではv1 / v2差分検証を再実施していない。

## Production acceptance

2026-08-21 Production acceptance passed.

Productionで確認した範囲:

- Home / navigation。正常表示。「再生する」「編集する」が動作
- Settings explicit Google reconnect。明示的な「Googleへ接続」で正常接続。refresh後は未接続へ戻る。自動account chooserは出ない
- `/system`。正常表示。Google / Drive / 端末状態に大きな異常なし
- Admin tabs。作品 / スライド / 公開 / このiPad の4tabが切替可能。作品一覧は正常
- project card photo/video counts。各作品カードが「写真 X ・ 動画 Y」
- selected-project offline save + exact Player playback。選択作品を「このiPadに保存」し、「この作品を再生」でその作品がPlayerで正常再生
- real Google Photos new album export。Productionから実Google Photosへexport成功。新しいalbum作成を確認
- image caption burn-in visible。画像caption burn-inを目視確認
- existing installed PWA launch。既存インストール済みPWAが正常起動

Previewで確認済みだったv1 / v2 caption evidenceは維持する。Productionではv1 / v2差分検証を再実施していないので、そこはPreview evidenceとして区別する。

現在のGoogle接続仕様:

- access tokenは非永続
- page refresh後は未接続
- ユーザーが明示的に「Googleへ接続」する
- page-load token requestなし
- automatic account chooserなし

「60分接続維持」は未解決のままである。authorization code flow / backend方式は別branchの検討対象とする。

未確認項目は「Explicitly unverified items」のまま残す。確認していない操作をverifiedへ昇格しない。
