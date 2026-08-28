import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const source = {
  providers: read("./app-providers.tsx"),
  navigation: read("../components/app-navigation.tsx"),
  disclosure: read("../components/product-disclosure.tsx"),
  dialog: read("../components/product-alert-dialog.tsx"),
  workspace: read("./admin/admin-workspace.tsx"),
  projects: read("./admin/project-status-panel.tsx"),
  edit: read("./admin/drive-project-workspace-panel.tsx"),
  import: read("./admin/asset-import-panel.tsx"),
  publish: read("./admin/project-publish-panel.tsx"),
  device: read("./admin/offline-sync-panel.tsx"),
  confirmedStore: read("./admin/offline-confirmed-store-panel.tsx"),
  player: read("./player/page.tsx"),
  settings: read("./settings/drive-settings-panel.tsx"),
  systemPage: read("./system/page.tsx"),
  system: read("./system/system-status-overview.tsx"),
};

describe("beginner-first product experience", () => {
  it("uses friendly navigation and workspace labels without changing routes or tab ids", () => {
    for (const [route, label] of [
      ["/", "ホーム"],
      ["/admin", "つくる"],
      ["/player", "再生"],
      ["/system", "サポート"],
    ]) {
      expect(source.navigation).toContain(`href: "${route}", label: "${label}"`);
    }

    for (const [id, label] of [
      ["project", "アルバム"],
      ["edit", "スライド"],
      ["device", "ローカル"],
      ["publish", "公開"],
    ]) {
      expect(source.workspace).toContain(`{ id: "${id}", label: "${label}" }`);
    }
    expect(source.systemPage).toContain("サポート");
  });

  it("never represents unknown project counts as zero and makes the whole card selectable", () => {
    expect(source.providers).toContain("slideCount: details?.slideCount ?? null");
    expect(source.providers).toContain("assetCount: details?.assetCount ?? null");
    expect(source.providers).toContain("const summary = toProjectSummary(project, details)");
    expect(source.providers).toContain("const nextProjectSummary = toProjectSummary(");
    expect(source.providers).toContain("photoCount: counts.photoCount");
    expect(source.providers).toContain("videoCount: counts.videoCount");
    expect(source.providers).toContain("otherCount: counts.otherCount");
    expect(source.projects).toContain("formatProjectMediaCounts(");
    expect(source.projects).toContain("projectMediaCountsFromSummary(project)");
    expect(source.projects).toContain("formatUiDateTime(project.updatedAt)");
    expect(source.projects).not.toContain("formatUiCount(project.slideCount)");
    expect(source.projects).not.toContain("formatUiCount(project.assetCount)");
    expect(source.projects).toContain("aria-pressed={isSelected}");
    expect(source.projects).not.toContain("この作品を選択");
  });

  it("keeps normal explanations and diagnostics behind default-collapsed disclosures", () => {
    expect(source.disclosure).toContain("<details");
    expect(source.disclosure).not.toMatch(/\sopen=/);
    expect(source.edit).toContain('label="使い方を見る"');
    expect(source.import).toContain('label="素材追加の詳細"');
    expect(source.settings).toContain('label="詳しい状態・診断"');
    expect(source.system.match(/<StatusSection title=/g)).toHaveLength(4);
  });

  it("keeps recovery-only auth reset and neutral unchecked support status", () => {
    const recoveryStart = source.settings.indexOf("{canResetGoogleAuth ? (");
    const resetAction = source.settings.indexOf("onClick={resetGoogleAuthFlow}");
    expect(recoveryStart).toBeGreaterThanOrEqual(0);
    expect(resetAction).toBeGreaterThan(recoveryStart);
    expect(source.settings).toContain("接続をやり直す");
    expect(source.system).toContain('status="未確認"');
    expect(source.system).toContain('tone="neutral"');
  });

  it("keeps publish and device actions clear without fabricating a public URL", () => {
    expect(source.publish).toContain("今の内容を公開版にします");
    expect(source.publish).toContain("公開前に確認");
    expect(source.publish).toContain("ローカルのアルバムを再生");
    expect(source.publish).toContain("公開履歴");
    expect(source.publish).toContain("formatUiDateTime(result.publishedAt)");
    expect(source.publish).not.toMatch(/公開URL|共有URL/);
    expect(source.device).toContain("ローカルに保存");
    expect(source.device).toContain("createPlayerProjectLinkHref(selectedProjectId)");
    expect(source.device).toContain("このアルバムを再生");
    expect(source.device).not.toContain('<Link href="/player">');
    for (const productSurface of [
      source.publish,
      source.device,
      source.confirmedStore,
      source.player,
    ]) {
      expect(productSurface).not.toMatch(/端末へ同期|端末への同期/);
    }
  });

  it("replaces slide deletion confirm with an accessible destructive dialog", () => {
    expect(source.edit).not.toContain("window.confirm");
    expect(source.confirmedStore).not.toContain("window.confirm");
    expect(source.confirmedStore).toContain("<ProductAlertDialog");
    expect(source.edit).toContain("<ProductAlertDialog");
    expect(source.dialog).toContain('role="alertdialog"');
    expect(source.dialog).toContain('aria-modal="true"');
    expect(source.dialog).toContain('event.key === "Escape"');
    expect(source.dialog).toContain("triggerElement?.focus()");
    expect(source.edit).toContain("Google Drive上の素材ファイルは削除しません");
  });
});
