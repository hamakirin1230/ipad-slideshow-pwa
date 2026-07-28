import { describe, expect, it, vi } from "vitest";
import type { ProjectManifest } from "../google-drive";
import {
  commitProjectRollbackManifestWithAdapter,
  type ProjectRollbackManifestCommitAdapter,
} from "./project-rollback-manifest-commit";
import { getProjectManifestContentCanonicalHash } from "./project-publish-revision";
import {
  TEST_CURRENT_REVISION_ID,
  TEST_NEXT_REVISION_ID,
  buildRollbackTestFixture,
} from "./project-rollback-test-fixture";

function buildAdapter(input: {
  initialManifest?: ProjectManifest;
  verifiedManifestText?: string;
  updateThrows?: boolean;
  rawFailure?: Error;
} = {}) {
  const fixture = buildRollbackTestFixture();
  let currentText = JSON.stringify(
    input.initialManifest ?? fixture.currentManifest,
  );
  let manifestReadCount = 0;
  const adapter: ProjectRollbackManifestCommitAdapter = {
    findProjectFolders: vi.fn(async ({ signal }) => {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (input.rawFailure) throw input.rawFailure;
      return [fixture.drive.projectFolder];
    }),
    findHistoryFolders: vi.fn(async () => [fixture.drive.historyFolder]),
    findRevisionsFolders: vi.fn(async () => [fixture.drive.revisionsFolder]),
    findRevisionFiles: vi.fn(async () => [
      fixture.drive.preparedRevisionFile,
    ]),
    readRevisionFile: vi.fn(async () => fixture.plan.revisionFile.canonicalBody),
    findCurrentManifestFiles: vi.fn(async () => [fixture.drive.manifestFile]),
    readCurrentManifest: vi.fn(async () => {
      manifestReadCount += 1;
      if (manifestReadCount > 1 && input.verifiedManifestText !== undefined) {
        return input.verifiedManifestText;
      }
      return currentText;
    }),
    updateCurrentManifest: vi.fn(async ({ jsonText }) => {
      currentText = jsonText;
      if (input.updateThrows) throw new Error("raw-update-secret");
    }),
  };
  return { fixture, adapter };
}

describe("rollback manifest commit", () => {
  it("replaces current content with the target-derived manifest body", async () => {
    const { fixture, adapter } = buildAdapter();
    const result = await commitProjectRollbackManifestWithAdapter(
      { plan: fixture.plan },
      adapter,
    );
    expect(result).toMatchObject({ ok: true, status: "committed" });
    expect(adapter.updateCurrentManifest).toHaveBeenCalledOnce();
    const update = vi.mocked(adapter.updateCurrentManifest).mock.calls[0][0];
    const body = JSON.parse(update.jsonText) as ProjectManifest;
    expect(body.title).toBe(fixture.targetManifest.title);
    expect(body.slides).toEqual(fixture.targetManifest.slides);
    expect(body.title).not.toBe(fixture.currentManifest.title);
    expect(body.slides).not.toEqual(fixture.currentManifest.slides);
  });

  it("returns alreadyCommitted only for a completely matching manifest", async () => {
    const { fixture, adapter } = buildAdapter({
      initialManifest: buildRollbackTestFixture().plan.currentManifestUpdate.body,
    });
    const result = await commitProjectRollbackManifestWithAdapter(
      { plan: fixture.plan },
      adapter,
    );
    expect(result).toMatchObject({ ok: true, status: "alreadyCommitted" });
    expect(adapter.updateCurrentManifest).not.toHaveBeenCalled();
  });

  it.each([
    [
      "revision ID only",
      (manifest: ProjectManifest, fixture: ReturnType<typeof buildRollbackTestFixture>) => {
        if (!manifest.publication) throw new Error("publication missing");
        manifest.publication.currentRevisionId = TEST_NEXT_REVISION_ID;
        manifest.publication.operationId =
          fixture.currentManifest.publication?.operationId ?? "";
      },
    ],
    [
      "operation ID only",
      (manifest: ProjectManifest, fixture: ReturnType<typeof buildRollbackTestFixture>) => {
        if (!manifest.publication) throw new Error("publication missing");
        manifest.publication.operation = "rollback";
        manifest.publication.operationId = fixture.plan.operationId;
      },
    ],
    [
      "publication matches but body differs",
      (manifest: ProjectManifest, fixture: ReturnType<typeof buildRollbackTestFixture>) => {
        manifest.publication = structuredClone(
          fixture.plan.currentManifestUpdate.publication,
        );
      },
    ],
  ])("treats %s as publicationConflict", async (_label, mutate) => {
    const fixture = buildRollbackTestFixture();
    const current = structuredClone(fixture.currentManifest);
    mutate(current, fixture);
    const built = buildAdapter({ initialManifest: current });
    const result = await commitProjectRollbackManifestWithAdapter(
      { plan: built.fixture.plan },
      built.adapter,
    );
    expect(result).toMatchObject({
      ok: false,
      code: "publicationConflict",
      recoverability: "requiresInspection",
    });
    expect(built.adapter.updateCurrentManifest).not.toHaveBeenCalled();
  });

  it("does not update when current modifiedTime changed", async () => {
    const { fixture, adapter } = buildAdapter();
    vi.mocked(adapter.findCurrentManifestFiles).mockResolvedValue([
      { ...fixture.drive.manifestFile, modifiedTime: "2026-07-28T01:30:00.000Z" },
    ]);
    const result = await commitProjectRollbackManifestWithAdapter(
      { plan: fixture.plan },
      adapter,
    );
    expect(result).toMatchObject({ ok: false, code: "currentManifestChanged" });
    expect(adapter.updateCurrentManifest).not.toHaveBeenCalled();
  });

  it("does not update when current content hash changed", async () => {
    const changed = buildRollbackTestFixture().currentManifest;
    changed.slides[0].caption = "changed again";
    const { fixture, adapter } = buildAdapter({ initialManifest: changed });
    const result = await commitProjectRollbackManifestWithAdapter(
      { plan: fixture.plan },
      adapter,
    );
    expect(result).toMatchObject({ ok: false, code: "currentManifestChanged" });
    expect(adapter.updateCurrentManifest).not.toHaveBeenCalled();
  });

  it("does not update when current revision changed", async () => {
    const changed = buildRollbackTestFixture().currentManifest;
    if (!changed.publication) throw new Error("publication missing");
    changed.publication.currentRevisionId =
      "rev_20260728T013000000Z_99999999";
    const { fixture, adapter } = buildAdapter({ initialManifest: changed });
    const result = await commitProjectRollbackManifestWithAdapter(
      { plan: fixture.plan },
      adapter,
    );
    expect(result).toMatchObject({ ok: false, code: "currentManifestChanged" });
    expect(adapter.updateCurrentManifest).not.toHaveBeenCalled();
  });

  it("commits after update and matching read-back", async () => {
    const { fixture, adapter } = buildAdapter();
    await expect(
      commitProjectRollbackManifestWithAdapter(
        { plan: fixture.plan },
        adapter,
      ),
    ).resolves.toMatchObject({ ok: true, status: "committed" });
  });

  it("converges when update throws but read-back is exact", async () => {
    const fixture = buildRollbackTestFixture();
    const { adapter } = buildAdapter({
      updateThrows: true,
      verifiedManifestText: JSON.stringify(
        fixture.plan.currentManifestUpdate.body,
      ),
    });
    const result = await commitProjectRollbackManifestWithAdapter(
      { plan: fixture.plan },
      adapter,
    );
    expect(result).toMatchObject({ ok: true, status: "committed" });
  });

  it("requires inspection when update throws and read-back is not exact", async () => {
    const { fixture, adapter } = buildAdapter({
      updateThrows: true,
      verifiedManifestText: JSON.stringify(
        buildRollbackTestFixture().currentManifest,
      ),
    });
    const result = await commitProjectRollbackManifestWithAdapter(
      { plan: fixture.plan },
      adapter,
    );
    expect(result).toMatchObject({
      ok: false,
      code: "currentManifestUpdateUnknown",
      recoverability: "requiresInspection",
    });
  });

  it("does not succeed when read-back fails formal parsing", async () => {
    const { fixture, adapter } = buildAdapter({
      verifiedManifestText: "{invalid",
    });
    const result = await commitProjectRollbackManifestWithAdapter(
      { plan: fixture.plan },
      adapter,
    );
    expect(result).toMatchObject({
      ok: false,
      code: "currentManifestVerificationFailed",
    });
  });

  it("returns classified abort and never raw adapter errors", async () => {
    const aborted = buildAdapter();
    const controller = new AbortController();
    controller.abort();
    const abortResult = await commitProjectRollbackManifestWithAdapter(
      { plan: aborted.fixture.plan, signal: controller.signal },
      aborted.adapter,
    );
    expect(abortResult).toMatchObject({ ok: false, code: "aborted" });

    const raw = buildAdapter({
      rawFailure: new Error("token Bearer raw-drive-secret"),
    });
    const failure = await commitProjectRollbackManifestWithAdapter(
      { plan: raw.fixture.plan },
      raw.adapter,
    );
    expect(failure).toMatchObject({ ok: false, code: "driveWriteFailed" });
    expect(JSON.stringify(failure)).not.toContain("raw-drive-secret");
    expect(JSON.stringify(failure)).not.toContain("Bearer");
  });

  it("keeps the expected content hash tied to the preflight snapshot", () => {
    const fixture = buildRollbackTestFixture();
    expect(fixture.plan.expectedCurrent.manifestCanonicalHash).toBe(
      getProjectManifestContentCanonicalHash(fixture.currentManifest),
    );
    expect(fixture.plan.expectedCurrent.currentRevisionId).toBe(
      TEST_CURRENT_REVISION_ID,
    );
  });
});
