import { describe, expect, it, vi } from "vitest";
import type { DriveFileCandidate } from "../google-drive";
import {
  buildProjectRollbackExecutionReview,
  createProjectRollbackExecutionReviewFailure,
} from "./project-rollback-execution-review";
import {
  prepareProjectRollbackExecutionReviewWithAdapter,
  type ProjectRollbackExecutionPreflightAdapter,
} from "./project-rollback-execution-preflight";
import { buildProjectRollbackPreview } from "./project-rollback-preview";
import { createRandomHexSuffix } from "./project-publish-ui";
import {
  TEST_PROJECT_ID,
  TEST_PUBLISHED_AT,
  TEST_TARGET_REVISION_ID,
  buildRollbackTestFixture,
} from "./project-rollback-test-fixture";

function reviewFixture() {
  const fixture = buildRollbackTestFixture();
  const preview = buildProjectRollbackPreview({
    checkedAt: TEST_PUBLISHED_AT,
    workspaceId: fixture.plan.workspaceId,
    projectId: TEST_PROJECT_ID,
    assetsFolderId: fixture.project.assetsFolderId,
    currentManifest: fixture.currentManifest,
    currentRevision: fixture.currentRevision,
    targetRevision: fixture.targetRevision,
    freshAssets: [
      {
        assetId: fixture.targetRevision.assets[0].assetId,
        metadata: fixture.drive.assetFile,
      },
    ],
  });
  return { fixture, preview };
}

function preflightFixture() {
  const fixture = buildRollbackTestFixture();
  const files: Record<string, DriveFileCandidate> = {
    [fixture.project.projectFolderId]: fixture.drive.projectFolder,
    [fixture.project.manifestFileId]: fixture.drive.manifestFile,
    [fixture.project.assetsFolderId]: fixture.drive.assetsFolder,
    "index-file": fixture.drive.indexFile,
    "asset-file": fixture.drive.assetFile,
  };
  let randomCall = 0;
  const cryptoSource: Pick<Crypto, "getRandomValues"> = {
    getRandomValues: vi.fn((array) => {
      randomCall += 1;
      array.fill(randomCall === 1 ? 0x11 : 0x22);
      return array;
    }),
  };
  const adapter: ProjectRollbackExecutionPreflightAdapter = {
    readMetadata: vi.fn(async ({ fileId }) => structuredClone(files[fileId])),
    readText: vi.fn(async (_token, fileId) =>
      fileId === fixture.project.manifestFileId
        ? JSON.stringify(fixture.currentManifest)
        : JSON.stringify(fixture.indexBody),
    ),
    loadRevision: vi.fn(async ({ revisionId }) =>
      revisionId === fixture.currentRevision.revisionId
        ? { ok: true as const, revision: structuredClone(fixture.currentRevision) }
        : { ok: true as const, revision: structuredClone(fixture.targetRevision) },
    ),
    listChildren: vi.fn(async ({ parentFolderId }) =>
      parentFolderId === fixture.project.projectFolderId
        ? [fixture.drive.historyFolder]
        : [fixture.drive.revisionsFolder],
    ),
    now: vi.fn(() => TEST_PUBLISHED_AT),
    randomHexSuffix: vi.fn(() =>
      createRandomHexSuffix(4, cryptoSource),
    ),
  };
  const input = {
    accessToken: "test-token",
    workspaceId: fixture.plan.workspaceId,
    projectsRootFolderId: "projects-root",
    indexJsonFileId: "index-file",
    project: fixture.project,
    targetRevisionId: TEST_TARGET_REVISION_ID,
    requestSequence: 7,
    guard: fixture.guard,
    signal: new AbortController().signal,
  };
  return { fixture, adapter, input, cryptoSource };
}

describe("rollback execution review", () => {
  it("creates a sanitized review and internal plan only after fresh preflight succeeds", async () => {
    const built = preflightFixture();
    const result = await prepareProjectRollbackExecutionReviewWithAdapter(
      built.input,
      built.adapter,
    );
    expect(result).toMatchObject({
      ok: true,
      review: {
        targetRevisionId: TEST_TARGET_REVISION_ID,
        rollbackProjectTitle: built.fixture.targetManifest.title,
      },
    });
    if (!result.ok) throw new Error("expected success");
    expect(result.plan.revisionFile.revisionId).toContain("11111111");
    expect(result.plan.operationId).toContain("22222222");
    expect(built.cryptoSource.getRandomValues).toHaveBeenCalledTimes(2);
    expect(result.review).not.toHaveProperty("operationId");
    expect(result.review).not.toHaveProperty("plan");
  });

  it("does not generate IDs or return a plan when fresh preflight fails", async () => {
    const built = preflightFixture();
    built.input.guard = structuredClone(built.fixture.guard);
    built.input.guard.owner.requestSequence += 1;
    const result = await prepareProjectRollbackExecutionReviewWithAdapter(
      built.input,
      built.adapter,
    );
    expect(result).toMatchObject({
      ok: false,
      code: "previewOwnerMismatch",
    });
    expect(result).not.toHaveProperty("plan");
    expect(built.adapter.randomHexSuffix).not.toHaveBeenCalled();
    expect(built.cryptoSource.getRandomValues).not.toHaveBeenCalled();
  });

  it("builds a sanitized review from a successfully prepared internal plan", () => {
    const { fixture, preview } = reviewFixture();
    const review = buildProjectRollbackExecutionReview({
      preview,
      plan: fixture.plan,
    });
    expect(review).toMatchObject({
      projectId: TEST_PROJECT_ID,
      targetRevisionId: fixture.plan.targetRevisionId,
      revisionId: fixture.plan.revisionFile.revisionId,
      rollbackProjectTitle: fixture.plan.currentManifestUpdate.body.title,
      replacesUnpublishedChanges: true,
      createsNewRollbackRevision: true,
      updatesCurrentManifest: true,
      updatesIndexMirror: true,
      offlineSyncRequired: true,
    });
    expect(review).not.toHaveProperty("plan");
  });

  it("does not use the preview object as a write plan", () => {
    const { fixture, preview } = reviewFixture();
    const beforePlan = structuredClone(fixture.plan);
    const changedPreview = structuredClone(preview);
    changedPreview.targetRevisionId =
      "rev_20260726T010000000Z_99999999";
    changedPreview.manifestImpact.rollbackProjectTitle =
      "untrusted preview title";
    const review = buildProjectRollbackExecutionReview({
      preview: changedPreview,
      plan: fixture.plan,
    });
    expect(review.targetRevisionId).toBe(fixture.plan.targetRevisionId);
    expect(review.rollbackProjectTitle).toBe(
      fixture.plan.currentManifestUpdate.body.title,
    );
    expect(fixture.plan).toEqual(beforePlan);
  });

  it("does not expose operation IDs, Drive IDs, hashes, checksums, or raw bodies", () => {
    const { fixture, preview } = reviewFixture();
    const review = buildProjectRollbackExecutionReview({
      preview,
      plan: fixture.plan,
    });
    const text = JSON.stringify(review);
    for (const forbidden of [
      fixture.plan.operationId,
      fixture.project.projectFolderId,
      fixture.project.manifestFileId,
      fixture.project.assetsFolderId,
      fixture.plan.expectedCurrent.manifestCanonicalHash,
      fixture.assetMetadata.checksum as string,
      fixture.plan.revisionFile.canonicalBody,
      "test-token",
      "Bearer",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("returns classified failure without a plan or sensitive details", () => {
    const failure = createProjectRollbackExecutionReviewFailure(
      "stalePreview",
      "stale",
    );
    expect(failure).toMatchObject({
      ok: false,
      category: "stale",
      code: "stalePreview",
    });
    expect(failure).not.toHaveProperty("plan");
    expect(JSON.stringify(failure)).not.toContain("operationId");
  });
});
