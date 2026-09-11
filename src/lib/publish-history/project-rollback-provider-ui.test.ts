import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const provider = readFileSync(
  new URL("../../app/app-providers.tsx", import.meta.url),
  "utf8",
);
const acceptanceFaults = readFileSync(
  new URL("./publication-acceptance-faults.ts", import.meta.url),
  "utf8",
);

describe("rollback Provider boundary", () => {
  it("keeps guard and write plan in refs with a shared publication guard", () => {
    for (const marker of [
      "projectRollbackPreviewGuardRef",
      "pendingProjectRollbackRef",
      "projectRollbackAbortRef",
      "projectRollbackRequestSequenceRef",
      "projectPublicationWriteInFlightRef",
      "prepareProjectRollbackExecutionReview",
      "commitPreparedProjectRollback",
      "cancelPreparedProjectRollback",
    ]) {
      expect(provider).toContain(marker);
    }
  });

  it("returns sanitized review and workflow results through Context", () => {
    expect(provider).toContain("return { ok: true, review: result.review }");
    expect(provider).toContain("buildSanitizedRollbackSuccess");
    expect(provider).not.toContain("result: pending.plan");
    expect(provider).not.toContain("review: result.plan");
    expect(provider).not.toContain("guard: result.guard");
  });

  it("keeps only retryable plans and clears terminal plans", () => {
    expect(provider).toContain(
      'if (workflow.recoverability !== "retryable")',
    );
    expect(provider).toContain("pendingProjectRollbackRef.current = null");
  });

  it("keeps the acceptance executor inside the existing Web Lock callback", () => {
    const start = provider.indexOf(
      "async function commitPreparedProjectRollback",
    );
    const end = provider.indexOf(
      "async function recoverPublicationAcceptanceIndex",
      start,
    );
    const commit = provider.slice(start, end);
    const lock = commit.indexOf("runWithProjectPublicationWriteLock(");
    const callback = commit.indexOf(
      "async (): Promise<CommitPreparedProjectRollbackResult> =>",
      lock,
    );
    const temporaryExecutor = commit.indexOf(
      "executePreparedProjectRollbackWithPublicationAcceptanceFaults({",
    );
    const lockFailure = commit.indexOf("if (!locked.acquired)");

    expect(lock).toBeGreaterThanOrEqual(0);
    expect(callback).toBeGreaterThan(lock);
    expect(temporaryExecutor).toBeGreaterThan(callback);
    expect(temporaryExecutor).toBeLessThan(lockFailure);
    expect(commit.match(/executePreparedProjectRollbackWithPublicationAcceptanceFaults\(\{/g)).toHaveLength(1);
  });

  it("keeps fault-OFF rollback on the normal executor path", () => {
    expect(provider).toContain(
      ": await executePreparedProjectRollback({",
    );
    expect(provider).toContain(
      "? await executePreparedProjectRollbackWithPublicationAcceptanceFaults({",
    );
  });

  it("does not enter the temporary executor when the Web Lock is unavailable", () => {
    const temporaryExecutor = provider.indexOf(
      "executePreparedProjectRollbackWithPublicationAcceptanceFaults({",
    );
    const lockFailure = provider.indexOf("if (!locked.acquired)", temporaryExecutor);
    expect(temporaryExecutor).toBeGreaterThanOrEqual(0);
    expect(lockFailure).toBeGreaterThan(temporaryExecutor);
    expect(provider.slice(lockFailure)).toContain(
      "code: PUBLICATION_WRITE_LOCKED_CODE",
    );
  });

  it("keeps Case B stale revalidation distinct from lock contention", () => {
    expect(acceptanceFaults).toContain(
      "revalidateProjectRollbackWritePlanInDrive",
    );
    expect(acceptanceFaults.indexOf("revalidate:")).toBeLessThan(
      acceptanceFaults.indexOf("prepareRevision:"),
    );
    expect(provider).toContain("code: PUBLICATION_WRITE_LOCKED_CODE");
    expect(provider).not.toContain(
      'PUBLICATION_WRITE_LOCKED_CODE = "stalePlan"',
    );
  });

  it("keeps acceptance recovery memory-only and clears it with project state", () => {
    expect(provider).toContain("PublicationAcceptanceFaultSession");
    expect(provider).toContain("publicationAcceptanceFaultSessionRef");
    expect(provider).toContain(
      "publicationAcceptanceFaultSession.clearForProjectChange()",
    );
    expect(provider).toContain("resetPublicationAcceptanceSession();");
    expect(provider).toContain("takeCRecoveryPlan");
    expect(provider).not.toContain("sessionStorage.setItem");
    expect(provider).not.toContain("localStorage.setItem");
  });

  it("runs explicit C index recovery under the publication lock", () => {
    const start = provider.indexOf(
      "async function recoverPublicationAcceptanceIndex",
    );
    const recovery = provider.slice(start);
    const lock = recovery.indexOf(
      "runPublicationAcceptanceRecoveryWithProjectLock({",
    );
    const take = recovery.indexOf("takeCRecoveryPlan(");
    const mirror = recovery.indexOf(
      "recoverPublicationAcceptanceIndexInDrive({",
    );

    expect(lock).toBeGreaterThanOrEqual(0);
    expect(take).toBeGreaterThan(lock);
    expect(mirror).toBeGreaterThan(take);
    expect(acceptanceFaults).toContain(
      "return runWithProjectPublicationWriteLock(",
    );
  });
});
