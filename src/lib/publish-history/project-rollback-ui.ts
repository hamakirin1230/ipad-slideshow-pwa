import type { ProjectRollbackExecutionReview } from "./project-rollback-execution-review";
import type { ProjectRollbackWorkflowResult } from "./project-rollback-workflow";

export type ProjectRollbackConfirmations = {
  createsNewRevision: boolean;
  driveOnly: boolean;
  replacesUnpublishedChanges: boolean;
};

export type CommitPreparedProjectRollbackResult =
  | {
      ok: true;
      result: {
        revisionId: string;
        revisionStatus: "created" | "alreadyPrepared";
        manifestStatus: "committed" | "alreadyCommitted";
        indexStatus: "mirrored" | "alreadyMirrored" | "warning";
        warning: string | null;
        refreshed: boolean;
      };
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        recoverability: "retryable" | "conflict" | "requiresInspection";
        canRetry: boolean;
      };
    };

export function areProjectRollbackConfirmationsComplete(input: {
  confirmations: ProjectRollbackConfirmations;
  replacesUnpublishedChanges: boolean;
}) {
  return (
    input.confirmations.createsNewRevision &&
    input.confirmations.driveOnly &&
    (!input.replacesUnpublishedChanges ||
      input.confirmations.replacesUnpublishedChanges)
  );
}

export function pendingProjectRollbackOwnerMatches(
  owner: {
    projectId: string;
    targetRevisionId: string;
    revisionId: string;
  },
  input: {
    projectId: string;
    targetRevisionId: string;
    revisionId: string;
  },
) {
  return (
    owner.projectId === input.projectId &&
    owner.targetRevisionId === input.targetRevisionId &&
    owner.revisionId === input.revisionId
  );
}

export function buildSanitizedRollbackSuccess(input: {
  workflow: Extract<ProjectRollbackWorkflowResult, { ok: true }>;
  refreshed: boolean;
}): Extract<CommitPreparedProjectRollbackResult, { ok: true }>["result"] {
  return {
    revisionId: input.workflow.revisionId,
    revisionStatus: input.workflow.revisionStatus,
    manifestStatus: input.workflow.manifestStatus,
    indexStatus: input.workflow.indexStatus,
    warning: input.workflow.warning,
    refreshed: input.refreshed,
  };
}

export function buildProjectRollbackCommitFailure(input: {
  code: string;
  message: string;
  recoverability: "retryable" | "conflict" | "requiresInspection";
}): Extract<CommitPreparedProjectRollbackResult, { ok: false }> {
  return {
    ok: false,
    error: {
      code: input.code,
      message: input.message,
      recoverability: input.recoverability,
      canRetry: input.recoverability === "retryable",
    },
  };
}

export function sanitizeProjectRollbackExecutionReview(
  review: ProjectRollbackExecutionReview,
) {
  return structuredClone(review);
}
