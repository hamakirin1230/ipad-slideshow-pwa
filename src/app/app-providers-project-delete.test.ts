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
const selectSource = source.slice(
  source.indexOf("async function selectProject(projectId: string)"),
  source.indexOf("async function updateSelectedProjectTitle"),
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

  it("confirm runs Drive execute first and only then starts local clear", () => {
    expect(confirmSource).toContain("runFreshPreflight");
    expect(confirmSource).toContain("preflightDriveProjectDeletion");
    expect(confirmSource).toContain("executeProjectDeleteDriveWorkflow");
    expect(confirmSource).not.toContain("confirmProjectDeleteWorkflow");
    expect(confirmSource).toContain("finalizeProjectDeleteLocalCopyAfterDriveState");
    expect(confirmSource).toContain("clearLocal: clearLocalOfflineProjectData");
    expect(confirmSource).toContain("setSelectedProjectId(null)");
    expect(confirmSource).not.toContain("checkProject(");
    expect(confirmSource).not.toContain("selectProject(");
    expect(
      confirmSource.indexOf("executeProjectDeleteDriveWorkflow"),
    ).toBeLessThan(
      confirmSource.indexOf("finalizeProjectDeleteLocalCopyAfterDriveState"),
    );
    expect(confirmSource.indexOf("setDriveProjects(")).toBeLessThan(
      confirmSource.indexOf("finalizeProjectDeleteLocalCopyAfterDriveState"),
    );
    expect(confirmSource.indexOf("setSelectedProjectId(null)")).toBeLessThan(
      confirmSource.indexOf("finalizeProjectDeleteLocalCopyAfterDriveState"),
    );
    expect(confirmSource.indexOf("clearProjectReadyDetails()")).toBeLessThan(
      confirmSource.indexOf("finalizeProjectDeleteLocalCopyAfterDriveState"),
    );
    expect(
      confirmSource.indexOf("setWorkspaceReadyContext({"),
    ).toBeLessThan(
      confirmSource.indexOf("finalizeProjectDeleteLocalCopyAfterDriveState"),
    );
  });

  it("preserves partialFailure after Google auth reset and releases locks independently", () => {
    const authBlock = confirmSource.slice(
      confirmSource.indexOf("shouldInvalidateGoogleAuth"),
    );
    expect(authBlock).toContain("resetGoogleAfterDriveAuthFailure");
    expect(authBlock.indexOf("applyDeleteUi();")).toBeLessThan(
      authBlock.indexOf("resetGoogleAfterDriveAuthFailure();"),
    );
    expect(authBlock).toContain("setDriveProjects(nextDriveProjects)");
    expect(confirmSource).toContain("releaseOwnedProjectDeleteConfirmLocks");
    expect(confirmSource).toContain("if (released.releaseDriveLock)");
    expect(confirmSource).toContain("if (released.releaseProjectDeleteLock)");
    expect(confirmSource).not.toContain(
      "requestId === driveOperationRequestIdRef.current &&\n        deleteRequestId === projectDeleteRequestIdRef.current",
    );
  });

  it("does not stale the current delete request when selectProject cannot change selection", () => {
    expect(selectSource.indexOf("if (driveOperationInFlightRef.current)")).toBeLessThan(
      selectSource.indexOf("discardPendingProjectDeleteConfirmation()"),
    );
    const inflightGuard = selectSource.slice(
      0,
      selectSource.indexOf("discardPendingProjectDeleteConfirmation()"),
    );
    expect(inflightGuard).toContain("if (driveOperationInFlightRef.current)");
    expect(inflightGuard).not.toContain("invalidatePendingProjectDeletion");
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

  it("does not change standalone local copy deletion", () => {
    expect(source).toContain("clearLocalOfflineProjectData");
    const confirmedStore = readFileSync(
      new URL("./admin/offline-confirmed-store-panel.tsx", import.meta.url),
      "utf8",
    );
    expect(confirmedStore).not.toContain("prepareProjectDeletion");
    expect(confirmedStore).not.toContain("confirmProjectDeletion");
    expect(confirmedStore).toContain("このiPadの保存データを削除しますか？");
  });
});
