import type { DriveProjectSummary } from "../google-drive";
import {
  revalidateProjectRollbackWritePlanInDrive,
} from "./project-rollback-execution-preflight";
import {
  mirrorProjectRollbackIndexInDrive,
  type MirrorProjectRollbackIndexResult,
} from "./project-rollback-index-mirror";
import {
  commitProjectRollbackManifestInDrive,
  type CommitProjectRollbackManifestResult,
} from "./project-rollback-manifest-commit";
import {
  prepareProjectRollbackRevisionInDrive,
  type PrepareProjectRollbackRevisionResult,
} from "./project-rollback-revision-writer";
import type { ProjectRollbackWritePlan } from "./project-rollback-write-plan";

export type ProjectRollbackWorkflowResult =
  | {
      ok: true;
      revisionId: string;
      revisionStatus: "created" | "alreadyPrepared";
      manifestStatus: "committed" | "alreadyCommitted";
      indexStatus: "mirrored" | "alreadyMirrored" | "warning";
      warning: string | null;
    }
  | {
      ok: false;
      stage:
        | "revalidateBeforeRevision"
        | "prepareRollbackRevision"
        | "revalidateBeforeManifestCommit"
        | "commitCurrentManifest";
      code: string;
      message: string;
      recoverability: "retryable" | "conflict" | "requiresInspection";
    };

export type ProjectRollbackWorkflowAdapter = {
  revalidate: (input: {
    plan: ProjectRollbackWritePlan;
    signal?: AbortSignal;
  }) => Promise<
    | { ok: true }
    | {
        ok: false;
        code: string;
        recoverability: "retryable" | "conflict" | "requiresInspection";
      }
  >;
  prepareRevision: (input: {
    plan: ProjectRollbackWritePlan;
    signal?: AbortSignal;
  }) => Promise<PrepareProjectRollbackRevisionResult>;
  commitManifest: (input: {
    plan: ProjectRollbackWritePlan;
    signal?: AbortSignal;
  }) => Promise<CommitProjectRollbackManifestResult>;
  mirrorIndex: (input: {
    plan: ProjectRollbackWritePlan;
    signal?: AbortSignal;
  }) => Promise<MirrorProjectRollbackIndexResult>;
};

export async function executePreparedProjectRollback(input: {
  accessToken: string;
  projectsRootFolderId: string;
  project: DriveProjectSummary;
  plan: ProjectRollbackWritePlan;
  signal?: AbortSignal;
}): Promise<ProjectRollbackWorkflowResult> {
  return executePreparedProjectRollbackWithAdapter(input, {
    revalidate: ({ plan, signal }) =>
      revalidateProjectRollbackWritePlanInDrive({
        accessToken: input.accessToken,
        projectsRootFolderId: input.projectsRootFolderId,
        project: input.project,
        plan,
        signal: signal ?? new AbortController().signal,
      }),
    prepareRevision: ({ plan, signal }) =>
      prepareProjectRollbackRevisionInDrive({
        accessToken: input.accessToken,
        plan,
        signal,
      }),
    commitManifest: ({ plan, signal }) =>
      commitProjectRollbackManifestInDrive({
        accessToken: input.accessToken,
        plan,
        signal,
      }),
    mirrorIndex: ({ plan, signal }) =>
      mirrorProjectRollbackIndexInDrive({
        accessToken: input.accessToken,
        plan,
        signal,
      }),
  });
}

export async function executePreparedProjectRollbackWithAdapter(
  input: { plan: ProjectRollbackWritePlan; signal?: AbortSignal },
  adapter: ProjectRollbackWorkflowAdapter,
): Promise<ProjectRollbackWorkflowResult> {
  const beforeRevision = await adapter.revalidate(input);
  if (!beforeRevision.ok) {
    return workflowFailure(
      "revalidateBeforeRevision",
      beforeRevision.code,
      beforeRevision.recoverability,
    );
  }

  const revision = await adapter.prepareRevision(input);
  if (!revision.ok) {
    return {
      ok: false,
      stage: "prepareRollbackRevision",
      code: revision.code,
      message: revision.message,
      recoverability: revision.recoverability,
    };
  }

  const beforeManifest = await adapter.revalidate(input);
  if (!beforeManifest.ok) {
    return workflowFailure(
      "revalidateBeforeManifestCommit",
      beforeManifest.code,
      beforeManifest.recoverability === "retryable"
        ? "requiresInspection"
        : beforeManifest.recoverability,
    );
  }

  const manifest = await adapter.commitManifest(input);
  if (!manifest.ok) {
    return {
      ok: false,
      stage: "commitCurrentManifest",
      code: manifest.code,
      message: manifest.message,
      recoverability: manifest.recoverability,
    };
  }

  const index = await adapter.mirrorIndex(input);
  if (!index.ok) {
    return {
      ok: true,
      revisionId: input.plan.revisionFile.revisionId,
      revisionStatus: revision.status,
      manifestStatus: manifest.status,
      indexStatus: "warning",
      warning:
        "rollback本体は成功しました。index mirrorは要確認です。自動的な巻き戻しは行っていません。",
    };
  }
  return {
    ok: true,
    revisionId: input.plan.revisionFile.revisionId,
    revisionStatus: revision.status,
    manifestStatus: manifest.status,
    indexStatus: index.status,
    warning: null,
  };
}

function workflowFailure(
  stage:
    | "revalidateBeforeRevision"
    | "revalidateBeforeManifestCommit",
  code: string,
  recoverability: "retryable" | "conflict" | "requiresInspection",
): Extract<ProjectRollbackWorkflowResult, { ok: false }> {
  return {
    ok: false,
    stage,
    code,
    recoverability,
    message:
      stage === "revalidateBeforeRevision"
        ? "rollback revision作成前の最新状態確認に失敗しました。"
        : "rollback revisionは作成済みですが、manifest反映前の再確認に失敗しました。履歴を確認してください。",
  };
}
