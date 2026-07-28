import { describe, expect, it, vi } from "vitest";
import {
  executePreparedProjectRollbackWithAdapter,
  type ProjectRollbackWorkflowAdapter,
} from "./project-rollback-workflow";
import type { ProjectRollbackWritePlan } from "./project-rollback-write-plan";

const plan = {
  revisionFile: { revisionId: "rev_20260728T020000000Z_1234abcd" },
} as ProjectRollbackWritePlan;

function adapter(overrides: Partial<ProjectRollbackWorkflowAdapter> = {}) {
  const calls: string[] = [];
  let validationCount = 0;
  const value: ProjectRollbackWorkflowAdapter = {
    revalidate: vi.fn(async () => {
      calls.push(
        validationCount++ === 0
          ? "revalidateBeforeRevision"
          : "revalidateBeforeManifestCommit",
      );
      return { ok: true as const };
    }),
    prepareRevision: vi.fn(async () => {
      calls.push("prepareRollbackRevision");
      return {
        ok: true as const,
        status: "created" as const,
        revisionId: plan.revisionFile.revisionId,
        verified: true as const,
      };
    }),
    commitManifest: vi.fn(async () => {
      calls.push("commitCurrentManifest");
      return {
        ok: true as const,
        status: "committed" as const,
        revisionId: plan.revisionFile.revisionId,
        committed: true as const,
      };
    }),
    mirrorIndex: vi.fn(async () => {
      calls.push("updateIndexMirror");
      return {
        ok: true as const,
        status: "mirrored" as const,
        mirrored: true as const,
      };
    }),
    ...overrides,
  };
  return { value, calls };
}

describe("project rollback workflow", () => {
  it("keeps the fixed revalidation/write ordering", async () => {
    const fixture = adapter();
    const result = await executePreparedProjectRollbackWithAdapter(
      { plan },
      fixture.value,
    );
    expect(result).toMatchObject({
      ok: true,
      revisionStatus: "created",
      manifestStatus: "committed",
      indexStatus: "mirrored",
    });
    expect(fixture.calls).toEqual([
      "revalidateBeforeRevision",
      "prepareRollbackRevision",
      "revalidateBeforeManifestCommit",
      "commitCurrentManifest",
      "updateIndexMirror",
    ]);
  });

  it("short-circuits before revision creation when prevalidation fails", async () => {
    const fixture = adapter({
      revalidate: vi.fn(async () => ({
        ok: false as const,
        code: "stalePlan",
        recoverability: "conflict" as const,
      })),
    });
    const result = await executePreparedProjectRollbackWithAdapter(
      { plan },
      fixture.value,
    );
    expect(result).toMatchObject({
      ok: false,
      stage: "revalidateBeforeRevision",
    });
    expect(fixture.value.prepareRevision).not.toHaveBeenCalled();
    expect(fixture.value.commitManifest).not.toHaveBeenCalled();
  });

  it("returns success-with-warning when index mirror fails after manifest commit", async () => {
    const fixture = adapter({
      mirrorIndex: vi.fn(async () => ({
        ok: false as const,
        code: "staleIndex",
        message: "classified",
        recoverability: "conflict" as const,
      })),
    });
    const result = await executePreparedProjectRollbackWithAdapter(
      { plan },
      fixture.value,
    );
    expect(result).toMatchObject({
      ok: true,
      manifestStatus: "committed",
      indexStatus: "warning",
    });
  });
});
