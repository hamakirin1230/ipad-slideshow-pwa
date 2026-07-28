import { describe, expect, it, vi } from "vitest";
import type { DriveFileCandidate } from "../google-drive";
import { compareFreshSnapshotToPreviewGuard } from "./project-rollback-execution-preflight";
import {
  prepareProjectRollbackPreviewGuardWithAdapter,
  type ProjectRollbackPreviewGuardAdapter,
} from "./project-rollback-preview-guard";
import { buildProjectRollbackPreview } from "./project-rollback-preview";
import {
  TEST_PROJECT_ID,
  TEST_PUBLISHED_AT,
  TEST_TARGET_REVISION_ID,
  TEST_WORKSPACE_ID,
  buildRollbackTestFixture,
} from "./project-rollback-test-fixture";

function buildAdapter() {
  const fixture = buildRollbackTestFixture();
  const firstPreview = buildProjectRollbackPreview({
    checkedAt: TEST_PUBLISHED_AT,
    workspaceId: TEST_WORKSPACE_ID,
    projectId: TEST_PROJECT_ID,
    assetsFolderId: fixture.project.assetsFolderId,
    currentManifest: fixture.currentManifest,
    currentRevision: fixture.currentRevision,
    targetRevision: fixture.targetRevision,
    freshAssets: [
      { assetId: fixture.targetRevision.assets[0].assetId, metadata: fixture.drive.assetFile },
    ],
  });
  const files: Record<string, DriveFileCandidate> = {
    [fixture.project.projectFolderId]: fixture.drive.projectFolder,
    [fixture.project.manifestFileId]: fixture.drive.manifestFile,
    [fixture.project.assetsFolderId]: fixture.drive.assetsFolder,
    "index-file": fixture.drive.indexFile,
    "asset-file": fixture.drive.assetFile,
  };
  const adapter: ProjectRollbackPreviewGuardAdapter = {
    preparePreview: vi.fn(async () => ({ ok: true as const, preview: firstPreview })),
    readMetadata: vi.fn(async ({ fileId }) => structuredClone(files[fileId])),
    readText: vi.fn(async (_token, fileId) =>
      fileId === fixture.project.manifestFileId
        ? JSON.stringify(fixture.currentManifest)
        : JSON.stringify(fixture.indexBody),
    ),
    loadRevision: vi.fn(async ({ revisionId }) =>
      revisionId === fixture.currentRevision.revisionId
        ? { ok: true as const, revision: structuredClone(fixture.currentRevision) }
        : revisionId === fixture.targetRevision.revisionId
          ? { ok: true as const, revision: structuredClone(fixture.targetRevision) }
          : { ok: false as const, code: "notFound" as const, message: "missing" },
    ),
    now: vi.fn(() => TEST_PUBLISHED_AT),
  };
  return { fixture, adapter };
}

function input(fixture: ReturnType<typeof buildRollbackTestFixture>) {
  return {
    accessToken: "test-token",
    workspaceId: TEST_WORKSPACE_ID,
    projectsRootFolderId: "projects-root",
    indexJsonFileId: "index-file",
    project: fixture.project,
    targetRevisionId: TEST_TARGET_REVISION_ID,
    requestSequence: 19,
    signal: new AbortController().signal,
  };
}

function snapshot(fixture: ReturnType<typeof buildRollbackTestFixture>) {
  return {
    currentManifest: structuredClone(fixture.currentManifest),
    currentRevision: structuredClone(fixture.currentRevision),
    targetRevision: structuredClone(fixture.targetRevision),
    assetSnapshots: structuredClone(fixture.guard.targetAssets),
    indexBody: structuredClone(fixture.indexBody),
    indexProject: structuredClone(fixture.project),
    indexMetadata: structuredClone(fixture.metadata.indexMetadata),
    projectFolder: structuredClone(fixture.metadata.projectFolder),
    manifestFile: structuredClone(fixture.metadata.manifestFile),
    assetsFolder: structuredClone(fixture.metadata.assetsFolder),
    historyFolder: structuredClone(fixture.metadata.historyFolder),
    revisionsFolder: structuredClone(fixture.metadata.revisionsFolder),
  };
}

describe("rollback preview guard", () => {
  it("records the exact project, target, and sequence owner", async () => {
    const built = buildAdapter();
    const result = await prepareProjectRollbackPreviewGuardWithAdapter(
      input(built.fixture),
      built.adapter,
    );
    expect(result).toMatchObject({
      ok: true,
      guard: {
        owner: {
          projectId: TEST_PROJECT_ID,
          targetRevisionId: TEST_TARGET_REVISION_ID,
          requestSequence: 19,
        },
        readiness: "ready",
      },
    });
  });

  it("rejects a changed project snapshot", async () => {
    const built = buildAdapter();
    const changedProject = {
      ...built.fixture.project,
      title: "changed project",
    };
    const result = await prepareProjectRollbackPreviewGuardWithAdapter(
      { ...input(built.fixture), project: changedProject },
      built.adapter,
    );
    expect(result).toMatchObject({ ok: false, code: "staleCurrent" });
  });

  it("rejects a changed target owner", async () => {
    const built = buildAdapter();
    const result = await prepareProjectRollbackPreviewGuardWithAdapter(
      {
        ...input(built.fixture),
        targetRevisionId: "rev_20260726T010000000Z_99999999",
      },
      built.adapter,
    );
    expect(result).toMatchObject({ ok: false, code: "staleTargetRevision" });
  });

  it.each([
    ["current snapshot", (value: ReturnType<typeof snapshot>) => {
      value.manifestFile.modifiedTime = "2026-07-28T03:00:00.000Z";
    }, "current"],
    ["target canonical", (value: ReturnType<typeof snapshot>) => {
      value.targetRevision.manifest.slides[0].caption = "changed";
    }, "target"],
    ["asset snapshot", (value: ReturnType<typeof snapshot>) => {
      value.assetSnapshots[0].metadata.checksum = "changed";
    }, "assets"],
    ["index snapshot", (value: ReturnType<typeof snapshot>) => {
      value.indexBody.updatedAt = "2026-07-28T03:00:00.000Z";
    }, "index"],
  ])("detects %s changes against the stored guard", async (_label, mutate, expected) => {
    const built = buildAdapter();
    const result = await prepareProjectRollbackPreviewGuardWithAdapter(
      input(built.fixture),
      built.adapter,
    );
    if (!result.ok || !result.guard) throw new Error("guard missing");
    const fresh = snapshot(built.fixture);
    mutate(fresh);
    expect(
      compareFreshSnapshotToPreviewGuard({
        guard: result.guard,
        snapshot: fresh,
        project: built.fixture.project,
      }),
    ).toBe(expected);
  });

  it("does not leak the guard into the public preview object", async () => {
    const built = buildAdapter();
    const result = await prepareProjectRollbackPreviewGuardWithAdapter(
      input(built.fixture),
      built.adapter,
    );
    if (!result.ok) throw new Error("expected success");
    expect(result.preview).not.toHaveProperty("guard");
    expect(JSON.stringify(result.preview)).not.toContain("project-folder");
    expect(JSON.stringify(result.preview)).not.toContain("index-file");
    expect(JSON.stringify(result.preview)).not.toContain("fresh-checksum");
  });
});
