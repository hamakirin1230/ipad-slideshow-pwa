import type {
  DriveFileCandidate,
  DriveProjectSummary,
  ProjectManifest,
} from "../google-drive";
import {
  deriveProjectPublishRevisionSummary,
  getProjectManifestContentCanonicalHash,
  getProjectPublishRevisionCanonicalHash,
  stringifyProjectPublishRevisionCanonical,
  type ProjectPublishRevision,
} from "./project-publish-revision";
import {
  buildProjectRollbackWritePlan,
  getProjectRollbackIndexCanonicalHash,
  type ProjectRollbackMetadataSnapshot,
  type ProjectRollbackPreviewGuard,
} from "./project-rollback-write-plan";

export const TEST_WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
export const TEST_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
export const TEST_ASSET_ID = "33333333-3333-4333-8333-333333333333";
export const TEST_SLIDE_ID = "44444444-4444-4444-8444-444444444444";
export const TEST_CURRENT_REVISION_ID =
  "rev_20260728T010000000Z_11111111";
export const TEST_TARGET_REVISION_ID =
  "rev_20260727T010000000Z_22222222";
export const TEST_NEXT_REVISION_ID = "rev_20260728T020000000Z_33333333";
export const TEST_PUBLISHED_AT = "2026-07-28T02:00:00.000Z";

export function buildTestManifest(
  title: string,
  caption: string,
): ProjectManifest {
  return {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: TEST_WORKSPACE_ID,
    projectId: TEST_PROJECT_ID,
    title,
    slides: [
      {
        slideId: TEST_SLIDE_ID,
        assetId: TEST_ASSET_ID,
        assetFileId: "asset-file",
        assetName: "photo.jpg",
        type: "image",
        mimeType: "image/jpeg",
        source: "localFile",
        sourceMimeType: "image/jpeg",
        sourceMediaItemId: "source",
        fileSize: 101,
        durationSeconds: 8,
        caption,
        createdAt: "2026-07-20T00:00:00.000Z",
        updatedAt: "2026-07-20T00:00:00.000Z",
      },
    ],
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-28T01:00:00.000Z",
  };
}

export function buildTestRevision(input: {
  revisionId: string;
  manifest: ProjectManifest;
  publishedAt: string;
  operation?: "publish" | "rollback";
  restoredFromRevisionId?: string;
  previousRevisionId?: string | null;
}): ProjectPublishRevision {
  const assets = [
    {
      assetId: TEST_ASSET_ID,
      driveFileId: "asset-file",
      mimeType: "image/jpeg",
      sizeBytes: 101,
      modifiedTime: "2026-07-20T00:00:00.000Z",
      checksum: "fresh-checksum",
      remoteOnly: false,
    },
  ];
  return {
    schemaVersion: 1,
    revisionId: input.revisionId,
    projectId: TEST_PROJECT_ID,
    publishedAt: input.publishedAt,
    operation: input.operation ?? "publish",
    ...(input.operation === "rollback"
      ? { restoredFromRevisionId: input.restoredFromRevisionId }
      : {}),
    sourceManifestModifiedTime:
      input.operation === "rollback"
        ? null
        : "2026-07-28T01:00:00.000Z",
    sourceManifestCanonicalHash: getProjectManifestContentCanonicalHash(
      input.manifest,
    ),
    previousRevisionId: input.previousRevisionId ?? null,
    summary: deriveProjectPublishRevisionSummary(input.manifest, assets),
    assets,
    manifest: structuredClone(input.manifest),
  };
}

export function buildTestMetadata(
  id: string,
  name: string,
  role: string,
  parent: string,
  mimeType = "application/vnd.google-apps.folder",
): ProjectRollbackMetadataSnapshot {
  return {
    id,
    name,
    mimeType,
    modifiedTime: "2026-07-28T01:00:00.000Z",
    parents: [parent],
    appProperties: {
      app: "ipad-slideshow-pwa",
      role,
      schemaVersion: "1",
      workspaceId: TEST_WORKSPACE_ID,
      ...(role === "index" ? {} : { projectId: TEST_PROJECT_ID }),
    },
    sizeBytes: null,
    checksum: null,
    trashed: false,
  };
}

export function toTestDriveItem(
  snapshot: ProjectRollbackMetadataSnapshot,
): DriveFileCandidate {
  return {
    id: snapshot.id,
    name: snapshot.name,
    mimeType: snapshot.mimeType,
    ...(snapshot.modifiedTime
      ? { modifiedTime: snapshot.modifiedTime }
      : {}),
    appProperties: { ...snapshot.appProperties },
    ...(snapshot.sizeBytes === null
      ? {}
      : { sizeBytes: snapshot.sizeBytes }),
    ...(snapshot.checksum === null ? {} : { checksum: snapshot.checksum }),
    parents: [...snapshot.parents],
    trashed: snapshot.trashed,
  };
}

export function buildRollbackTestFixture() {
  const publishedManifest = buildTestManifest("Current title", "published");
  const currentRevision = buildTestRevision({
    revisionId: TEST_CURRENT_REVISION_ID,
    manifest: publishedManifest,
    publishedAt: "2026-07-28T01:00:00.000Z",
  });
  const currentManifest = buildTestManifest(
    "Current title",
    "saved unpublished edit",
  );
  currentManifest.publication = {
    schemaVersion: 1,
    currentRevisionId: currentRevision.revisionId,
    publishedAt: currentRevision.publishedAt,
    operation: currentRevision.operation,
    operationId: "pubop_20260728T010000000Z_abcdef12",
    contentCanonicalHash: currentRevision.sourceManifestCanonicalHash,
  };
  const targetManifest = buildTestManifest(
    "Restored title",
    "target caption",
  );
  const targetRevision = buildTestRevision({
    revisionId: TEST_TARGET_REVISION_ID,
    manifest: targetManifest,
    publishedAt: "2026-07-27T01:00:00.000Z",
  });
  const project: DriveProjectSummary = {
    projectId: TEST_PROJECT_ID,
    title: currentManifest.title,
    projectFolderId: "project-folder",
    manifestFileId: "manifest-file",
    assetsFolderId: "assets-folder",
    manifestPath: `projects/${TEST_PROJECT_ID}/manifest.json`,
    createdAt: currentManifest.createdAt,
    updatedAt: currentManifest.updatedAt,
  };
  const assetMetadata = buildTestMetadata(
    "asset-file",
    "photo.jpg",
    "asset",
    "assets-folder",
    "image/jpeg",
  );
  assetMetadata.modifiedTime = "2026-07-20T00:00:00.000Z";
  assetMetadata.sizeBytes = 101;
  assetMetadata.checksum = "fresh-checksum";
  assetMetadata.appProperties.assetId = TEST_ASSET_ID;
  const projectFolder = buildTestMetadata(
    "project-folder",
    TEST_PROJECT_ID,
    "projectRoot",
    "projects-root",
  );
  const manifestFile = buildTestMetadata(
    "manifest-file",
    "manifest.json",
    "projectManifest",
    "project-folder",
    "application/json",
  );
  const assetsFolder = buildTestMetadata(
    "assets-folder",
    "assets",
    "assetsRoot",
    "project-folder",
  );
  const historyFolder = buildTestMetadata(
    "history-folder",
    "history",
    "projectHistory",
    "project-folder",
  );
  const revisionsFolder = buildTestMetadata(
    "revisions-folder",
    "revisions",
    "projectPublishRevisions",
    "history-folder",
  );
  const indexMetadata = buildTestMetadata(
    "index-file",
    "index.json",
    "index",
    "workspace-root",
    "application/json",
  );
  const indexBody = {
    app: "ipad-slideshow-pwa",
    role: "index",
    schemaVersion: 1,
    workspaceId: TEST_WORKSPACE_ID,
    projects: [project],
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: currentManifest.updatedAt,
  };
  const guard: ProjectRollbackPreviewGuard = {
    owner: {
      projectId: TEST_PROJECT_ID,
      targetRevisionId: TEST_TARGET_REVISION_ID,
      requestSequence: 7,
    },
    checkedAt: TEST_PUBLISHED_AT,
    readiness: "ready",
    expectedCurrent: {
      manifestModifiedTime: manifestFile.modifiedTime as string,
      manifestCanonicalHash:
        getProjectManifestContentCanonicalHash(currentManifest),
      currentRevisionId: TEST_CURRENT_REVISION_ID,
    },
    targetRevisionCanonicalBody:
      stringifyProjectPublishRevisionCanonical(targetRevision),
    targetRevisionCanonicalHash:
      getProjectPublishRevisionCanonicalHash(targetRevision),
    targetAssets: [
      {
        assetId: TEST_ASSET_ID,
        driveFileId: "asset-file",
        metadata: assetMetadata,
      },
    ],
    index: {
      metadata: indexMetadata,
      canonicalHash: getProjectRollbackIndexCanonicalHash(indexBody),
      project,
    },
    locations: { projectFolder, manifestFile, assetsFolder },
  };
  const plan = buildProjectRollbackWritePlan({
    operationId: "rbop_20260728T020000000Z_abcdef12",
    workspaceId: TEST_WORKSPACE_ID,
    checkedAt: TEST_PUBLISHED_AT,
    guard,
    currentManifest,
    currentRevisionId: TEST_CURRENT_REVISION_ID,
    targetRevision,
    freshAssets: guard.targetAssets,
    historyFolder,
    revisionsFolder,
    revisionId: TEST_NEXT_REVISION_ID,
    publishedAt: TEST_PUBLISHED_AT,
  });
  const preparedRevisionFile: DriveFileCandidate = {
    id: "prepared-revision-file",
    name: plan.revisionFile.filename,
    mimeType: "application/json",
    modifiedTime: TEST_PUBLISHED_AT,
    appProperties: { ...plan.revisionFile.appProperties },
    parents: [revisionsFolder.id],
    trashed: false,
  };

  return {
    currentManifest,
    currentRevision,
    targetManifest,
    targetRevision,
    project,
    assetMetadata,
    indexBody,
    guard,
    plan,
    metadata: {
      projectFolder,
      manifestFile,
      assetsFolder,
      historyFolder,
      revisionsFolder,
      indexMetadata,
    },
    drive: {
      projectFolder: toTestDriveItem(projectFolder),
      manifestFile: toTestDriveItem(manifestFile),
      assetsFolder: toTestDriveItem(assetsFolder),
      historyFolder: toTestDriveItem(historyFolder),
      revisionsFolder: toTestDriveItem(revisionsFolder),
      indexFile: toTestDriveItem(indexMetadata),
      assetFile: toTestDriveItem(assetMetadata),
      preparedRevisionFile,
    },
  };
}
