# 第4-3 素材追加・assets保存 設計決定メモ

* 対象プロジェクト: `ipad-slideshow-pwa`
* 対象フェーズ: 第4ゴール / 第4-3 素材追加・assets保存
* ステータス: 第4-3-1 実装前設計
* 最終更新日: 2026-06-04
* 参照元:
  * `docs/decisions/goal-04-drive-workspace.md`
  * `docs/decisions/goal-04-drive-workspace-create.md`
  * `docs/decisions/goal-04-2-project-create.md`
  * `docs/verification/goal-04-2-project-create-completion.md`

---

## 1. 目的

第4-3では、Google Photos Pickerで選んだ写真を、Drive上の既存プロジェクト配下に保存し、`manifest.json.slides[]` と結びつける。

第4-3の第1スライスである第4-3-1では、外部APIを実行しない。

第4-3-1では、設計docs、型、状態、UI土台だけを追加する。

---

## 2. 基本方針

Google Photos Pickerは素材の取り込み元として扱う。

Driveの `projects/{projectId}/assets/` は保存先として扱う。

`manifest.json` はプロジェクトの正本として扱う。

正本とは、後で表示や同期の判断に迷ったとき、最終的に信頼するデータのこと。

Google Photosの `baseUrl` は期限付きの取得URLなので、`manifest.json` には保存しない。

---

## 3. Drive上の保存先

第4-2で作成済みのDrive構造を前提にする。

```text
iPad Slideshow PWA Workspace/
├─ workspace.json
├─ index.json
└─ projects/
   └─ {projectId}/
      ├─ manifest.json
      └─ assets/
      