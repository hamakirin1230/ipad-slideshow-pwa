import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const layoutSource = read("./layout.tsx");
const homeSource = read("./page.tsx");
const appShellSource = read("../components/app-shell.tsx");
const navigationSource = read("../components/app-navigation.tsx");
const systemPageSource = read("./system/page.tsx");
const systemOverviewSource = read("./system/system-status-overview.tsx");
const adminSource = read("./admin/page.tsx");
const playerSource = read("./player/page.tsx");

describe("focused product experience contract", () => {
  it("adds the system route and wraps regular pages in the shared app shell", () => {
    expect(existsSync(new URL("./system/page.tsx", import.meta.url))).toBe(true);
    expect(layoutSource).toContain("<AppShell>{children}</AppShell>");
    expect(appShellSource).toContain('pathname === "/player"');
    expect(appShellSource).toContain("pb-[calc(5.5rem+env(safe-area-inset-bottom))]");
    expect(systemPageSource).toContain("<SystemStatusOverview />");
  });

  it("provides four primary navigation destinations with active-route semantics", () => {
    for (const [href, label] of [
      ["/", "Home"],
      ["/admin", "管理"],
      ["/player", "再生"],
      ["/system", "システム"],
    ]) {
      expect(navigationSource).toContain(`href: "${href}"`);
      expect(navigationSource).toContain(`label: "${label}"`);
    }

    expect(navigationSource).toContain('aria-label="メインナビゲーション"');
    expect(navigationSource).toContain('aria-current={active ? "page" : undefined}');
    expect(navigationSource).toContain("min-h-12");
    expect(navigationSource).toContain("env(safe-area-inset-bottom)");
  });

  it("turns Home into a simple launch surface", () => {
    expect(homeSource).toContain("再生する");
    expect(homeSource).toContain("編集する");
    expect(homeSource).toContain("接続・端末の状態を見る");
    expect(homeSource).not.toMatch(/Vercel|IndexedDB|offline-first|Drive workspace/);
    expect(homeSource).not.toContain("taskItems");
    expect(homeSource).not.toContain("<Card");
  });

  it("groups quiet system status without rendering internal identifiers", () => {
    for (const category of [
      "Google / Drive",
      "プロジェクト",
      "端末データ",
      "同期 / 公開整合性",
    ]) {
      expect(systemOverviewSource).toContain(`title="${category}"`);
    }

    for (const internalPresentation of [
      ">{project.projectId}<",
      "title={project.projectId}",
      "value={project.projectId}",
      ">{project.assetId}<",
      "title={project.assetId}",
      "value={project.assetId}",
    ]) {
      expect(systemOverviewSource).not.toContain(internalPresentation);
    }

    expect(systemOverviewSource).toContain("未公開の変更あり");
    expect(systemOverviewSource).toContain("この端末の再生データは現在の公開内容と一致しています");
  });

  it("removes always-visible Drive status summaries from task screens", () => {
    expect(adminSource).not.toContain("DriveStatusSummary");
    expect(playerSource).not.toContain("DriveStatusSummary");
  });
});
