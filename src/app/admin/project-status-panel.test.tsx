import { readFileSync } from "node:fs";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProjectSummary } from "@/app/app-providers";
import { DUPLICATE_PROJECT_TITLE_MESSAGE } from "@/lib/project-title-uniqueness";
import {
  getProjectDeleteViewState,
} from "./project-delete-view";
import {
  getProjectDriveNotReadyNotice,
  getProjectTitleFormFeedback,
  ProjectList,
  ProjectTitleDuplicateAlert,
  SelectedProjectDeleteCard,
} from "./project-status-panel";

const source = readFileSync(
  new URL("./project-status-panel.tsx", import.meta.url),
  "utf8",
);
const listSource = source.slice(
  source.indexOf("export function ProjectList("),
  source.indexOf("function CreateProjectTitleForm("),
);

function project(index: number): ProjectSummary {
  return {
    projectId: `project-${index}`,
    projectIdPart: "",
    title: `作品 ${index}`,
    manifestPath: "",
    createdAt: "2026-06-12T21:50:49.646Z",
    updatedAt: "2026-06-12T21:50:49.646Z",
    slideCount: index === 10 ? null : index,
    assetCount: index === 10 ? null : index + 2,
    photoCount: index === 10 ? null : index,
    videoCount: index === 10 ? null : 1,
    otherCount: index === 10 ? null : 0,
  };
}

describe("project list presentation", () => {
  it("renders an 11-project fixture as compact whole-card buttons", () => {
    const html = renderToStaticMarkup(
      <ProjectList
        projects={Array.from({ length: 11 }, (_, index) => project(index + 1))}
        selectedProjectId="project-1"
        disabled={false}
        onSelect={vi.fn()}
      />,
    );

    expect(html.match(/<button/g)).toHaveLength(11);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("写真 —");
    expect(html).toContain("動画 —");
    expect(html).toContain("写真 1");
    expect(html).toContain("動画 1");
    expect(html).not.toContain("スライド");
    expect(html).not.toContain("素材");
    expect(html).not.toContain("写真 0");
    expect(html).not.toContain(".646");
    expect(html).not.toContain("この作品を選択");
    expect(html).not.toContain("作品を削除");
    expect(html).not.toContain("trash");
    expect(listSource).not.toContain("Trash");
    expect(listSource).not.toContain("prepareProjectDeletion");
    expect(listSource).not.toContain("ProductAlertDialog");
  });

  it("shows other counts only when unknown media exists", () => {
    const html = renderToStaticMarkup(
      <ProjectList
        projects={[
          {
            ...project(1),
            photoCount: 2,
            videoCount: 1,
            otherCount: 3,
          },
        ]}
        selectedProjectId="project-1"
        disabled={false}
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain("写真 2");
    expect(html).toContain("動画 1");
    expect(html).toContain("その他 3");
    expect(html).not.toContain("スライド");
    expect(html).not.toContain("素材");
  });
});

describe("project drive not-ready notice", () => {
  it("asks for Google connection when Drive is not ready and Google is disconnected", () => {
    expect(
      getProjectDriveNotReadyNotice({
        googleStatus: "notConnected",
        driveStatus: "unchecked",
      }),
    ).toEqual({
      title: "Google Driveへの接続が必要です",
      body: "設定で「Googleアカウントでつなぐ」を押してください。",
    });
  });

  it("does not call an unchecked connected session a missing Google connection", () => {
    expect(
      getProjectDriveNotReadyNotice({
        googleStatus: "connected",
        driveStatus: "unchecked",
      })?.title,
    ).toBe("Google Driveの保存場所を確認しています");
    expect(
      getProjectDriveNotReadyNotice({
        googleStatus: "connected",
        driveStatus: "checking",
      })?.title,
    ).toBe("Google Driveの保存場所を確認しています");
    expect(
      getProjectDriveNotReadyNotice({
        googleStatus: "connected",
        driveStatus: "checking",
      })?.title,
    ).not.toBe("Google Driveへの接続が必要です");
  });

  it("asks to prepare or recheck the save location after Drive validation fails", () => {
    expect(
      getProjectDriveNotReadyNotice({
        googleStatus: "connected",
        driveStatus: "notCreated",
      })?.title,
    ).toBe("Google Driveの保存場所の準備が必要です");
    expect(
      getProjectDriveNotReadyNotice({
        googleStatus: "connected",
        driveStatus: "creating",
      })?.title,
    ).toBe("Google Driveの保存場所の準備が必要です");
    expect(
      getProjectDriveNotReadyNotice({
        googleStatus: "connected",
        driveStatus: "operationFailed",
      })?.title,
    ).toBe("Google Driveの保存場所を確認できません");
    expect(
      getProjectDriveNotReadyNotice({
        googleStatus: "connected",
        driveStatus: "invalidWorkspace",
      })?.title,
    ).toBe("Google Driveの保存場所を確認できません");
    expect(
      getProjectDriveNotReadyNotice({
        googleStatus: "connected",
        driveStatus: "ready",
      }),
    ).toBeNull();
  });
});

describe("selected project delete controls", () => {
  it("shows a destructive selected-project delete button", () => {
    const html = renderDeleteCard({
      hasSelectedProject: true,
      selectedProjectTitle: "夏の記録",
      canStartDeletion: true,
    });

    expect(html).toContain("アルバムを削除");
    expect(html).toContain("夏の記録");
    expect(html).toContain("data-variant=\"destructive\"");
    expect(html).toContain("min-h-11");
    expect(html).not.toContain('disabled=""');
  });

  it("disables destructive deletion without a selected project", () => {
    const html = renderDeleteCard({
      hasSelectedProject: false,
      selectedProjectTitle: null,
      canStartDeletion: false,
      blockedReason: null,
    });

    expect(html).toContain("アルバムを削除");
    expect(html).toContain('disabled=""');
    expect(html).toContain("先にアルバムを選択してください。");
    expect(html).not.toContain("アルバムを削除しますか？");
  });

  it("shows the confirmation dialog only while confirming with a review", () => {
    const html = renderDeleteCard({
      hasSelectedProject: true,
      selectedProjectTitle: "夏の記録",
      canStartDeletion: false,
      status: "confirming",
      review: { projectTitle: "夏の記録", remainingProjectCount: 3 },
    });

    expect(html).toContain("アルバムを削除しますか？");
    expect(html).toContain("『夏の記録』を削除します。");
    expect(html).toContain("Google Drive上のアルバムデータ（スライド、素材、公開履歴）を削除します。");
    expect(html).toContain("ローカルコピーがある場合も、Google Driveの削除が完了した後に削除します。");
    expect(html).toContain("Googleフォトへ書き出した写真は削除されません。");
    expect(html).toContain("この操作はアプリから元に戻せません。");
    expect(html).toContain("role=\"alertdialog\"");
    expect(html).not.toContain("indexRemoved");
    expect(html).not.toContain("projectRootTrashed");
    expect(html).not.toContain("access-token");
    expect(html).not.toContain("https://www.googleapis.com");
  });

  it("renders completed local-copy outcomes without calling Drive internals", () => {
    const cleared = renderDeleteCard({
      status: "completed",
      localCopyStatus: "cleared",
      canStartDeletion: false,
      hasSelectedProject: false,
    });
    const absent = renderDeleteCard({
      status: "completed",
      localCopyStatus: "absent",
      canStartDeletion: false,
      hasSelectedProject: false,
    });
    const failed = renderDeleteCard({
      status: "completed",
      localCopyStatus: "failed",
      canStartDeletion: false,
      hasSelectedProject: false,
    });

    expect(cleared).toContain("アルバムを削除しました。ローカルコピーも削除しました。");
    expect(cleared).toContain("role=\"status\"");
    expect(absent).toContain("アルバムを削除しました。ローカルコピーはありませんでした。");
    expect(failed).toContain("ローカルコピーを削除できませんでした");
    expect(failed).not.toContain("アルバムの削除に失敗しました");
    expect(failed).toContain("role=\"alert\"");
    expect(cleared).not.toContain("indexRemoved");
    expect(cleared).not.toContain("projectRootTrashed");
  });

  it("explains partialFailure leftover Drive data without a retry button", () => {
    const html = renderDeleteCard({
      status: "partialFailure",
      localCopyStatus: "notAttempted",
      message:
        "アルバム一覧からは削除されましたが、Google Drive上にデータが残っている可能性があります。",
      diagnostics: ["Googleへ再接続してください。"],
      canStartDeletion: false,
      hasSelectedProject: false,
    });

    expect(html).toContain("Google Drive上にデータが残っている可能性");
    expect(html).toContain("ローカルコピーは削除していません");
    expect(html).not.toContain("もう一度削除");
    expect(html).not.toContain("自動再試行");
  });
});

describe("project title duplicate user-visible message", () => {
  it("shows the duplicate message on the existing role=alert path", () => {
    const html = renderToStaticMarkup(
      <ProjectTitleDuplicateAlert projectMessage={DUPLICATE_PROJECT_TITLE_MESSAGE} />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain(DUPLICATE_PROJECT_TITLE_MESSAGE);
    expect(html).not.toContain("projectId");
    expect(html).not.toContain("folderId");
    expect(html).not.toContain("revision");
    expect(html).not.toContain("operationId");
    expect(html).not.toContain("ya29");
    expect(html).not.toContain("session");
    expect(html).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    expect(source).toContain(
      "<ProjectTitleDuplicateAlert projectMessage={projectMessage} />",
    );
    expect(source).toContain("projectMessage={projectMessage}");
  });

  it("does not show the duplicate message for other project messages", () => {
    expect(
      renderToStaticMarkup(
        <ProjectTitleDuplicateAlert projectMessage="新しいプロジェクトを作成し、選択状態にしました。" />,
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <ProjectTitleDuplicateAlert projectMessage="選択中プロジェクトの名前をプロジェクト設定と一覧へ反映し、再確認しました。" />,
      ),
    ).toBe("");
    expect(
      getProjectTitleFormFeedback({
        projectMessage: "新しいプロジェクトを作成し、選択状態にしました。",
        projectTitleError: null,
        idleMessage: "アルバムを作成して一覧へ追加します。",
      }),
    ).toEqual({
      text: "アルバムを作成して一覧へ追加します。",
      tone: "idle",
    });
  });

  it("surfaces the sanitized duplicate message on create and rename forms", () => {
    const createFeedback = getProjectTitleFormFeedback({
      projectMessage: DUPLICATE_PROJECT_TITLE_MESSAGE,
      projectTitleError: null,
      idleMessage: "アルバムを作成して一覧へ追加します。",
    });
    const renameFeedback = getProjectTitleFormFeedback({
      projectMessage: DUPLICATE_PROJECT_TITLE_MESSAGE,
      projectTitleError: null,
      idleMessage: "変更後にアルバムの情報を再確認します。",
    });

    expect(createFeedback).toEqual({
      text: DUPLICATE_PROJECT_TITLE_MESSAGE,
      tone: "error",
    });
    expect(renameFeedback).toEqual({
      text: DUPLICATE_PROJECT_TITLE_MESSAGE,
      tone: "error",
    });
    expect(createFeedback.text).not.toContain("projectId");
    expect(renameFeedback.text).not.toContain("projectId");
  });
});

describe("project status panel delete wiring", () => {
  it("wires prepare/cancel/confirm to AppProviders without auto-select", () => {
    const deleteUsage = source.slice(
      source.indexOf("<SelectedProjectDeleteCard"),
      source.indexOf("export function ProjectList"),
    );
    expect(deleteUsage).toContain("void prepareProjectDeletion();");
    expect(deleteUsage).toContain("onCancel={cancelProjectDeletion}");
    expect(deleteUsage).toContain("void confirmProjectDeletion();");
    expect(deleteUsage).not.toContain("checkProject(");
    expect(deleteUsage).not.toContain("selectProject(");
    expect(source).toContain("shouldAutoCheckProject");
    expect(source).toContain("ProductAlertDialog");
    expect(source).toContain("アルバムの管理");
    expect(source).toContain("新しいアルバムを作成");
    expect(source).toContain("選択中のアルバム名を変更");
  });

  it("does not add per-card trash actions or change standalone/photos panels", () => {
    expect(listSource).not.toContain("アルバムを削除");
    expect(source).not.toContain("clearLocalOfflineProjectData(");
    const confirmedStore = readFileSync(
      new URL("./offline-confirmed-store-panel.tsx", import.meta.url),
      "utf8",
    );
    const photosExport = readFileSync(
      new URL("./google-photos-export-panel.tsx", import.meta.url),
      "utf8",
    );
    expect(confirmedStore).toContain("ローカルの保存データを削除しますか？");
    expect(confirmedStore).not.toContain("prepareProjectDeletion");
    expect(photosExport).not.toContain("prepareProjectDeletion");
    expect(photosExport).not.toContain("confirmProjectDeletion");
  });
});

function renderDeleteCard(
  override: Partial<Parameters<typeof SelectedProjectDeleteCard>[0]> & {
    localCopyStatus?: "notAttempted" | "cleared" | "absent" | "failed";
    message?: string | null;
    diagnostics?: string[];
  } = {},
) {
  const status = override.status ?? "idle";
  const localCopyStatus = override.localCopyStatus ?? "notAttempted";
  const message = override.message ?? null;
  const diagnostics = override.diagnostics ?? [];
  const cardOverride = { ...override };
  delete cardOverride.localCopyStatus;
  delete cardOverride.message;
  delete cardOverride.diagnostics;

  return renderToStaticMarkup(
    <SelectedProjectDeleteCard
      hasSelectedProject={true}
      selectedProjectTitle="夏の記録"
      canStartDeletion={true}
      blockedReason={null}
      status={status}
      review={null}
      view={getProjectDeleteViewState({
        status,
        localCopyStatus,
        message,
        diagnostics,
      })}
      isProjectDeleteInFlight={false}
      triggerRef={createRef<HTMLButtonElement>()}
      onPrepare={vi.fn()}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
      {...cardOverride}
    />,
  );
}
