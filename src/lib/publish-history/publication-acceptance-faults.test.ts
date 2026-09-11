import { readFileSync } from "node:fs";
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
  const events: string[] = [];
  const adapter: ProjectRollbackManifestCommitAdapter = {
    findProjectFolders: vi.fn(async () => [fixture.drive.projectFolder]),
    findHistoryFolders: vi.fn(async () => [fixture.drive.historyFolder]),
    findRevisionsFolders: vi.fn(async () => [fixture.drive.revisionsFolder]),
    findRevisionFiles: vi.fn(async () => [fixture.drive.preparedRevisionFile]),
    readRevisionFile: vi.fn(async () => fixture.plan.revisionFile.canonicalBody),
    findCurrentManifestFiles: vi.fn(async () => [fixture.drive.manifestFile]),
    readCurrentManifest: vi.fn(async () => {
      events.push("read");
      return currentText;
    }),
    updateCurrentManifest: vi.fn(async ({ jsonText }) => {
      events.push("real-update");
      currentText = jsonText;
    }),
  };
  return { fixture, adapter, events };
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
  it.each([
    [undefined, "https://example-preview.vercel.app"],
    ["0", "https://example-preview.vercel.app"],
    ["true", "https://example-preview.vercel.app"],
    ["1", "https://ipad-slideshow-pwa.vercel.app"],
    ["1", "http://localhost:3000"],
    ["1", ""],
    ["1", "not an origin"],
    ["1", "https://preview.example.com"],
  ])("fails closed for build guard %s and origin %s", (buildGuard, origin) => {
    expect(
      isPublicationAcceptanceFaultRuntimeEnabled({ buildGuard, origin }),
    ).toBe(false);
  });

  it("enables only an HTTPS Vercel Preview origin with guard 1", () => {
    expect(
      isPublicationAcceptanceFaultRuntimeEnabled({
        buildGuard: "1",
        origin: "https://example-preview.vercel.app",
      }),
    ).toBe(true);
  });

  it("is disabled during SSR when no origin is supplied", () => {
    expect(
      isPublicationAcceptanceFaultRuntimeEnabled({ buildGuard: "1" }),
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

  it("throws once only after the real manifest update resolves", async () => {
    const { adapter, events } = buildManifestAdapter();
    const session = new PublicationAcceptanceFaultSession();
    session.arm("A", PUBLICATION_ACCEPTANCE_CASE_A_TITLE);
    const wrapped = wrapPublicationAcceptanceManifestAdapter({
      adapter,
      session,
      projectTitle: PUBLICATION_ACCEPTANCE_CASE_A_TITLE,
      onConsumed: () => events.push("fault"),
    });
    const updateInput = {
      fileId: "manifest-file",
      jsonText: "{}",
      signal: new AbortController().signal,
    };

    await expect(wrapped.updateCurrentManifest(updateInput)).rejects.toThrow();
    expect(events.slice(-2)).toEqual(["real-update", "fault"]);
    expect(session.getSnapshot().mode).toBe("aConsumed");
    await expect(wrapped.updateCurrentManifest(updateInput)).resolves.toBeUndefined();
    expect(adapter.updateCurrentManifest).toHaveBeenCalledTimes(2);
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

  it("throws once before the real index update and does not retry", async () => {
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

  it("keeps rollback success with an index warning after current commit", async () => {
    const { fixture, adapter, update } = buildIndexAdapter();
    const session = new PublicationAcceptanceFaultSession();
    session.arm("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    const events: string[] = [];
    const workflowAdapter: ProjectRollbackWorkflowAdapter = {
      revalidate: vi.fn(async () => {
        events.push("revalidate");
        return { ok: true as const };
      }),
      prepareRevision: vi.fn(async () => {
        events.push("revision");
        return {
          ok: true as const,
          status: "created" as const,
          revisionId: fixture.plan.revisionFile.revisionId,
          verified: true as const,
        };
      }),
      commitManifest: vi.fn(async () => {
        events.push("manifest");
        return {
          ok: true as const,
          status: "committed" as const,
          revisionId: fixture.plan.revisionFile.revisionId,
          committed: true as const,
        };
      }),
      mirrorIndex: vi.fn(async () => {
        events.push("index");
        return mirrorProjectRollbackIndexWithAdapter(
          { accessToken: "test-token", plan: fixture.plan },
          wrapPublicationAcceptanceIndexAdapter({
            adapter,
            session,
            projectTitle: PUBLICATION_ACCEPTANCE_CASE_C_TITLE,
          }),
        );
      }),
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
    expect(events).toEqual(["revalidate", "revision", "revalidate", "manifest", "index"]);
    expect(update).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toEqual({
      mode: "cConsumed",
      recoveryReady: false,
    });
    expect(
      session.retainCRecoveryPlanAfterWarning(
        PUBLICATION_ACCEPTANCE_CASE_C_TITLE,
        fixture.plan,
      ),
    ).toBe(true);
    expect(session.getSnapshot().recoveryReady).toBe(true);
  });
});

describe("publication acceptance C recovery", () => {
  it("becomes ready only after C is consumed and is one-shot", () => {
    const fixture = buildRollbackTestFixture();
    const session = new PublicationAcceptanceFaultSession();
    session.arm("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    expect(
      session.retainCRecoveryPlanAfterWarning(
        PUBLICATION_ACCEPTANCE_CASE_C_TITLE,
        fixture.plan,
      ),
    ).toBe(false);
    session.consume("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    expect(
      session.retainCRecoveryPlanAfterWarning(
        PUBLICATION_ACCEPTANCE_CASE_C_TITLE,
        fixture.plan,
      ),
    ).toBe(true);
    expect(
      session.takeCRecoveryPlan(PUBLICATION_ACCEPTANCE_CASE_C_TITLE),
    ).toBe(fixture.plan);
    expect(
      session.takeCRecoveryPlan(PUBLICATION_ACCEPTANCE_CASE_C_TITLE),
    ).toBeNull();
  });

  it.each(["mirrored", "alreadyMirrored"] as const)(
    "reports %s after one explicit mirror call",
    async (status) => {
      const fixture = buildRollbackTestFixture();
      const mirror = vi.fn(async () => ({
        ok: true as const,
        status,
        mirrored: true as const,
      }));

      await expect(
        runPublicationAcceptanceIndexRecovery({ plan: fixture.plan, mirror }),
      ).resolves.toMatchObject({ ok: true, status });
      expect(mirror).toHaveBeenCalledOnce();
    },
  );

  it("stops without writing when the fresh index guard conflicts", async () => {
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
    ["requiresInspection", "手動確認が必要です。"],
  ] as const)("does not retry a %s recovery failure", async (recoverability, message) => {
    const fixture = buildRollbackTestFixture();
    const mirror = vi.fn(async () => ({
      ok: false as const,
      code: "raw-internal-code",
      message: "raw internal response",
      recoverability,
    }));

    const result = await runPublicationAcceptanceIndexRecovery({
      plan: fixture.plan,
      mirror,
    });

    expect(result).toMatchObject({
      ok: false,
      status: "stopped",
      category: recoverability,
    });
    expect(result.message).toContain(message);
    expect(result.message).not.toContain("raw");
    expect(mirror).toHaveBeenCalledOnce();
  });

  it("does not reconstruct a lost plan and clears all state on project change", () => {
    const fixture = buildRollbackTestFixture();
    const session = new PublicationAcceptanceFaultSession();
    session.arm("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    session.consume("C", PUBLICATION_ACCEPTANCE_CASE_C_TITLE);
    session.retainCRecoveryPlanAfterWarning(
      PUBLICATION_ACCEPTANCE_CASE_C_TITLE,
      fixture.plan,
    );
    session.clearForProjectChange();

    expect(session.getSnapshot()).toEqual({ mode: "off", recoveryReady: false });
    expect(
      session.takeCRecoveryPlan(PUBLICATION_ACCEPTANCE_CASE_C_TITLE),
    ).toBeNull();
    expect(new PublicationAcceptanceFaultSession().getSnapshot()).toEqual({
      mode: "off",
      recoveryReady: false,
    });
  });
});

describe("publication acceptance safety contract", () => {
  it("allows only the dedicated A and C aliases", () => {
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

  it("does not consume the opposite mode or a wrong project", () => {
    const a = new PublicationAcceptanceFaultSession();
    a.arm("A", PUBLICATION_ACCEPTANCE_CASE_A_TITLE);
    expect(a.consume("C", PUBLICATION_ACCEPTANCE_CASE_A_TITLE)).toBe(false);
    expect(a.consume("A", PUBLICATION_ACCEPTANCE_CASE_C_TITLE)).toBe(false);
    expect(a.getSnapshot().mode).toBe("aArmed");
  });

  it("keeps the harness memory-only and constructs C from public Drive primitives", () => {
    const source = readFileSync(
      new URL("./publication-acceptance-faults.ts", import.meta.url),
      "utf8",
    );
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "document.cookie",
      "console.",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("readDriveFileMetadata");
    expect(source).toContain("readDriveTextFile");
    expect(source).toContain("updateDriveJsonFileContent");
    expect(source).not.toContain("createProjectRollbackIndexMirrorDriveAdapter");
  });
});
