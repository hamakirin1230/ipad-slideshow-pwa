import {
  parseProjectManifest,
  readDriveFileMetadata,
  readDriveTextFile,
  validateIndexJsonProjects,
  type DriveFileCandidate,
  type DriveProjectSummary,
  type ProjectManifest,
} from "../google-drive";
import {
  PROJECT_HISTORY_FOLDER_ROLE,
  PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE,
  loadProjectPublishRevision,
} from "./project-publish-revision-loader";
import {
  getProjectManifestContentCanonicalHash,
  getProjectPublishRevisionCanonicalHash,
  stringifyProjectPublishRevisionCanonical,
  type ProjectPublishRevision,
} from "./project-publish-revision";
import { createProjectPublishRevisionId } from "./project-publish-revision-id";
import { listProjectPublishDriveChildren } from "./project-publish-drive-adapter";
import {
  buildProjectRollbackPreview,
} from "./project-rollback-preview";
import {
  buildProjectRollbackExecutionReview,
  createProjectRollbackExecutionReviewFailure,
  type InternalProjectRollbackExecutionReviewResult,
} from "./project-rollback-execution-review";
import { createProjectRollbackOperationId } from "./project-rollback-operation-id";
import {
  buildProjectRollbackWritePlan,
  getProjectRollbackIndexCanonicalHash,
  projectRollbackAssetSnapshotsEqual,
  projectRollbackMetadataSnapshotEquals,
  snapshotProjectRollbackMetadata,
  type ProjectRollbackAssetSnapshot,
  type ProjectRollbackMetadataSnapshot,
  type ProjectRollbackPreviewGuard,
  type ProjectRollbackWritePlan,
} from "./project-rollback-write-plan";
import { createRandomHexSuffix } from "./project-publish-ui";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export type ProjectRollbackExecutionPreflightAdapter = {
  readMetadata: typeof readDriveFileMetadata;
  readText: typeof readDriveTextFile;
  loadRevision: typeof loadProjectPublishRevision;
  listChildren: (input: {
    accessToken: string;
    workspaceId: string;
    projectId: string;
    parentFolderId: string;
    signal: AbortSignal;
  }) => Promise<DriveFileCandidate[]>;
  now: () => string;
  randomHexSuffix: () => string;
};

const defaultAdapter: ProjectRollbackExecutionPreflightAdapter = {
  readMetadata: readDriveFileMetadata,
  readText: readDriveTextFile,
  loadRevision: loadProjectPublishRevision,
  listChildren: async (input) =>
    listProjectPublishDriveChildren(input.accessToken, input),
  now: () => new Date().toISOString(),
  randomHexSuffix: createRandomHexSuffix,
};

export async function prepareProjectRollbackExecutionReviewInDrive(input: {
  accessToken: string;
  workspaceId: string;
  projectsRootFolderId: string;
  indexJsonFileId: string;
  project: DriveProjectSummary;
  targetRevisionId: string;
  requestSequence: number;
  guard: ProjectRollbackPreviewGuard;
  signal: AbortSignal;
}): Promise<InternalProjectRollbackExecutionReviewResult> {
  return prepareProjectRollbackExecutionReviewWithAdapter(input, defaultAdapter);
}

export async function prepareProjectRollbackExecutionReviewWithAdapter(
  input: {
    accessToken: string;
    workspaceId: string;
    projectsRootFolderId: string;
    indexJsonFileId: string;
    project: DriveProjectSummary;
    targetRevisionId: string;
    requestSequence: number;
    guard: ProjectRollbackPreviewGuard;
    signal: AbortSignal;
  },
  adapter: ProjectRollbackExecutionPreflightAdapter,
): Promise<InternalProjectRollbackExecutionReviewResult> {
  if (
    input.guard.readiness !== "ready" ||
    input.guard.owner.projectId !== input.project.projectId ||
    input.guard.owner.targetRevisionId !== input.targetRevisionId ||
    input.guard.owner.requestSequence !== input.requestSequence
  ) {
    return createProjectRollbackExecutionReviewFailure(
      "previewOwnerMismatch",
      "stale",
    );
  }

  try {
    const snapshot = await readFreshRollbackSnapshot(input, adapter);
    if (!snapshot.ok) return snapshot.failure;
    const staleReason = compareFreshSnapshotToPreviewGuard({
      guard: input.guard,
      snapshot: snapshot.value,
      project: input.project,
    });
    if (staleReason) {
      return createProjectRollbackExecutionReviewFailure(
        "stalePreview",
        "stale",
      );
    }

    const rerun = buildProjectRollbackPreview({
      checkedAt: adapter.now(),
      workspaceId: input.workspaceId,
      projectId: input.project.projectId,
      assetsFolderId: input.project.assetsFolderId,
      currentManifest: snapshot.value.currentManifest,
      currentRevision: snapshot.value.currentRevision,
      targetRevision: snapshot.value.targetRevision,
      freshAssets: snapshot.value.assetSnapshots.map((asset) => ({
        assetId: asset.assetId,
        metadata: toDriveFileCandidate(asset.metadata),
      })),
    });
    if (rerun.readiness !== "ready") {
      return createProjectRollbackExecutionReviewFailure(
        rerun.readiness === "noChange" ? "noChange" : "previewNotReady",
        "blocked",
      );
    }

    // IDs are intentionally generated only after every fresh read and guard
    // comparison has succeeded.
    const publishedAt = adapter.now();
    const revisionId = createProjectPublishRevisionId({
      publishedAt,
      randomSuffix: adapter.randomHexSuffix(),
    });
    const operationId = createProjectRollbackOperationId({
      startedAt: publishedAt,
      randomSuffix: adapter.randomHexSuffix(),
    });
    const plan = buildProjectRollbackWritePlan({
      operationId,
      workspaceId: input.workspaceId,
      checkedAt: publishedAt,
      guard: input.guard,
      currentManifest: snapshot.value.currentManifest,
      currentRevisionId: snapshot.value.currentRevision.revisionId,
      targetRevision: snapshot.value.targetRevision,
      freshAssets: snapshot.value.assetSnapshots,
      historyFolder: snapshot.value.historyFolder,
      revisionsFolder: snapshot.value.revisionsFolder,
      revisionId,
      publishedAt,
    });
    return {
      ok: true,
      plan,
      review: buildProjectRollbackExecutionReview({ preview: rerun, plan }),
    };
  } catch (error) {
    return createProjectRollbackExecutionReviewFailure(
      input.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
        ? "aborted"
        : "driveReadFailed",
      "error",
    );
  }
}

type FreshRollbackSnapshot = {
  currentManifest: ProjectManifest;
  currentRevision: ProjectPublishRevision;
  targetRevision: ProjectPublishRevision;
  assetSnapshots: ProjectRollbackAssetSnapshot[];
  indexBody: Record<string, unknown>;
  indexProject: DriveProjectSummary;
  indexMetadata: ProjectRollbackMetadataSnapshot;
  projectFolder: ProjectRollbackMetadataSnapshot;
  manifestFile: ProjectRollbackMetadataSnapshot;
  assetsFolder: ProjectRollbackMetadataSnapshot;
  historyFolder: ProjectRollbackMetadataSnapshot;
  revisionsFolder: ProjectRollbackMetadataSnapshot;
};

async function readFreshRollbackSnapshot(
  input: {
    accessToken: string;
    workspaceId: string;
    projectsRootFolderId: string;
    indexJsonFileId: string;
    project: DriveProjectSummary;
    targetRevisionId: string;
    signal: AbortSignal;
  },
  adapter: ProjectRollbackExecutionPreflightAdapter,
): Promise<
  | { ok: true; value: FreshRollbackSnapshot }
  | {
      ok: false;
      failure: Extract<InternalProjectRollbackExecutionReviewResult, { ok: false }>;
    }
> {
  const [
    projectFolderFile,
    manifestFileValue,
    assetsFolderFile,
    indexFile,
    manifestText,
    indexText,
    projectChildren,
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
    adapter.listChildren({
      accessToken: input.accessToken,
      workspaceId: input.workspaceId,
      projectId: input.project.projectId,
      parentFolderId: input.project.projectFolderId,
      signal: input.signal,
    }),
  ]);
  if (input.signal.aborted) {
    return failSnapshot("aborted", "error");
  }

  const projectFolder = snapshotProjectRollbackMetadata(projectFolderFile);
  const manifestFile = snapshotProjectRollbackMetadata(manifestFileValue);
  const assetsFolder = snapshotProjectRollbackMetadata(assetsFolderFile);
  const indexMetadata = snapshotProjectRollbackMetadata(indexFile);
  if (
    projectFolder.id !== input.project.projectFolderId ||
    projectFolder.parents[0] !== input.projectsRootFolderId ||
    manifestFile.id !== input.project.manifestFileId ||
    manifestFile.modifiedTime === null ||
    assetsFolder.id !== input.project.assetsFolderId ||
    indexMetadata.id !== input.indexJsonFileId ||
    indexMetadata.modifiedTime === null ||
    indexMetadata.trashed ||
    indexMetadata.appProperties.app !== "ipad-slideshow-pwa" ||
    indexMetadata.appProperties.role !== "index" ||
    indexMetadata.appProperties.schemaVersion !== "1" ||
    indexMetadata.appProperties.workspaceId !== input.workspaceId
  ) {
    return failSnapshot("invalidProjectLocation");
  }

  const currentManifest = parseManifest(manifestText);
  const indexBody = parseObject(indexText);
  const indexValidation = validateIndexJsonProjects(indexText);
  const indexProject =
    indexValidation.status === "ready"
      ? indexValidation.projects.find(
          (project) => project.projectId === input.project.projectId,
        )
      : null;
  if (
    !currentManifest ||
    !currentManifest.publication ||
    currentManifest.workspaceId !== input.workspaceId ||
    currentManifest.projectId !== input.project.projectId
  ) {
    return failSnapshot("invalidCurrent");
  }
  if (!indexBody || !indexProject) return failSnapshot("invalidIndex");

  const historyCandidates = projectChildren.filter(
    (file) =>
      file.name === "history" ||
      file.appProperties.role === PROJECT_HISTORY_FOLDER_ROLE,
  );
  if (historyCandidates.length !== 1) {
    return failSnapshot("invalidProjectLocation");
  }
  const historyFolder = snapshotProjectRollbackMetadata(historyCandidates[0]);
  if (
    historyFolder.mimeType !== FOLDER_MIME_TYPE ||
    historyFolder.parents[0] !== input.project.projectFolderId ||
    historyFolder.trashed ||
    historyFolder.appProperties.app !== "ipad-slideshow-pwa" ||
    historyFolder.appProperties.role !== PROJECT_HISTORY_FOLDER_ROLE ||
    historyFolder.appProperties.schemaVersion !== "1" ||
    historyFolder.appProperties.workspaceId !== input.workspaceId ||
    historyFolder.appProperties.projectId !== input.project.projectId
  ) {
    return failSnapshot("invalidProjectLocation");
  }
  const historyChildren = await adapter.listChildren({
    accessToken: input.accessToken,
    workspaceId: input.workspaceId,
    projectId: input.project.projectId,
    parentFolderId: historyFolder.id,
    signal: input.signal,
  });
  const revisionsCandidates = historyChildren.filter(
    (file) =>
      file.name === "revisions" ||
      file.appProperties.role === PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE,
  );
  if (revisionsCandidates.length !== 1) {
    return failSnapshot("invalidProjectLocation");
  }
  const revisionsFolder = snapshotProjectRollbackMetadata(
    revisionsCandidates[0],
  );
  if (
    revisionsFolder.mimeType !== FOLDER_MIME_TYPE ||
    revisionsFolder.parents[0] !== historyFolder.id ||
    revisionsFolder.trashed ||
    revisionsFolder.appProperties.app !== "ipad-slideshow-pwa" ||
    revisionsFolder.appProperties.role !==
      PROJECT_PUBLISH_REVISIONS_FOLDER_ROLE ||
    revisionsFolder.appProperties.schemaVersion !== "1" ||
    revisionsFolder.appProperties.workspaceId !== input.workspaceId ||
    revisionsFolder.appProperties.projectId !== input.project.projectId
  ) {
    return failSnapshot("invalidProjectLocation");
  }

  const [currentExact, targetExact] = await Promise.all([
    adapter.loadRevision({
      accessToken: input.accessToken,
      workspaceId: input.workspaceId,
      projectId: input.project.projectId,
      projectFolderId: input.project.projectFolderId,
      revisionId: currentManifest.publication.currentRevisionId,
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
  if (
    !currentExact.ok ||
    !targetExact.ok ||
    !publicationMatchesCurrent(currentManifest, currentExact.revision) ||
    targetExact.revision.projectId !== input.project.projectId ||
    targetExact.revision.manifest.workspaceId !== input.workspaceId ||
    targetExact.revision.manifest.projectId !== input.project.projectId ||
    targetExact.revision.manifest.createdAt !== currentManifest.createdAt
  ) {
    return failSnapshot("invalidTarget");
  }

  const assetFiles = await Promise.all(
    targetExact.revision.assets.map((asset) =>
      adapter.readMetadata({
        accessToken: input.accessToken,
        fileId: asset.driveFileId,
        signal: input.signal,
      }),
    ),
  );
  const assetSnapshots = targetExact.revision.assets.map((asset, index) => ({
    assetId: asset.assetId,
    driveFileId: asset.driveFileId,
    metadata: snapshotProjectRollbackMetadata(assetFiles[index]),
  }));
  if (
    assetSnapshots.some(
      (asset) =>
        asset.metadata.id !== asset.driveFileId ||
        asset.metadata.trashed ||
        asset.metadata.parents.length !== 1 ||
        asset.metadata.parents[0] !== input.project.assetsFolderId,
    )
  ) {
    return failSnapshot("invalidAsset");
  }

  return {
    ok: true,
    value: {
      currentManifest,
      currentRevision: currentExact.revision,
      targetRevision: targetExact.revision,
      assetSnapshots,
      indexBody,
      indexProject,
      indexMetadata,
      projectFolder,
      manifestFile,
      assetsFolder,
      historyFolder,
      revisionsFolder,
    },
  };
}

export function compareFreshSnapshotToPreviewGuard(input: {
  guard: ProjectRollbackPreviewGuard;
  snapshot: FreshRollbackSnapshot;
  project: DriveProjectSummary;
}): string | null {
  const currentHash = getProjectManifestContentCanonicalHash(
    input.snapshot.currentManifest,
  );
  const targetBody = stringifyProjectPublishRevisionCanonical(
    input.snapshot.targetRevision,
  );
  const targetHash = getProjectPublishRevisionCanonicalHash(
    input.snapshot.targetRevision,
  );
  if (
    input.snapshot.manifestFile.modifiedTime !==
      input.guard.expectedCurrent.manifestModifiedTime ||
    currentHash !== input.guard.expectedCurrent.manifestCanonicalHash ||
    input.snapshot.currentManifest.publication?.currentRevisionId !==
      input.guard.expectedCurrent.currentRevisionId
  ) {
    return "current";
  }
  if (
    targetBody !== input.guard.targetRevisionCanonicalBody ||
    targetHash !== input.guard.targetRevisionCanonicalHash
  ) {
    return "target";
  }
  if (
    !projectRollbackAssetSnapshotsEqual(
      input.snapshot.assetSnapshots,
      input.guard.targetAssets,
    )
  ) {
    return "assets";
  }
  if (
    getProjectRollbackIndexCanonicalHash(input.snapshot.indexBody) !==
      input.guard.index.canonicalHash ||
    JSON.stringify(input.snapshot.indexProject) !==
      JSON.stringify(input.guard.index.project) ||
    JSON.stringify(input.snapshot.indexProject) !== JSON.stringify(input.project)
  ) {
    return "index";
  }
  if (
    !projectRollbackMetadataSnapshotEquals(
      input.snapshot.projectFolder,
      input.guard.locations.projectFolder,
    ) ||
    !projectRollbackMetadataSnapshotEquals(
      input.snapshot.manifestFile,
      input.guard.locations.manifestFile,
    ) ||
    !projectRollbackMetadataSnapshotEquals(
      input.snapshot.assetsFolder,
      input.guard.locations.assetsFolder,
    ) ||
    !projectRollbackMetadataSnapshotEquals(
      input.snapshot.indexMetadata,
      input.guard.index.metadata,
    )
  ) {
    return "location";
  }
  return null;
}

export async function revalidateProjectRollbackWritePlanInDrive(input: {
  accessToken: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
  plan: ProjectRollbackWritePlan;
  signal: AbortSignal;
}) {
  const guard: ProjectRollbackPreviewGuard = {
    owner: {
      projectId: input.plan.projectId,
      targetRevisionId: input.plan.targetRevisionId,
      requestSequence: 0,
    },
    checkedAt: input.plan.checkedAt,
    readiness: "ready",
    expectedCurrent: input.plan.expectedCurrent,
    targetRevisionCanonicalBody: input.plan.expectedTarget.canonicalBody,
    targetRevisionCanonicalHash: input.plan.expectedTarget.canonicalHash,
    targetAssets: input.plan.expectedTarget.assetSnapshots,
    index: {
      metadata: input.plan.indexMirror.expectedMetadata,
      canonicalHash: input.plan.indexMirror.expectedCanonicalHash,
      project: input.plan.indexMirror.expectedProject,
    },
    locations: {
      projectFolder: input.plan.locations.projectFolder,
      manifestFile: input.plan.locations.manifestFile,
      assetsFolder: input.plan.locations.assetsFolder,
    },
  };
  const snapshot = await readFreshRollbackSnapshot(
    {
      accessToken: input.accessToken,
      workspaceId: input.plan.workspaceId,
      projectsRootFolderId: input.projectsRootFolderId,
      indexJsonFileId: input.plan.indexMirror.fileId,
      project: input.project,
      targetRevisionId: input.plan.targetRevisionId,
      signal: input.signal,
    },
    defaultAdapter,
  );
  if (!snapshot.ok) {
    return {
      ok: false as const,
      code: snapshot.failure.code,
      recoverability: "conflict" as const,
    };
  }
  const mismatch = compareFreshSnapshotToPreviewGuard({
    guard,
    snapshot: snapshot.value,
    project: input.project,
  });
  return mismatch
    ? {
        ok: false as const,
        code: "stalePlan",
        recoverability: "conflict" as const,
      }
    : { ok: true as const };
}

function failSnapshot(
  code: string,
  category: "stale" | "blocked" | "error" = "blocked",
) {
  return {
    ok: false as const,
    failure: createProjectRollbackExecutionReviewFailure(code, category),
  };
}

function parseManifest(text: string) {
  const body = parseObject(text);
  if (!body) return null;
  const parsed = parseProjectManifest(body);
  return parsed.ok ? parsed.value : null;
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function publicationMatchesCurrent(
  manifest: ProjectManifest,
  revision: ProjectPublishRevision,
) {
  const publication = manifest.publication;
  return (
    publication?.currentRevisionId === revision.revisionId &&
    publication.publishedAt === revision.publishedAt &&
    publication.operation === revision.operation &&
    publication.contentCanonicalHash === revision.sourceManifestCanonicalHash
  );
}

function toDriveFileCandidate(
  metadata: ProjectRollbackMetadataSnapshot,
): DriveFileCandidate {
  return {
    id: metadata.id,
    name: metadata.name,
    mimeType: metadata.mimeType,
    ...(metadata.modifiedTime
      ? { modifiedTime: metadata.modifiedTime }
      : {}),
    appProperties: { ...metadata.appProperties },
    ...(metadata.sizeBytes !== null ? { sizeBytes: metadata.sizeBytes } : {}),
    ...(metadata.checksum !== null ? { checksum: metadata.checksum } : {}),
    parents: [...metadata.parents],
    trashed: metadata.trashed,
  };
}
