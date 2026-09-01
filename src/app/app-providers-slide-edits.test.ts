import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./app-providers.tsx", import.meta.url), "utf8");
const start = source.indexOf("async function updateProjectSlideEdits(");
const end = source.indexOf("async function updateProjectSlideCaption(", start);
const updateSource = source.slice(start, end);

describe("AppProviders unified slide edits", () => {
  it("calls one unified Drive operation and refreshes project details", () => {
    expect(start).toBeGreaterThan(-1);
    expect(updateSource.match(/await updateDriveProjectSlideEdits\(/g)).toHaveLength(1);
    expect(updateSource).toContain("...input,");
    expect(updateSource).toContain(
      "applyProjectReadyState(result.project, toProjectDetails(result.details))",
    );
    expect(updateSource).toContain("変更を保存しました。");
    expect(updateSource).not.toContain("テロップを保存しました");
    expect(updateSource).not.toContain("表示時間を保存しました");
    expect(updateSource).not.toContain("startOfflineSync");
  });

  it("blocks duplicate submission and keeps stale failures fail-closed", () => {
    expect(updateSource).toContain("getSlideEditBlockedReason");
    expect(updateSource).toContain("setDriveOperationInFlight(true)");
    expect(updateSource).toContain("setSlideEditsUpdateSlideId(input.slideId)");
    expect(updateSource).toContain("内容が更新されています。Drive状態を再確認してください。");
    expect(updateSource).toContain("自動再試行せず");
    expect(updateSource).not.toContain("retry");
  });

  it("does not expose token, identifiers, or raw errors through the UI message", () => {
    const errorSource = updateSource.slice(updateSource.indexOf("} catch (error)"));
    expect(updateSource).not.toContain("setSlideEditMessage(error.message)");
    expect(updateSource).not.toContain("setSlideEditDiagnostics(error.diagnostics)");
    expect(updateSource).not.toContain("JSON.stringify(error)");
    expect(errorSource).not.toContain("accessToken:");
  });
});
