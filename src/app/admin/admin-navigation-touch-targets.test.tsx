import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AdminPage from "./page";

vi.mock("./project-status-panel", () => ({
  ProjectStatusPanel: () => <div data-panel="project-status" />,
}));

vi.mock("./drive-project-workspace-panel", () => ({
  DriveProjectWorkspacePanel: () => <div data-panel="workspace" />,
}));

vi.mock("./project-publish-panel", () => ({
  ProjectPublishPanel: () => <div data-panel="publish" />,
}));

vi.mock("./offline-sync-panel", () => ({
  OfflineSyncPanel: () => <div data-panel="offline-sync" />,
}));

vi.mock("./offline-confirmed-store-panel", () => ({
  OfflineConfirmedStorePanel: () => <div data-panel="confirmed-store" />,
}));

const source = {
  project: read("./project-status-panel.tsx"),
  import: read("./asset-import-panel.tsx"),
  workspace: read("./drive-project-workspace-panel.tsx"),
  cleanup: read("./asset-cleanup-preview-panel.tsx"),
  offlineSync: read("./offline-sync-panel.tsx"),
  confirmedStore: read("./offline-confirmed-store-panel.tsx"),
  driveSettings: read("../settings/drive-settings-panel.tsx"),
  offlineDb: read("../settings/offline-db-check-panel.tsx"),
};

describe("admin section navigation", () => {
  const markup = renderToStaticMarkup(<AdminPage />);

  it("renders four descriptive section anchors and matching labelled sections", () => {
    expect(markup).toContain('aria-label="管理画面の主要セクション"');

    for (const [id, label] of [
      ["project", "プロジェクト"],
      ["edit", "編集"],
      ["publish", "公開"],
      ["device", "端末同期・保存"],
    ] as const) {
      expect(markup).toContain(`href="#${id}"`);
      expect(markup).toContain(`id="${id}"`);
      expect(markup).toContain(`aria-labelledby="admin-${id}-heading"`);
      expect(markup).toContain(label);
    }
  });

  it("keeps navigation targets touch-sized and ordered by the task flow", () => {
    const links = markup.match(/<a[^>]*href="#[^"]+"[^>]*>/g) ?? [];

    expect(links).toHaveLength(4);
    for (const link of links) {
      expect(link).toContain("min-h-11");
      expect(link).toContain("min-w-0");
    }

    expect(markup.indexOf('id="project"')).toBeLessThan(
      markup.indexOf('id="edit"'),
    );
    expect(markup.indexOf('id="edit"')).toBeLessThan(
      markup.indexOf('id="publish"'),
    );
    expect(markup.indexOf('id="publish"')).toBeLessThan(
      markup.indexOf('id="device"'),
    );
  });

  it("keeps existing panels in the section matching their operation", () => {
    expect(markup).not.toContain('data-panel="drive-status"');
    expect(sectionMarkup(markup, "project", "edit")).toContain(
      'data-panel="project-status"',
    );
    expect(sectionMarkup(markup, "edit", "publish")).toContain(
      'data-panel="workspace"',
    );
    expect(sectionMarkup(markup, "publish", "device")).toContain(
      'data-panel="publish"',
    );
    expect(sectionMarkup(markup, "device")).toContain(
      'data-panel="offline-sync"',
    );
    expect(sectionMarkup(markup, "device")).toContain(
      'data-panel="confirmed-store"',
    );
  });
});

describe("admin and settings touch target contracts", () => {
  it.each([
    [source.project, "selectProject(project.projectId)", "disabled={isSelected || isDriveOperationInFlight}"],
    [source.project, "onClick={checkDriveWorkspace}", "disabled={!canCheckDriveWorkspace}"],
    [source.import, "onClick={startAssetImport}", "disabled={!canStartAssetImport}"],
    [source.workspace, "onClick={handleDeleteSelectedSlides}", "disabled={!canDeleteSelectedSlides}"],
    [source.cleanup, "onClick={previewUnusedProjectAssets}", "isAssetCleanupPreviewInFlight"],
    [source.offlineSync, "onClick={startOfflineSync}", "disabled={!canStartOfflineSync || isOfflineSyncInFlight}"],
    [source.confirmedStore, "onClick={handleCheckConfirmedStore}", "disabled={isChecking || isClearingProject}"],
    [source.driveSettings, "onClick={connectGoogle}", "disabled={!canConnect}"],
    [source.driveSettings, "onClick={checkDriveWorkspace}", "disabled={!canCheckDrive}"],
    [source.offlineDb, "onClick={handleCheckOfflineDb}", 'disabled={checkState.status === "checking"}'],
  ])(
    "keeps a major action touch-sized without replacing its handler or disabled guard",
    (componentSource, handler, disabledGuard) => {
      const button = openingButton(componentSource, handler);

      expect(button).toContain("min-h-11");
      expect(button).toContain(handler);
      expect(button).toContain(disabledGuard);
    },
  );
});

function openingButton(componentSource: string, handler: string) {
  const handlerIndex = componentSource.indexOf(handler);
  expect(handlerIndex).toBeGreaterThanOrEqual(0);

  const start = componentSource.lastIndexOf("<Button", handlerIndex);
  const end = componentSource.indexOf(">", handlerIndex);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(handlerIndex);

  return componentSource.slice(start, end + 1);
}

function sectionMarkup(markup: string, id: string, nextId?: string) {
  const start = markup.indexOf(`<section id="${id}"`);
  const end = nextId
    ? markup.indexOf(`<section id="${nextId}"`, start)
    : markup.length;

  return markup.slice(start, end);
}

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
