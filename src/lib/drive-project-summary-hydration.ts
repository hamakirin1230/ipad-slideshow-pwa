import {
  validateDriveProjectDetails,
  type DriveProjectDetailsValidationResult,
  type DriveProjectSummary,
} from "./google-drive";

export type HydratedDriveProjectCount = {
  projectId: string;
  slideCount: number | null;
  assetCount: number | null;
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

      results[index] =
        result?.status === "ready"
          ? {
              projectId: project.projectId,
              slideCount: result.details.slideCount,
              assetCount: result.details.assetCount,
            }
          : { projectId: project.projectId, slideCount: null, assetCount: null };
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
