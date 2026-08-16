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
    expect(source.panel).toContain("Driveの公開版作成とは別の操作です");
    expect(source.panel).not.toMatch(/公開URL|共有URL|共有リンク/);
  });

  it("shows progress and a Photos open link without calling it a share URL", () => {
    expect(source.panel).toContain("全体:");
    expect(source.panel).toContain("現在のスライド:");
    expect(source.panel).toContain("アップロード:");
    expect(source.panel).toContain("中止");
    expect(source.panel).toContain("Googleフォトへの書き出しが完了しました");
    expect(source.panel).toContain("Googleフォトで開く");
    expect(source.panel).toContain("result.productUrl");
    expect(source.panel).toContain(
      "共有する場合はGoogleフォトでアルバムを開き、Googleフォトの共有機能からリンクを作成してください。",
    );
    expect(source.panel).not.toContain("共有リンク");
  });

  it("requires the album confirmation checkbox before export", () => {
    expect(source.panel).toContain(
      "Googleフォトに新しいアルバムを作成することを確認しました",
    );
    expect(source.panel).toContain("disabled={!confirmed || disabled}");
    expect(source.panel).toContain("Googleアカウントの保存容量を使用します。");
    expect(source.panel).toContain("表示時間はGoogleフォトへ引き継がれません。");
    expect(source.panel).toContain("テロップはGoogleフォトの説明として書き出します。");
    expect(source.panel).toContain("同じ素材を使うスライドも、それぞれ1件として容量に含みます。");
    expect(source.panel).toContain("このiPadに保存");
  });

  it("does not persist or display Photos or Drive tokens", () => {
    expect(source.panel).not.toContain("accessToken");
    expect(source.panel).not.toContain("photosExportAccessTokenRef");
    expect(source.panel).not.toContain("localStorage");
    expect(source.panel).not.toContain("sessionStorage");
    expect(source.providers).toContain("photosExportAccessTokenRef");
    expect(source.providers).toContain("scope: GOOGLE_PHOTOS_EXPORT_SCOPE");
    expect(source.providers).toContain(
      "photosExportAccessTokenRef.current = tokenResponse.access_token",
    );
    expect(source.providers).not.toContain(
      "accessTokenRef.current = tokenResponse.access_token;\n    pendingRequest.resolve",
    );
  });
});

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
