import {
  commitProjectPublishManifestInDrive,
  type CommitProjectPublishManifestResult,
} from "./project-publish-manifest-commit";
import {
  prepareProjectPublishRevisionInDrive,
  type PrepareProjectPublishRevisionResult,
} from "./project-publish-revision-writer";
import type { ProjectPublishWritePlan } from "./project-publish-write-plan";

export type ProjectPublishWorkflowResult =
  | {
      ok: true;
      revisionId: string;
      operationId: string;
      revisionStatus: "created" | "alreadyPrepared";
      manifestStatus: "committed" | "alreadyCommitted";
    }
  | {
      ok: false;
      stage: "prepareRevision" | "commitManifest";
      code: string;
      message: string;
      recoverability: "retryable" | "conflict" | "requiresInspection";
    };

type ProjectPublishWorkflowAdapter = {
  prepareRevision: (input: {
    plan: ProjectPublishWritePlan;
    signal?: AbortSignal;
  }) => Promise<PrepareProjectPublishRevisionResult>;
  commitManifest: (input: {
    plan: ProjectPublishWritePlan;
    signal?: AbortSignal;
  }) => Promise<CommitProjectPublishManifestResult>;
};

export async function executePreparedProjectPublish(input: {
  accessToken: string;
  plan: ProjectPublishWritePlan;
  signal?: AbortSignal;
}): Promise<ProjectPublishWorkflowResult> {
  return executePreparedProjectPublishWithAdapter(
    { plan: input.plan, signal: input.signal },
    {
      prepareRevision: ({ plan, signal }) =>
        prepareProjectPublishRevisionInDrive({
          accessToken: input.accessToken,
          plan,
          signal,
        }),
      commitManifest: ({ plan, signal }) =>
        commitProjectPublishManifestInDrive({
          accessToken: input.accessToken,
          plan,
          signal,
        }),
    },
  );
}

export async function executePreparedProjectPublishWithAdapter(
  input: {
    plan: ProjectPublishWritePlan;
    signal?: AbortSignal;
  },
  adapter: ProjectPublishWorkflowAdapter,
): Promise<ProjectPublishWorkflowResult> {
  const revisionResult = await adapter.prepareRevision(input);
  if (!revisionResult.ok) {
    return {
      ok: false,
      stage: "prepareRevision",
      code: revisionResult.code,
      message: revisionResult.message,
      recoverability: revisionResult.recoverability,
    };
  }

  const manifestResult = await adapter.commitManifest(input);
  if (!manifestResult.ok) {
    return {
      ok: false,
      stage: "commitManifest",
      code: manifestResult.code,
      message: manifestResult.message,
      recoverability: manifestResult.recoverability,
    };
  }

  return {
    ok: true,
    revisionId: manifestResult.revisionId,
    operationId: manifestResult.operationId,
    revisionStatus: revisionResult.status,
    manifestStatus: manifestResult.status,
  };
}
