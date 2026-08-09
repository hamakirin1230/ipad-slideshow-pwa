import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const provider = readFileSync(
  new URL("../../app/app-providers.tsx", import.meta.url),
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
});
