import { describe, expect, it } from "vitest";
import {
  areProjectRollbackConfirmationsComplete,
  buildProjectRollbackCommitFailure,
  buildSanitizedRollbackSuccess,
  getProjectRollbackFailureDisplayMessage,
  sanitizeProjectRollbackExecutionReview,
} from "./project-rollback-ui";
import {
  buildProjectRollbackExecutionReview,
} from "./project-rollback-execution-review";
import { buildProjectRollbackPreview } from "./project-rollback-preview";
import {
  TEST_PUBLISHED_AT,
  buildRollbackTestFixture,
} from "./project-rollback-test-fixture";

describe("rollback UI sanitizers", () => {
  it.each(["retryable", "conflict", "requiresInspection"] as const)(
    "keeps sentinel error text out of the %s presentation message",
    (recoverability) => {
      const sentinel =
        "RAW_ERROR_SECRET_SENTINEL Bearer SECRET_SENTINEL https://secret.invalid/internal";
      const message = getProjectRollbackFailureDisplayMessage({
        message: sentinel,
        recoverability,
      });

      expect(message).not.toContain("RAW_ERROR_SECRET_SENTINEL");
      expect(message).not.toContain("Bearer SECRET_SENTINEL");
      expect(message).not.toContain("https://secret.invalid/internal");
    },
  );

  it("shows a sanitized multi-tab lock message without internals", () => {
    const message = getProjectRollbackFailureDisplayMessage({
      code: "publicationWriteLocked",
      message: "RAW_ERROR_SECRET_SENTINEL lock:ispwa.pubwrite.v1.deadbeef",
      recoverability: "retryable",
    });

    expect(message).toBe(
      "別のタブで公開操作を実行中です。完了後にもう一度操作してください。",
    );
    expect(message).not.toContain("RAW_ERROR_SECRET_SENTINEL");
    expect(message).not.toContain("ispwa.pubwrite");
  });

  it("allows retry only for retryable failures", () => {
    expect(
      buildProjectRollbackCommitFailure({
        code: "temporary",
        message: "retry",
        recoverability: "retryable",
      }).error.canRetry,
    ).toBe(true);
    for (const recoverability of [
      "conflict",
      "requiresInspection",
    ] as const) {
      expect(
        buildProjectRollbackCommitFailure({
          code: "terminal",
          message: "stop",
          recoverability,
        }).error.canRetry,
      ).toBe(false);
    }
  });

  it("sanitizes success and warning workflow results", () => {
    const success = buildSanitizedRollbackSuccess({
      workflow: {
        ok: true,
        revisionId: "rev_20260728T020000000Z_33333333",
        revisionStatus: "created",
        manifestStatus: "committed",
        indexStatus: "mirrored",
        warning: null,
      },
      refreshed: true,
    });
    expect(success).toEqual({
      revisionId: "rev_20260728T020000000Z_33333333",
      revisionStatus: "created",
      manifestStatus: "committed",
      indexStatus: "mirrored",
      warning: null,
      refreshed: true,
    });
    const warning = buildSanitizedRollbackSuccess({
      workflow: {
        ok: true,
        revisionId: success.revisionId,
        revisionStatus: "alreadyPrepared",
        manifestStatus: "alreadyCommitted",
        indexStatus: "warning",
        warning: "index mirrorは要確認です。",
      },
      refreshed: false,
    });
    expect(warning).toMatchObject({
      indexStatus: "warning",
      warning: "index mirrorは要確認です。",
      refreshed: false,
    });
  });

  it("keeps offlineSyncRequired as guidance and removes internal values", () => {
    const fixture = buildRollbackTestFixture();
    const preview = buildProjectRollbackPreview({
      checkedAt: TEST_PUBLISHED_AT,
      workspaceId: fixture.plan.workspaceId,
      projectId: fixture.plan.projectId,
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
    const review = sanitizeProjectRollbackExecutionReview(
      buildProjectRollbackExecutionReview({
        preview,
        plan: fixture.plan,
      }),
    );
    expect(review.offlineSyncRequired).toBe(true);
    const text = JSON.stringify(review);
    for (const forbidden of [
      fixture.plan.operationId,
      fixture.project.projectFolderId,
      fixture.project.manifestFileId,
      fixture.project.assetsFolderId,
      fixture.plan.expectedCurrent.manifestCanonicalHash,
      fixture.assetMetadata.checksum as string,
      fixture.plan.revisionFile.canonicalBody,
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("requires the unpublished-edit confirmation only when applicable", () => {
    expect(
      areProjectRollbackConfirmationsComplete({
        confirmations: {
          createsNewRevision: true,
          driveOnly: true,
          replacesUnpublishedChanges: false,
        },
        replacesUnpublishedChanges: false,
      }),
    ).toBe(true);
    expect(
      areProjectRollbackConfirmationsComplete({
        confirmations: {
          createsNewRevision: true,
          driveOnly: true,
          replacesUnpublishedChanges: false,
        },
        replacesUnpublishedChanges: true,
      }),
    ).toBe(false);
  });
});
