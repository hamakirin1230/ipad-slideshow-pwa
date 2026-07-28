import { describe, expect, it, vi } from "vitest";
import type { CommitProjectPublishManifestResult } from "./project-publish-manifest-commit";
import type { PrepareProjectPublishRevisionResult } from "./project-publish-revision-writer";
import {
  executePreparedProjectPublishWithAdapter,
  type ProjectPublishWorkflowResult,
} from "./project-publish-workflow";
import type { ProjectPublishWritePlan } from "./project-publish-write-plan";

const plan = {} as ProjectPublishWritePlan;

function prepareSuccess(
  status: "created" | "alreadyPrepared",
): PrepareProjectPublishRevisionResult {
  return {
    ok: true,
    status,
    revisionId: "revision",
    operationId: "operation",
    initialPublish: false,
    verified: true,
  };
}

function commitSuccess(
  status: "committed" | "alreadyCommitted",
): CommitProjectPublishManifestResult {
  return {
    ok: true,
    status,
    revisionId: "revision",
    operationId: "operation",
    committed: true,
  };
}

async function run(
  prepareResult: PrepareProjectPublishRevisionResult,
  commitResult: CommitProjectPublishManifestResult = commitSuccess("committed"),
) {
  const prepareRevision = vi.fn().mockResolvedValue(prepareResult);
  const commitManifest = vi.fn().mockResolvedValue(commitResult);
  const result = await executePreparedProjectPublishWithAdapter(
    { plan },
    { prepareRevision, commitManifest },
  );
  return { result, prepareRevision, commitManifest };
}

describe("successful publish workflow", () => {
  const combinations = [
    ["created", "committed"],
    ["created", "alreadyCommitted"],
    ["alreadyPrepared", "committed"],
    ["alreadyPrepared", "alreadyCommitted"],
  ] as const;

  it.each(combinations)(
    "accepts %s then %s",
    async (revisionStatus, manifestStatus) => {
      const { result } = await run(
        prepareSuccess(revisionStatus),
        commitSuccess(manifestStatus),
      );
      expect(result).toEqual({
        ok: true,
        revisionId: "revision",
        operationId: "operation",
        revisionStatus,
        manifestStatus,
      });
    },
  );

  it("runs prepare before commit", async () => {
    const calls: string[] = [];
    await executePreparedProjectPublishWithAdapter(
      { plan },
      {
        prepareRevision: async () => {
          calls.push("prepare");
          return prepareSuccess("created");
        },
        commitManifest: async () => {
          calls.push("commit");
          return commitSuccess("committed");
        },
      },
    );
    expect(calls).toEqual(["prepare", "commit"]);
  });

  it("passes the same immutable plan to both stages", async () => {
    const { prepareRevision, commitManifest } = await run(
      prepareSuccess("created"),
    );
    expect(prepareRevision.mock.calls[0][0].plan).toBe(plan);
    expect(commitManifest.mock.calls[0][0].plan).toBe(plan);
  });

  it("passes AbortSignal to both stages", async () => {
    const signal = new AbortController().signal;
    const prepareRevision = vi.fn().mockResolvedValue(prepareSuccess("created"));
    const commitManifest = vi.fn().mockResolvedValue(commitSuccess("committed"));
    await executePreparedProjectPublishWithAdapter(
      { plan, signal },
      { prepareRevision, commitManifest },
    );
    expect(prepareRevision).toHaveBeenCalledWith({ plan, signal });
    expect(commitManifest).toHaveBeenCalledWith({ plan, signal });
  });
});

describe("workflow failure handling", () => {
  const recoverabilities = [
    "retryable",
    "conflict",
    "requiresInspection",
  ] as const;

  it.each(recoverabilities)(
    "maps prepare %s failure and does not commit",
    async (recoverability) => {
      const failure: PrepareProjectPublishRevisionResult = {
        ok: false,
        code: "driveWriteFailed",
        message: "sanitized prepare",
        recoverability,
      };
      const { result, commitManifest } = await run(failure);
      expect(result).toEqual({
        ok: false,
        stage: "prepareRevision",
        code: "driveWriteFailed",
        message: "sanitized prepare",
        recoverability,
      });
      expect(commitManifest).not.toHaveBeenCalled();
    },
  );

  it.each(recoverabilities)(
    "maps commit %s failure",
    async (recoverability) => {
      const failure: CommitProjectPublishManifestResult = {
        ok: false,
        code: "driveWriteFailed",
        message: "sanitized commit",
        recoverability,
      };
      const { result, commitManifest } = await run(
        prepareSuccess("created"),
        failure,
      );
      expect(result).toEqual({
        ok: false,
        stage: "commitManifest",
        code: "driveWriteFailed",
        message: "sanitized commit",
        recoverability,
      });
      expect(commitManifest).toHaveBeenCalledOnce();
    },
  );

  it("maps an aborted prepare as retryable", async () => {
    const { result } = await run({
      ok: false,
      code: "aborted",
      message: "stopped",
      recoverability: "retryable",
    });
    expect(result).toMatchObject({
      ok: false,
      stage: "prepareRevision",
      code: "aborted",
      recoverability: "retryable",
    });
  });

  it("maps an aborted commit as retryable", async () => {
    const { result } = await run(prepareSuccess("created"), {
      ok: false,
      code: "aborted",
      message: "stopped",
      recoverability: "retryable",
    });
    expect(result).toMatchObject({
      ok: false,
      stage: "commitManifest",
      code: "aborted",
      recoverability: "retryable",
    });
  });

  it("does not expose the plan in success", async () => {
    const { result } = await run(prepareSuccess("created"));
    expect(result).not.toHaveProperty("plan");
  });

  it("does not expose the plan in failure", async () => {
    const { result } = await run({
      ok: false,
      code: "driveReadFailed",
      message: "failed",
      recoverability: "retryable",
    });
    expect(result).not.toHaveProperty("plan");
  });

  it("does not add raw errors to a failure", async () => {
    const { result } = await run({
      ok: false,
      code: "revisionVerificationFailed",
      message: "failed",
      recoverability: "requiresInspection",
    });
    expect(result).not.toHaveProperty("error");
    expect(result).not.toHaveProperty("cause");
  });

  it("returns a discriminated result", async () => {
    const { result } = await run(prepareSuccess("created"));
    expect((result as ProjectPublishWorkflowResult).ok).toBe(true);
  });
});
