# 第4-3 素材追加・assets保存 設計決定メモ

* 対象プロジェクト: `ipad-slideshow-pwa`
* 対象フェーズ: 第4ゴール / 第4-3 素材追加・assets保存
* 現在のスライス: 第4-3-2 Google Photos Picker選択まで
* ステータス: 第4-3-2 実装前設計確定
* 最終更新日: 2026-06-04
* 参照元:
  * `docs/decisions/goal-04-drive-workspace.md`
  * `docs/decisions/goal-04-drive-workspace-create.md`
  * `docs/decisions/goal-04-2-project-create.md`
  * `docs/verification/goal-04-2-project-create-completion.md`
  * `docs/verification/goal-04-3-1-asset-import-foundation-completion.md`

---

## 1. 目的

第4-3では、Google Photos Pickerで選んだ写真を、Drive上の既存プロジェクト配下に保存し、`manifest.json.slides[]` と結びつける。

Google Photos Pickerは素材の取り込み元として扱う。

Driveの `projects/{projectId}/assets/` は保存先として扱う。

`manifest.json` はプロジェクトの正本として扱う。

正本とは、後で表示や同期の判断に迷ったとき、最終的に信頼するデータのこと。

Google Photosの `baseUrl` は期限付きの取得URLなので、`manifest.json` には保存しない。

---

## 2. 第4-3全体の基本方針

第4-3全体では、次の順序で素材追加を行う。

```text
Photos取得
→ Drive assets/ 保存
→ Drive metadata検証
→ 最新manifest再読込
→ slides[] append
→ manifest保存
→ 再読込検証
