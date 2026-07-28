import { describe, expect, it, vi } from "vitest";
import {
  prepareProjectRollbackRevisionWithAdapter,
  type ProjectRollbackRevisionWriterAdapter,
} from "./project-rollback-revision-writer";
import { buildRollbackTestFixture } from "./project-rollback-test-fixture";

function buildAdapter(input: {
  existing?: "none" | "exact" | "different" | "duplicate";
  history?: "exact" | "missing" | "duplicate" | "invalidMetadata";
  revisions?: "exact" | "missing" | "duplicate" | "invalidMetadata";
  createThrows?: boolean;
  createdVerification?: "exact" | "missing" | "different";
} = {}) {
  const fixture = buildRollbackTestFixture();
  const exact = fixture.drive.preparedRevisionFile;
  const different = { ...exact, name: "different.json" };
  let revisionSearchCount = 0;
  const deleteRevision = vi.fn();
  const updateRevision = vi.fn();
  const renameRevision = vi.fn();
  const adapter: ProjectRollbackRevisionWriterAdapter = {
    findProjectFolders: vi.fn(async () => [fixture.drive.projectFolder]),
    findHistoryFolders: vi.fn(async () => {
      switch (input.history) {
        case "missing":
          return [];
        case "duplicate":
          return [fixture.drive.historyFolder, { ...fixture.drive.historyFolder }];
        case "invalidMetadata":
          return [{ ...fixture.drive.historyFolder, name: "wrong-history" }];
        default:
          return [fixture.drive.historyFolder];
      }
    }),
    findRevisionsFolders: vi.fn(async () => {
      switch (input.revisions) {
        case "missing":
          return [];
        case "duplicate":
          return [
            fixture.drive.revisionsFolder,
            { ...fixture.drive.revisionsFolder },
          ];
        case "invalidMetadata":
          return [{ ...fixture.drive.revisionsFolder, mimeType: "text/plain" }];
        default:
          return [fixture.drive.revisionsFolder];
      }
    }),
    findRevisionFiles: vi.fn(async () => {
      revisionSearchCount += 1;
      if (revisionSearchCount === 1) {
        if (input.existing === "exact") return [exact];
        if (input.existing === "different") return [different];
        if (input.existing === "duplicate") return [exact, { ...exact }];
        return [];
      }
      if (input.createdVerification === "missing") return [];
      if (input.createdVerification === "different") return [different];
      return [exact];
    }),
    createRevisionFile: vi.fn(async () => {
      if (input.createThrows) throw new Error("unknown create response");
    }),
    readRevisionFile: vi.fn(async ({ fileId }) =>
      fileId === exact.id
        ? fixture.plan.revisionFile.canonicalBody
        : JSON.stringify({ different: true }),
    ),
  };
  return {
    fixture,
    adapter,
    deleteRevision,
    updateRevision,
    renameRevision,
  };
}

describe("rollback revision writer", () => {
  it("creates a new revision and verifies metadata and body", async () => {
    const { fixture, adapter } = buildAdapter();
    const result = await prepareProjectRollbackRevisionWithAdapter(
      { plan: fixture.plan },
      adapter,
    );
    expect(result).toMatchObject({ ok: true, status: "created" });
    expect(adapter.createRevisionFile).toHaveBeenCalledOnce();
    expect(adapter.findRevisionFiles).toHaveBeenCalledTimes(2);
    expect(adapter.readRevisionFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: fixture.drive.preparedRevisionFile.id,
      }),
    );
  });

  it("returns alreadyPrepared for the same ID and exact content", async () => {
    const { fixture, adapter } = buildAdapter({ existing: "exact" });
    const result = await prepareProjectRollbackRevisionWithAdapter(
      { plan: fixture.plan },
      adapter,
    );
    expect(result).toMatchObject({ ok: true, status: "alreadyPrepared" });
    expect(adapter.createRevisionFile).not.toHaveBeenCalled();
  });

  it("returns conflict for the same ID with different metadata or body", async () => {
    const metadata = buildAdapter({ existing: "different" });
    await expect(
      prepareProjectRollbackRevisionWithAdapter(
        { plan: metadata.fixture.plan },
        metadata.adapter,
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "revisionConflict",
      recoverability: "conflict",
    });

    const body = buildAdapter({ existing: "exact" });
    vi.mocked(body.adapter.readRevisionFile).mockResolvedValue(
      JSON.stringify({ different: true }),
    );
    await expect(
      prepareProjectRollbackRevisionWithAdapter(
        { plan: body.fixture.plan },
        body.adapter,
      ),
    ).resolves.toMatchObject({ ok: false, code: "revisionConflict" });
  });

  it("stops on duplicate revision", async () => {
    const { fixture, adapter } = buildAdapter({ existing: "duplicate" });
    const result = await prepareProjectRollbackRevisionWithAdapter(
      { plan: fixture.plan },
      adapter,
    );
    expect(result).toMatchObject({
      ok: false,
      code: "duplicateRevision",
      recoverability: "requiresInspection",
    });
    expect(adapter.createRevisionFile).not.toHaveBeenCalled();
  });

  it.each([
    ["missing history", { history: "missing" as const }, "historyFolderConflict"],
    [
      "duplicate history",
      { history: "duplicate" as const },
      "duplicateHistoryFolder",
    ],
    [
      "invalid history metadata",
      { history: "invalidMetadata" as const },
      "historyFolderConflict",
    ],
    [
      "missing revisions",
      { revisions: "missing" as const },
      "revisionsFolderConflict",
    ],
    [
      "duplicate revisions",
      { revisions: "duplicate" as const },
      "duplicateRevisionsFolder",
    ],
    [
      "invalid revisions metadata",
      { revisions: "invalidMetadata" as const },
      "revisionsFolderConflict",
    ],
  ])("stops for %s", async (_label, options, code) => {
    const { fixture, adapter } = buildAdapter(options);
    const result = await prepareProjectRollbackRevisionWithAdapter(
      { plan: fixture.plan },
      adapter,
    );
    expect(result).toMatchObject({ ok: false, code });
    expect(adapter.createRevisionFile).not.toHaveBeenCalled();
  });

  it("converges after an unknown create response when exact content is found", async () => {
    const { fixture, adapter } = buildAdapter({ createThrows: true });
    const result = await prepareProjectRollbackRevisionWithAdapter(
      { plan: fixture.plan },
      adapter,
    );
    expect(result).toMatchObject({ ok: true, status: "created" });
    expect(adapter.findRevisionFiles).toHaveBeenCalledTimes(2);
  });

  it("never deletes, updates, or renames a revision when verification fails", async () => {
    const fixture = buildAdapter({
      createdVerification: "different",
    });
    const result = await prepareProjectRollbackRevisionWithAdapter(
      { plan: fixture.fixture.plan },
      fixture.adapter,
    );
    expect(result).toMatchObject({
      ok: false,
      code: "revisionVerificationFailed",
      recoverability: "requiresInspection",
    });
    expect(fixture.deleteRevision).not.toHaveBeenCalled();
    expect(fixture.updateRevision).not.toHaveBeenCalled();
    expect(fixture.renameRevision).not.toHaveBeenCalled();
    expect(fixture.adapter).not.toHaveProperty("deleteRevision");
    expect(fixture.adapter).not.toHaveProperty("updateRevision");
    expect(fixture.adapter).not.toHaveProperty("renameRevision");
  });
});
