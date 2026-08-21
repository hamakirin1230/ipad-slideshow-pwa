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
  it("keeps Home focused on playback and editing", () => {
    for (const href of ["/player", "/admin", "/settings", "/system"]) {
      expect(homeSource).toContain(`href="${href}"`);
    }

    expect(homeSource).toContain("再生する");
    expect(homeSource).toContain("つくる");
    expect(homeSource).not.toContain("編集する");
    expect(homeSource).not.toContain("次の開発候補");
    expect(homeSource).not.toContain("nextStepItems");
    expect(homeSource).not.toContain("現在の到達点");
    expect(homeSource).not.toMatch(/Vercel|IndexedDB|offline-first|Drive workspace/);
  });

  it("keeps Settings focused on connection setup and links to system status", () => {
    expect(settingsSource).toContain("<DriveSettingsPanel />");
    expect(settingsSource).not.toContain("<OfflineDbCheckPanel />");
    expect(settingsSource).toContain('href="/system"');
    expect(settingsSource).toContain("接続で困ったとき");
    expect(settingsSource).not.toContain("futureItems");
    expect(settingsSource).not.toContain("notImplementedItems");
    expect(settingsSource).not.toContain("まだ未実装");
    expect(settingsSource).not.toContain("次の候補");
  });

  it("describes a ready Drive workspace without claiming offline sync happened", () => {
    expect(driveSettingsSource).not.toContain("オフライン再生未対応");
    expect(driveSettingsSource).toContain(
      "作品の編集、公開、このiPadへの保存は「つくる」から明示的に実行します。",
    );
    expect(terminologyUiSource).toContain(
      "オンライン再生用の情報だけをこのiPadに保持し、本体は保存しません。",
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
      "オンライン再生のみの動画",
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
