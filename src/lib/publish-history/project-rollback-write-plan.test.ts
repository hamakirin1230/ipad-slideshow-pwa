import { describe, expect, it } from "vitest";
import type { DriveProjectSummary, ProjectManifest } from "../google-drive";
import {
  deriveProjectPublishRevisionSummary,
  getProjectManifestContentCanonicalHash,
  type ProjectPublishRevision,
} from "./project-publish-revision";
import {
  buildProjectRollbackWritePlan,
  isValidProjectRollbackWritePlan,
  type ProjectRollbackMetadataSnapshot,
  type ProjectRollbackPreviewGuard,
} from "./project-rollback-write-plan";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const SLIDE_ID = "44444444-4444-4444-8444-444444444444";
const CURRENT_ID = "rev_20260728T010000000Z_11111111";
const TARGET_ID = "rev_20260727T010000000Z_22222222";
const NEXT_ID = "rev_20260728T020000000Z_33333333";
const PUBLISHED_AT = "2026-07-28T02:00:00.000Z";

function manifest(title: string, caption: string): ProjectManifest {
  return {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title,
    slides: [
      {
        slideId: SLIDE_ID,
        assetId: ASSET_ID,
        assetFileId: "asset-file",
        assetName: "photo.jpg",
        type: "image",
        mimeType: "image/jpeg",
        source: "localFile",
        sourceMimeType: "image/jpeg",
        sourceMediaItemId: "source",
        fileSize: 100,
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

function revision(): ProjectPublishRevision {
  const body = manifest("Restored title", "target caption");
  const assets = [
    {
      assetId: ASSET_ID,
      driveFileId: "asset-file",
      mimeType: "image/jpeg",
      sizeBytes: 100,
      modifiedTime: "2026-07-20T00:00:00.000Z",
      checksum: "old-checksum",
      remoteOnly: false,
    },
  ];
  return {
    schemaVersion: 1,
    revisionId: TARGET_ID,
    projectId: PROJECT_ID,
    publishedAt: "2026-07-27T01:00:00.000Z",
    operation: "publish",
    sourceManifestModifiedTime: "2026-07-27T01:00:00.000Z",
    sourceManifestCanonicalHash: getProjectManifestContentCanonicalHash(body),
    previousRevisionId: null,
    summary: deriveProjectPublishRevisionSummary(body, assets),
    assets,
    manifest: body,
  };
}

function metadata(
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
      workspaceId: WORKSPACE_ID,
      ...(role === "index" ? {} : { projectId: PROJECT_ID }),
    },
    sizeBytes: null,
    checksum: null,
    trashed: false,
  };
}

function fixture() {
  const current = manifest("Current title", "unpublished caption");
  current.publication = {
    schemaVersion: 1,
    currentRevisionId: CURRENT_ID,
    publishedAt: "2026-07-28T01:00:00.000Z",
    operation: "publish",
    operationId: "pubop_20260728T010000000Z_abcdef12",
    contentCanonicalHash: getProjectManifestContentCanonicalHash(current),
  };
  const project: DriveProjectSummary = {
    projectId: PROJECT_ID,
    title: "Current title",
    projectFolderId: "project-folder",
    manifestFileId: "manifest-file",
    assetsFolderId: "assets-folder",
    manifestPath: "manifest.json",
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
  };
  const assetMetadata = metadata(
    "asset-file",
    "photo.jpg",
    "asset",
    "assets-folder",
    "image/jpeg",
  );
  assetMetadata.sizeBytes = 101;
  assetMetadata.checksum = "fresh-checksum";
  const guard: ProjectRollbackPreviewGuard = {
    owner: {
      projectId: PROJECT_ID,
      targetRevisionId: TARGET_ID,
      requestSequence: 1,
    },
    checkedAt: PUBLISHED_AT,
    readiness: "ready",
    expectedCurrent: {
      manifestModifiedTime: "2026-07-28T01:00:00.000Z",
      manifestCanonicalHash: getProjectManifestContentCanonicalHash(current),
      currentRevisionId: CURRENT_ID,
    },
    targetRevisionCanonicalBody: "guard-body",
    targetRevisionCanonicalHash: "fnv1a64:1234567890abcdef",
    targetAssets: [
      { assetId: ASSET_ID, driveFileId: "asset-file", metadata: assetMetadata },
    ],
    index: {
      metadata: metadata("index-file", "index.json", "index", "workspace"),
      canonicalHash: "fnv1a64:abcdef1234567890",
      project,
    },
    locations: {
      projectFolder: metadata(
        "project-folder",
        PROJECT_ID,
        "projectRoot",
        "projects",
      ),
      manifestFile: metadata(
        "manifest-file",
        "manifest.json",
        "projectManifest",
        "project-folder",
        "application/json",
      ),
      assetsFolder: metadata(
        "assets-folder",
        "assets",
        "assetsRoot",
        "project-folder",
      ),
    },
  };
  return { current, project, assetMetadata, guard };
}

describe("rollback write plan", () => {
  it("creates a new target-derived rollback revision from fresh asset metadata", () => {
    const { current, assetMetadata, guard } = fixture();
    const plan = buildProjectRollbackWritePlan({
      operationId: "rbop_20260728T020000000Z_abcdef12",
      workspaceId: WORKSPACE_ID,
      checkedAt: PUBLISHED_AT,
      guard,
      currentManifest: current,
      currentRevisionId: CURRENT_ID,
      targetRevision: revision(),
      freshAssets: [
        { assetId: ASSET_ID, driveFileId: "asset-file", metadata: assetMetadata },
      ],
      historyFolder: metadata(
        "history-folder",
        "history",
        "projectHistory",
        "project-folder",
      ),
      revisionsFolder: metadata(
        "revisions-folder",
        "revisions",
        "projectRevisions",
        "history-folder",
      ),
      revisionId: NEXT_ID,
      publishedAt: PUBLISHED_AT,
    });

    expect(isValidProjectRollbackWritePlan(plan)).toBe(true);
    expect(plan.revisionFile.body).toMatchObject({
      operation: "rollback",
      restoredFromRevisionId: TARGET_ID,
      previousRevisionId: CURRENT_ID,
      sourceManifestModifiedTime: null,
    });
    expect(plan.revisionFile.body.manifest).not.toHaveProperty("publication");
    expect(plan.currentManifestUpdate.body).toMatchObject({
      title: "Restored title",
      createdAt: current.createdAt,
      updatedAt: PUBLISHED_AT,
      publication: {
        operation: "rollback",
        operationId: "rbop_20260728T020000000Z_abcdef12",
      },
    });
    expect(plan.revisionFile.body.assets[0]).toMatchObject({
      sizeBytes: 101,
      checksum: "fresh-checksum",
    });
    expect(plan.indexMirror.nextProject).toMatchObject({
      title: "Restored title",
      updatedAt: PUBLISHED_AT,
      projectFolderId: "project-folder",
    });
  });

  it("restores transition from a newer revision without converting undefined to none", () => {
    const { current, assetMetadata, guard } = fixture();
    current.transition = "zoom";
    const target = revision();
    target.manifest.transition = "fade";
    target.sourceManifestCanonicalHash = getProjectManifestContentCanonicalHash(
      target.manifest,
    );

    const restored = buildProjectRollbackWritePlan({
      operationId: "rbop_20260728T020000000Z_abcdef12",
      workspaceId: WORKSPACE_ID,
      checkedAt: PUBLISHED_AT,
      guard,
      currentManifest: current,
      currentRevisionId: CURRENT_ID,
      targetRevision: target,
      freshAssets: [
        { assetId: ASSET_ID, driveFileId: "asset-file", metadata: assetMetadata },
      ],
      historyFolder: metadata(
        "history-folder",
        "history",
        "projectHistory",
        "project-folder",
      ),
      revisionsFolder: metadata(
        "revisions-folder",
        "revisions",
        "projectRevisions",
        "history-folder",
      ),
      revisionId: NEXT_ID,
      publishedAt: PUBLISHED_AT,
    });

    expect(restored.currentManifestUpdate.body.transition).toBe("fade");
    expect(restored.revisionFile.body.manifest.transition).toBe("fade");

    const legacyTarget = revision();
    expect(legacyTarget.manifest.transition).toBeUndefined();
    const rolledBackToLegacy = buildProjectRollbackWritePlan({
      operationId: "rbop_20260728T020000000Z_abcdef12",
      workspaceId: WORKSPACE_ID,
      checkedAt: PUBLISHED_AT,
      guard,
      currentManifest: current,
      currentRevisionId: CURRENT_ID,
      targetRevision: legacyTarget,
      freshAssets: [
        { assetId: ASSET_ID, driveFileId: "asset-file", metadata: assetMetadata },
      ],
      historyFolder: metadata(
        "history-folder",
        "history",
        "projectHistory",
        "project-folder",
      ),
      revisionsFolder: metadata(
        "revisions-folder",
        "revisions",
        "projectRevisions",
        "history-folder",
      ),
      revisionId: NEXT_ID,
      publishedAt: PUBLISHED_AT,
    });

    expect(rolledBackToLegacy.currentManifestUpdate.body.transition).toBeUndefined();
    expect(rolledBackToLegacy.revisionFile.body.manifest.transition).toBeUndefined();
    expect(rolledBackToLegacy.currentManifestUpdate.body).not.toHaveProperty(
      "transition",
    );
  });

  it("rejects operation-specific invariant changes", () => {
    const { current, assetMetadata, guard } = fixture();
    const plan = buildProjectRollbackWritePlan({
      operationId: "rbop_20260728T020000000Z_abcdef12",
      workspaceId: WORKSPACE_ID,
      checkedAt: PUBLISHED_AT,
      guard,
      currentManifest: current,
      currentRevisionId: CURRENT_ID,
      targetRevision: revision(),
      freshAssets: [
        { assetId: ASSET_ID, driveFileId: "asset-file", metadata: assetMetadata },
      ],
      historyFolder: metadata("history", "history", "projectHistory", "project-folder"),
      revisionsFolder: metadata("revisions", "revisions", "projectRevisions", "history"),
      revisionId: NEXT_ID,
      publishedAt: PUBLISHED_AT,
    });
    const changed = structuredClone(plan);
    changed.revisionFile.body.sourceManifestModifiedTime = PUBLISHED_AT;
    expect(isValidProjectRollbackWritePlan(changed)).toBe(false);
  });
});
