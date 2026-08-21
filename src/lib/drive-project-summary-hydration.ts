import {
  countProjectMedia,
  nullableProjectMediaCounts,
} from "./project-media-counts";
import {
  validateDriveProjectDetails,
  type DriveProjectDetailsValidationResult,
  type DriveProjectSummary,
} from "./google-drive";

export type HydratedDriveProjectCount = {
  projectId: string;
  slideCount: number | null;
  assetCount: number | null;
  photoCount: number | null;
  videoCount: number | null;
  otherCount: number | null;
};

export async function hydrateDriveProjectCounts(input: {
  accessToken: string;
  expectedWorkspaceId: string;
  expectedProjectsRootFolderId: string;
  projects: DriveProjectSummary[];
  signal: AbortSignal;
  concurrency?: number;
  readDetails?: typeof validateDriveProjectDetails;
}) {
  const results = new Array<HydratedDriveProjectCount>(input.projects.length);
  const concurrency = Math.max(
    1,
    Math.min(input.concurrency ?? 2, input.projects.length || 1),
  );
  const readDetails = input.readDetails ?? validateDriveProjectDetails;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < input.projects.length) {
      const index = nextIndex;
      nextIndex += 1;
      const project = input.projects[index];
      let result: DriveProjectDetailsValidationResult | null = null;

      try {
        result = await readDetails({
          accessToken: input.accessToken,
          expectedWorkspaceId: input.expectedWorkspaceId,
          expectedProjectsRootFolderId: input.expectedProjectsRootFolderId,
          project,
          signal: input.signal,
        });
      } catch {
        if (input.signal.aborted) throw new DOMException("Aborted", "AbortError");
      }

      results[index] = {
        projectId: project.projectId,
        ...countsFromDetailsResult(result),
      };
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function countsFromDetailsResult(
  result: DriveProjectDetailsValidationResult | null,
) {
  if (result?.status !== "ready") {
    return {
      slideCount: null,
      assetCount: null,
      ...nullableProjectMediaCounts(null),
    };
  }

  return {
    slideCount: result.details.slideCount,
    assetCount: result.details.assetCount,
    ...nullableProjectMediaCounts(countProjectMedia(result.details.slides)),
  };
}
