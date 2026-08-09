import { describe, expect, it, vi } from "vitest";
import type { ProjectManifest } from "../google-drive";
import {
  commitProjectRollbackManifestWithAdapter,
  type ProjectRollbackManifestCommitAdapter,
} from "./project-rollback-manifest-commit";
import {
  mirrorProjectRollbackIndexWithAdapter,
  type ProjectRollbackIndexMirrorAdapter,
} from "./project-rollback-index-mirror";
import {
  executePreparedProjectRollbackWithAdapter,
  type ProjectRollbackWorkflowAdapter,
} from "./project-rollback-workflow";
import { buildRollbackTestFixture } from "./project-rollback-test-fixture";
import {
  PUBLICATION_ACCEPTANCE_CASE_A_TITLE,
  PUBLICATION_ACCEPTANCE_CASE_C_TITLE,
  PublicationAcceptanceFaultSession,
  canArmPublicationAcceptanceFault,
  isPublicationAcceptanceFaultRuntimeEnabled,
  runPublicationAcceptanceIndexRecovery,
  wrapPublicationAcceptanceIndexAdapter,
  wrapPublicationAcceptanceManifestAdapter,
} from "./publication-acceptance-faults";

function buildManifestAdapter() {
  const fixture = buildRollbackTestFixture();
  let currentText = JSON.stringify(fixture.currentManifest);
  const adapter: ProjectRollbackManifestCommitAdapter = {
    findProjectFolders: vi.fn(async () => [fixture.drive.projectFolder]),
    findHistoryFolders: vi.fn(async () => [fixture.drive.historyFolder]),
    findRevisionsFolders: vi.fn(async () => [fixture.drive.revisionsFolder]),
    findRevisionFiles: vi.fn(async () => [fixture.drive.preparedRevisionFile]),
    readRevisionFile: vi.fn(async () => fixture.plan.revisionFile.canonicalBody),
    findCurrentManifestFiles: vi.fn(async () => [fixture.drive.manifestFile]),
    readCurrentManifest: vi.fn(async () => currentText),
    updateCurrentManifest: vi.fn(async ({ jsonText }) => {
      currentText = jsonText;
    }),
  };
  return { fixture, adapter };
}

function buildIndexAdapter(input?: { staleMetadata?: boolean }) {
  const fixture = buildRollbackTestFixture();
  let indexText = `${JSON.stringify(fixture.indexBody, null, 2)}\n`;
  const update = vi.fn(async ({ jsonText }: { jsonText: string }) => {
    indexText = jsonText;
  });
  const adapter: ProjectRollbackIndexMirrorAdapter = {
    readMetadata: vi.fn(async () => ({
      ...fixture.drive.indexFile,
      ...(input?.staleMetadata
        ? { modifiedTime: "2026-07-28T03:00:00.000Z" }
        : {}),
    })),
    readText: vi.fn(async () => indexText),
    update,
  };
  return { fixture, adapter, update };
}

describe("publication acceptance runtime guard", () => {
  it("is default OFF and rejects the production origin", () => {
    expect(
      isPublicationAcceptanceFaultRuntimeEnabled({
        buildGuard: "0",
        origin: "https://example-preview.vercel.app",
      }),
    ).toBe(false);
    expect(
      isPublicationAcceptanceFaultRuntimeEnabled({
        buildGuard: "1",
        origin: "https://ipad-slideshow-pwa.vercel.app",
      }),
    ).toBe(false);
  });

  it("requires an HTTPS Vercel Preview origin and the explicit build guard", () => {
    expect(
      isPublicationAcceptanceFaultRuntimeEnabled({
        buildGuard: "1",
        origin: "https://example-preview.vercel.app",
      }),
    ).toBe(true);
    expect(
      isPublicationAcceptanceFaultRuntimeEnabled({
        buildGuard: "1",
        origin: "http://localhost:3000",
      }),
    ).toBe(false);
    expect(
      isPublicationAcceptanceFaultRuntimeEnabled({
        buildGuard: "1",
        origin: "https://preview.example.com",
      }),
    ).toBe(false);
  });
});

describe("publication acceptance fault A", () => {
  it("uses the original update unchanged while OFF", async () => {
    const { adapter } = buildManifestAdapter();
    const session = new PublicationAcceptanceFaultSession();
    const wrapped = wrapPublicationAcceptanceManifestAdapter({
      adapter,
      session,
      projectTitle: PUBLICATION_ACCEPTANCE_CASE_A_TITLE,
    });
    await expect(
      wrapped.updateCurrentManifest({
        fileId: "manifest-file",
        jsonText: "{}",
        signal: new AbortController().signal,
      }),
    ).resolves.toBeUndefined();
    expect(adapter.updateCurrentManifest).toHaveBeenCalledOnce();
    expect(session.getSnapshot().mode).toBe("off");
  });

  it("throws once only after the original update resolves", async () => {
    const { adapter } = buildManifestAdapter();
    const session = new PublicationAcceptanceFaultSession();
    expect(session.arm("A", PUBLICATION_ACCEPTANCE_CASE_A_TITLE)).toBe(true);
    const wrapped = wrapPublicationAcceptanceManifestAdapter({
      adapter,
      session,
      projectTitle: PUBLICATION_ACCEPTANCE_CASE_A_TITLE,
    });
    const updateInput = {
      fileId: "manifest-file",
      jsonText: "{}",
      signal: new AbortController().signal,
    };
    await expect(wrapped.updateCurrentManifest(updateInput)).rejects.toThrow();
    expect(adapter.updateCurrentManifest).toHaveBeenCalledOnce();
    expect(session.getSnapshot().mode).toBe("aConsumed");
    await expect(wrapped.updateCurrentManifest(updateInput)).resolves.toBeUndefined();
    expect(adapter.updateCurrentManifest).toHaveBeenCalledTimes(2);
  });

  it("does not fire for a wrong project", async () => {
    const { adapter } = buildManifestAdapter();
    const session = new PublicationAcceptanceFaultSession();
    session.arm("A", PUBLICATION_ACCEPTANCE_CASE_A_TITLE);
    const wrapped = wrapPublicationAcceptanceManifestAdapter({
      adapter,
      session,
      projectTitle: "case-b-current-conflict",
    });
    await expect(
      wrapped.updateCurrentManifest({
        fileId: "manifest-file",
        jsonText: "{}",
        signal: new AbortController().signal,
      }),
    ).resolves.toBeUndefined();
    expect(session.getSnapshot().mode).toBe("aArmed");
  });

  it("converges to committed through the existing post-write read-back", async () => {
    const { fixture, adapter } = buildManifestAdapter();
    const session = new PublicationAcceptanceFaultSession();
    session.arm("A", PUBLICATION_ACCEPTANCE_CASE_A_TITLE);
    const result = await commitProjectRollbackManifestWithAdapter(
      { plan: fixture.plan },
      wrapPublicationAcceptanceManifestAdapter({
        adapter,
        session,
        projectTitle: PUBLICATION_ACCEPTANCE_CASE_A_TITLE,
      }),
    );
    expect(result).toMatchObject({ ok: true, status: "committed" });
    expect(adapter.updateCurrentManifest).toHaveBeenCalledOnce();
    expect(session.getSnapshot().mode).toBe("aConsumed");
    const written = JSON.parse(
      vi.mocked(adapter.updateCurrentManifest).mock.calls[0][0].jsonText,
    ) as ProjectManifest;
    expect(written.publication?.operation).toBe("rollback");
  });
});

describe("publication acceptance fault C", () => {
  it("uses the original index update unchanged while OFF", async () => {
    const { adapter, update } = buildIndexAdapter();
    const wrapped = wrapPublicationAcceptanceIndexAdapter({
      adapter,
      session: new PublicationAcceptanceFaultSession(),
      projectTitle: PUBLICATION_ACCEPTANCE_CASE_C_TITLE,
    });
    await wrapped.update({
      accessToken: "test-token",
      fileId: "index-file",
      jsonText: "{}",
      signal: new AbortController().signal,
    });
    expect(update).toHaveBeenCalledOnce();
  });

  it("throws once before the actual index update and does not re-fire", async () => {
    const { adapter, update } = buildIndexAdapter();
    const session = new PublicationAcceptanceFaultSession();
    session.arm("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    const wrapped = wrapPublicationAcceptanceIndexAdapter({
      adapter,
      session,
      projectTitle: PUBLICATION_ACCEPTANCE_CASE_C_TITLE,
    });
    const updateInput = {
      accessToken: "test-token",
      fileId: "index-file",
      jsonText: "{}",
      signal: new AbortController().signal,
    };
    await expect(wrapped.update(updateInput)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
    expect(session.getSnapshot().mode).toBe("cConsumed");
    await expect(wrapped.update(updateInput)).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledOnce();
  });

  it("does not fire for a wrong project", async () => {
    const { adapter, update } = buildIndexAdapter();
    const session = new PublicationAcceptanceFaultSession();
    session.arm("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    const wrapped = wrapPublicationAcceptanceIndexAdapter({
      adapter,
      session,
      projectTitle: PUBLICATION_ACCEPTANCE_CASE_A_TITLE,
    });
    await wrapped.update({
      accessToken: "test-token",
      fileId: "index-file",
      jsonText: "{}",
      signal: new AbortController().signal,
    });
    expect(update).toHaveBeenCalledOnce();
    expect(session.getSnapshot().mode).toBe("cArmed");
  });

  it("keeps manifest success and returns index warning", async () => {
    const { fixture, adapter, update } = buildIndexAdapter();
    const session = new PublicationAcceptanceFaultSession();
    session.arm("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    session.retainCRecoveryPlan(
      PUBLICATION_ACCEPTANCE_CASE_C_TITLE,
      fixture.plan,
    );
    const mirrorIndex = vi.fn(() =>
      mirrorProjectRollbackIndexWithAdapter(
        { accessToken: "test-token", plan: fixture.plan },
        wrapPublicationAcceptanceIndexAdapter({
          adapter,
          session,
          projectTitle: PUBLICATION_ACCEPTANCE_CASE_C_TITLE,
        }),
      ),
    );
    const workflowAdapter: ProjectRollbackWorkflowAdapter = {
      revalidate: vi.fn(async () => ({ ok: true as const })),
      prepareRevision: vi.fn(async () => ({
        ok: true as const,
        status: "created" as const,
        revisionId: fixture.plan.revisionFile.revisionId,
        verified: true as const,
      })),
      commitManifest: vi.fn(async () => ({
        ok: true as const,
        status: "committed" as const,
        revisionId: fixture.plan.revisionFile.revisionId,
        committed: true as const,
      })),
      mirrorIndex,
    };
    const result = await executePreparedProjectRollbackWithAdapter(
      { plan: fixture.plan },
      workflowAdapter,
    );
    expect(result).toMatchObject({
      ok: true,
      manifestStatus: "committed",
      indexStatus: "warning",
    });
    expect(workflowAdapter.commitManifest).toHaveBeenCalledOnce();
    expect(mirrorIndex).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(session.getSnapshot().mode).toBe("cConsumed");
  });
});

describe("publication acceptance C recovery", () => {
  it("keeps the plan in memory, makes it one-shot, and clears it on project change", () => {
    const fixture = buildRollbackTestFixture();
    const session = new PublicationAcceptanceFaultSession();
    session.arm("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    session.retainCRecoveryPlan(
      PUBLICATION_ACCEPTANCE_CASE_C_TITLE,
      fixture.plan,
    );
    session.consume("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    expect(session.markCRecoveryReady(PUBLICATION_ACCEPTANCE_CASE_C_TITLE)).toBe(
      true,
    );
    expect(
      session.takeCRecoveryPlan(PUBLICATION_ACCEPTANCE_CASE_C_TITLE),
    ).toBe(fixture.plan);
    expect(
      session.takeCRecoveryPlan(PUBLICATION_ACCEPTANCE_CASE_C_TITLE),
    ).toBeNull();

    const changed = new PublicationAcceptanceFaultSession();
    changed.arm("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    changed.retainCRecoveryPlan(
      PUBLICATION_ACCEPTANCE_CASE_C_TITLE,
      fixture.plan,
    );
    changed.clearForProjectChange();
    expect(changed.getSnapshot()).toEqual({
      mode: "off",
      recoveryReady: false,
    });
    expect(
      changed.takeCRecoveryPlan(PUBLICATION_ACCEPTANCE_CASE_C_TITLE),
    ).toBeNull();
    expect(new PublicationAcceptanceFaultSession().getSnapshot()).toEqual({
      mode: "off",
      recoveryReady: false,
    });

    const disarmed = new PublicationAcceptanceFaultSession();
    disarmed.arm("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    disarmed.retainCRecoveryPlan(
      PUBLICATION_ACCEPTANCE_CASE_C_TITLE,
      fixture.plan,
    );
    disarmed.consume("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    disarmed.markCRecoveryReady(PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    disarmed.disarm();
    expect(
      disarmed.takeCRecoveryPlan(PUBLICATION_ACCEPTANCE_CASE_C_TITLE),
    ).toBe(fixture.plan);
  });

  it("calls the existing mirror once for success", async () => {
    const fixture = buildRollbackTestFixture();
    const mirror = vi.fn(async () => ({
      ok: true as const,
      status: "mirrored" as const,
      mirrored: true as const,
    }));
    await expect(
      runPublicationAcceptanceIndexRecovery({ plan: fixture.plan, mirror }),
    ).resolves.toMatchObject({ ok: true, status: "mirrored" });
    expect(mirror).toHaveBeenCalledOnce();
  });

  it("stops without writing when the fresh index guard is stale", async () => {
    const { fixture, adapter, update } = buildIndexAdapter({
      staleMetadata: true,
    });
    const result = await runPublicationAcceptanceIndexRecovery({
      plan: fixture.plan,
      mirror: (plan) =>
        mirrorProjectRollbackIndexWithAdapter(
          { accessToken: "test-token", plan },
          adapter,
        ),
    });
    expect(result).toMatchObject({
      ok: false,
      status: "stopped",
      category: "conflict",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ["retryable", "自動retryは行いません。"],
    ["conflict", "recovery writeを停止しました。"],
    ["requiresInspection", "手動確認が必要です。"],
  ] as const)("sanitizes a %s recovery failure", async (recoverability, message) => {
    const fixture = buildRollbackTestFixture();
    const result = await runPublicationAcceptanceIndexRecovery({
      plan: fixture.plan,
      mirror: vi.fn(async () => ({
        ok: false as const,
        code: "raw-internal-code",
        message: "raw internal response",
        recoverability,
      })),
    });
    expect(result).toMatchObject({
      ok: false,
      status: "stopped",
      category: recoverability,
    });
    expect(result.message).toContain(message);
    expect(result.message).not.toContain("raw");
  });
});

describe("publication acceptance project matching", () => {
  it("allows only the dedicated A and C project titles", () => {
    expect(
      canArmPublicationAcceptanceFault("A", PUBLICATION_ACCEPTANCE_CASE_A_TITLE),
    ).toBe(true);
    expect(
      canArmPublicationAcceptanceFault("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE),
    ).toBe(true);
    expect(canArmPublicationAcceptanceFault("A", "case-b-current-conflict")).toBe(
      false,
    );
    expect(canArmPublicationAcceptanceFault("C", null)).toBe(false);
  });

  it("does not consume the opposite fault mode", () => {
    const a = new PublicationAcceptanceFaultSession();
    a.arm("A", PUBLICATION_ACCEPTANCE_CASE_A_TITLE);
    expect(a.consume("C", PUBLICATION_ACCEPTANCE_CASE_A_TITLE)).toBe(false);
    expect(a.getSnapshot().mode).toBe("aArmed");

    const c = new PublicationAcceptanceFaultSession();
    c.arm("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    expect(c.consume("A", PUBLICATION_ACCEPTANCE_CASE_C_TITLE)).toBe(false);
    expect(c.getSnapshot().mode).toBe("cArmed");
  });
});
