import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./app-providers.tsx", import.meta.url), "utf8");
const prepareSource = source.slice(
  source.indexOf("async function prepareProjectDeletion()"),
  source.indexOf("function cancelProjectDeletion()"),
);
const cancelSource = source.slice(
  source.indexOf("function cancelProjectDeletion()"),
  source.indexOf("async function confirmProjectDeletion()"),
);
const confirmSource = source.slice(
  source.indexOf("async function confirmProjectDeletion()"),
  source.indexOf("async function refreshAssetCleanupPreviewAfterDelete"),
);

describe("AppProviders project delete workflow wiring", () => {
  it("keeps the pending delete plan in a ref rather than public state", () => {
    expect(source).toContain("useRef<DriveProjectDeletePlan | null>(null)");
    expect(source).not.toContain("useState<DriveProjectDeletePlan");
    expect(source).not.toContain("projectDeletePlan:");
  });

  it("prepare uses fresh preflight and does not write", () => {
    expect(prepareSource).toContain("preflightDriveProjectDeletion");
    expect(prepareSource).toContain("prepareDriveProjectDeletion");
    expect(prepareSource).toContain('setProjectDeleteStatus("confirming")');
    expect(prepareSource).not.toContain("writeDriveProjectIndexForDeletion");
    expect(prepareSource).not.toContain("trashDriveProjectRootFolder");
    expect(prepareSource).not.toContain("clearLocalOfflineProjectData");
    expect(prepareSource).not.toContain("checkProject(");
  });

  it("clears the pending plan on blocked prepare", () => {
    expect(prepareSource).toContain("pendingProjectDeletePlanRef.current = null");
    expect(prepareSource).toContain('setProjectDeleteStatus("blocked")');
  });

  it("cancel does not write or clear local data", () => {
    expect(cancelSource).toContain("invalidatePendingProjectDeletion");
    expect(cancelSource).toContain('setProjectDeleteStatus("cancelled")');
    expect(cancelSource).not.toContain("writeDriveProjectIndexForDeletion");
    expect(cancelSource).not.toContain("clearLocalOfflineProjectData");
    expect(cancelSource).not.toContain("executeDriveProjectDeletion");
  });

  it("confirm runs execute fresh preflight and clears local only through the workflow", () => {
    expect(confirmSource).toContain("runFreshPreflight");
    expect(confirmSource).toContain("preflightDriveProjectDeletion");
    expect(confirmSource).toContain("confirmProjectDeleteWorkflow");
    expect(confirmSource).toContain("clearLocal: clearLocalOfflineProjectData");
    expect(confirmSource).toContain("setSelectedProjectId(null)");
    expect(confirmSource).not.toContain("checkProject(");
    expect(confirmSource).not.toContain("selectProject(");
  });

  it("preserves partialFailure after Google auth reset", () => {
    const authBlock = confirmSource.slice(
      confirmSource.indexOf("shouldInvalidateGoogleAuth"),
    );
    expect(authBlock).toContain("resetGoogleAfterDriveAuthFailure");
    expect(authBlock.indexOf("applyDeleteUi();")).toBeLessThan(
      authBlock.indexOf("resetGoogleAfterDriveAuthFailure();"),
    );
    expect(authBlock).toContain("applyDeleteUi();");
    expect(confirmSource).toContain("setDriveProjects(nextDriveProjects)");
  });

  it("does not touch Photos export state, tokens, or app shell cache", () => {
    for (const fragment of [
      prepareSource,
      cancelSource,
      confirmSource,
    ]) {
      expect(fragment).not.toContain("photosExportAccessTokenRef");
      expect(fragment).not.toContain("photosExportTokenClientRef");
      expect(fragment).not.toContain("pendingGooglePhotosExportRef");
      expect(fragment).not.toContain("caches.");
      expect(fragment).not.toContain("appShell");
    }
  });

  it("does not change standalone local copy deletion or admin UI files", () => {
    expect(source).toContain("clearLocalOfflineProjectData");
    const adminPanel = readFileSync(
      new URL("./admin/project-status-panel.tsx", import.meta.url),
      "utf8",
    );
    expect(adminPanel).not.toContain("prepareProjectDeletion");
    expect(adminPanel).not.toContain("confirmProjectDeletion");
  });
});
