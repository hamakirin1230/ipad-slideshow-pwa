# 動画再生・手動retry・unit test・CI 引き継ぎ

Date: 2026-07-12

## 概要

iPadスライドショーPWAの動画再生フェーズは、ローカル動画追加、offline Blob再生、大容量動画のremoteOnly運用、Drive streaming、duration override、再生失敗時の手動retryまで実装済みです。

主productionはVercelです。GitHub Pagesは手動deployと履歴確認用であり、主productionではありません。

このhandoff作成時点の最新commitは次のとおりです。

```text
5449e8b ci: run tests before build and deploy
```

## 完了commit

```text
e93eb93 feat: add slide duration editing in admin playlist
4ff2dbc feat: apply video duration override in player
8dc7ce4 chore: clarify remote video offline status
909ad57 chore: clarify offline sync recovery states
261a621 fix: clarify unavailable remote video playback
90319ef feat: add manual retry for remote video playback
1c79a69 fix: harden remote video retry lifecycle
f7f4e85 test: cover remote video retry state guards
5449e8b ci: run tests before build and deploy
```

## 現行仕様

- `/admin/`から端末上のローカル動画をDrive assetとして追加し、動画slideをmanifestへ保存する。
- offline保存対象assetは50MBを上限とし、対象動画本体をIndexedDB Blobとしてconfirmed storeへ保存する。
- 上限超過動画はremoteOnly metadataとしてconfirmed storeへ残し、動画本体はIndexedDBへ保存しない。
- remoteOnly動画はofflineでは再生できない。onlineかつGoogle接続済みの場合にDrive streamingで再生する。
- 動画slideのduration overrideは、設定秒数が動画実時間より短い場合だけ適用する。pause / buffering / seeking中はoverrideで進めない。
- remote videoの再生失敗時は、ユーザー操作による手動retry、前のslide、次のslideを提供する。失敗後の自動nextは行わない。
- retry stateは現在のproject / snapshot / slideだけに所属し、古い非同期結果や古いvideo eventを現在の再生状態へ反映しない。
- retry中はpolite live region、再生失敗はalertで一般文言だけを通知する。
- retry可否、owner key、generation、source identity、unavailable reasonはpure helperへ分離し、Vitestで検証する。
- GitHub Actionsの`CI` workflowはmainへのpush、pull request、手動実行でinstall / test / lint / production buildを行う。
- GitHub Pagesの手動deployもtest / lint成功後にPages用buildとdeployを行う。

## 重要制約

- Google認可情報はAppProviders内部のmemoryだけに保持し、永続化しない。
- 認可情報、取得先、streaming内部識別子、Drive assetの完全な識別子、raw response、転送範囲の実値をUI、diagnostics、console、docsへ出さない。
- 50MBはoffline保存対象assetの上限であり、端末ストレージ全体の上限ではない。
- 1GB級動画をIndexedDB Blobへ保存しない。
- remoteOnly動画をoffline再生可能とは扱わない。
- online復帰やGoogle再接続だけで自動retryしない。
- 動画を自動unmuteしない。音声ONはユーザー操作からだけ行う。
- Drive fileの物理削除とDrive delete APIは未実装のままにする。
- server-side proxyとDrive public sharingを追加しない。
- 動画要素は`muted`、`playsInline`、`autoPlay`、`controls={false}`、`preload="auto"`を維持する。

## 検証

通常のローカル検証はpnpm 10系で行います。

```bash
pnpm test
pnpm lint
pnpm build
```

- Vitest: 1 file / 22 tests
- CI job名: `Test, lint, and build`
- CI install: `pnpm install --frozen-lockfile`

## Production

主production:

```text
https://ipad-slideshow-pwa.vercel.app/
```

ユーザー確認情報として、次のcommitはVercel productionでREADY確認済みです。

```text
5449e8bdbb58d8d3e9cfb12b41b3937d015d6b0b
```

## 未確認・ユーザー側確認

- `5449e8b` push後のGitHub Actions CI run成功確認。
- 必要に応じてGitHub Rulesets / branch protectionで`Test, lint, and build`をrequired status checkへ設定する。
- iPad実機でremoteOnly動画のoffline案内、online再生失敗、手動retry、前後移動を運用確認する。
- remote streamingの実通信を伴うretry成功経路は、ローカルのpure unit testや静的visual-checkだけでは完了確認できない。

## 次の推奨作業

1. 公開履歴に利用できる現在のデータ構造を監査する。
2. read-only公開履歴一覧のデータモデルと画面を設計する。
3. rollback対象、復元範囲、Drive workspace / manifest / confirmed storeの整合性を設計する。
4. 物理削除や破壊的rollbackはまだ実装しない。
