import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(
  new URL("./settings/page.tsx", import.meta.url),
  "utf8",
);
const driveSettingsSource = readFileSync(
  new URL("./settings/drive-settings-panel.tsx", import.meta.url),
  "utf8",
);
const terminologyUiSource = [
  "./admin/asset-cleanup-preview-panel.tsx",
  "./admin/history/publish-history-client.tsx",
  "./admin/offline-confirmed-store-panel.tsx",
  "./admin/offline-sync-panel.tsx",
  "./admin/project-publish-panel.tsx",
  "./player/page.tsx",
  "./settings/drive-settings-panel.tsx",
]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n");

describe("production task copy", () => {
  it("keeps the three primary task routes on Home without a development roadmap", () => {
    for (const href of ["/player", "/admin", "/settings"]) {
      expect(homeSource).toContain(`href: "${href}"`);
    }

    expect(homeSource).not.toContain("次の開発候補");
    expect(homeSource).not.toContain("nextStepItems");
    expect(homeSource).not.toContain("現在の到達点");
  });

  it("keeps Settings focused on connection checks instead of implementation status", () => {
    expect(settingsSource).toContain("<DriveSettingsPanel />");
    expect(settingsSource).toContain("<OfflineDbCheckPanel />");
    expect(settingsSource).not.toContain("futureItems");
    expect(settingsSource).not.toContain("notImplementedItems");
    expect(settingsSource).not.toContain("まだ未実装");
    expect(settingsSource).not.toContain("次の候補");
  });

  it("describes a ready Drive workspace without claiming offline sync happened", () => {
    expect(driveSettingsSource).not.toContain("オフライン再生未対応");
    expect(driveSettingsSource).toContain(
      "保存や公開だけでは、この端末の再生用データは更新されません。",
    );
    expect(driveSettingsSource).toContain(
      "remoteOnly動画は動画本体を端末に保存せず",
    );
  });

  it("preserves the existing Google and Drive button guards", () => {
    for (const guard of [
      "disabled={!canConnect}",
      "disabled={!canCheckDrive}",
      "disabled={!canResetGoogleAuth}",
      "disabled={isDriveCreating}",
      "disabled={!canDisconnect}",
    ]) {
      expect(driveSettingsSource).toContain(guard);
    }
  });

  it("uses production-facing terminology in the audited UI copy", () => {
    for (const legacyCopy of [
      "confirmed store",
      "staging manifest",
      "preflight済み asset",
      "未使用 asset",
      "Goal ",
      "Phase ",
      "第Nゴール",
      "第1ゴール",
      "Provider内部のuseRef",
      "AppProviders内",
      "manifestPath:",
      "remoteOnly video",
    ]) {
      expect(terminologyUiSource).not.toContain(legacyCopy);
    }

    for (const productionCopy of [
      "端末保存データ",
      "公開前確認",
      "確認済み素材を物理削除",
      "remoteOnly動画",
    ]) {
      expect(terminologyUiSource).toContain(productionCopy);
    }

    for (const internalIdentifierPresentation of [
      "title={project.projectIdPart}",
      "title={candidate.workspaceIdPart}",
      "title={asset.assetIdPart}",
      "title={asset.assetFileIdPart}",
      "value={asset.assetIdPart}",
      "value={asset.assetFileIdPart}",
      "title={item.assetIdPart}",
      "title={item.assetFileIdPart}",
      "value={item.assetIdPart}",
      "value={item.assetFileIdPart}",
      "{formatIdPart(project.projectId)}",
    ]) {
      expect(terminologyUiSource).not.toContain(
        internalIdentifierPresentation,
      );
    }

    expect(terminologyUiSource).toContain("Google Driveから完全削除します");
    expect(terminologyUiSource).toContain("取り消せません");
  });
});
