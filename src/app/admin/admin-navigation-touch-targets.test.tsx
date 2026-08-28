import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = {
  page: read("./page.tsx"),
  workspace: read("./admin-workspace.tsx"),
  project: read("./project-status-panel.tsx"),
  import: read("./asset-import-panel.tsx"),
  edit: read("./drive-project-workspace-panel.tsx"),
  cleanup: read("./asset-cleanup-preview-panel.tsx"),
  publish: read("./project-publish-panel.tsx"),
  offlineSync: read("./offline-sync-panel.tsx"),
  confirmedStore: read("./offline-confirmed-store-panel.tsx"),
  system: read("../system/system-status-overview.tsx"),
  player: read("../player/page.tsx"),
  driveSettings: read("../settings/drive-settings-panel.tsx"),
  offlineDb: read("../settings/offline-db-check-panel.tsx"),
};

describe("admin creative workspace", () => {
  it("keeps the page thin and provides four accessible workspace tabs", () => {
    expect(source.page).toContain("<AdminWorkspace />");
    expect(source.workspace).toContain('role="tablist"');
    expect(source.workspace).toContain('role="tab"');
    expect(source.workspace).toContain("aria-selected={selected}");
    expect(source.workspace).toContain("aria-controls={tab.id}");
    expect(source.workspace).toContain("tabIndex={selected ? 0 : -1}");
    expect(source.workspace).toContain("min-h-11");

    for (const [id, label] of [
      ["project", "アルバム"],
      ["edit", "スライド"],
      ["device", "ローカル"],
      ["publish", "公開"],
    ]) {
      expect(source.workspace).toContain(`{ id: "${id}", label: "${label}" }`);
    }
  });

  it("removes the old anchor dashboard while preserving deep-link hashes", () => {
    expect(source.workspace).not.toContain("作業セクション");
    expect(source.workspace).not.toContain("AdminSectionLink");
    expect(source.workspace).toContain("window.location.hash.slice(1)");
    expect(source.workspace).toContain("window.history.replaceState");
  });

  it("keeps every existing pane mounted and hides only inactive panels", () => {
    expect(source.workspace).toContain("hidden={activeTab !== id}");
    expect(source.workspace).toContain('role="tabpanel"');
    for (const panel of [
      "<ProjectStatusPanel />",
      "<DriveProjectWorkspacePanel />",
      "<GooglePhotosExportPanel />",
      "<ProjectPublishPanel />",
      "<OfflineSyncPanel />",
      "<OfflineConfirmedStorePanel />",
    ]) {
      expect(source.workspace).toContain(panel);
    }
  });

  it("supports tab keyboard navigation", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
      expect(source.workspace).toContain(`event.key === "${key}"`);
    }
  });

  it("keeps project diagnostics collapsed and recheck controls in support", () => {
    expect(source.project).toContain('<ProductDisclosure label="詳しい状態を見る">');
    expect(source.project).toContain("projectDiagnostics");
    expect(source.project).not.toContain("onClick={checkDriveWorkspace}");
    expect(source.project).not.toContain("onClick={checkProject}");
    expect(source.system).toContain("driveDiagnostics");
    expect(source.system).toContain("projectDiagnostics");
    expect(source.system).toContain("onClick={checkDriveWorkspace}");
    expect(source.system).toContain("onClick={checkProject}");
  });

  it("removes editing dashboard counts and duplicated ready context", () => {
    expect(source.edit).not.toMatch(/Driveプロジェクト数|選択中Driveプロジェクト|Drive確認済み/);
    expect(source.workspace).toContain("countProjectMedia(projectDetails?.slides)");
    expect(source.workspace).toContain("formatProjectMediaCounts(mediaCounts)");
    expect(source.workspace).not.toContain("formatUiCount(slideCount)");
    expect(source.workspace).not.toContain("formatUiCount(assetCount)");
  });

  it("passes the selected app project to Player without an implicit fallback link", () => {
    expect(source.workspace).toContain(
      "createPlayerProjectLinkHref(selectedId)",
    );
    expect(source.publish).toContain(
      "createPlayerProjectLinkHref(selectedProjectId)",
    );
    expect(source.workspace).not.toContain('<Link href="/player">');
    expect(source.publish).not.toContain('<Link href="/player">');
  });

  it("plays only a confirmed selected project and otherwise guides to this iPad", () => {
    expect(source.workspace).toContain("readOfflineProjectPlaybackReadiness(selectedId)");
    expect(source.workspace).toContain(
      "if (requestId !== readinessRequestIdRef.current)",
    );
    expect(source.workspace).toContain(
      "checkedPlaybackReadiness?.projectId === selectedId",
    );
    expect(source.workspace).toContain("playbackReadiness === \"ready\"");
    expect(source.workspace).toContain("ローカルに保存");
    expect(source.workspace).toContain('onClick={() => selectTab("device")}');
    expect(source.workspace).toContain("再生準備を確認中");
    expect(source.workspace).not.toContain("createPlayerProjectLinkHref(projectSummary.projectId)");
    expect(source.workspace).not.toContain("readOfflinePlaybackSnapshot");
    expect(source.offlineSync).toContain(
      "createPlayerProjectLinkHref(selectedProjectId)",
    );
    expect(source.offlineSync).toContain("このアルバムを再生");
    expect(source.offlineSync).not.toContain('<Link href="/player">');
  });

  it("guides an unavailable requested project back to this iPad storage", () => {
    expect(source.player).toContain(
      "このアルバムはまだローカルに保存されていません",
    );
    expect(source.player).toContain("unavailableProjectSnapshot");
    expect(source.player).toContain(
      '<Link href={{ pathname: "/admin", hash: "device" }}>',
    );
    expect(source.player).toContain("getPlayerEmptySnapshotView");
    expect(source.player).not.toContain("削除後なら正常な状態です");
    expect(source.player).not.toContain(
      "unavailableProjectSnapshot.diagnostics",
    );
  });
});

describe("admin and settings touch target contracts", () => {
  it.each([
    [source.system, "onClick={checkDriveWorkspace}", "disabled={!canCheckDriveWorkspace}"],
    [source.system, "onClick={checkProject}", "disabled={!canCheckProject}"],
    [source.import, "onClick={openLocalImageFilePicker}", "disabled={!canStartAssetImport}"],
    [source.import, "onClick={openLocalVideoFilePicker}", "disabled={!canStartAssetImport}"],
    [source.import, "onClick={startAssetImport}", "disabled={!canStartAssetImport}"],
    [source.edit, "onClick={handleDeleteSelectedSlides}", "disabled={!canDeleteSelectedSlides}"],
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

  it("keeps each whole project card touch-sized and selection guarded", () => {
    expect(source.project).toContain('aria-pressed={isSelected}');
    expect(source.project).toContain("min-h-11 w-full rounded-xl");
    expect(source.project).toContain("if (!isSelected) onSelect(project.projectId)");
    expect(source.project).toContain("disabled={disabled}");
    expect(source.project).toContain("onSelect={selectProject}");
  });
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

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
