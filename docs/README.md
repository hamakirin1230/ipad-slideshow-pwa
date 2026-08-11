# Documentation index

このindexは、現在の正式運用ガイドと、過去時点の設計・検証記録を区別するための入口です。現在の実装や運用を判断するときは、まずCurrentの文書だけを読み、Historicalをsource of truthとして扱わないでください。

## まず読む文書

1. [`../README.md`](../README.md) — 製品の現在地、主要機能、ローカル検証方法
2. [`current-context.md`](current-context.md) — 2026-08-12時点の最新作業引き継ぎと実装境界
3. [`environment-security.md`](environment-security.md) — runtime environmentとVercel security headerの現行契約
4. [`release-rollback.md`](release-rollback.md) — Vercel productionのrelease / rollback運用

現在の正式productionはVercelのみです。GitHub Pages deployは廃止済みで、GitHub ActionsはCIとして継続します。package managerは`pnpm@10.34.4`に固定します。

## Current

次の文書を、現在の作業判断に使うauthoritative guidanceとします。

- [`../README.md`](../README.md)
- [`current-context.md`](current-context.md)
- [`environment-security.md`](environment-security.md)
- [`release-rollback.md`](release-rollback.md)

Currentに記載がない詳細はproduction codeとtestsで確認し、古い文書だけから現在仕様を推測しません。

## Historical

次はその時点の意思決定、設計、実装状況を保存した記録です。本文に「未実装」、GitHub Pages、npm、旧route、旧schema案などが残っていても、現在仕様へ書き換えません。

- [`handoffs/`](handoffs/) — dated handoff。当時の実装・acceptance・未実施事項の記録
- [`decisions/`](decisions/) と [`decisions.md`](decisions.md) — 過去decisionと初期方針
- [`architecture.md`](architecture.md)、[`requirements.md`](requirements.md)、[`roadmap.md`](roadmap.md)、[`risk-register.md`](risk-register.md) — 初期フェーズの設計・要件・計画
- [`setup-windows.md`](setup-windows.md)、[`data-flow.md`](data-flow.md)、[`video-playback-design.md`](video-playback-design.md) — 当時の環境・data flow・実装前設計
- Currentに列挙していないその他のtop-level design文書 — 作成日、Status、実装結果を確認するための補助資料

HistoricalとCurrentが衝突する場合はCurrentを優先します。dated handoffは完了・未実施の根拠として参照できますが、現在の運用入口ではありません。

## Acceptance / evidence

- [`acceptance/publication-write-abnormal-acceptance-plan.md`](acceptance/publication-write-abnormal-acceptance-plan.md) — publication write異常系の承認済み試験計画。temporary harnessの履歴を含むが、実Google DriveでのA/B/C完了記録はない
- [`verification/`](verification/) — 各時点の検証記録
- [`handoffs/`](handoffs/) — 実環境・実機acceptanceを含むdated evidence

計画、local test、Vercel確認、実Google Drive確認、実iPad確認は別のevidenceです。記録がない段階を実施済みへ昇格させません。

## 更新ルール

- production behaviorや正式運用が変わったら、`../README.md`と`current-context.md`を同じ変更で更新する
- historical handoffや過去decisionの本文は、現在仕様に合わせて遡及rewriteしない
- 古いtop-level文書が誤読され得る場合は、本文を改変せずHistorical bannerまたはこのindexの分類を更新する
- 未実施acceptanceを完了扱いせず、実施済みevidenceを未実施へ戻さない
- token、Drive ID、revision ID、hash、raw URL、raw error、temporary Preview URLをdocsへ記録しない
- local validationはrepositoryの`pnpm@10.34.4`契約に従う
