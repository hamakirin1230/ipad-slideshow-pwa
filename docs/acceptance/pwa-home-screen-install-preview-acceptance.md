# PWA home screen install Preview acceptance

Date: 2026-08-26

Status:
Preview PASS.
This document remains Preview evidence only.
Production acceptance is not yet recorded.

対象機能:
- トップ `/` の「ホーム画面に追加」案内
- iPadOS 16.4以降
- Safari / Chrome / Edge向け案内
- browser別copy
- standalone起動時のinstall guide非表示
- PWAホーム画面アイコン更新

これはPreview上の実iPad functional acceptanceである。Preview観測内容をProduction evidenceへ書き換えない。Production acceptanceは未実施である。

temporary Preview hostname / URL、deployment ID、access token、session ID、Drive ID、projectId、revision ID、operation ID、hash、raw API errorは記録しない。不要なcommit SHAも記録しない。

## Scope

対象は、通常browserでトップ `/` を開いたときに「ホーム画面に追加」案内を確認し、実iPadでPreview版をホーム画面へ追加してstandalone起動できることである。OSのインストールUIをWebアプリから直接起動する機能の確認ではない。

- iPadOS 16.4以降を対象とする
- Safari / Chrome / Edge向けの共通手順と、browser別copyを案内する
- standalone判定authorityは`display-mode: standalone OR navigator.standalone`である
- UAはstandalone判定には使用しない
- browser UA判定は案内copy selection専用である
- `beforeinstallprompt`には依存しない

## Implemented Preview acceptance

2026-08-26、Vercel Previewと実iPadでfunctional acceptanceを実施した。最終Preview acceptance観測時、Vercel Preview deploymentはREADYだった。temporary Preview URLとdeployment IDは記録しない。

Safari / Chrome / Edgeそれぞれで、通常browser表示のトップ `/` から「ホーム画面に追加」案内を開いた。各browser向けcopyと共有アイコン表示に問題はなかった。実iPadでPreview版をホーム画面へ追加し、新しいアプリアイコンとアプリ名を目視し、ホーム画面アイコンからstandalone起動できた。standalone起動時は「ホーム画面に追加」が表示されず、「再生する」から `/player` を正常に開けた。実際のホーム画面追加をどのbrowserから実行したかは、明示的なevidenceがないため記録しない。acceptance観測中のPreview runtime error / warning / fatalは0件だった。

| 項目 | 結果 |
| --- | --- |
| SafariでPreviewトップを開き、「ホーム画面に追加」が表示される | PASS |
| Safari向けに「Safariで開いています」とSafariの共有ボタン手順が表示される | PASS |
| ChromeでPreviewトップを開き、Chrome向け案内が表示される | PASS |
| Chrome向けに「Chromeで開いています」とChromeの共有手順が表示される | PASS |
| EdgeでPreviewトップを開き、Edge向け案内が表示される | PASS |
| Edge向けに「Edgeで開いています」とEdgeの共有メニュー手順が表示される | PASS |
| 共有操作の表示が、四角から上向き矢印が出る共有アイコンである | PASS |
| 実iPadでPreview版をホーム画面へ追加できる | PASS |
| 新しいアプリアイコンが表示される | PASS |
| 新アイコンは青系背景、写真フレーム、中央の再生マークである | PASS |
| iPadの角丸マスクで主要部分が切れず、見た目に問題ない | PASS |
| ホーム画面のアプリ名は「スライドショー」 | PASS |
| ホーム画面アイコンからstandaloneで起動できる | PASS |
| standalone起動時は「ホーム画面に追加」が表示されない | PASS |
| standalone状態から「再生する」で `/player` を正常に開ける | PASS |
| 明らかなlayout崩れやhorizontal overflowがない | PASS |
| 最終観測時のPreview deploymentはREADY | PASS |
| acceptance観測中にPreview runtime error / warning / fatalなし | PASS |

## Implementation contracts recorded during acceptance

- standalone判定authorityは`display-mode: standalone OR navigator.standalone`
- UAはstandalone判定には使用しない
- browser UA判定は案内copy selection専用
- Edge → Chrome → Safari → other のbest-effort browser判定
- 判定不能時はcommon fallback copy
- `beforeinstallprompt`には依存しない
- Home pageはServer Componentのまま
- install guideのみClient Component
- initial SSRではinstall guideを描画しない
- persistent dismissalなし
- localStorage / sessionStorage / IndexedDB / Cookieへinstall-guide状態を保存しない
- manifestは `start_url: "/"`、`scope: "/"`、`display: "standalone"` を維持
- manifest iconは192 / 512 PNG
- Apple touch iconは180 PNG
- OAuth / Drive / Photos / IndexedDB / Player authority / Service Workerの挙動は変更していない

## Local validation that is not real-device evidence

実装commit時のlocal validationはPASS済みである。これはreal-device Preview acceptanceとは別のlocal test evidenceである。実機確認の代替にはしない。

- `pnpm test`: PASS（93 files / 1322 tests）
- `pnpm lint`: PASS
- `pnpm build`: PASS
- `git diff --check`: PASS

## Not accepted / not verified

このPreview文書の記録時点では以下を未実施とした。この文書はPreview evidenceとして残す。Production confirmationへ昇格させない。

- Productionでのホーム画面追加
- Productionでの新アイコン目視
- Production standalone起動
- ProductionでのSafari / Chrome / Edge browser別案内
- iPadOS 16.3以前
- Android専用install workflow
- desktop専用install workflow
