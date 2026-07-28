import { describe, expect, it, vi } from "vitest";
import type {
  DriveFileCandidate,
  DriveProjectSummary,
  DriveSlideSummary,
  ProjectManifest,
} from "../google-drive";
import {
  deriveProjectPublishRevisionSummary,
  getProjectManifestContentCanonicalHash,
  type ProjectPublishRevision,
} from "./project-publish-revision";
import {
  prepareProjectRollbackPreviewWithAdapter,
  type ProjectRollbackReviewAdapter,
} from "./project-rollback-review";
import type { LoadProjectPublishRevisionResult } from "./project-publish-revision-loader";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const PROJECTS_ROOT_ID = "projects-root-secret";
const PROJECT_FOLDER_ID = "project-folder-secret";
const MANIFEST_FILE_ID = "manifest-file-secret";
const ASSETS_FOLDER_ID = "assets-folder-secret";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_FILE_ID = "asset-file-secret";
const CURRENT_REVISION_ID = "rev_20260728T010000000Z_1111aaaa";
const TARGET_REVISION_ID = "rev_20260727T010000000Z_2222bbbb";

const project: DriveProjectSummary = {
  projectId: PROJECT_ID,
  title: "Project title",
  projectFolderId: PROJECT_FOLDER_ID,
  manifestFileId: MANIFEST_FILE_ID,
  assetsFolderId: ASSETS_FOLDER_ID,
  manifestPath: `projects/${PROJECT_ID}/manifest.json`,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};

function slide(
  overrides: Partial<DriveSlideSummary> = {},
): DriveSlideSummary {
  return {
    slideId: "44444444-4444-4444-8444-444444444444",
    assetId: ASSET_ID,
    assetFileId: ASSET_FILE_ID,
    assetName: "asset.jpg",
    type: "image",
    mimeType: "image/jpeg",
    source: "localFile",
    sourceMimeType: "image/jpeg",
    sourceMediaItemId: "source",
    fileSize: 1200,
    durationSeconds: 10,
    caption: "caption",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function manifest(slides = [slide()]): ProjectManifest {
  return {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: project.title,
    slides,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function revision(
  revisionId: string,
  revisionManifest: ProjectManifest,
): ProjectPublishRevision {
  const assets = [
    {
      assetId: ASSET_ID,
      driveFileId: ASSET_FILE_ID,
      mimeType: "image/jpeg",
      sizeBytes: 1200,
      modifiedTime: "2026-07-20T00:00:00.000Z",
      checksum: "checksum-secret",
      remoteOnly: false,
    },
  ];
  return {
    schemaVersion: 1,
    revisionId,
    projectId: PROJECT_ID,
    publishedAt:
      revisionId === CURRENT_REVISION_ID
        ? "2026-07-28T01:00:00.000Z"
        : "2026-07-27T01:00:00.000Z",
    operation: "publish",
    sourceManifestModifiedTime: "2026-07-20T00:00:00.000Z",
    sourceManifestCanonicalHash:
      getProjectManifestContentCanonicalHash(revisionManifest),
    previousRevisionId: null,
    summary: deriveProjectPublishRevisionSummary(revisionManifest, assets),
    assets,
    manifest: revisionManifest,
  };
}

function driveMetadata(input: {
  id: string;
  name: string;
  mimeType: string;
  role: string;
  parentId: string;
  modifiedTime?: string;
  assetId?: string;
}): DriveFileCandidate {
  return {
    id: input.id,
    name: input.name,
    mimeType: input.mimeType,
    modifiedTime: input.modifiedTime,
    parents: [input.parentId],
    trashed: false,
    appProperties: {
      app: "ipad-slideshow-pwa",
      role: input.role,
      schemaVersion: "1",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      ...(input.assetId ? { assetId: input.assetId } : {}),
    },
  };
}

function buildFixture(options: {
  withoutPublication?: boolean;
  currentResult?: Awaited<
    ReturnType<ProjectRollbackReviewAdapter["loadRevision"]>
  >;
  targetResult?: Awaited<
    ReturnType<ProjectRollbackReviewAdapter["loadRevision"]>
  >;
  endTargetResult?: Awaited<
    ReturnType<ProjectRollbackReviewAdapter["loadRevision"]>
  >;
  endManifestModifiedTime?: string;
  endManifest?: ProjectManifest;
} = {}) {
  const publishedManifest = manifest([
    slide({ caption: "currently published" }),
  ]);
  const currentRevision = revision(CURRENT_REVISION_ID, publishedManifest);
  const currentManifest = structuredClone(publishedManifest);
  if (!options.withoutPublication) {
    currentManifest.publication = {
      schemaVersion: 1,
      currentRevisionId: currentRevision.revisionId,
      publishedAt: currentRevision.publishedAt,
      operation: currentRevision.operation,
      operationId: "pubop_20260728T010000000Z_1234abcd",
      contentCanonicalHash: currentRevision.sourceManifestCanonicalHash,
    };
  }
  const targetManifest = manifest([slide({ caption: "target caption" })]);
  const targetRevision = revision(TARGET_REVISION_ID, targetManifest);
  const endManifest = options.endManifest ?? currentManifest;
  let manifestMetadataReadCount = 0;
  let manifestTextReadCount = 0;
  let targetReadCount = 0;
  const readMetadata = vi.fn(async ({ fileId }: { fileId: string }) => {
    if (fileId === PROJECT_FOLDER_ID) {
      return driveMetadata({
        id: PROJECT_FOLDER_ID,
        name: PROJECT_ID,
        mimeType: "application/vnd.google-apps.folder",
        role: "projectRoot",
        parentId: PROJECTS_ROOT_ID,
      });
    }
    if (fileId === MANIFEST_FILE_ID) {
      manifestMetadataReadCount += 1;
      return driveMetadata({
        id: MANIFEST_FILE_ID,
        name: "manifest.json",
        mimeType: "application/json",
        role: "projectManifest",
        parentId: PROJECT_FOLDER_ID,
        modifiedTime:
          manifestMetadataReadCount === 1
            ? "2026-07-28T00:00:00.000Z"
            : (options.endManifestModifiedTime ??
              "2026-07-28T00:00:00.000Z"),
      });
    }
    if (fileId === ASSETS_FOLDER_ID) {
      return driveMetadata({
        id: ASSETS_FOLDER_ID,
        name: "assets",
        mimeType: "application/vnd.google-apps.folder",
        role: "assetsRoot",
        parentId: PROJECT_FOLDER_ID,
      });
    }
    if (fileId === ASSET_FILE_ID) {
      return {
        ...driveMetadata({
          id: ASSET_FILE_ID,
          name: "asset.jpg",
          mimeType: "image/jpeg",
          role: "asset",
          parentId: ASSETS_FOLDER_ID,
          modifiedTime: "2026-07-20T00:00:00.000Z",
          assetId: ASSET_ID,
        }),
        sizeBytes: 1200,
        checksum: "checksum-secret",
      };
    }
    throw new Error("unexpected metadata read");
  });
  const readText = vi.fn(async () => {
    manifestTextReadCount += 1;
    return JSON.stringify(
      manifestTextReadCount === 1 ? currentManifest : endManifest,
    );
  });
  const loadRevision = vi.fn(
    async (input: {
      revisionId: string;
    }): Promise<LoadProjectPublishRevisionResult> => {
    if (input.revisionId === CURRENT_REVISION_ID) {
      return (
        options.currentResult ?? { ok: true, revision: currentRevision }
      );
    }
    targetReadCount += 1;
    return targetReadCount === 1
      ? (options.targetResult ?? { ok: true, revision: targetRevision })
      : (options.endTargetResult ??
          options.targetResult ?? { ok: true, revision: targetRevision });
    },
  );
  const adapter: ProjectRollbackReviewAdapter = {
    readMetadata,
    readText,
    loadRevision,
    now: () => "2026-07-28T02:00:00.000Z",
  };
  return { adapter, readMetadata, currentManifest, currentRevision, targetRevision };
}

function run(
  fixture: ReturnType<typeof buildFixture>,
  signal = new AbortController().signal,
) {
  return prepareProjectRollbackPreviewWithAdapter(
    {
      accessToken: "access-token-secret",
      workspaceId: WORKSPACE_ID,
      projectsRootFolderId: PROJECTS_ROOT_ID,
      project,
      targetRevisionId: TARGET_REVISION_ID,
      signal,
    },
    fixture.adapter,
  );
}

describe("prepareProjectRollbackPreviewWithAdapter", () => {
  it("fresh-reads current, target, target assets and rechecks current/target", async () => {
    const fixture = buildFixture();
    const result = await run(fixture);
    expect(result.ok).toBe(true);
    expect(fixture.readMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: ASSET_FILE_ID }),
    );
    expect(fixture.adapter.loadRevision).toHaveBeenCalledTimes(3);
    expect(fixture.adapter.readText).toHaveBeenCalledTimes(2);
  });

  it("reads duplicate slide references only once per unique asset", async () => {
    const duplicateTarget = manifest([
      slide(),
      slide({
        slideId: "55555555-5555-4555-8555-555555555555",
      }),
    ]);
    const targetRevision = revision(TARGET_REVISION_ID, duplicateTarget);
    const fixture = buildFixture({
      targetResult: { ok: true, revision: targetRevision },
      endTargetResult: { ok: true, revision: targetRevision },
    });
    await run(fixture);
    expect(
      fixture.readMetadata.mock.calls.filter(
        ([input]) => input.fileId === ASSET_FILE_ID,
      ),
    ).toHaveLength(1);
  });

  it("blocks an unpublished project", async () => {
    const result = await run(buildFixture({ withoutPublication: true }));
    expect(result).toMatchObject({
      ok: false,
      category: "blocked",
      code: "unpublished",
    });
  });

  it.each([
    ["notFound", "currentRevisionNotFound"],
    ["duplicateRevision", "currentRevisionDuplicate"],
    ["invalidMetadata", "currentRevisionInvalid"],
    ["invalidJson", "currentRevisionInvalid"],
    ["invalidRevision", "currentRevisionInvalid"],
    ["metadataBodyMismatch", "currentRevisionInvalid"],
  ] as const)("maps current revision %s to %s", async (loaderCode, expected) => {
    const fixture = buildFixture({
      currentResult: {
        ok: false,
        code: loaderCode,
        message: "raw error fixture",
      },
    });
    const result = await run(fixture);
    expect(result).toMatchObject({ ok: false, code: expected });
    expect(JSON.stringify(result)).not.toContain("raw error fixture");
  });

  it.each([
    ["publishedAt", { publishedAt: "2026-07-28T01:00:01.000Z" }],
    ["operation", { operation: "rollback" as const }],
    [
      "content hash",
      { sourceManifestCanonicalHash: "fnv1a64:0123456789abcdef" },
    ],
  ])("blocks publication/current revision %s mismatch", async (_label, override) => {
    const base = buildFixture();
    const mismatched = { ...base.currentRevision, ...override };
    const result = await run(
      buildFixture({
        currentResult: { ok: true, revision: mismatched },
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      code: "currentPublicationInconsistent",
    });
  });

  it.each([
    ["notFound", "targetRevisionNotFound"],
    ["duplicateRevision", "targetRevisionDuplicate"],
    ["invalidMetadata", "targetRevisionInvalid"],
    ["invalidJson", "targetRevisionInvalid"],
    ["invalidRevision", "targetRevisionInvalid"],
    ["metadataBodyMismatch", "targetRevisionInvalid"],
  ] as const)("maps target revision %s to %s", async (loaderCode, expected) => {
    const fixture = buildFixture({
      targetResult: {
        ok: false,
        code: loaderCode,
        message: "raw target error fixture",
      },
    });
    const result = await run(fixture);
    expect(result).toMatchObject({ ok: false, code: expected });
    expect(JSON.stringify(result)).not.toContain("raw target error fixture");
  });

  it("detects stale current modifiedTime", async () => {
    const result = await run(
      buildFixture({
        endManifestModifiedTime: "2026-07-28T00:01:00.000Z",
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      category: "stale",
      code: "staleCurrent",
    });
  });

  it("detects stale current content hash", async () => {
    const changed = manifest([slide({ caption: "changed during preview" })]);
    const currentRevision = revision(CURRENT_REVISION_ID, manifest());
    changed.publication = {
      schemaVersion: 1,
      currentRevisionId: currentRevision.revisionId,
      publishedAt: currentRevision.publishedAt,
      operation: currentRevision.operation,
      operationId: "pubop_20260728T010000000Z_1234abcd",
      contentCanonicalHash: currentRevision.sourceManifestCanonicalHash,
    };
    const result = await run(buildFixture({ endManifest: changed }));
    expect(result).toMatchObject({ ok: false, code: "staleCurrent" });
  });

  it("detects stale currentRevisionId", async () => {
    const fixture = buildFixture();
    const changed = structuredClone(fixture.currentManifest);
    if (!changed.publication) throw new Error("fixture publication missing");
    changed.publication.currentRevisionId =
      "rev_20260726T010000000Z_9999cccc";
    const result = await run(buildFixture({ endManifest: changed }));
    expect(result).toMatchObject({ ok: false, code: "staleCurrent" });
  });

  it("detects a target revision body change after asset inspection", async () => {
    const fixture = buildFixture();
    const changedManifest = structuredClone(fixture.targetRevision.manifest);
    changedManifest.slides[0].caption = "Drive UI mutation";
    const changedRevision = revision(TARGET_REVISION_ID, changedManifest);
    const result = await run(
      buildFixture({
        endTargetResult: { ok: true, revision: changedRevision },
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      category: "stale",
      code: "staleTargetRevision",
    });
  });

  it("blocks a target revision whose project does not match", async () => {
    const fixture = buildFixture();
    const wrongProject = {
      ...fixture.targetRevision,
      projectId: "other-project",
    };
    const result = await run(
      buildFixture({
        targetResult: { ok: true, revision: wrongProject },
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      code: "targetProjectMismatch",
    });
  });

  it("honors AbortSignal and does not expose token or raw Drive data", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await run(buildFixture(), controller.signal);
    expect(result).toMatchObject({ ok: false, code: "aborted" });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("access-token-secret");
    expect(serialized).not.toContain(PROJECT_FOLDER_ID);
    expect(serialized).not.toContain(ASSET_FILE_ID);
  });
});
