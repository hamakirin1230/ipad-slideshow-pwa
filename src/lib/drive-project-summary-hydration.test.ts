import { describe, expect, it, vi } from "vitest";
import { hydrateDriveProjectCounts } from "./drive-project-summary-hydration";
import type { DriveProjectSummary } from "./google-drive";

function project(index: number): DriveProjectSummary {
  return {
    projectId: `project-${index}`,
    title: `Project ${index}`,
    projectFolderId: `folder-${index}`,
    manifestFileId: `manifest-${index}`,
    assetsFolderId: `assets-${index}`,
    manifestPath: `projects/project-${index}/manifest.json`,
    createdAt: "2026-06-12T21:50:49.646Z",
    updatedAt: "2026-06-12T21:50:49.646Z",
  };
}

describe("read-only project count hydration", () => {
  it("uses bounded reads without selecting, retrying, or writing", async () => {
    let active = 0;
    let maxActive = 0;
    const readDetails = vi.fn(async ({ project: item }: { project: DriveProjectSummary }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return {
        status: "ready" as const,
        details: {
          project: item,
          slides: [],
          slideCount: Number(item.projectId.split("-")[1]),
          assetCount: 20,
        },
        diagnostics: [],
      };
    });

    const projects = Array.from({ length: 11 }, (_, index) => project(index + 1));
    const result = await hydrateDriveProjectCounts({
      accessToken: "test-token",
      expectedWorkspaceId: "workspace",
      expectedProjectsRootFolderId: "projects-root",
      projects,
      signal: new AbortController().signal,
      concurrency: 2,
      readDetails: readDetails as never,
    });

    expect(readDetails).toHaveBeenCalledTimes(11);
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(result[0]).toMatchObject({ projectId: "project-1", slideCount: 1, assetCount: 20 });
    expect(projects[0].projectId).toBe("project-1");
  });

  it("leaves failed reads unknown and does not retry", async () => {
    const readDetails = vi.fn().mockRejectedValue(new Error("read failed"));
    const result = await hydrateDriveProjectCounts({
      accessToken: "test-token",
      expectedWorkspaceId: "workspace",
      expectedProjectsRootFolderId: "projects-root",
      projects: [project(1)],
      signal: new AbortController().signal,
      readDetails,
    });

    expect(readDetails).toHaveBeenCalledOnce();
    expect(result).toEqual([{ projectId: "project-1", slideCount: null, assetCount: null }]);
  });
});
