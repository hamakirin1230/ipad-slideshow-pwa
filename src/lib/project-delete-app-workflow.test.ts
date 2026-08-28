import { describe, expect, it, vi } from "vitest";
import {
  closePendingProjectDeleteConfirmation,
  executeProjectDeleteDriveWorkflow,
  finalizeProjectDeleteLocalCopyAfterDriveState,
  interpretDriveProjectDeleteResult,
  isStrictDriveProjectDeleteCompleted,
  releaseOwnedProjectDeleteConfirmLocks,
  removeDeletedProjectFromList,
  shouldDiscardPendingProjectDeleteOnSelect,
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

describe("isStrictDriveProjectDeleteCompleted", () => {
  it("requires completed, indexRemoved, projectRootTrashed, and authRequired=false", () => {
    expect(isStrictDriveProjectDeleteCompleted(driveResult())).toBe(true);
    expect(
      isStrictDriveProjectDeleteCompleted(
        driveResult({ indexRemoved: false }),
      ),
    ).toBe(false);
    expect(
      isStrictDriveProjectDeleteCompleted(
        driveResult({ projectRootTrashed: false }),
      ),
    ).toBe(false);
    expect(
      isStrictDriveProjectDeleteCompleted(driveResult({ authRequired: true })),
    ).toBe(false);
    expect(
      isStrictDriveProjectDeleteCompleted(
        driveResult({ status: "partialFailure" }),
      ),
    ).toBe(false);
  });
});

describe("interpretDriveProjectDeleteResult", () => {
  it("clears local only after strict Drive completed", () => {
    const interpretation = interpretDriveProjectDeleteResult(driveResult());
    expect(interpretation.shouldClearLocal).toBe(true);
    expect(interpretation.shouldRemoveDeletedProjectFromList).toBe(true);
    expect(interpretation.nextSelectedProjectId).toBeNull();
    expect(interpretation.keepCurrentSelection).toBe(false);
    expect(interpretation.shouldInvalidateGoogleAuth).toBe(false);
  });

  it("does not clear local or destroy selection on inconsistent completed results", () => {
    for (const override of [
      { indexRemoved: false },
      { projectRootTrashed: false },
      { authRequired: true },
    ] as const) {
      const interpretation = interpretDriveProjectDeleteResult(
        driveResult(override),
      );
      expect(interpretation.shouldClearLocal).toBe(false);
      expect(interpretation.shouldRemoveDeletedProjectFromList).toBe(false);
      expect(interpretation.keepCurrentSelection).toBe(true);
      expect(interpretation.shouldClearDeletedProjectReadyState).toBe(false);
      expect(interpretation.status).toBe("error");
      expect(interpretation.diagnostics.join(" ")).not.toContain(ACCESS_TOKEN);
      expect(interpretation.diagnostics.join(" ")).not.toContain(
        PROJECT.projectFolderId,
      );
    }
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
    expect(result.message).toContain("ローカルコピーも削除しました");
  });

  it("returns absent when no local records existed", async () => {
    const result = await finalizeProjectDeleteLocalCopy({
      projectId: PROJECT_ID,
      clearLocal: async () => localClearResult(),
    });
    expect(result.status).toBe("absent");
    expect(result.message).toContain("ローカルコピーはありませんでした");
  });

  it("returns failed without treating Drive success as rolled back", async () => {
    const result = await finalizeProjectDeleteLocalCopy({
      projectId: PROJECT_ID,
      clearLocal: async () => {
        throw new Error("indexeddb failed");
      },
    });
    expect(result.status).toBe("failed");
    expect(result.message).toContain("ローカルコピーを削除できませんでした");
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

describe("executeProjectDeleteDriveWorkflow", () => {
  it("runs execute with a fresh preflight callback and does not clear local", async () => {
    const runFreshPreflight = vi.fn(async () => {
      return { status: "ready" as const };
    });
    const execute = vi.fn(async () => driveResult());
    const clearLocal = vi.fn(async () =>
      localClearResult({ deletedProjects: 1 }),
    );

    const outcome = await executeProjectDeleteDriveWorkflow({
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
      isCurrent: () => true,
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]![0].runFreshPreflight).toBe(runFreshPreflight);
    expect(clearLocal).not.toHaveBeenCalled();
    expect(outcome.interpretation?.shouldClearLocal).toBe(true);
    expect(outcome.interpretation?.status).toBe("completed");
    expect(outcome.driveResult?.status).toBe("completed");
  });

  it("does not clear local on partialFailure, including authRequired", async () => {
    const partial = await executeProjectDeleteDriveWorkflow({
      plan: PLAN,
      currentOwner: OWNER,
      execute: async () =>
        driveResult({ status: "partialFailure", indexRemoved: true }),
      executeInput: unusedExecuteInput(),
      isCurrent: () => true,
    });
    const authRequired = await executeProjectDeleteDriveWorkflow({
      plan: PLAN,
      currentOwner: OWNER,
      execute: async () =>
        driveResult({
          status: "partialFailure",
          indexRemoved: true,
          authRequired: true,
        }),
      executeInput: unusedExecuteInput(),
      isCurrent: () => true,
    });

    expect(partial.interpretation?.shouldClearLocal).toBe(false);
    expect(authRequired.interpretation?.shouldInvalidateGoogleAuth).toBe(true);
    expect(authRequired.interpretation?.shouldClearLocal).toBe(false);
  });

  it("does not start local clear on pre-write 401/403", async () => {
    for (const status of [401, 403] as const) {
      const outcome = await executeProjectDeleteDriveWorkflow({
        plan: PLAN,
        currentOwner: OWNER,
        execute: async () => {
          throw new DriveApiError(status);
        },
        executeInput: unusedExecuteInput(),
        isCurrent: () => true,
      });

      expect(outcome.kind).toBe("preWriteAuthError");
      expect(outcome.interpretation).toBeNull();
    }
  });

  it("does not apply UI for a stale request after Drive completed", async () => {
    let current = true;
    const outcome = await executeProjectDeleteDriveWorkflow({
      plan: PLAN,
      currentOwner: OWNER,
      execute: async () => {
        current = false;
        return driveResult();
      },
      executeInput: unusedExecuteInput(),
      isCurrent: () => current,
    });

    expect(outcome.kind).toBe("stale");
    expect(outcome.applyUi).toBe(false);
    expect(outcome.interpretation?.shouldClearLocal).toBe(true);
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

describe("finalizeProjectDeleteLocalCopyAfterDriveState", () => {
  it("applies Drive list/selection state before clearing local exactly once", async () => {
    const events: string[] = [];
    let driveProjects = [
      { projectId: PROJECT_ID, title: "削除対象" },
      { projectId: OTHER_PROJECT_ID, title: "残す作品" },
    ];
    let selectedProjectId: string | null = PROJECT_ID;
    const clearLocal = vi.fn(async () => {
      expect(events).toEqual(["drive-state"]);
      expect(selectedProjectId).toBeNull();
      expect(driveProjects).toEqual([
        { projectId: OTHER_PROJECT_ID, title: "残す作品" },
      ]);
      events.push("local-clear");
      return localClearResult({ deletedProjects: 1 });
    });

    const outcome = await finalizeProjectDeleteLocalCopyAfterDriveState({
      shouldClearLocal: true,
      projectId: PROJECT_ID,
      applyDriveState: () => {
        events.push("drive-state");
        driveProjects = removeDeletedProjectFromList(driveProjects, PROJECT_ID);
        selectedProjectId = null;
      },
      isCurrent: () => true,
      clearLocal,
    });

    expect(events).toEqual(["drive-state", "local-clear"]);
    expect(clearLocal).toHaveBeenCalledOnce();
    expect(clearLocal).toHaveBeenCalledWith(PROJECT_ID);
    expect(outcome.localCopyStatus).toBe("cleared");
    expect(outcome.applyLocalCopyUi).toBe(true);
  });

  it("returns absent when Drive completed and local records were 0", async () => {
    const outcome = await finalizeProjectDeleteLocalCopyAfterDriveState({
      shouldClearLocal: true,
      projectId: PROJECT_ID,
      applyDriveState: () => undefined,
      isCurrent: () => true,
      clearLocal: async () => localClearResult(),
    });

    expect(outcome.localCopyStatus).toBe("absent");
  });

  it("keeps Drive completed when local clear throws", async () => {
    const outcome = await finalizeProjectDeleteLocalCopyAfterDriveState({
      shouldClearLocal: true,
      projectId: PROJECT_ID,
      applyDriveState: () => undefined,
      isCurrent: () => true,
      clearLocal: async () => {
        throw new Error("local failed");
      },
    });

    expect(outcome.localCopyStatus).toBe("failed");
    expect(outcome.localCopyMessage).toContain(
      "ローカルコピーを削除できませんでした",
    );
  });

  it("does not start local clear unless all strict completed flags are true", async () => {
    const clearLocal = vi.fn(async () => localClearResult({ deletedProjects: 1 }));

    for (const result of [
      driveResult({ indexRemoved: false }),
      driveResult({ projectRootTrashed: false }),
      driveResult({ authRequired: true }),
      driveResult({ status: "partialFailure", indexRemoved: true }),
      driveResult({
        status: "partialFailure",
        indexRemoved: true,
        authRequired: true,
      }),
    ]) {
      const interpretation = interpretDriveProjectDeleteResult(result);
      await finalizeProjectDeleteLocalCopyAfterDriveState({
        shouldClearLocal: interpretation.shouldClearLocal,
        projectId: PROJECT_ID,
        applyDriveState: () => undefined,
        isCurrent: () => true,
        clearLocal,
      });
    }

    const allowed = await finalizeProjectDeleteLocalCopyAfterDriveState({
      shouldClearLocal: interpretDriveProjectDeleteResult(driveResult())
        .shouldClearLocal,
      projectId: PROJECT_ID,
      applyDriveState: () => undefined,
      isCurrent: () => true,
      clearLocal,
    });

    expect(clearLocal).toHaveBeenCalledOnce();
    expect(allowed.localCopyStatus).toBe("cleared");
  });

  it("does not start local clear for a stale request after Drive state is applied", async () => {
    const clearLocal = vi.fn(async () => localClearResult({ deletedProjects: 1 }));
    let current = true;
    const outcome = await finalizeProjectDeleteLocalCopyAfterDriveState({
      shouldClearLocal: true,
      projectId: PROJECT_ID,
      applyDriveState: () => {
        current = false;
      },
      isCurrent: () => current,
      clearLocal,
    });

    expect(clearLocal).not.toHaveBeenCalled();
    expect(outcome.localCopyStatus).toBe("notAttempted");
    expect(outcome.applyLocalCopyUi).toBe(false);
  });
});

describe("releaseOwnedProjectDeleteConfirmLocks", () => {
  it("releases the Drive lock after pre-write 401 even if delete request id was incremented", () => {
    const released = releaseOwnedProjectDeleteConfirmLocks({
      ownedDriveRequestId: 5,
      ownedDeleteRequestId: 3,
      currentDriveRequestId: 5,
      currentDeleteRequestId: 4,
    });
    expect(released.releaseDriveLock).toBe(true);
    expect(released.releaseProjectDeleteLock).toBe(false);
  });

  it("releases the Drive lock after post-index authRequired partialFailure", () => {
    const released = releaseOwnedProjectDeleteConfirmLocks({
      ownedDriveRequestId: 8,
      ownedDeleteRequestId: 2,
      currentDriveRequestId: 8,
      currentDeleteRequestId: 3,
    });
    expect(released.releaseDriveLock).toBe(true);
    expect(released.releaseProjectDeleteLock).toBe(false);
  });

  it("does not release a newer Drive operation lock", () => {
    const released = releaseOwnedProjectDeleteConfirmLocks({
      ownedDriveRequestId: 5,
      ownedDeleteRequestId: 3,
      currentDriveRequestId: 6,
      currentDeleteRequestId: 4,
    });
    expect(released.releaseDriveLock).toBe(false);
    expect(released.releaseProjectDeleteLock).toBe(false);
  });
});

describe("pending project delete confirmation on selection change", () => {
  it("does not stale the current delete request when selection cannot actually change", () => {
    expect(
      shouldDiscardPendingProjectDeleteOnSelect({
        driveOperationInFlight: true,
      }),
    ).toBe(false);
  });

  it("closes pending confirmation without discarding settled results", () => {
    const confirming = closePendingProjectDeleteConfirmation({
      status: "confirming",
    });
    expect(confirming.shouldClearPendingPlan).toBe(true);
    expect(confirming.shouldClearReview).toBe(true);
    expect(confirming.shouldResetPendingUi).toBe(true);
    expect(confirming.nextStatus).toBe("idle");
    expect(confirming.preserveSettledResult).toBe(false);

    const completed = closePendingProjectDeleteConfirmation({
      status: "completed",
    });
    expect(completed.shouldResetPendingUi).toBe(false);
    expect(completed.preserveSettledResult).toBe(true);
    expect(completed.nextStatus).toBe("completed");

    const partialFailure = closePendingProjectDeleteConfirmation({
      status: "partialFailure",
    });
    expect(partialFailure.shouldResetPendingUi).toBe(false);
    expect(partialFailure.preserveSettledResult).toBe(true);
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
    diagnostics: ["Google Drive上のアルバムを削除しました。"],
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
