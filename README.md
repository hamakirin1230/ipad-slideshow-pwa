# スライドショー

iPadで安定して再生するためのスライドショーPWAです。

このプロジェクトでは、PCでスライドショーを管理・編集し、iPadでは同期・検証・再生を行うことを目指します。
最優先は、学校現場・イベント現場で本番中に止まらないことです。

## 現在の到達点

現在は第4-1まで完了しています。

* Google Driveワークスペースを作成できる
* 作成済みワークスペースを再確認し、`ready` と判定できる
* `/settings`、`/admin`、`/player` でDrive状態を共有表示できる
* GitHub Pages公開版とiPadホーム画面PWAで基本確認済み

詳細な完了確認は以下を参照してください。

* `docs/verification/goal-04-1-drive-create-completion.md`

## 現在使える画面

* `/` トップ画面
* `/settings` 設定画面
* `/admin` 管理画面
* `/player` 再生画面

## 次の作業候補

次の作業候補は、第4-2: プロジェクト作成設計です。

Driveワークスペースが `ready` になった後、プロジェクト一覧である `index.json` と、将来の `projects/{projectId}/manifest.json` をどう扱うかを設計します。

## 今後の主な未実装

* プロジェクト作成
* スライド・素材情報の保存
* Google Photos Picker連携
* IndexedDB同期
* オフライン本番再生
* Driveワークスペースの自動修復

## 使用技術

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui
* npm
* GitHub
* GitHub Pages
* Google OAuth
* Google Drive API

## 公開URL

https://hamakirin1230.github.io/ipad-slideshow-pwa/

## ローカル起動

```bash
npm run dev
```

ローカル確認URL:

```text
http://localhost:3000/ipad-slideshow-pwa/
```

## ビルド確認

```bash
npm run build
```

## ドキュメント

* `docs/requirements.md`
* `docs/roadmap.md`
* `docs/setup-windows.md`
* `docs/decisions.md`
* `docs/architecture.md`
* `docs/data-flow.md`
* `docs/risk-register.md`
* `docs/decisions/goal-04-drive-workspace.md`
* `docs/decisions/goal-04-drive-workspace-create.md`
* `docs/verification/goal-04-1-drive-create-completion.md`
