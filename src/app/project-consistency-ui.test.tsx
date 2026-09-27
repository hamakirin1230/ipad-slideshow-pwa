import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectReadFixture, projectId } from "@/lib/project-read-model.test-fixtures";
import { PROJECT_SUMMARY_STALE_REASON, PROJECT_SUMMARY_STALE_WARNING } from "@/lib/project-consistency";

const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("./app-providers", () => ({ useAppState: () => state.value }));
import { ProjectStatusPanel } from "./admin/project-status-panel";
import { SystemStatusOverview } from "./system/system-status-overview";
import { ProjectSlideCaptionStyleSettings } from "./admin/project-slide-caption-style-settings";
import { ProjectSlideTransitionSettings } from "./admin/project-slide-transition-settings";
import { ProjectPublishPanel } from "./admin/project-publish-panel";
import { GooglePhotosExportPanel } from "./admin/google-photos-export-panel";
import { DriveProjectWorkspacePanel } from "./admin/drive-project-workspace-panel";

beforeEach(() => {
  const f = projectReadFixture();
  const summary = { ...f.project, title: "内容の作品", slideCount: 1, assetCount: 1, photoCount: 1, videoCount: 0, otherCount: 0 };
  state.value = {
    googleStatus: "connected", googleStatusLabel: "接続済み", googleMessage: "",
    driveStatus: "ready", driveStatusLabel: "利用可能", driveMessage: "", driveDiagnostics: [],
    projectStatus: "ready", projectStatusLabel: "利用可能", projectConsistency: "summaryStale",
    selectedProjectId: projectId, projectSummary: summary, driveProjects: [summary],
    projectMessage: "内容を確認できます。", projectDiagnostics: [],
    projectDeleteStatus: "idle", projectDeleteMessage: "", projectDeleteDiagnostics: [],
    projectDeleteBlockedReason: PROJECT_SUMMARY_STALE_REASON,
    projectDeleteReview: null, projectDeleteLocalCopyStatus: "notAttempted",
    offlineSyncStatus: "idle", offlineSyncStatusLabel: "保存待ち", offlineSyncMessage: "",
    checkProject: vi.fn(), selectProject: vi.fn(), checkDriveWorkspace: vi.fn(),
    projectDetails: { slides: f.manifest.slides, slideCount: 1, assetCount: 1 },
    slideEditBlockedReason: PROJECT_SUMMARY_STALE_REASON,
    slideReorderBlockedReason: PROJECT_SUMMARY_STALE_REASON,
    slideEditDiagnostics: [], slideReorderDiagnostics: [],
    assetImportStatus: "idle", assetImportBatch: [], assetImportDiagnostics: [],
    assetImportBlockedReason: PROJECT_SUMMARY_STALE_REASON,
    canStartAssetImport: false, assetImportBatchSummary: {},
    assetCleanupPreviewStatus: "idle", assetCleanupPreviewResult: null,
    assetCleanupPreviewDiagnostics: [], assetCleanupDeletePreflightDiagnostics: [],
    assetCleanupDeleteDiagnostics: [], assetCleanupDeleteBlockedReason: PROJECT_SUMMARY_STALE_REASON,
  };
});

describe("stale project presentation", () => {
  it("Admin retains the manifest title, warns, and disables update controls", () => {
    const html = renderToStaticMarkup(<ProjectStatusPanel />);
    expect(html).toContain("内容の作品");
    expect(html).toContain(PROJECT_SUMMARY_STALE_WARNING);
    expect(html).not.toContain("アルバムの情報を確認できません");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*アルバムを作成/);
    expect(html).toMatch(/<input[^>]*disabled=""/);
  });

  it("system separates usable content from stale list information", () => {
    const html = renderToStaticMarkup(<SystemStatusOverview />);
    expect(html).toContain("内容の作品");
    expect(html).toContain("利用可能");
    expect(html).toContain("一覧情報");
    expect(html).toContain("同期が必要");
    expect(html).not.toContain("未選択");
    for (const secret of [projectId, "fixture-", "2026-08-22T", "raw API", "manifest.json"]) {
      expect(html).not.toContain(secret);
    }
  });

  it("keeps the actual slide list visible with editing blocked", () => {
    const html = renderToStaticMarkup(<DriveProjectWorkspacePanel />);
    expect(html).toContain("スライド一覧（1件）");
    expect(html).toContain("内容を確認");
    expect(html).toContain(PROJECT_SUMMARY_STALE_REASON);
    expect(html).not.toContain("編集するアルバムを選択してください");
  });

  it("disables style, transition, publish and Photos update controls", () => {
    for (const component of [<ProjectSlideCaptionStyleSettings key="caption" />, <ProjectSlideTransitionSettings key="transition" />, <ProjectPublishPanel key="publish" />, <GooglePhotosExportPanel key="photos" />]) {
      const html = renderToStaticMarkup(component);
      expect(html).toContain('disabled=""');
    }
  });

  it.each(["synced", null])("does not show the stale warning for %s", consistency => {
    state.value.projectConsistency = consistency;
    expect(renderToStaticMarkup(<ProjectStatusPanel />)).not.toContain(PROJECT_SUMMARY_STALE_WARNING);
  });

  it.each(["invalid", "error"])("keeps %s distinct", status => {
    state.value.projectStatus = status;
    state.value.projectConsistency = null;
    state.value.projectSummary = null;
    const html = renderToStaticMarkup(<ProjectStatusPanel />);
    expect(html).toContain("アルバムの情報を確認できません");
    expect(html).not.toContain(PROJECT_SUMMARY_STALE_WARNING);
  });
});
