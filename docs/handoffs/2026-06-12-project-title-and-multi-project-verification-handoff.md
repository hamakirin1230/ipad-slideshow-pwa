# Project title and multi-project verification handoff

Date: 2026-06-12

## Summary

`/admin` の複数 project 運用で Project A / Project B を安全に識別できるように、Drive project title の作成時入力と選択中 project の title 変更を追加した。

## Implemented

- 新規 project 作成時に `project title` を入力する UI を追加
- title は trim 後に保存し、空文字と 40 文字超を拒否
- デフォルト候補は既存 project 数から `Project A` / `Project B` のように提示
- `createDriveProject()` が title 引数を受け取り、`index.json.projects[].title` と `manifest.json.title` に同じ値を保存
- 選択中 project が ready の場合に title 変更できる UI を追加
- title 変更時は `index.json` と `manifest.json` を再読込し、対象 `projectId` と現行整合を確認してから更新
- title 変更後は `manifest.json.title` と `index.json.projects[].title` の両方を再読込して検証
- 途中失敗時は自動修復せず、manifest / index のどこまで進んだ可能性があるか診断を表示

## Changed files

- `src/lib/google-drive.ts`
- `src/app/app-providers.tsx`
- `src/app/admin/project-status-panel.tsx`
- `docs/handoffs/2026-06-12-project-title-and-multi-project-verification-handoff.md`

## Title storage

project title は表示名として扱い、内部識別子ではない。

- `index.json.projects[].title`
- `projects/<projectId>/manifest.json.title`

内部処理、offline sync、confirmed store、`/player/?projectId=...` は引き続き `projectId` を正とする。

## Consistency policy

title 変更は以下の順序で行う。

1. `index.json` と対象 `manifest.json` を再読込する
2. `index.json.projects` の対象 `projectId` と現行 summary を検証する
3. `manifest.json` の `workspaceId / projectId / title / createdAt / updatedAt` が index 側と一致することを検証する
4. `manifest.json.title` と `manifest.json.updatedAt` を更新する
5. 書き込み直前に `index.json` を再読込し、他 project を保持したまま対象 project だけ更新する
6. 更新後に `index.json` と `manifest.json` を再読込し、title と updatedAt の整合を確認する

不整合や判断不能な競合がある場合は自動修復しない。

## Local verification

実装後に確認するコマンド:

```bash
npm run lint
npm run build
git diff --check
```

## Production verification checklist

1. `/admin` を開く
2. Project A が既にある場合、title を `Project A` に変更する
3. 新規 project 作成欄に `Project B` と入力する
4. Project B を作成する
5. Drive project 一覧に Project A / Project B が区別して表示される
6. Project B を選択できる
7. Project B に素材を1件追加できる
8. Project B を offline sync できる
9. confirmed projects に A / B が2件残る
10. `/player` の selector で A / B が区別して表示される
11. `/player/?projectId=<Project A>` で A が再生できる
12. `/player/?projectId=<Project B>` で B が再生できる

## Known constraints

- project 削除、複製、並び替えは未対応
- project title は一意制約を持たない
- 壊れた Drive project の自動修復は未対応
- confirmed store の容量制御は未対応
- title 変更後の confirmed store 反映には対象 project の offline sync が必要
