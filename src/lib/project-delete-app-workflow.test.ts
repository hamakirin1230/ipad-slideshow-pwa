import { describe, expect, it, vi } from "vitest";
import {
  confirmProjectDeleteWorkflow,
  interpretDriveProjectDeleteResult,
  removeDeletedProjectFromList,
  toProjectDeletePublicResult,
} from "./project-delete-app-workflow";
import {
  finalizeProjectDeleteLocalCopy,
  projectDeleteLocalCopyStatusFromClearResult,
  totalDeletedLocalOfflineRecords,
} from "./project-delete-local-finalization";
import {
  buildDriveProjectDeleteOwner,
  type DriveProjectDeletePlan,
  type DriveProjectDeleteResult,
} from "./drive-project-delete";
import { DriveApiError, type DriveProjectSummary } from "./google-drive";
import type { ClearLocalOfflineProjectDataResult } from "./offline-local-project-clear";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ACCESS_TOKEN = "access-token-project-delete-workflow-fixture";

const PROJECT: DriveProjectSummary = {
  projectId: PROJECT_ID,
  title: "削除対象",
  projectFolderId: "project-folder-id-fixture",
  manifestFileId: "manifest-file-id-fixture",
  assetsFolderId: "assets-folder-id-fixture",
  manifestPath: `projects/${PROJECT_ID}/manifest.json`,
  createdAt: "2026-08-22T00:00:00.000Z",
  updatedAt: "2026-08-22T01:00:00.000Z",
};

const OTHER_PROJECT: DriveProjectSummary = {
  projectId: OTHER_PROJECT_ID,
  title: "残す作品",
  projectFolderId: "other-project-folder-id-fixture",
  manifestFileId: "other-manifest-file-id-fixture",
  assetsFolderId: "other-assets-folder-id-fixture",
  manifestPath: `projects/${OTHER_PROJECT_ID}/manifest.json`,
  createdAt: "2026-08-22T00:00:00.000Z",
  updatedAt: "2026-08-22T01:00:00.000Z",
};

const OWNER = buildDriveProjectDeleteOwner({
  workspaceId: WORKSPACE_ID,
  indexJsonFileId: "index-file-id-fixture",
  projectsRootFolderId: "projects-root-id-fixture",
  project: PROJECT,
});

const PLAN: DriveProjectDeletePlan = {
  owner: OWNER,
  project: PROJECT,
  remainingProjects: [OTHER_PROJECT],
  indexJsonText: "{}",
  indexCreatedAt: PROJECT.createdAt,
  indexUpdatedAt: PROJECT.updatedAt,
  indexFingerprint: "index-fp",
  projectRootFingerprint: "root-fp",
  manifestFingerprint: "manifest-fp",
  assetsFolderFingerprint: "assets-fp",
};

describe("interpretDriveProjectDeleteResult", () => {
  it("clears local only after Drive completed", () => {
    const interpretation = interpretDriveProjectDeleteResult(
      driveResult({ status: "completed" }),
    );
    expect(interpretation.shouldClearLocal).toBe(true);
    expect(interpretation.shouldRemoveDeletedProjectFromList).toBe(true);
    expect(interpretation.nextSelectedProjectId).toBeNull();
    expect(interpretation.keepCurrentSelection).toBe(false);
    expect(interpretation.shouldInvalidateGoogleAuth).toBe(false);
  });

  it("does not clear local on partialFailure and does not auto-select another project", () => {
    const interpretation = interpretDriveProjectDeleteResult(
      driveResult({
        status: "partialFailure",
        indexRemoved: true,
        projectRootTrashed: false,
      }),
    );
    expect(interpretation.shouldClearLocal).toBe(false);
    expect(interpretation.shouldRemoveDeletedProjectFromList).toBe(true);
    expect(interpretation.nextSelectedProjectId).toBeNull();
    expect(interpretation.keepCurrentSelection).toBe(false);
  });

  it("keeps the selected project when blocked or failed without index removal", () => {
    for (const status of ["blocked", "failed"] as const) {
      const interpretation = interpretDriveProjectDeleteResult(
        driveResult({ status, indexRemoved: false }),
      );
      expect(interpretation.shouldClearLocal).toBe(false);
      expect(interpretation.shouldRemoveDeletedProjectFromList).toBe(false);
      expect(interpretation.keepCurrentSelection).toBe(true);
    }
  });

  it("marks authRequired partialFailure for session invalidation without local clear", () => {
    const interpretation = interpretDriveProjectDeleteResult(
      driveResult({
        status: "partialFailure",
        indexRemoved: true,
        authRequired: true,
      }),
    );
    expect(interpretation.shouldInvalidateGoogleAuth).toBe(true);
    expect(interpretation.shouldClearLocal).toBe(false);
    expect(interpretation.shouldUpdateWorkspaceIndexText).toBe(false);
  });
});

describe("removeDeletedProjectFromList", () => {
  it("removes only the deleted projectId and keeps other project entries", () => {
    const remaining = removeDeletedProjectFromList(
      [
        { projectId: PROJECT_ID, title: "削除対象" },
        { projectId: OTHER_PROJECT_ID, title: "残す作品" },
      ],
      PROJECT_ID,
    );
    expect(remaining).toEqual([{ projectId: OTHER_PROJECT_ID, title: "残す作品" }]);
  });
});

describe("finalizeProjectDeleteLocalCopy", () => {
  it("returns cleared when local records existed", async () => {
    const result = await finalizeProjectDeleteLocalCopy({
      projectId: PROJECT_ID,
      clearLocal: async (projectId) => {
        expect(projectId).toBe(PROJECT_ID);
        return localClearResult({ deletedProjects: 1, deletedAssets: 2 });
      },
    });
    expect(result.status).toBe("cleared");
    expect(result.message).toContain("このiPadのコピーも削除しました");
  });

  it("returns absent when no local records existed", async () => {
    const result = await finalizeProjectDeleteLocalCopy({
      projectId: PROJECT_ID,
      clearLocal: async () => localClearResult(),
    });
    expect(result.status).toBe("absent");
    expect(result.message).toContain("このiPadには保存コピーがありませんでした");
  });

  it("returns failed without treating Drive success as rolled back", async () => {
    const result = await finalizeProjectDeleteLocalCopy({
      projectId: PROJECT_ID,
      clearLocal: async () => {
        throw new Error("indexeddb failed");
      },
    });
    expect(result.status).toBe("failed");
    expect(result.message).toContain("このiPadのコピーを削除できませんでした");
  });

  it("counts only exact projectId matches in the clear result totals", () => {
    const result = localClearResult({ deletedProjects: 1 });
    expect(totalDeletedLocalOfflineRecords(result)).toBe(1);
    expect(projectDeleteLocalCopyStatusFromClearResult(result)).toBe("cleared");
    expect(projectDeleteLocalCopyStatusFromClearResult(localClearResult())).toBe(
      "absent",
    );
  });
});

describe("confirmProjectDeleteWorkflow", () => {
  it("runs execute with a fresh preflight callback and clears local exactly once on completed", async () => {
    const runFreshPreflight = vi.fn(async () => {
      return { status: "ready" as const };
    });
    const execute = vi.fn(async () => driveResult({ status: "completed" }));
    const clearLocal = vi.fn(async () =>
      localClearResult({ deletedProjects: 1 }),
    );

    const outcome = await confirmProjectDeleteWorkflow({
      plan: PLAN,
      currentOwner: OWNER,
      execute: execute as never,
      executeInput: {
        runFreshPreflight: runFreshPreflight as never,
        writeIndexJson: async () => undefined,
        readIndexJson: async () => "{}",
        trashProjectRoot: async () => ({ status: "patched", trashed: true }),
        readProjectRootMetadata: async () => ({
          id: PROJECT.projectFolderId,
          name: PROJECT.projectId,
          mimeType: "application/vnd.google-apps.folder",
          appProperties: {},
          trashed: true,
        }),
        listActiveProjectRoots: async () => [],
      },
      clearLocal,
      isCurrent: () => true,
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]![0].runFreshPreflight).toBe(runFreshPreflight);
    expect(clearLocal).toHaveBeenCalledOnce();
    expect(clearLocal).toHaveBeenCalledWith(PROJECT_ID);
    expect(outcome.localCopyStatus).toBe("cleared");
    expect(outcome.interpretation?.status).toBe("completed");
    expect(outcome.driveResult?.status).toBe("completed");
  });

  it("returns absent when Drive completed and local records were 0", async () => {
    const outcome = await confirmProjectDeleteWorkflow({
      plan: PLAN,
      currentOwner: OWNER,
      execute: async () => driveResult({ status: "completed" }),
      executeInput: unusedExecuteInput(),
      clearLocal: async () => localClearResult(),
      isCurrent: () => true,
    });

    expect(outcome.localCopyStatus).toBe("absent");
    expect(outcome.driveResult?.status).toBe("completed");
  });

  it("keeps Drive completed when local clear throws", async () => {
    const outcome = await confirmProjectDeleteWorkflow({
      plan: PLAN,
      currentOwner: OWNER,
      execute: async () => driveResult({ status: "completed" }),
      executeInput: unusedExecuteInput(),
      clearLocal: async () => {
        throw new Error("local failed");
      },
      isCurrent: () => true,
    });

    expect(outcome.driveResult?.status).toBe("completed");
    expect(outcome.localCopyStatus).toBe("failed");
    expect(outcome.interpretation?.shouldRemoveDeletedProjectFromList).toBe(true);
  });

  it("does not clear local on partialFailure, including authRequired", async () => {
    const clearLocal = vi.fn(async () => localClearResult({ deletedProjects: 1 }));
    const partial = await confirmProjectDeleteWorkflow({
      plan: PLAN,
      currentOwner: OWNER,
      execute: async () =>
        driveResult({ status: "partialFailure", indexRemoved: true }),
      executeInput: unusedExecuteInput(),
      clearLocal,
      isCurrent: () => true,
    });
    const authRequired = await confirmProjectDeleteWorkflow({
      plan: PLAN,
      currentOwner: OWNER,
      execute: async () =>
        driveResult({
          status: "partialFailure",
          indexRemoved: true,
          authRequired: true,
        }),
      executeInput: unusedExecuteInput(),
      clearLocal,
      isCurrent: () => true,
    });

    expect(clearLocal).not.toHaveBeenCalled();
    expect(partial.localCopyStatus).toBe("notAttempted");
    expect(authRequired.interpretation?.shouldInvalidateGoogleAuth).toBe(true);
    expect(authRequired.localCopyStatus).toBe("notAttempted");
  });

  it("does not clear local on pre-write 401/403", async () => {
    const clearLocal = vi.fn(async () => localClearResult());
    const outcome = await confirmProjectDeleteWorkflow({
      plan: PLAN,
      currentOwner: OWNER,
      execute: async () => {
        throw new DriveApiError(401);
      },
      executeInput: unusedExecuteInput(),
      clearLocal,
      isCurrent: () => true,
    });

    expect(outcome.kind).toBe("preWriteAuthError");
    expect(clearLocal).not.toHaveBeenCalled();
    expect(outcome.localCopyStatus).toBe("notAttempted");
  });

  it("does not start local clear for a stale request after Drive completed", async () => {
    const clearLocal = vi.fn(async () => localClearResult({ deletedProjects: 1 }));
    let current = true;
    const outcome = await confirmProjectDeleteWorkflow({
      plan: PLAN,
      currentOwner: OWNER,
      execute: async () => {
        current = false;
        return driveResult({ status: "completed" });
      },
      executeInput: unusedExecuteInput(),
      clearLocal,
      isCurrent: () => current,
    });

    expect(outcome.kind).toBe("stale");
    expect(clearLocal).not.toHaveBeenCalled();
    expect(outcome.applyUi).toBe(false);
  });

  it("does not put token, URL, or Drive IDs into public result diagnostics", () => {
    const publicResult = toProjectDeletePublicResult(
      driveResult({
        status: "partialFailure",
        diagnostics: [
          ACCESS_TOKEN,
          "https://www.googleapis.com/drive/v3/files",
          PROJECT.projectFolderId,
        ],
      }),
    );
    const serialized = JSON.stringify(publicResult);
    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain("https://www.googleapis.com");
    expect(serialized).not.toContain(PROJECT.projectFolderId);
    expect(publicResult).toEqual({
      status: "partialFailure",
      indexRemoved: true,
      projectRootTrashed: true,
      authRequired: false,
    });
  });
});

function driveResult(
  override: Partial<DriveProjectDeleteResult> = {},
): DriveProjectDeleteResult {
  return {
    status: "completed",
    indexRemoved: true,
    projectRootTrashed: true,
    authRequired: false,
    diagnostics: ["Google Drive上の作品を削除しました。"],
    ...override,
  };
}

function unusedExecuteInput() {
  return {
    runFreshPreflight: async () => {
      throw new Error("unused");
    },
    writeIndexJson: async () => undefined,
    readIndexJson: async () => "{}",
    trashProjectRoot: async () => ({ status: "patched" as const, trashed: true }),
    readProjectRootMetadata: async () => ({
      id: "id",
      name: "name",
      mimeType: "application/vnd.google-apps.folder",
      appProperties: {},
    }),
    listActiveProjectRoots: async () => [],
  };
}

function localClearResult(
  override: Partial<ClearLocalOfflineProjectDataResult> = {},
): ClearLocalOfflineProjectDataResult {
  return {
    clearedAt: "2026-08-22T03:00:00.000Z",
    projectId: PROJECT_ID,
    deletedProjects: 0,
    deletedAssets: 0,
    deletedAssetBlobs: 0,
    deletedSyncStates: 0,
    deletedStagingProjects: 0,
    deletedStagingAssets: 0,
    deletedStagingAssetBlobs: 0,
    ...override,
  };
}
