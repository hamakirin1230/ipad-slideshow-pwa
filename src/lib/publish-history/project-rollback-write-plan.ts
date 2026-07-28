import { DRIVE_VIDEO_OFFLINE_MAX_BYTES } from "../drive-video-policy";
import {
  parseProjectManifest,
  type DriveFileCandidate,
  type DriveProjectSummary,
  type ProjectManifest,
} from "../google-drive";
import {
  PROJECT_MANIFEST_PUBLICATION_SCHEMA_VERSION,
  type ProjectManifestPublication,
} from "./project-manifest-publication";
import { isValidProjectPublishRevisionId } from "./project-publish-revision-id";
import {
  PROJECT_PUBLISH_REVISION_SCHEMA_VERSION,
  deriveProjectPublishRevisionSummary,
  getProjectManifestContentCanonicalHash,
  getProjectManifestPublishableContent,
  getProjectPublishRevisionCanonicalHash,
  hashCanonicalJson,
  parseProjectPublishRevision,
  stringifyCanonicalJson,
  stringifyProjectPublishRevisionCanonical,
  type CanonicalJsonValue,
  type ProjectPublishAssetReference,
  type ProjectPublishRevision,
} from "./project-publish-revision";
import { buildProjectPublishRevisionAppProperties } from "./project-publish-write-plan";
import { isValidProjectRollbackOperationId } from "./project-rollback-operation-id";

export type ProjectRollbackMetadataSnapshot = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  parents: string[];
  appProperties: Record<string, string>;
  sizeBytes: number | null;
  checksum: string | null;
  trashed: boolean;
};

export type ProjectRollbackAssetSnapshot = {
  assetId: string;
  driveFileId: string;
  metadata: ProjectRollbackMetadataSnapshot;
};

export type ProjectRollbackPreviewGuard = {
  owner: {
    projectId: string;
    targetRevisionId: string;
    requestSequence: number;
  };
  checkedAt: string;
  readiness: "ready";
  expectedCurrent: {
    manifestModifiedTime: string;
    manifestCanonicalHash: string;
    currentRevisionId: string;
  };
  targetRevisionCanonicalBody: string;
  targetRevisionCanonicalHash: string;
  targetAssets: ProjectRollbackAssetSnapshot[];
  index: {
    metadata: ProjectRollbackMetadataSnapshot;
    canonicalHash: string;
    project: DriveProjectSummary;
  };
  locations: {
    projectFolder: ProjectRollbackMetadataSnapshot;
    manifestFile: ProjectRollbackMetadataSnapshot;
    assetsFolder: ProjectRollbackMetadataSnapshot;
  };
};

export type ProjectRollbackWriteStep =
  | { kind: "revalidateBeforeRevision" }
  | { kind: "prepareRollbackRevision" }
  | { kind: "verifyRollbackRevision" }
  | { kind: "revalidateBeforeManifestCommit" }
  | { kind: "commitCurrentManifest" }
  | { kind: "verifyCurrentManifest" }
  | { kind: "updateIndexMirror" }
  | { kind: "verifyIndexMirror" };

export const PROJECT_ROLLBACK_WRITE_STEP_ORDER = [
  "revalidateBeforeRevision",
  "prepareRollbackRevision",
  "verifyRollbackRevision",
  "revalidateBeforeManifestCommit",
  "commitCurrentManifest",
  "verifyCurrentManifest",
  "updateIndexMirror",
  "verifyIndexMirror",
] as const;

export type ProjectRollbackWritePlan = {
  operationId: string;
  workspaceId: string;
  projectId: string;
  targetRevisionId: string;
  checkedAt: string;
  expectedCurrent: ProjectRollbackPreviewGuard["expectedCurrent"];
  expectedTarget: {
    canonicalBody: string;
    canonicalHash: string;
    assetSnapshots: ProjectRollbackAssetSnapshot[];
  };
  locations: ProjectRollbackPreviewGuard["locations"] & {
    historyFolder: ProjectRollbackMetadataSnapshot;
    revisionsFolder: ProjectRollbackMetadataSnapshot;
  };
  revisionFile: {
    revisionId: string;
    filename: string;
    body: ProjectPublishRevision;
    canonicalBody: string;
    canonicalHash: string;
    appProperties: Record<string, string>;
  };
  currentManifestUpdate: {
    body: ProjectManifest;
    canonicalContentHash: string;
    publication: ProjectManifestPublication;
  };
  indexMirror: {
    fileId: string;
    expectedMetadata: ProjectRollbackMetadataSnapshot;
    expectedCanonicalHash: string;
    expectedProject: DriveProjectSummary;
    nextProject: DriveProjectSummary;
    updatedAt: string;
  };
  steps: ProjectRollbackWriteStep[];
};

export function snapshotProjectRollbackMetadata(
  file: DriveFileCandidate,
): ProjectRollbackMetadataSnapshot {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime ?? null,
    parents: [...(file.parents ?? [])],
    appProperties: { ...file.appProperties },
    sizeBytes: file.sizeBytes ?? null,
    checksum: file.checksum ?? null,
    trashed: file.trashed === true,
  };
}

export function getProjectRollbackIndexCanonicalHash(indexBody: unknown) {
  return hashCanonicalJson(indexBody as CanonicalJsonValue);
}

export function projectRollbackMetadataSnapshotEquals(
  left: ProjectRollbackMetadataSnapshot,
  right: ProjectRollbackMetadataSnapshot,
) {
  return stringifyCanonicalJson(left as unknown as CanonicalJsonValue) ===
    stringifyCanonicalJson(right as unknown as CanonicalJsonValue);
}

export function projectRollbackAssetSnapshotsEqual(
  left: readonly ProjectRollbackAssetSnapshot[],
  right: readonly ProjectRollbackAssetSnapshot[],
) {
  return stringifyCanonicalJson(
    [...left].sort(compareAssetSnapshot) as unknown as CanonicalJsonValue,
  ) ===
    stringifyCanonicalJson(
      [...right].sort(compareAssetSnapshot) as unknown as CanonicalJsonValue,
    );
}

export function buildProjectRollbackRevisionDraft(input: {
  revisionId: string;
  operationId: string;
  publishedAt: string;
  currentManifest: ProjectManifest;
  currentRevisionId: string;
  targetRevision: ProjectPublishRevision;
  freshAssets: readonly ProjectRollbackAssetSnapshot[];
}): {
  revision: ProjectPublishRevision;
  nextManifest: ProjectManifest;
  publication: ProjectManifestPublication;
} {
  const currentParsed = parseProjectManifest(input.currentManifest);
  const targetParsed = parseProjectPublishRevision(input.targetRevision);
  if (!currentParsed.ok || !targetParsed.ok) {
    throw new TypeError("rollback source must pass validation");
  }
  if (
    !isValidProjectPublishRevisionId(input.revisionId) ||
    !isValidProjectRollbackOperationId(input.operationId) ||
    input.revisionId === input.targetRevision.revisionId ||
    input.revisionId === input.currentRevisionId
  ) {
    throw new TypeError("rollback identifiers are invalid");
  }
  if (
    targetParsed.value.projectId !== currentParsed.value.projectId ||
    targetParsed.value.manifest.workspaceId !==
      currentParsed.value.workspaceId ||
    targetParsed.value.manifest.projectId !== currentParsed.value.projectId ||
    targetParsed.value.manifest.createdAt !== currentParsed.value.createdAt
  ) {
    throw new TypeError("rollback target identity must match current manifest");
  }

  const targetAssetById = new Map(
    targetParsed.value.assets.map((asset) => [asset.assetId, asset]),
  );
  const freshById = new Map(input.freshAssets.map((asset) => [asset.assetId, asset]));
  if (
    targetAssetById.size !== targetParsed.value.assets.length ||
    freshById.size !== input.freshAssets.length ||
    targetAssetById.size !== freshById.size
  ) {
    throw new TypeError("rollback asset set must be exact and unique");
  }

  const assets: ProjectPublishAssetReference[] = [...targetAssetById.values()]
    .map((targetAsset) => {
      const fresh = freshById.get(targetAsset.assetId);
      if (
        !fresh ||
        fresh.driveFileId !== targetAsset.driveFileId ||
        fresh.metadata.id !== targetAsset.driveFileId ||
        fresh.metadata.trashed
      ) {
        throw new TypeError("rollback asset identity changed");
      }
      return {
        assetId: targetAsset.assetId,
        driveFileId: targetAsset.driveFileId,
        mimeType: fresh.metadata.mimeType,
        sizeBytes: fresh.metadata.sizeBytes,
        modifiedTime: fresh.metadata.modifiedTime,
        checksum: fresh.metadata.checksum,
        remoteOnly: deriveRemoteOnly(
          fresh.metadata.mimeType,
          fresh.metadata.sizeBytes,
        ),
      };
    })
    .sort((left, right) => left.assetId.localeCompare(right.assetId));

  const nextManifestContent = {
    ...getProjectManifestPublishableContent(targetParsed.value.manifest),
    app: currentParsed.value.app,
    role: currentParsed.value.role,
    schemaVersion: currentParsed.value.schemaVersion,
    workspaceId: currentParsed.value.workspaceId,
    projectId: currentParsed.value.projectId,
    createdAt: currentParsed.value.createdAt,
    updatedAt: input.publishedAt,
  };
  const nextContentHash = getProjectManifestContentCanonicalHash(
    nextManifestContent,
  );
  const publication: ProjectManifestPublication = {
    schemaVersion: PROJECT_MANIFEST_PUBLICATION_SCHEMA_VERSION,
    currentRevisionId: input.revisionId,
    publishedAt: input.publishedAt,
    operation: "rollback",
    operationId: input.operationId,
    contentCanonicalHash: nextContentHash,
  };
  const nextManifest: ProjectManifest = {
    ...nextManifestContent,
    publication,
  };
  const revision: ProjectPublishRevision = {
    schemaVersion: PROJECT_PUBLISH_REVISION_SCHEMA_VERSION,
    revisionId: input.revisionId,
    projectId: currentParsed.value.projectId,
    publishedAt: input.publishedAt,
    operation: "rollback",
    restoredFromRevisionId: targetParsed.value.revisionId,
    sourceManifestModifiedTime: null,
    sourceManifestCanonicalHash: nextContentHash,
    previousRevisionId: input.currentRevisionId,
    summary: deriveProjectPublishRevisionSummary(nextManifestContent, assets),
    assets,
    manifest: nextManifestContent,
  };
  const revisionParsed = parseProjectPublishRevision(revision);
  const manifestParsed = parseProjectManifest(nextManifest);
  if (!revisionParsed.ok || !manifestParsed.ok) {
    throw new TypeError("rollback revision draft failed validation");
  }
  return {
    revision: revisionParsed.value,
    nextManifest: manifestParsed.value,
    publication,
  };
}

export function buildProjectRollbackWritePlan(input: {
  operationId: string;
  workspaceId: string;
  checkedAt: string;
  guard: ProjectRollbackPreviewGuard;
  currentManifest: ProjectManifest;
  currentRevisionId: string;
  targetRevision: ProjectPublishRevision;
  freshAssets: readonly ProjectRollbackAssetSnapshot[];
  historyFolder: ProjectRollbackMetadataSnapshot;
  revisionsFolder: ProjectRollbackMetadataSnapshot;
  revisionId: string;
  publishedAt: string;
}): ProjectRollbackWritePlan {
  const built = buildProjectRollbackRevisionDraft({
    revisionId: input.revisionId,
    operationId: input.operationId,
    publishedAt: input.publishedAt,
    currentManifest: input.currentManifest,
    currentRevisionId: input.currentRevisionId,
    targetRevision: input.targetRevision,
    freshAssets: input.freshAssets,
  });
  const expectedProject = structuredClone(input.guard.index.project);
  const nextProject = {
    ...expectedProject,
    title: built.nextManifest.title,
    updatedAt: input.publishedAt,
  };
  const plan: ProjectRollbackWritePlan = {
    operationId: input.operationId,
    workspaceId: input.workspaceId,
    projectId: input.guard.owner.projectId,
    targetRevisionId: input.guard.owner.targetRevisionId,
    checkedAt: input.checkedAt,
    expectedCurrent: { ...input.guard.expectedCurrent },
    expectedTarget: {
      canonicalBody: stringifyProjectPublishRevisionCanonical(
        input.targetRevision,
      ),
      canonicalHash: getProjectPublishRevisionCanonicalHash(
        input.targetRevision,
      ),
      assetSnapshots: [...structuredClone(input.freshAssets)],
    },
    locations: {
      ...structuredClone(input.guard.locations),
      historyFolder: structuredClone(input.historyFolder),
      revisionsFolder: structuredClone(input.revisionsFolder),
    },
    revisionFile: {
      revisionId: input.revisionId,
      filename: `${input.revisionId}.json`,
      body: built.revision,
      canonicalBody: stringifyProjectPublishRevisionCanonical(built.revision),
      canonicalHash: getProjectPublishRevisionCanonicalHash(built.revision),
      appProperties: buildProjectPublishRevisionAppProperties({
        workspaceId: input.workspaceId,
        revision: built.revision,
      }),
    },
    currentManifestUpdate: {
      body: built.nextManifest,
      canonicalContentHash:
        getProjectManifestContentCanonicalHash(built.nextManifest),
      publication: built.publication,
    },
    indexMirror: {
      fileId: input.guard.index.metadata.id,
      expectedMetadata: structuredClone(input.guard.index.metadata),
      expectedCanonicalHash: input.guard.index.canonicalHash,
      expectedProject,
      nextProject,
      updatedAt: input.publishedAt,
    },
    steps: PROJECT_ROLLBACK_WRITE_STEP_ORDER.map((kind) => ({ kind })),
  };
  if (!isValidProjectRollbackWritePlan(plan)) {
    throw new TypeError("rollback write plan failed validation");
  }
  return plan;
}

export function isValidProjectRollbackWritePlan(
  value: unknown,
): value is ProjectRollbackWritePlan {
  if (!isRecord(value)) return false;
  const plan = value as unknown as ProjectRollbackWritePlan;
  if (!plan.revisionFile || !plan.currentManifestUpdate || !plan.indexMirror) {
    return false;
  }
  const revision = parseProjectPublishRevision(plan.revisionFile?.body);
  const manifest = parseProjectManifest(plan.currentManifestUpdate?.body);
  let target: ReturnType<typeof parseProjectPublishRevision> | null = null;
  try {
    target = parseProjectPublishRevision(
      JSON.parse(plan.expectedTarget?.canonicalBody),
    );
  } catch {
    target = null;
  }
  const stepKinds = Array.isArray(plan.steps)
    ? plan.steps.map((step) => step?.kind)
    : [];
  const headValid =
    isValidProjectRollbackOperationId(plan.operationId) &&
    typeof plan.workspaceId === "string" &&
    typeof plan.projectId === "string" &&
    isValidProjectPublishRevisionId(plan.targetRevisionId) &&
    target?.ok === true &&
    target.value.revisionId === plan.targetRevisionId &&
    stringifyProjectPublishRevisionCanonical(target.value) ===
      plan.expectedTarget.canonicalBody &&
    getProjectPublishRevisionCanonicalHash(target.value) ===
      plan.expectedTarget.canonicalHash &&
    revision.ok &&
    revision.value.operation === "rollback" &&
    revision.value.restoredFromRevisionId === plan.targetRevisionId &&
    revision.value.previousRevisionId === plan.expectedCurrent?.currentRevisionId &&
    revision.value.sourceManifestModifiedTime === null &&
    plan.revisionFile.revisionId === revision.value.revisionId &&
    plan.revisionFile.filename === `${revision.value.revisionId}.json` &&
    plan.revisionFile.canonicalBody ===
      stringifyProjectPublishRevisionCanonical(revision.value) &&
    plan.revisionFile.canonicalHash ===
      getProjectPublishRevisionCanonicalHash(revision.value) &&
    manifest.ok &&
    manifest.value.workspaceId === plan.workspaceId &&
    manifest.value.projectId === plan.projectId;
  return (
    headValid &&
    validateRollbackPlanTail(
      plan,
      revision.ok ? revision.value : null,
      manifest.ok ? manifest.value : null,
      stepKinds,
    )
  );
}

function validateRollbackPlanTail(
  plan: ProjectRollbackWritePlan,
  revision: ProjectPublishRevision | null,
  manifest: ProjectManifest | null,
  stepKinds: unknown[],
) {
  if (!revision || !manifest || !manifest.publication) return false;
  const publication = manifest.publication;
  const expectedSteps = [...PROJECT_ROLLBACK_WRITE_STEP_ORDER];
  return (
    manifest.createdAt === revision.manifest.createdAt &&
    manifest.updatedAt === revision.publishedAt &&
    publication.operation === "rollback" &&
    publication.operationId === plan.operationId &&
    publication.currentRevisionId === revision.revisionId &&
    publication.publishedAt === revision.publishedAt &&
    publication.contentCanonicalHash === revision.sourceManifestCanonicalHash &&
    getProjectManifestContentCanonicalHash(manifest) ===
      plan.currentManifestUpdate.canonicalContentHash &&
    plan.currentManifestUpdate.canonicalContentHash ===
      revision.sourceManifestCanonicalHash &&
    plan.indexMirror.nextProject.projectId === plan.projectId &&
    plan.indexMirror.nextProject.title === manifest.title &&
    plan.indexMirror.nextProject.updatedAt === manifest.updatedAt &&
    plan.indexMirror.expectedProject.projectId === plan.projectId &&
    sameProjectIdentity(
      plan.indexMirror.expectedProject,
      plan.indexMirror.nextProject,
    ) &&
    stepKinds.length === expectedSteps.length &&
    stepKinds.every((kind, index) => kind === expectedSteps[index])
  );
}

function sameProjectIdentity(
  left: ProjectRollbackWritePlan["indexMirror"]["expectedProject"],
  right: ProjectRollbackWritePlan["indexMirror"]["nextProject"],
) {
  return (
    left.projectId === right.projectId &&
    left.projectFolderId === right.projectFolderId &&
    left.manifestFileId === right.manifestFileId &&
    left.assetsFolderId === right.assetsFolderId &&
    left.manifestPath === right.manifestPath &&
    left.createdAt === right.createdAt
  );
}

function deriveRemoteOnly(mimeType: string, sizeBytes: number | null) {
  return (
    mimeType.startsWith("video/") &&
    (sizeBytes === null || sizeBytes > DRIVE_VIDEO_OFFLINE_MAX_BYTES)
  );
}

function compareAssetSnapshot(
  left: ProjectRollbackAssetSnapshot,
  right: ProjectRollbackAssetSnapshot,
) {
  return left.assetId.localeCompare(right.assetId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
