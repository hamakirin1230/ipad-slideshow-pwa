# Vercel existing production confirmation handoff

Date: 2026-06-22

## 目的

Vercel移行ではなく、既存のVercel production運用状態を確認し、次作業の入口として固定する。

このhandoffではコードロジックを変更しない。Drive file物理削除、Drive file delete API、cleanup previewの実削除化、Photos Picker、offline sync、IndexedDB schema、player再生ロジックは扱わない。

## local state

- local path: `/Users/yokotashigehiro/src/ipad-slideshow-pwa`
- branch: `main`
- latest commit: `c72c269 Add unused asset delete preflight`
- latest commit sha: `c72c269ebdb9ceb2d1060d74bb8fa20bd350fbf4`
- working tree: clean
- remote: `https://github.com/hamakirin1230/ipad-slideshow-pwa.git`
- `.vercel/project.json`: ローカルには存在しない
- `.vercel`: `.gitignore`で除外済み

## verification

実行済み:

```bash
npm run lint
npm run build
git diff --check
```

結果:

- lint: pass
- build: pass
- diff-check: pass

## Vercel production

- Vercel project `ipad-slideshow-pwa` は既存。
- production alias: `https://ipad-slideshow-pwa.vercel.app/`
- production deployment state: READY
- production deployment commitはlocal latest commit `c72c269 Add unused asset delete preflight` と一致。
- root path配信で以下を確認済み:
  - `/settings/`: 200
  - `/admin/`: 200
  - `/player/`: 200
  - `/manifest.json`: 200
  - `/sw.js`: 200
- `next.config.ts` は `GITHUB_PAGES=true` の場合だけGitHub Pages用 `basePath: "/ipad-slideshow-pwa"` を付ける。
- Vercel root運用では `GITHUB_PAGES=true` を設定しない前提。

## Vercel project handling

以下は不要:

- Vercel project新規作成
- Vercel import
- `vercel link`
- `.vercel` のコミット

Dashboard上のGitHub連携が成立しており、production aliasも既存deploymentへ向いている。

## GitHub Actions

`.github/workflows/deploy.yml` はGitHub Pages用workflow。

現在の特徴:

- `main` pushで自動実行される
- `workflow_dispatch` でも手動実行できる
- build時に `GITHUB_PAGES: "true"` を設定する
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` はGitHub Repository Variablesから渡す
- `./out` をGitHub Pages artifactとしてdeployする

判断:

- 今すぐ削除しない。
- Vercel productionとは直接衝突していない。
- ただしmain pushで自動実行されるため、今後の混乱源にはなる。
- Vercel production確認済み後、別コミットで削除ではなく `workflow_dispatch` のみにする案が安全。
- GitHub Pagesは本番ではなく、履歴または手動確認用途に降格する方向。

今回のdocs固定では `.github/workflows/deploy.yml` は変更しない。

## 要ユーザー確認

Codex側で値を推測しない。Client ID、access token、Vercel token、Google Cloud credentialsは出力・要求・保存しない。

- Vercel Production Environment Variablesに `NEXT_PUBLIC_GOOGLE_CLIENT_ID` が設定されていること。
- Vercel Environment Variablesに `GITHUB_PAGES=true` が設定されていないこと。
- Google Cloud OAuth Authorized JavaScript originsに `https://ipad-slideshow-pwa.vercel.app` が入っていること。

## cleanup safety

- unused asset cleanupはpreview + readiness + preflight + confirm previewまで。
- cleanup preview / preflight / confirm previewはread-only。
- cleanup preview / preflight / confirm previewはPlayer snapshotやIndexedDBを変更しない。
- Drive file物理削除は未実装。
- Drive file delete APIはまだ実装しない。
- access token、Authorization header、raw Drive response、Blob本体、raw URLはUI / diagnostics / consoleに出さない。

## 次候補

- GitHub Actionsを別コミットで `workflow_dispatch` のみにする。
- README以外の古いGitHub Pages前提docsを、履歴と現行運用に分けて整理する。
- `/admin` unused asset cleanup preview tableの横スクロール表示を修正する。
