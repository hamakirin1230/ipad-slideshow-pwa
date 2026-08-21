import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProjectSummary } from "@/app/app-providers";
import {
  getProjectDriveNotReadyNotice,
  ProjectList,
} from "./project-status-panel";

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
      body: "設定を完了すると、作品を選べます。",
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
