import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { hydrateDriveProjectCounts } from "./drive-project-summary-hydration";
import type { DriveProjectSummary } from "./google-drive";

const source = readFileSync(
  new URL("./drive-project-summary-hydration.ts", import.meta.url),
  "utf8",
);

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
  it("derives media counts from the existing details read without extra requests", async () => {
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
          slides: [
            { type: "image" as const, mimeType: "image/jpeg" },
            { type: "image" as const, mimeType: "image/png" },
            { type: "image" as const, mimeType: "image/webp" },
            { type: "video" as const, mimeType: "video/mp4" },
            { mimeType: "video/quicktime" },
            { mimeType: "application/octet-stream" },
          ],
          slideCount: 6,
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
    expect(result[0]).toEqual({
      projectId: "project-1",
      slideCount: 6,
      assetCount: 20,
      photoCount: 3,
      videoCount: 2,
      otherCount: 1,
    });
    expect(source).toContain("countProjectMedia(result.details.slides)");
    expect(source.match(/await readDetails\(/g)).toHaveLength(1);
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
    expect(result).toEqual([
      {
        projectId: "project-1",
        slideCount: null,
        assetCount: null,
        photoCount: null,
        videoCount: null,
        otherCount: null,
      },
    ]);
  });
});
