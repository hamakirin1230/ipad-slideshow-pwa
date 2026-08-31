import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = {
  panel: read("./google-photos-export-panel.tsx"),
  workspace: read("./admin-workspace.tsx"),
  providers: read("../app-providers.tsx"),
};

describe("Google Photos same-album sync UI", () => {
  it("places a same-album sync card above Drive publish", () => {
    expect(source.workspace).toContain("<GooglePhotosExportPanel />");
    expect(source.workspace.indexOf("<GooglePhotosExportPanel />")).toBeLessThan(
      source.workspace.indexOf("<ProjectPublishPanel />"),
    );
    expect(source.panel).toContain("Googleフォトと同期");
    expect(source.panel).toContain(
      "選択中のアルバムからGoogleフォトへ反映される変更を確認します。",
    );
    expect(source.panel).toContain("動画は対象外です");
  });

  it("uses a Drive-only review action without starting Photos sync", () => {
    const review = extractFunction(source.panel, "startReview");
    expect(review).toContain("prepareGooglePhotosSyncReview(");
    expect(review).toContain("controller.signal");
    expect(review).not.toContain("syncSelectedProjectToGooglePhotos");
    expect(review).not.toContain("requestAccessToken");
    expect(review).not.toContain("requestPhotosSyncAccessToken");
    expect(source.panel).toContain("同期内容を確認");
  });

  it("shows exact initial, update, and continuation action labels", () => {
    const labels = extractFunction(source.panel, "syncActionLabel");
    expect(labels).toContain('return "Googleフォトへ書き出す"');
    expect(labels).toContain('return "Googleフォトを更新"');
    expect(labels).toContain('return "Googleフォトの更新を続ける"');
  });

  it("shows mode-specific confirmation semantics", () => {
    const confirmation = extractFunction(source.panel, "confirmationText");
    expect(confirmation).toContain(
      "Googleフォトに新しい同期先アルバムを作成し、今後は同じアルバムを更新することを確認しました",
    );
    expect(confirmation).toContain(
      "同じGoogleフォトアルバムを現在の内容に更新することを確認しました",
    );
    expect(confirmation).toContain(
      "前回のGoogleフォト更新の続きから状態を確認して再開することを確認しました",
    );
    expect(source.panel).toContain("disabled={!confirmed || disabled}");
  });

  it("calls the sync action in the click stack before its first await", () => {
    const action = extractFunction(source.panel, "syncToGooglePhotos");
    const call = action.indexOf(
      "syncSelectedProjectToGooglePhotos(selectedProjectId)",
    );
    const firstAwait = action.indexOf("await ");

    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(firstAwait);
    expect(action).toContain("const resultPromise =");
    expect(action).toContain("const result = await resultPromise");
    expect(action.match(/syncSelectedProjectToGooglePhotos\(/g)).toHaveLength(1);
    expect(action.indexOf("actionInFlightRef.current = true")).toBeLessThan(call);
    expect(action).not.toContain("prepareGooglePhotosSyncReview");
  });

  it("shows safe before/after diffs, summaries, and legacy fallback", () => {
    expect(source.panel).toContain("review.diff.albumTitleChange.before");
    expect(source.panel).toContain("review.diff.albumTitleChange.after");
    expect(source.panel).toContain('<SummaryChip label="追加"');
    expect(source.panel).toContain('<SummaryChip label="削除"');
    expect(source.panel).toContain('<SummaryChip label="変更"');
    expect(source.panel).toContain('<SummaryChip label="並び替え"');
    expect(source.panel).toContain('return "素材"');
    expect(source.panel).toContain('return "テロップ"');
    expect(source.panel).toContain('return "表示時間"');
    expect(source.panel).toContain('return "画像調整"');
    expect(source.panel).toContain('return "順番"');
    expect(source.panel).toContain("前回の詳細は表示できません。");
    expect(source.panel).toContain("今回の同期内容のみ確認できます。");
    expect(source.panel).toContain("Googleフォト側の写真変更はありません。");
    expect(source.panel).toContain("変更前");
    expect(source.panel).toContain("変更後");
    expect(source.panel).toContain("item.displayName");
    expect(source.panel).toContain("review.skippedVideoCount");
  });

  it("maps all sanitized progress stages and exposes abort", () => {
    const progress = extractFunction(source.panel, "progressStageMessage");
    expect(progress).toContain("同期状態を確認しています。");
    expect(progress).toContain("同期先を準備しています。");
    expect(progress).toContain("写真を準備・アップロードしています。");
    expect(progress).toContain(
      "同期先アルバムの写真構成を更新しています。",
    );
    expect(progress).toContain("同期結果を確認しています。");
    expect(source.panel).toContain("progress.completedCount");
    expect(source.panel).toContain("progress.totalCount");
    expect(source.panel).toContain("abortGooglePhotosSync()");
    expect(source.panel).toContain("中止");
  });

  it("shows safe completed, no-change, authorization, and abort messages", () => {
    expect(source.panel).toContain("Googleフォトへの初回同期が完了しました。");
    expect(source.panel).toContain("Googleフォトの更新が完了しました。");
    expect(source.panel).toContain("Googleフォトは最新です。");
    expect(source.panel).toContain(
      "Googleフォト同期の利用許可を確認できませんでした。もう一度実行してください。",
    );
    expect(source.panel).toContain(
      "Googleフォト同期の利用許可がキャンセルされました。",
    );
    expect(source.panel).toContain(
      "更新を中止しました。GoogleフォトまたはDrive側の処理が途中まで進んでいる場合があります。状態を再確認してください。",
    );
  });

  it("fails closed for source changes and ambiguous recovery", () => {
    expect(source.panel).toContain(
      "前回のGoogleフォト同期処理中からアルバム内容が変更されています。自動では続行しません。",
    );
    expect(source.panel).toContain(
      "前回のGoogleフォト処理の結果を自動では確定できません。新しい同期先を自動作成したり、写真を再送したりしません。",
    );
    expect(source.panel).toContain(
      "Googleフォト側の処理結果を自動では判断できません。状態を再確認してください。",
    );
    expect(source.panel).toContain("状態を再確認");
  });

  it("maps target missing and invalid binding without IDs", () => {
    expect(source.panel).toContain(
      "同期先のGoogleフォトアルバムが見つかりません。自動で新しいアルバムは作成しません。",
    );
    expect(source.panel).toContain(
      "Googleフォト同期設定を一意に確認できません。自動修復は行いません。",
    );
    expect(source.panel).not.toContain("result.stage");
    expect(source.panel).not.toContain("{result.reason}");
  });

  it("discloses legacy unbound behavior without title-based auto-link", () => {
    expect(source.panel).toContain(
      "同期設定がない場合は新しい同期先を作成し、名前だけで既存アルバムへ自動関連付けしません。",
    );
    expect(source.panel).not.toContain("同名アルバムを検索");
    expect(source.panel).not.toContain("既存の同名");
  });

  it("discloses user-added and removed media semantics", () => {
    expect(source.panel).toContain(
      "ユーザー自身が同期先へ追加した写真は削除しません。",
    );
    expect(source.panel).toContain(
      "アルバムから外れた写真はGoogleフォトのライブラリに残る場合があります。",
    );
    expect(source.panel).toContain("同期について");
  });

  it("keeps Google Photos sync, local save, and publish separate", () => {
    expect(source.panel).toContain(
      "Driveの元画像・元動画、ローカル保存、公開状態は変更しません。",
    );
  });

  it("aborts stale review work on cancel, unmount, and project-key change", () => {
    expect(source.panel).toContain("reviewAbortRef.current?.abort()");
    expect(source.panel).toContain("requestSequenceRef.current += 1");
    expect(source.panel).toContain(
      'key={`${googleStatus}:${driveStatus}:${projectStatus}:${selectedProjectId ?? "none"}`}',
    );
  });

  it("does not expose internal IDs, tokens, URLs, runtime, or raw errors", () => {
    for (const forbidden of [
      "albumId",
      "mediaItemId",
      "operationId",
      "workspaceId",
      "projectFolderId",
      "sourceFingerprint",
      "renderKey",
      "sessionUrl",
      "uploadToken",
      "accessToken",
      "productUrl",
      "console.",
    ]) {
      expect(source.panel).not.toContain(forbidden);
    }
  });

  it("removes one-shot UI dependencies while preserving its backend", () => {
    for (const oldUiDependency of [
      "prepareGooglePhotosExportReview",
      "commitPreparedGooglePhotosExport",
      "cancelPreparedGooglePhotosExport",
      "abortGooglePhotosExport",
      "googlePhotosExportProgress",
    ]) {
      expect(source.panel).not.toContain(oldUiDependency);
      expect(source.providers).toContain(oldUiDependency);
    }
    expect(source.providers).toContain("GOOGLE_PHOTOS_EXPORT_SCOPE");
    expect(source.providers).toContain("photosExportAccessTokenRef");
  });
});

function extractFunction(text: string, name: string) {
  const start = text.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const candidates = [
    text.indexOf("\n  function ", start + 1),
    text.indexOf("\n  async function ", start + 1),
    text.indexOf("\nfunction ", start + 1),
    text.indexOf("\nasync function ", start + 1),
  ].filter((index) => index !== -1);
  const end = candidates.length === 0 ? undefined : Math.min(...candidates);
  return text.slice(start, end);
}

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
