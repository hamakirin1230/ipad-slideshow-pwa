import {
  parseProjectManifest,
  readDriveFileMetadata,
  readDriveTextFile,
  validateIndexJsonProjects,
  type DriveFileCandidate,
  type DriveProjectSummary,
} from "../google-drive";
import {
  loadProjectPublishRevision,
  type LoadProjectPublishRevisionResult,
} from "./project-publish-revision-loader";
import {
  getProjectManifestContentCanonicalHash,
  getProjectPublishRevisionCanonicalHash,
  stringifyProjectPublishRevisionCanonical,
} from "./project-publish-revision";
import {
  buildProjectRollbackPreview,
  type ProjectRollbackFreshAsset,
  type ProjectRollbackPreview,
} from "./project-rollback-preview";
import {
  createPrepareProjectRollbackPreviewFailure,
  prepareProjectRollbackPreviewInDrive,
  type PrepareProjectRollbackPreviewResult,
} from "./project-rollback-review";
import {
  getProjectRollbackIndexCanonicalHash,
  snapshotProjectRollbackMetadata,
  type ProjectRollbackPreviewGuard,
} from "./project-rollback-write-plan";

export type InternalProjectRollbackPreviewPreparationResult =
  | {
      ok: true;
      preview: ProjectRollbackPreview;
      guard: ProjectRollbackPreviewGuard | null;
    }
  | Extract<PrepareProjectRollbackPreviewResult, { ok: false }>;

export type ProjectRollbackPreviewGuardAdapter = {
  preparePreview: typeof prepareProjectRollbackPreviewInDrive;
  readMetadata: typeof readDriveFileMetadata;
  readText: typeof readDriveTextFile;
  loadRevision: typeof loadProjectPublishRevision;
  now: () => string;
};

const defaultAdapter: ProjectRollbackPreviewGuardAdapter = {
  preparePreview: prepareProjectRollbackPreviewInDrive,
  readMetadata: readDriveFileMetadata,
  readText: readDriveTextFile,
  loadRevision: loadProjectPublishRevision,
  now: () => new Date().toISOString(),
};

export async function prepareProjectRollbackPreviewGuardInDrive(input: {
  accessToken: string;
  workspaceId: string;
  projectsRootFolderId: string;
  indexJsonFileId: string;
  project: DriveProjectSummary;
  targetRevisionId: string;
  requestSequence: number;
  signal: AbortSignal;
}): Promise<InternalProjectRollbackPreviewPreparationResult> {
  return prepareProjectRollbackPreviewGuardWithAdapter(input, defaultAdapter);
}

export async function prepareProjectRollbackPreviewGuardWithAdapter(
  input: {
    accessToken: string;
    workspaceId: string;
    projectsRootFolderId: string;
    indexJsonFileId: string;
    project: DriveProjectSummary;
    targetRevisionId: string;
    requestSequence: number;
    signal: AbortSignal;
  },
  adapter: ProjectRollbackPreviewGuardAdapter,
): Promise<InternalProjectRollbackPreviewPreparationResult> {
  const first = await adapter.preparePreview(input);
  if (!first.ok) return first;
  if (first.preview.readiness !== "ready") {
    return { ...first, guard: null };
  }

  try {
    const [
      projectFolder,
      manifestFile,
      assetsFolder,
      indexFile,
      manifestText,
      indexText,
    ] = await Promise.all([
      adapter.readMetadata({
        accessToken: input.accessToken,
        fileId: input.project.projectFolderId,
        signal: input.signal,
      }),
      adapter.readMetadata({
        accessToken: input.accessToken,
        fileId: input.project.manifestFileId,
        signal: input.signal,
      }),
      adapter.readMetadata({
        accessToken: input.accessToken,
        fileId: input.project.assetsFolderId,
        signal: input.signal,
      }),
      adapter.readMetadata({
        accessToken: input.accessToken,
        fileId: input.indexJsonFileId,
        signal: input.signal,
      }),
      adapter.readText(
        input.accessToken,
        input.project.manifestFileId,
        input.signal,
      ),
      adapter.readText(input.accessToken, input.indexJsonFileId, input.signal),
    ]);
    const manifest = parseJsonManifest(manifestText);
    const indexBody = parseJson(indexText);
    const indexProjects = validateIndexJsonProjects(indexText);
    const indexProject =
      indexProjects.status === "ready"
        ? indexProjects.projects.find(
            (project) => project.projectId === input.project.projectId,
          )
        : null;
    if (
      input.signal.aborted ||
      !manifest ||
      !manifest.publication ||
      !indexBody ||
      !indexProject ||
      !sameProject(indexProject, input.project) ||
      !validLocationSnapshots({
        input,
        projectFolder,
        manifestFile,
        assetsFolder,
        indexFile,
      })
    ) {
      return createPrepareProjectRollbackPreviewFailure(
        input.signal.aborted ? "aborted" : "staleCurrent",
      );
    }

    const [currentExact, targetExact] = await Promise.all([
      adapter.loadRevision({
        accessToken: input.accessToken,
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
        projectFolderId: input.project.projectFolderId,
        revisionId: manifest.publication.currentRevisionId,
        signal: input.signal,
      }),
      adapter.loadRevision({
        accessToken: input.accessToken,
        workspaceId: input.workspaceId,
        projectId: input.project.projectId,
        projectFolderId: input.project.projectFolderId,
        revisionId: input.targetRevisionId,
        signal: input.signal,
      }),
    ]);
    if (!currentExact.ok || !targetExact.ok) {
      return createPrepareProjectRollbackPreviewFailure("staleTargetRevision");
    }
    const freshAssets = await loadFreshAssets(input, targetExact, adapter);
    const checkedAt = adapter.now();
    const rerun = buildProjectRollbackPreview({
      checkedAt,
      workspaceId: input.workspaceId,
      projectId: input.project.projectId,
      assetsFolderId: input.project.assetsFolderId,
      currentManifest: manifest,
      currentRevision: currentExact.revision,
      targetRevision: targetExact.revision,
      freshAssets,
    });
    if (rerun.readiness !== "ready") {
      return {
        ok: true,
        preview: rerun,
        guard: null,
      };
    }
    if (
      rerun.targetRevisionId !== first.preview.targetRevisionId ||
      rerun.manifestImpact.rollbackProjectTitle !==
        first.preview.manifestImpact.rollbackProjectTitle
    ) {
      return createPrepareProjectRollbackPreviewFailure("staleTargetRevision");
    }

    return {
      ok: true,
      preview: rerun,
      guard: {
        owner: {
          projectId: input.project.projectId,
          targetRevisionId: input.targetRevisionId,
          requestSequence: input.requestSequence,
        },
        checkedAt,
        readiness: "ready",
        expectedCurrent: {
          manifestModifiedTime: manifestFile.modifiedTime as string,
          manifestCanonicalHash:
            getProjectManifestContentCanonicalHash(manifest),
          currentRevisionId: manifest.publication.currentRevisionId,
        },
        targetRevisionCanonicalBody:
          stringifyProjectPublishRevisionCanonical(targetExact.revision),
        targetRevisionCanonicalHash:
          getProjectPublishRevisionCanonicalHash(targetExact.revision),
        targetAssets: freshAssets.map((asset) => ({
          assetId: asset.assetId,
          driveFileId:
            targetExact.revision.assets.find(
              (candidate) => candidate.assetId === asset.assetId,
            )?.driveFileId ?? "",
          metadata: snapshotProjectRollbackMetadata(
            asset.metadata as DriveFileCandidate,
          ),
        })),
        index: {
          metadata: snapshotProjectRollbackMetadata(indexFile),
          canonicalHash: getProjectRollbackIndexCanonicalHash(indexBody),
          project: structuredClone(indexProject),
        },
        locations: {
          projectFolder: snapshotProjectRollbackMetadata(projectFolder),
          manifestFile: snapshotProjectRollbackMetadata(manifestFile),
          assetsFolder: snapshotProjectRollbackMetadata(assetsFolder),
        },
      },
    };
  } catch (error) {
    return createPrepareProjectRollbackPreviewFailure(
      input.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
        ? "aborted"
        : "driveReadFailed",
    );
  }
}

async function loadFreshAssets(
  input: {
    accessToken: string;
    signal: AbortSignal;
  },
  target: Extract<LoadProjectPublishRevisionResult, { ok: true }>,
  adapter: ProjectRollbackPreviewGuardAdapter,
): Promise<ProjectRollbackFreshAsset[]> {
  return Promise.all(
    target.revision.assets.map(async (asset) => ({
      assetId: asset.assetId,
      metadata: await adapter.readMetadata({
        accessToken: input.accessToken,
        fileId: asset.driveFileId,
        signal: input.signal,
      }),
    })),
  );
}

function parseJsonManifest(text: string) {
  const body = parseJson(text);
  if (!body) return null;
  const parsed = parseProjectManifest(body);
  return parsed.ok ? parsed.value : null;
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function sameProject(left: DriveProjectSummary, right: DriveProjectSummary) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validLocationSnapshots(input: {
  input: {
    workspaceId: string;
    projectsRootFolderId: string;
    indexJsonFileId: string;
    project: DriveProjectSummary;
  };
  projectFolder: DriveFileCandidate;
  manifestFile: DriveFileCandidate;
  assetsFolder: DriveFileCandidate;
  indexFile: DriveFileCandidate;
}) {
  return (
    input.projectFolder.id === input.input.project.projectFolderId &&
    input.projectFolder.parents?.[0] === input.input.projectsRootFolderId &&
    input.projectFolder.appProperties.workspaceId === input.input.workspaceId &&
    input.projectFolder.appProperties.projectId ===
      input.input.project.projectId &&
    input.manifestFile.id === input.input.project.manifestFileId &&
    typeof input.manifestFile.modifiedTime === "string" &&
    input.manifestFile.parents?.[0] === input.input.project.projectFolderId &&
    input.assetsFolder.id === input.input.project.assetsFolderId &&
    input.assetsFolder.parents?.[0] === input.input.project.projectFolderId &&
    input.indexFile.id === input.input.indexJsonFileId &&
    typeof input.indexFile.modifiedTime === "string" &&
    input.indexFile.trashed === false &&
    input.indexFile.appProperties.app === "ipad-slideshow-pwa" &&
    input.indexFile.appProperties.role === "index" &&
    input.indexFile.appProperties.schemaVersion === "1" &&
    input.indexFile.appProperties.workspaceId === input.input.workspaceId
  );
}
