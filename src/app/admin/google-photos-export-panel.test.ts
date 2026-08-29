import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = {
  panel: read("./google-photos-export-panel.tsx"),
  workspace: read("./admin-workspace.tsx"),
  providers: read("../app-providers.tsx"),
};

describe("google photos export review UI", () => {
  it("places a separate export card above Drive publish", () => {
    expect(source.workspace).toContain("<GooglePhotosExportPanel />");
    expect(source.workspace.indexOf("<GooglePhotosExportPanel />")).toBeLessThan(
      source.workspace.indexOf("<ProjectPublishPanel />"),
    );
    expect(source.panel).toContain("Googleフォトへ書き出す");
    expect(source.panel).toContain("動画は書き出しません");
    expect(source.panel).toContain("Driveの公開版作成とは別の操作です");
    expect(source.panel).not.toMatch(/公開URL|共有URL|共有リンク/);
  });

  it("shows progress and a Photos open link without calling it a share URL", () => {
    expect(source.panel).toContain("現在の写真:");
    expect(source.panel).toContain("完了済み:");
    expect(source.panel).not.toContain("現在のスライド:");
    expect(source.panel).toContain("アップロード:");
    expect(source.panel).toContain("Googleフォト用の画像を作成しています");
    expect(source.panel).toContain("Googleフォトへアップロードしています");
    expect(source.panel).toContain("中止");
    expect(source.panel).toContain("Googleフォトへの書き出しが完了しました");
    expect(source.panel).toContain("Googleフォトで開く");
    expect(source.panel).toContain("result.productUrl");
    expect(source.panel).toContain(
      "共有する場合はGoogleフォトでアルバムを開き、Googleフォトの共有機能からリンクを作成してください。",
    );
    expect(source.panel).not.toContain("共有リンク");
  });

  it("shows completed upload count and an in-session resume action", () => {
    expect(source.panel).toContain("completedSlides");
    expect(source.panel).toContain("枚までアップロード済みです。");
    expect(source.panel).toContain("続きから再開");
    expect(source.panel).toContain("この画面を開いている間");
    expect(source.panel).not.toContain(">再開<");
    expect(source.panel).not.toContain("sessionUrl");
    expect(source.panel).not.toContain("uploadToken");
  });

  it("requires the album confirmation checkbox before export", () => {
    expect(source.panel).toContain(
      "Googleフォトに新しいアルバムを作成することを確認しました",
    );
    expect(source.panel).toContain("disabled={!confirmed || disabled}");
    expect(source.panel).toContain("Googleアカウントの保存容量を使用します。");
    expect(source.panel).toContain("表示時間はGoogleフォトへ引き継がれません。");
    expect(source.panel).toContain(
      "画像スライドのテロップは、Googleフォト用の画像に焼き込んで書き出します。",
    );
    expect(source.panel).toContain(
      "画像のテロップは、Googleフォトの説明にも保存します。",
    );
    expect(source.panel).toContain(
      "動画はGoogleフォトへ書き出しません。アルバムとDrive上の動画はそのまま残ります。",
    );
    expect(source.panel).toContain("書き出し対象外");
    expect(source.panel).toContain("review.exportPhotoCount");
    expect(source.panel).toContain("review.skippedVideoCount");
    expect(source.panel).toContain("review.sourceSlideCount");
    expect(source.panel).toContain("書き出す写真の合計容量");
    expect(source.panel).not.toContain("review.videoCount");
    expect(source.panel).not.toContain('label="スライド数"');
    expect(source.panel).not.toContain('label="動画"');
    expect(source.panel).toContain(
      "Google Drive上の元画像・元動画は変更しません。",
    );
    expect(source.panel).toContain("元素材と異なる場合があります。");
    expect(source.panel).not.toContain(
      "テロップはGoogleフォトの説明として書き出します。",
    );
    expect(source.panel).not.toContain(
      "同じ素材を使うスライドも、それぞれ1件として容量に含みます。",
    );
    expect(source.panel).not.toMatch(/重複スライドも別アイテムとして書き出す/);
    expect(source.panel).toContain("ローカルに保存");
  });

  it("asks the user to review again after the export source changes", () => {
    expect(source.panel).toContain('result.error.kind === "sourceChanged"');
    expect(source.providers).toContain(
      "commitGooglePhotosExportAfterFreshValidation",
    );
    expect(source.providers).not.toContain(
      "executeGooglePhotosExportWithAdapter({",
    );
    expect(source.providers).toContain('result.error.kind === "sourceChanged"');
  });

  it("does not persist or display Photos or Drive tokens", () => {
    expect(source.panel).not.toContain("accessToken");
    expect(source.panel).not.toContain("photosExportAccessTokenRef");
    expect(source.providers).toContain("googlePhotosRenderedImageRef");
    expect(source.providers).not.toContain(
      "setGooglePhotosRenderedImage",
    );
    expect(source.providers).not.toContain("localStorage");
    expect(source.panel).not.toContain("sessionStorage");
    expect(source.providers).toContain("assertGooglePhotosExportPlanIsImageOnly");
    expect(source.providers).toContain(
      "await requestPhotosExportAccessToken(requestSequence);",
    );
    expect(
      source.providers.indexOf("assertGooglePhotosExportPlanIsImageOnly(source.plan)"),
    ).toBeLessThan(
      source.providers.indexOf("await requestPhotosExportAccessToken(requestSequence);"),
    );
    expect(source.providers).toContain("photosExportAccessTokenRef");
    expect(source.providers).toContain("scope: GOOGLE_PHOTOS_EXPORT_SCOPE");
    expect(source.providers).toContain(
      "photosExportAccessTokenRef.current = tokenResponse.access_token",
    );
    expect(source.providers).not.toContain(
      "accessTokenRef.current = tokenResponse.access_token;\n    pendingRequest.resolve",
    );
  });

  it("uses a dedicated Photos export token client with appendonly only", () => {
    expect(source.providers).toContain("photosExportTokenClientRef");
    expect(source.providers).toContain(
      "photosExportTokenClientRef.current = oauth2.initTokenClient({",
    );
    expect(source.providers).toContain(
      "tokenClientRef.current = oauth2.initTokenClient({",
    );

    const driveInitStart = source.providers.indexOf(
      "tokenClientRef.current = oauth2.initTokenClient({",
    );
    const exportInitStart = source.providers.indexOf(
      "photosExportTokenClientRef.current = oauth2.initTokenClient({",
    );
    expect(driveInitStart).toBeGreaterThan(-1);
    expect(exportInitStart).toBeGreaterThan(driveInitStart);

    const driveInit = source.providers.slice(driveInitStart, exportInitStart);
    expect(driveInit).toContain("scope: DRIVE_FILE_SCOPE");
    expect(driveInit).not.toContain("handlePhotosExportTokenResponse");
    expect(driveInit).not.toContain("GOOGLE_PHOTOS_EXPORT_SCOPE");

    const exportInitEnd = source.providers.indexOf(
      'setGoogleStatus("notConnected")',
      exportInitStart,
    );
    const exportInit = source.providers.slice(exportInitStart, exportInitEnd);
    expect(exportInit).toContain("scope: GOOGLE_PHOTOS_EXPORT_SCOPE");
    expect(exportInit).toContain("include_granted_scopes: false");
    expect(exportInit).not.toContain("photospicker");
    expect(exportInit).not.toContain("DRIVE_FILE_SCOPE");
    expect(exportInit).toContain("handlePhotosExportTokenResponse");

    expect(source.providers).toContain(
      "const tokenClient = photosExportTokenClientRef.current;",
    );
    expect(source.providers).toContain(
      "scope: GOOGLE_PHOTOS_EXPORT_SCOPE,\n          include_granted_scopes: false,",
    );
    expect(source.providers).not.toContain("setPhotosExportAccessToken");
  });

  it("keeps sanitized export errors and does not render internal diagnostics", () => {
    expect(source.panel).toContain("{uiState.error.message}");
    expect(source.panel).not.toContain("diagnostics");
    expect(source.panel).not.toContain("assetDiagnostics");
    expect(source.panel).not.toContain("issueCodes");
    expect(source.providers).toContain(
      "return toGooglePhotosExportReviewResult(source);",
    );
  });
});

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
