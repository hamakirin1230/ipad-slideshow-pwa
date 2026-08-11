import { describe, expect, it, vi } from "vitest";
import type { DriveFileCandidate, ProjectManifest } from "../google-drive";
import {
  compareFreshSnapshotToPreviewGuard,
  prepareProjectRollbackExecutionReviewWithAdapter,
  type ProjectRollbackExecutionPreflightAdapter,
} from "./project-rollback-execution-preflight";
import {
  deriveProjectPublishRevisionSummary,
  getProjectManifestContentCanonicalHash,
  getProjectPublishRevisionCanonicalHash,
  stringifyProjectPublishRevisionCanonical,
} from "./project-publish-revision";
import {
  TEST_CURRENT_REVISION_ID,
  TEST_PUBLISHED_AT,
  TEST_TARGET_REVISION_ID,
  TEST_WORKSPACE_ID,
  buildRollbackTestFixture,
} from "./project-rollback-test-fixture";
import {
  getProjectRollbackIndexCanonicalHash,
  snapshotProjectRollbackMetadata,
  type ProjectRollbackPreviewGuard,
} from "./project-rollback-write-plan";

function buildAdapter(input: {
  currentManifest?: ProjectManifest;
  currentRevision?: ReturnType<typeof buildRollbackTestFixture>["currentRevision"];
  targetRevision?: ReturnType<typeof buildRollbackTestFixture>["targetRevision"];
  assetFile?: DriveFileCandidate;
  projectFolder?: DriveFileCandidate;
  indexBody?: Record<string, unknown>;
} = {}) {
  const fixture = buildRollbackTestFixture();
  const currentManifest = input.currentManifest ?? fixture.currentManifest;
  const currentRevision = input.currentRevision ?? fixture.currentRevision;
  const targetRevision = input.targetRevision ?? fixture.targetRevision;
  const assetFile = input.assetFile ?? fixture.drive.assetFile;
  const projectFolder = input.projectFolder ?? fixture.drive.projectFolder;
  const indexBody = input.indexBody ?? fixture.indexBody;
  const suffixes = ["aaaa1111", "bbbb2222"];
  const readBlob = vi.fn();
  const adapter: ProjectRollbackExecutionPreflightAdapter = {
    readMetadata: vi.fn(async ({ fileId }) => {
      const files: Record<string, DriveFileCandidate> = {
        [fixture.project.projectFolderId]: projectFolder,
        [fixture.project.manifestFileId]: fixture.drive.manifestFile,
        [fixture.project.assetsFolderId]: fixture.drive.assetsFolder,
        "index-file": fixture.drive.indexFile,
        "asset-file": assetFile,
      };
      const file = files[fileId];
      if (!file) throw new Error("unexpected metadata read");
      return structuredClone(file);
    }),
    readText: vi.fn(async (_token, fileId) =>
      fileId === fixture.project.manifestFileId
        ? JSON.stringify(currentManifest)
        : JSON.stringify(indexBody),
    ),
    loadRevision: vi.fn(async ({ revisionId }) => {
      if (revisionId === currentManifest.publication?.currentRevisionId) {
        return { ok: true as const, revision: structuredClone(currentRevision) };
      }
      if (revisionId === TEST_TARGET_REVISION_ID) {
        return { ok: true as const, revision: structuredClone(targetRevision) };
      }
      return { ok: false as const, code: "notFound" as const, message: "missing" };
    }),
    listChildren: vi.fn(async ({ parentFolderId }) =>
      parentFolderId === fixture.project.projectFolderId
        ? [fixture.drive.historyFolder]
        : [fixture.drive.revisionsFolder],
    ),
    now: vi.fn(() => TEST_PUBLISHED_AT),
    randomHexSuffix: vi.fn(() => suffixes.shift() ?? "cccc3333"),
  };
  return {
    fixture,
    adapter,
    readBlob,
    currentManifest,
    currentRevision,
    targetRevision,
    assetFile,
    indexBody,
  };
}

function inputFor(
  fixture: ReturnType<typeof buildRollbackTestFixture>,
  guard: ProjectRollbackPreviewGuard | null = fixture.guard,
) {
  return {
    accessToken: "test-token",
    workspaceId: TEST_WORKSPACE_ID,
    projectsRootFolderId: "projects-root",
    indexJsonFileId: "index-file",
    project: fixture.project,
    targetRevisionId: TEST_TARGET_REVISION_ID,
    requestSequence: 7,
    guard: guard as ProjectRollbackPreviewGuard,
    signal: new AbortController().signal,
  };
}

function snapshotFor(fixture: ReturnType<typeof buildRollbackTestFixture>) {
  return {
    currentManifest: structuredClone(fixture.currentManifest),
    currentRevision: structuredClone(fixture.currentRevision),
    targetRevision: structuredClone(fixture.targetRevision),
    assetSnapshots: structuredClone(fixture.guard.targetAssets),
    indexBody: structuredClone(fixture.indexBody),
    indexProject: structuredClone(fixture.project),
    indexMetadata: structuredClone(fixture.metadata.indexMetadata),
    projectFolder: structuredClone(fixture.metadata.projectFolder),
    manifestFile: structuredClone(fixture.metadata.manifestFile),
    assetsFolder: structuredClone(fixture.metadata.assetsFolder),
    historyFolder: structuredClone(fixture.metadata.historyFolder),
    revisionsFolder: structuredClone(fixture.metadata.revisionsFolder),
  };
}

describe("rollback execution preflight", () => {
  it("rejects a missing preview guard without producing a plan", async () => {
    const built = buildAdapter();
    const result = await prepareProjectRollbackExecutionReviewWithAdapter(
      inputFor(built.fixture, null),
      built.adapter,
    );
    expect(result).toMatchObject({ ok: false });
    expect(result).not.toHaveProperty("plan");
    expect(built.adapter.randomHexSuffix).not.toHaveBeenCalled();
  });

  it.each([
    ["project", (guard: ProjectRollbackPreviewGuard) => {
      guard.owner.projectId = "99999999-9999-4999-8999-999999999999";
    }],
    ["target", (guard: ProjectRollbackPreviewGuard) => {
      guard.owner.targetRevisionId =
        "rev_20260726T010000000Z_99999999";
    }],
    ["sequence", (guard: ProjectRollbackPreviewGuard) => {
      guard.owner.requestSequence += 1;
    }],
  ])("rejects %s owner mismatch before ID generation", async (_label, mutate) => {
    const built = buildAdapter();
    const guard = structuredClone(built.fixture.guard);
    mutate(guard);
    const result = await prepareProjectRollbackExecutionReviewWithAdapter(
      inputFor(built.fixture, guard),
      built.adapter,
    );
    expect(result).toMatchObject({
      ok: false,
      code: "previewOwnerMismatch",
    });
    expect(result).not.toHaveProperty("plan");
    expect(built.adapter.randomHexSuffix).not.toHaveBeenCalled();
  });

  it.each([
    ["current modifiedTime", (snapshot: ReturnType<typeof snapshotFor>) => {
      snapshot.manifestFile.modifiedTime = "2026-07-28T01:30:00.000Z";
    }, "current"],
    ["current content", (snapshot: ReturnType<typeof snapshotFor>) => {
      snapshot.currentManifest.slides[0].caption = "changed";
    }, "current"],
    ["current revision", (snapshot: ReturnType<typeof snapshotFor>) => {
      if (!snapshot.currentManifest.publication) throw new Error("missing");
      snapshot.currentManifest.publication.currentRevisionId =
        "rev_20260728T013000000Z_99999999";
    }, "current"],
    ["target canonical", (snapshot: ReturnType<typeof snapshotFor>) => {
      snapshot.targetRevision.manifest.title = "changed target";
    }, "target"],
    ["asset metadata", (snapshot: ReturnType<typeof snapshotFor>) => {
      snapshot.assetSnapshots[0].metadata.modifiedTime =
        "2026-07-28T01:30:00.000Z";
    }, "assets"],
    ["index record", (snapshot: ReturnType<typeof snapshotFor>) => {
      snapshot.indexProject.title = "changed index";
    }, "index"],
    ["project location", (snapshot: ReturnType<typeof snapshotFor>) => {
      snapshot.projectFolder.name = "changed folder";
    }, "location"],
  ])("detects stale %s", (_label, mutate, expected) => {
    const fixture = buildRollbackTestFixture();
    const snapshot = snapshotFor(fixture);
    mutate(snapshot);
    expect(
      compareFreshSnapshotToPreviewGuard({
        guard: fixture.guard,
        snapshot,
        project: fixture.project,
      }),
    ).toBe(expected);
  });

  it("stops before write when the Drive storage name changes after preview", async () => {
    const fixture = buildRollbackTestFixture();
    const renamedAsset = structuredClone(fixture.drive.assetFile);
    renamedAsset.name = "renamed.jpg";
    const built = buildAdapter({ assetFile: renamedAsset });

    const result = await prepareProjectRollbackExecutionReviewWithAdapter(
      inputFor(built.fixture),
      built.adapter,
    );

    expect(result).toMatchObject({ ok: false, code: "stalePreview" });
    expect(result).not.toHaveProperty("plan");
    expect(built.adapter.randomHexSuffix).not.toHaveBeenCalled();
  });

  it("rejects current publication inconsistency", async () => {
    const fixture = buildRollbackTestFixture();
    const inconsistent = structuredClone(fixture.currentRevision);
    inconsistent.publishedAt = "2026-07-28T00:30:00.000Z";
    const built = buildAdapter({ currentRevision: inconsistent });
    const result = await prepareProjectRollbackExecutionReviewWithAdapter(
      inputFor(built.fixture),
      built.adapter,
    );
    expect(result).toMatchObject({ ok: false, code: "invalidTarget" });
    expect(result).not.toHaveProperty("plan");
  });

  it.each(["projectId", "workspaceId", "createdAt"] as const)(
    "rejects target %s identity mismatch",
    async (field) => {
      const fixture = buildRollbackTestFixture();
      const target = structuredClone(fixture.targetRevision);
      if (field === "projectId") {
        target.projectId = "99999999-9999-4999-8999-999999999999";
      } else if (field === "workspaceId") {
        target.manifest.workspaceId =
          "99999999-9999-4999-8999-999999999999";
      } else {
        target.manifest.createdAt = "2026-07-19T00:00:00.000Z";
      }
      const built = buildAdapter({ targetRevision: target });
      const guard = structuredClone(built.fixture.guard);
      guard.targetRevisionCanonicalBody =
        stringifyProjectPublishRevisionCanonical(target);
      guard.targetRevisionCanonicalHash =
        getProjectPublishRevisionCanonicalHash(target);
      const result = await prepareProjectRollbackExecutionReviewWithAdapter(
        inputFor(built.fixture, guard),
        built.adapter,
      );
      expect(result).toMatchObject({ ok: false, code: "invalidTarget" });
      expect(result).not.toHaveProperty("plan");
    },
  );

  it.each([
    ["unavailable", (file: DriveFileCandidate) => {
      file.appProperties.role = "wrong";
    }],
    ["contentChanged", (file: DriveFileCandidate) => {
      file.sizeBytes = 202;
    }],
    ["metadataChanged", (file: DriveFileCandidate) => {
      file.name = "renamed.jpg";
    }],
    ["unverifiable", (file: DriveFileCandidate) => {
      delete file.sizeBytes;
      delete file.checksum;
      delete file.modifiedTime;
    }],
  ])("rejects %s target asset classification", async (_label, mutate) => {
    const fixture = buildRollbackTestFixture();
    const asset = structuredClone(fixture.drive.assetFile);
    mutate(asset);
    const built = buildAdapter({ assetFile: asset });
    const guard = structuredClone(built.fixture.guard);
    guard.targetAssets[0].metadata = snapshotProjectRollbackMetadata(asset);
    const result = await prepareProjectRollbackExecutionReviewWithAdapter(
      inputFor(built.fixture, guard),
      built.adapter,
    );
    expect(result).toMatchObject({
      ok: false,
      code: "previewNotReady",
    });
    expect(result).not.toHaveProperty("plan");
  });

  it("allows remoteOnly alone and uses two independent suffixes", async () => {
    const fixture = buildRollbackTestFixture();
    const target = structuredClone(fixture.targetRevision);
    target.assets[0].mimeType = "video/mp4";
    target.assets[0].sizeBytes = 60 * 1024 * 1024;
    target.assets[0].remoteOnly = true;
    target.manifest.slides[0].type = "video";
    target.manifest.slides[0].mimeType = "video/mp4";
    target.manifest.slides[0].sourceMimeType = "video/mp4";
    target.manifest.slides[0].fileSize = 60 * 1024 * 1024;
    target.sourceManifestCanonicalHash =
      getProjectManifestContentCanonicalHash(target.manifest);
    target.summary = deriveProjectPublishRevisionSummary(
      target.manifest,
      target.assets,
    );
    const asset = structuredClone(fixture.drive.assetFile);
    asset.mimeType = "video/mp4";
    asset.name = `${asset.appProperties.assetId}.mp4`;
    asset.sizeBytes = 60 * 1024 * 1024;
    const built = buildAdapter({ targetRevision: target, assetFile: asset });
    const guard = structuredClone(built.fixture.guard);
    guard.targetRevisionCanonicalBody =
      stringifyProjectPublishRevisionCanonical(target);
    guard.targetRevisionCanonicalHash =
      getProjectPublishRevisionCanonicalHash(target);
    guard.targetAssets[0].metadata = snapshotProjectRollbackMetadata(asset);
    const result = await prepareProjectRollbackExecutionReviewWithAdapter(
      inputFor(built.fixture, guard),
      built.adapter,
    );
    expect(result).toMatchObject({
      ok: true,
      review: { rollbackRemoteOnlyAssetCount: 1 },
    });
    expect(built.adapter.randomHexSuffix).toHaveBeenCalledTimes(2);
    if (!result.ok) throw new Error("expected success");
    expect(result.plan.revisionFile.revisionId).toContain("aaaa1111");
    expect(result.plan.operationId).toContain("bbbb2222");
  });

  it("rejects noChange but allows ready replacement of unpublished edits", async () => {
    const ready = buildAdapter();
    const readyResult = await prepareProjectRollbackExecutionReviewWithAdapter(
      inputFor(ready.fixture),
      ready.adapter,
    );
    expect(readyResult).toMatchObject({
      ok: true,
      review: { replacesUnpublishedChanges: true },
    });

    const fixture = buildRollbackTestFixture();
    const current = structuredClone(fixture.targetManifest);
    const currentRevision = structuredClone(fixture.currentRevision);
    currentRevision.manifest = structuredClone(fixture.targetManifest);
    currentRevision.sourceManifestCanonicalHash =
      getProjectManifestContentCanonicalHash(currentRevision.manifest);
    current.publication = {
      schemaVersion: 1,
      currentRevisionId: TEST_CURRENT_REVISION_ID,
      publishedAt: currentRevision.publishedAt,
      operation: currentRevision.operation,
      operationId: "pubop_20260728T010000000Z_abcdef12",
      contentCanonicalHash: currentRevision.sourceManifestCanonicalHash,
    };
    const project = {
      ...fixture.project,
      title: current.title,
      updatedAt: current.updatedAt,
    };
    const indexBody = { ...fixture.indexBody, projects: [project] };
    const built = buildAdapter({
      currentManifest: current,
      currentRevision,
      indexBody,
    });
    built.fixture.project.title = project.title;
    built.fixture.project.updatedAt = project.updatedAt;
    const guard = structuredClone(built.fixture.guard);
    guard.expectedCurrent.manifestCanonicalHash =
      getProjectManifestContentCanonicalHash(current);
    guard.index.project = project;
    guard.index.canonicalHash = getProjectRollbackIndexCanonicalHash(indexBody);
    const result = await prepareProjectRollbackExecutionReviewWithAdapter(
      { ...inputFor(built.fixture, guard), project },
      built.adapter,
    );
    expect(result).toMatchObject({ ok: false, code: "noChange" });
    expect(result).not.toHaveProperty("plan");
  });

  it("reads metadata only and never requests an asset Blob", async () => {
    const built = buildAdapter();
    const result = await prepareProjectRollbackExecutionReviewWithAdapter(
      inputFor(built.fixture),
      built.adapter,
    );
    expect(result.ok).toBe(true);
    expect(built.readBlob).not.toHaveBeenCalled();
    expect(built.adapter).not.toHaveProperty("readBlob");
    expect(built.adapter.readMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "asset-file" }),
    );
  });
});
