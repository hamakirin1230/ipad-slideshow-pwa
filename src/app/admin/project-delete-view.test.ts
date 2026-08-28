import { describe, expect, it } from "vitest";
import {
  buildProjectDeleteConfirmationDescription,
  canStartProjectDeletion,
  getProjectDeleteButtonLabel,
  getProjectDeleteViewState,
  shouldAutoCheckProject,
} from "./project-delete-view";

describe("project delete button and start conditions", () => {
  it("keeps the selected-project delete action disabled without a selection", () => {
    expect(
      canStartProjectDeletion({
        hasSelectedProject: false,
        blockedReason: null,
        status: "idle",
        isProjectDeleteInFlight: false,
      }),
    ).toBe(false);
    expect(
      canStartProjectDeletion({
        hasSelectedProject: true,
        blockedReason: null,
        status: "idle",
        isProjectDeleteInFlight: false,
      }),
    ).toBe(true);
  });

  it("blocks a second prepare while checking, confirming, or deleting", () => {
    for (const status of ["checking", "confirming", "deleting"] as const) {
      expect(
        canStartProjectDeletion({
          hasSelectedProject: true,
          blockedReason: null,
          status,
          isProjectDeleteInFlight: status === "deleting",
        }),
      ).toBe(false);
    }
    expect(getProjectDeleteButtonLabel("checking")).toBe("削除対象を確認中");
    expect(getProjectDeleteButtonLabel("deleting")).toBe("アルバムを削除中");
    expect(getProjectDeleteButtonLabel("idle")).toBe("アルバムを削除");
  });
});

describe("project delete confirmation copy", () => {
  it("names the selected title and explains Drive, local copy, Photos, and irreversibility", () => {
    const description = buildProjectDeleteConfirmationDescription("夏の記録");
    expect(description).toContain("『夏の記録』を削除します。");
    expect(description).toContain("Google Drive");
    expect(description).toContain("スライド");
    expect(description).toContain("素材");
    expect(description).toContain("公開履歴");
    expect(description).toContain("ローカルコピー");
    expect(description).toContain("Googleフォトへ書き出した写真は削除されません。");
    expect(description).toContain("アプリから元に戻せません。");
    expect(description).not.toContain("indexRemoved");
    expect(description).not.toContain("projectRootTrashed");
    expect(description).not.toContain("projectId");
  });
});

describe("project delete result view", () => {
  it("shows success copy for cleared and absent local copies", () => {
    expect(
      getProjectDeleteViewState({
        status: "completed",
        localCopyStatus: "cleared",
        message: null,
        diagnostics: [],
      })?.title,
    ).toBe("アルバムを削除しました。ローカルコピーも削除しました。");
    expect(
      getProjectDeleteViewState({
        status: "completed",
        localCopyStatus: "absent",
        message: null,
        diagnostics: [],
      })?.title,
    ).toBe("アルバムを削除しました。ローカルコピーはありませんでした。");
    expect(
      getProjectDeleteViewState({
        status: "completed",
        localCopyStatus: "cleared",
        message: null,
        diagnostics: [],
      })?.liveRole,
    ).toBe("status");
  });

  it("keeps Drive success when local copy deletion fails", () => {
    const view = getProjectDeleteViewState({
      status: "completed",
      localCopyStatus: "failed",
      message: null,
      diagnostics: [],
    });
    expect(view?.tone).toBe("warning");
    expect(view?.liveRole).toBe("alert");
    expect(view?.title).toContain("ローカルコピーを削除できませんでした");
    expect(view?.title).not.toContain("アルバムの削除に失敗しました");
    expect(view?.body.join(" ")).toContain("端末保存データ");
  });

  it("explains leftover Drive data and that the iPad copy was not deleted", () => {
    const view = getProjectDeleteViewState({
      status: "partialFailure",
      localCopyStatus: "notAttempted",
      message:
        "アルバム一覧からは削除されましたが、Google Drive上にデータが残っている可能性があります。",
      diagnostics: ["Googleへ再接続してください。"],
    });
    expect(view?.liveRole).toBe("alert");
    expect(view?.title).toContain("Google Drive上にデータが残っている可能性");
    expect(view?.body.join(" ")).toContain("ローカルコピーは削除していません");
    expect(view?.body.join(" ")).toContain("自動では再試行しません");
    expect(view?.body.join(" ")).toContain("Googleへ再接続してください。");
  });

  it("does not present blocked or error as a completed deletion", () => {
    const blocked = getProjectDeleteViewState({
      status: "blocked",
      localCopyStatus: "notAttempted",
      message: "アルバムの削除を中止しました。",
      diagnostics: ["Drive操作中のため、アルバムを削除できません。"],
    });
    const error = getProjectDeleteViewState({
      status: "error",
      localCopyStatus: "notAttempted",
      message: "アルバムを削除できませんでした。",
      diagnostics: [],
    });
    expect(blocked?.title).not.toContain("アルバムを削除しました");
    expect(error?.title).not.toContain("アルバムを削除しました");
    expect(error?.liveRole).toBe("alert");
  });
});

describe("project auto-check after deletion", () => {
  it("does not auto-check when leftover projects are ready without a selection", () => {
    expect(
      shouldAutoCheckProject({
        driveStatus: "ready",
        projectStatus: "ready",
        isDriveOperationInFlight: false,
      }),
    ).toBe(false);
  });

  it("only auto-checks the initial idle ready workspace", () => {
    expect(
      shouldAutoCheckProject({
        driveStatus: "ready",
        projectStatus: "idle",
        isDriveOperationInFlight: false,
      }),
    ).toBe(true);
  });
});
