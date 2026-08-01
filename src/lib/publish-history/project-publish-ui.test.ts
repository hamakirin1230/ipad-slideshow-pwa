import { describe, expect, it, vi } from "vitest";
import { DRIVE_VIDEO_OFFLINE_MAX_BYTES } from "../drive-video-policy";
import type {
  DriveFileCandidate,
  DriveProjectSummary,
  ProjectManifest,
} from "../google-drive";
import {
  prepareProjectPublishReviewWithAdapter,
  type ProjectPublishReviewAdapter,
} from "./project-publish-review";
import {
  buildProjectPublishReview,
  buildSanitizedPublishSuccess,
  createPrepareReviewFailure,
  createRandomHexSuffix,
  getProjectPublishAssetDiagnosticLabel,
  getManifestCommitLabel,
  getProjectPublishModeLabel,
  getRevisionPreparationLabel,
  isCurrentProjectPublishRequest,
  mapPublishPreflightIssue,
  mapPublishWorkflowError,
  pendingProjectPublishOwnerMatches,
  PROJECT_PUBLISH_ASSET_DIAGNOSTIC_CODES,
  PROJECT_PUBLISH_DRIVE_SUCCESS_MESSAGE,
  PROJECT_PUBLISH_OFFLINE_SYNC_MESSAGE,
  shouldDiscardPendingPlan,
  type PendingProjectPublishOwner,
  type ProjectPublishAssetDiagnosticCode,
  type ProjectPublishReview,
} from "./project-publish-ui";
import { getProjectManifestContentCanonicalHash } from "./project-publish-revision";
import type { ListProjectPublishRevisionsResult } from "./project-publish-revision-loader";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const IMAGE_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const VIDEO_ASSET_ID = "44444444-4444-4444-8444-444444444444";
const IMAGE_SLIDE_ID = "55555555-5555-4555-8555-555555555555";
const VIDEO_SLIDE_ID = "66666666-6666-4666-8666-666666666666";
const PUBLISHED_AT = "2026-07-28T12:34:56.789Z";
const PREVIOUS_REVISION_ID = "rev_20260727T123456789Z_cd34ef56";

const project: DriveProjectSummary = {
  projectId: PROJECT_ID,
  title: "Fresh project",
  projectFolderId: "project-folder",
  manifestFileId: "manifest-file",
  assetsFolderId: "assets-folder",
  manifestPath: `projects/${PROJECT_ID}/manifest.json`,
  createdAt: "2026-07-28T10:00:00.000Z",
  updatedAt: "2026-07-28T12:00:00.000Z",
};

function buildManifest(): ProjectManifest {
  return {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: project.title,
    slides: [
      {
        slideId: IMAGE_SLIDE_ID,
        assetId: IMAGE_ASSET_ID,
        assetFileId: "image-file",
        assetName: "image.jpg",
        type: "image",
        mimeType: "image/jpeg",
        source: "localFile",
        sourceMimeType: "image/jpeg",
        sourceMediaItemId: "image-source",
        fileSize: 1200,
        durationSeconds: 10,
        caption: "",
        createdAt: "2026-07-28T10:01:00.000Z",
        updatedAt: "2026-07-28T10:01:00.000Z",
      },
      {
        slideId: VIDEO_SLIDE_ID,
        assetId: VIDEO_ASSET_ID,
        assetFileId: "video-file",
        assetName: "video.mp4",
        type: "video",
        mimeType: "video/mp4",
        source: "localFile",
        sourceMimeType: "video/mp4",
        sourceMediaItemId: "video-source",
        fileSize: DRIVE_VIDEO_OFFLINE_MAX_BYTES + 1,
        durationMs: 30_000,
        durationSeconds: 12,
        caption: "",
        createdAt: "2026-07-28T10:02:00.000Z",
        updatedAt: "2026-07-28T10:02:00.000Z",
      },
    ],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function file(
  id: string,
  name: string,
  mimeType: string,
  role: string,
  parentId: string,
  extra: Partial<DriveFileCandidate> = {},
): DriveFileCandidate {
  const { appProperties: extraProperties, ...extraFields } = extra;
  return {
    id,
    name,
    mimeType,
    modifiedTime: "2026-07-28T12:00:00.000Z",
    parents: [parentId],
    trashed: false,
    ...extraFields,
    appProperties: {
      app: "ipad-slideshow-pwa",
      role,
      schemaVersion: "1",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      ...(extraProperties ?? {}),
    },
  };
}

function buildMetadata() {
  return new Map<string, DriveFileCandidate>([
    [
      project.projectFolderId,
      file(
        project.projectFolderId,
        PROJECT_ID,
        "application/vnd.google-apps.folder",
        "projectRoot",
        "projects-root",
      ),
    ],
    [
      project.manifestFileId,
      file(
        project.manifestFileId,
        "manifest.json",
        "application/json",
        "projectManifest",
        project.projectFolderId,
      ),
    ],
    [
      project.assetsFolderId,
      file(
        project.assetsFolderId,
        "assets",
        "application/vnd.google-apps.folder",
        "assetsRoot",
        project.projectFolderId,
      ),
    ],
    [
      "image-file",
      file(
        "image-file",
        "image.jpg",
        "image/jpeg",
        "asset",
        project.assetsFolderId,
        {
          sizeBytes: 1200,
          checksum: "image-checksum",
          appProperties: { assetId: IMAGE_ASSET_ID },
        },
      ),
    ],
    [
      "video-file",
      file(
        "video-file",
        "video.mp4",
        "video/mp4",
        "asset",
        project.assetsFolderId,
        {
          sizeBytes: DRIVE_VIDEO_OFFLINE_MAX_BYTES + 1,
          checksum: "video-checksum",
          appProperties: { assetId: VIDEO_ASSET_ID },
        },
      ),
    ],
  ]);
}

function buildAdapter(input?: {
  manifest?: ProjectManifest;
  history?: ListProjectPublishRevisionsResult;
  metadata?: Map<string, DriveFileCandidate>;
}): ProjectPublishReviewAdapter {
  const manifest = input?.manifest ?? buildManifest();
  const metadata = input?.metadata ?? buildMetadata();
  return {
    readMetadata: vi.fn(async ({ fileId }) => {
      const value = metadata.get(fileId);
      if (!value) throw new Error("missing fixture");
      return structuredClone(value);
    }),
    readText: vi.fn(async () => JSON.stringify(manifest)),
    listRevisions: vi.fn(async () =>
      input?.history ?? { ok: true, status: "notConfigured" },
    ),
  };
}

async function prepare(input?: {
  manifest?: ProjectManifest;
  history?: ListProjectPublishRevisionsResult;
  metadata?: Map<string, DriveFileCandidate>;
}) {
  return prepareProjectPublishReviewWithAdapter(
    {
      accessToken: "token-never-returned",
      workspaceId: WORKSPACE_ID,
      projectsRootFolderId: "projects-root",
      project,
      publishedAt: PUBLISHED_AT,
      revisionRandomSuffix: "a1b2c3d4",
      operationRandomSuffix: "1234abcd",
      signal: new AbortController().signal,
    },
    buildAdapter(input),
  );
}

function reviewFixture(
  input: Partial<ProjectPublishReview> = {},
): ProjectPublishReview {
  return {
    projectId: PROJECT_ID,
    projectTitle: "Fixture",
    revisionId: "rev_20260728T123456789Z_a1b2c3d4",
    publishedAt: PUBLISHED_AT,
    initialPublish: true,
    previousRevisionId: null,
    slideCount: 2,
    assetCount: 2,
    remoteOnlyAssetCount: 1,
    warnings: [],
    ...input,
  };
}

describe("fresh publish review preparation", () => {
  it("allows a manifest display name to differ from the Drive storage name", async () => {
    const manifest = buildManifest();
    manifest.slides[0].assetName = "IMG_1234.JPG";
    const metadata = buildMetadata();
    metadata.get("image-file")!.name =
      "33333333-3333-4333-8333-333333333333.jpg";

    const result = await prepare({ manifest, metadata });

    expect(result.ok).toBe(true);
  });

  it("continues to allow matching manifest and Drive asset names", async () => {
    const result = await prepare();
    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("diagnosticCode");
  });

  it("allows notConfigured as initial publish", async () => {
    const result = await prepare();
    expect(result.ok && result.review.initialPublish).toBe(true);
  });

  it("allows ready with zero valid revisions as initial publish", async () => {
    const result = await prepare({
      history: {
        ok: true,
        status: "ready",
        items: [],
        invalidMetadataCount: 0,
        ignoredFileCount: 0,
        duplicateRevisionIdCount: 0,
      },
    });
    expect(result.ok && result.review.previousRevisionId).toBeNull();
  });

  it("uses the latest valid revision for a subsequent publish", async () => {
    const manifest = buildManifest();
    manifest.publication = {
      schemaVersion: 1,
      currentRevisionId: PREVIOUS_REVISION_ID,
      publishedAt: "2026-07-27T12:34:56.789Z",
      operation: "publish",
      operationId: "pubop_20260727T123456789Z_1234abcd",
      contentCanonicalHash: getProjectManifestContentCanonicalHash(manifest),
    };
    const result = await prepare({
      manifest,
      history: {
        ok: true,
        status: "ready",
        items: [
          {
            revisionId: PREVIOUS_REVISION_ID,
            operation: "publish",
            publishedAt: "2026-07-27T12:34:56.789Z",
            schemaVersion: 1,
            modifiedTime: "2026-07-27T12:35:00.000Z",
            metadataStatus: "ready",
          },
        ],
        invalidMetadataCount: 0,
        ignoredFileCount: 0,
        duplicateRevisionIdCount: 0,
      },
    });
    expect(result.ok && result.review.previousRevisionId).toBe(
      PREVIOUS_REVISION_ID,
    );
  });

  it("blocks invalid history metadata", async () => {
    const result = await prepare({
      history: {
        ok: true,
        status: "ready",
        items: [],
        invalidMetadataCount: 1,
        ignoredFileCount: 0,
        duplicateRevisionIdCount: 0,
      },
    });
    expect(result).toMatchObject({ ok: false, code: "invalidHistoryMetadata" });
  });

  it("blocks duplicate revision metadata", async () => {
    const result = await prepare({
      history: {
        ok: true,
        status: "ready",
        items: [],
        invalidMetadataCount: 0,
        ignoredFileCount: 0,
        duplicateRevisionIdCount: 1,
      },
    });
    expect(result).toMatchObject({ ok: false, code: "invalidHistoryMetadata" });
  });

  it("blocks duplicate history locations reported by the loader", async () => {
    const result = await prepare({
      history: {
        ok: false,
        code: "duplicateHistoryFolder",
        message: "raw detail",
      },
    });
    expect(result).toEqual({
      ok: false,
      code: "duplicateHistoryFolder",
      message: "公開履歴の保存状態を確認できませんでした。",
    });
  });

  it("reads only location files and manifest referenced assets", async () => {
    const adapter = buildAdapter();
    await prepareProjectPublishReviewWithAdapter(
      {
        accessToken: "token",
        workspaceId: WORKSPACE_ID,
        projectsRootFolderId: "projects-root",
        project,
        publishedAt: PUBLISHED_AT,
        revisionRandomSuffix: "a1b2c3d4",
        operationRandomSuffix: "1234abcd",
        signal: new AbortController().signal,
      },
      adapter,
    );
    expect(vi.mocked(adapter.readMetadata).mock.calls.map(([arg]) => arg.fileId))
      .toEqual([
        "project-folder",
        "manifest-file",
        "assets-folder",
        "image-file",
        "video-file",
      ]);
  });

  it("uses fresh manifest slide counts", async () => {
    const manifest = buildManifest();
    manifest.slides = manifest.slides.slice(0, 1);
    const result = await prepare({ manifest });
    expect(result.ok && result.review.slideCount).toBe(1);
  });

  it("uses fresh asset size to derive remoteOnly", async () => {
    const manifest = buildManifest();
    const metadata = buildMetadata();
    metadata.set(
      "video-file",
      file(
        "video-file",
        "video.mp4",
        "video/mp4",
        "asset",
        project.assetsFolderId,
        {
          sizeBytes: DRIVE_VIDEO_OFFLINE_MAX_BYTES,
          checksum: "video-checksum",
          appProperties: { assetId: VIDEO_ASSET_ID },
        },
      ),
    );
    manifest.slides[1].fileSize = DRIVE_VIDEO_OFFLINE_MAX_BYTES;
    const result = await prepare({ manifest, metadata });
    expect(result.ok && result.review.remoteOnlyAssetCount).toBe(0);
  });

  it("reports a sanitized preflight asset size diagnostic", async () => {
    const manifest = buildManifest();
    manifest.slides[0].fileSize = 1201;
    const result = await prepare({ manifest });
    expect(result).toMatchObject({
      ok: false,
      code: "assetSizeMismatch",
      diagnosticCode: "assetSizeMismatch",
    });
  });

  it("does not use component project detail state", async () => {
    const result = await prepare();
    expect(result.ok && result.review.slideCount).toBe(2);
  });

  it("creates separate revision and operation suffixes", async () => {
    const result = await prepare();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.revisionId).toContain("a1b2c3d4");
    expect(result.plan.operationId).toContain("1234abcd");
  });

  it("does not return a plan after preflight failure", async () => {
    const metadata = buildMetadata();
    metadata.get("manifest-file")!.modifiedTime = undefined;
    const result = await prepare({ metadata });
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("plan");
  });

  it("does not expose token or Drive IDs in the review", async () => {
    const result = await prepare();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.review);
    expect(serialized).not.toContain("token-never-returned");
    expect(serialized).not.toContain("manifest-file");
    expect(serialized).not.toContain("image-file");
  });

  it("diagnoses a mismatched asset parent count", async () => {
    const metadata = buildMetadata();
    metadata.get("image-file")!.parents = [
      project.assetsFolderId,
      "additional-folder",
    ];
    const result = await prepare({ metadata });
    expect(result).toMatchObject({
      ok: false,
      code: "invalidAssetMetadata",
      diagnosticCode: "assetParentCountMismatch",
    });
  });

  it("diagnoses a mismatched asset parent", async () => {
    const metadata = buildMetadata();
    metadata.get("image-file")!.parents = ["wrong-folder"];
    const result = await prepare({ metadata });
    expect(result).toMatchObject({
      ok: false,
      code: "invalidAssetMetadata",
      diagnosticCode: "assetParentMismatch",
    });
  });

  it("diagnoses a mismatched asset file ID", async () => {
    const metadata = buildMetadata();
    metadata.get("image-file")!.id = "different-file";
    const result = await prepare({ metadata });
    expect(result).toMatchObject({
      ok: false,
      code: "invalidAssetMetadata",
      diagnosticCode: "assetFileIdMismatch",
    });
  });

  it("diagnoses a mismatched asset MIME type", async () => {
    const metadata = buildMetadata();
    metadata.get("image-file")!.mimeType = "image/png";
    const result = await prepare({ metadata });
    expect(result).toMatchObject({
      ok: false,
      code: "invalidAssetMetadata",
      diagnosticCode: "assetMimeTypeMismatch",
    });
  });

  it.each([
    ["app", "different-app", "assetAppMismatch"],
    ["role", "different-role", "assetRoleMismatch"],
    ["schemaVersion", "2", "assetSchemaVersionMismatch"],
    ["workspaceId", "different-id", "assetWorkspaceMismatch"],
    ["projectId", "different-id", "assetProjectMismatch"],
    ["assetId", "different-asset", "assetIdMismatch"],
  ] as const)(
    "diagnoses a mismatched asset appProperties.%s",
    async (property, value, diagnosticCode) => {
      const metadata = buildMetadata();
      metadata.get("image-file")!.appProperties[property] = value;
      const result = await prepare({ metadata });
      expect(result).toMatchObject({
        ok: false,
        code: "invalidAssetMetadata",
        diagnosticCode,
      });
    },
  );

  it("returns no sensitive metadata with an asset diagnostic", async () => {
    const metadata = buildMetadata();
    const asset = metadata.get("image-file")!;
    asset.name = "https://drive.example.invalid/private-file";
    asset.checksum = "sensitive-checksum";
    asset.appProperties.app = "raw-sensitive-app";
    const result = await prepare({ metadata });
    const serialized = JSON.stringify(result);
    expect(result).toEqual({
      ok: false,
      code: "invalidAssetMetadata",
      message: "公開対象のアセット情報が一致しません。",
      diagnosticCode: "assetAppMismatch",
    });
    for (const forbidden of [
      "token-never-returned",
      "image-file",
      "video-file",
      "manifest-file",
      "assets-folder",
      "project-folder",
      IMAGE_ASSET_ID,
      WORKSPACE_ID,
      PROJECT_ID,
      "raw-sensitive-app",
      "appProperties",
      "sensitive-checksum",
      "https://",
      "fnv1a64",
      "slides",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("blocks a trashed asset in preflight", async () => {
    const metadata = buildMetadata();
    metadata.get("image-file")!.trashed = true;
    const result = await prepare({ metadata });
    expect(result).toMatchObject({ ok: false, code: "trashedAsset" });
  });
});

describe("review and warning mapping", () => {
  it("provides a fixed label for every allowed asset diagnostic", () => {
    for (const code of PROJECT_PUBLISH_ASSET_DIAGNOSTIC_CODES) {
      expect(getProjectPublishAssetDiagnosticLabel(code)).not.toBe("");
    }
  });

  it.each([
    ["assetFileIdMismatch", "ファイル参照ID不一致"],
    ["assetSizeMismatch", "ファイルサイズ不一致"],
    ["assetMediaTypeMismatch", "image/video分類不一致"],
  ] as const)("maps sanitized diagnostic %s", (code, label) => {
    expect(
      getProjectPublishAssetDiagnosticLabel(
        code as ProjectPublishAssetDiagnosticCode,
      ),
    ).toBe(label);
  });
  it("builds an initial review", () => {
    expect(getProjectPublishModeLabel(reviewFixture())).toBe("初回公開");
  });

  it("builds a subsequent review", () => {
    expect(
      getProjectPublishModeLabel(
        reviewFixture({ initialPublish: false, previousRevisionId: "rev" }),
      ),
    ).toBe("更新公開");
  });

  it("maps a warning without path or raw values", () => {
    expect(
      mapPublishPreflightIssue({
        code: "remoteOnlyAsset",
        message: "remote only",
      }),
    ).toEqual({ code: "remoteOnlyAsset", message: "remote only" });
  });

  it("preserves zero warnings", () => {
    expect(reviewFixture().warnings).toEqual([]);
  });

  it("preserves multiple sanitized warnings", () => {
    const result = buildProjectPublishReview({
      projectId: PROJECT_ID,
      projectTitle: "Title",
      publishedAt: PUBLISHED_AT,
      summary: {
        initialPublish: true,
        revisionId: "revision",
        previousRevisionId: null,
        slideCount: 1,
        assetCount: 1,
        remoteOnlyAssetCount: 1,
        warningCount: 2,
      },
      warnings: [
        { code: "missingAssetChecksum", severity: "warning", message: "one" },
        { code: "remoteOnlyAsset", severity: "warning", message: "two" },
      ],
    });
    expect(result.warnings).toEqual([
      { code: "missingAssetChecksum", message: "one" },
      { code: "remoteOnlyAsset", message: "two" },
    ]);
  });

  it("creates a generic sanitized preflight error", () => {
    expect(createPrepareReviewFailure()).toMatchObject({
      ok: false,
      code: "preflightFailed",
    });
  });

  it("does not add raw issue fields to review warnings", () => {
    const warning = mapPublishPreflightIssue({
      code: "missingAssetSize",
      message: "missing",
    });
    expect(warning).not.toHaveProperty("path");
    expect(warning).not.toHaveProperty("severity");
  });
});

describe("workflow error and success labels", () => {
  const errors = [
    ["retryable", true],
    ["conflict", false],
    ["requiresInspection", false],
  ] as const;

  it.each(errors)("maps %s recovery", (recoverability, canRetry) => {
    const mapped = mapPublishWorkflowError({
      ok: false,
      stage: "commitManifest",
      code: "internal-code",
      message: "raw token manifest-file fnv1a64:1234567890abcdef",
      recoverability,
    });
    expect(mapped.canRetry).toBe(canRetry);
    expect(mapped.recoverability).toBe(recoverability);
  });

  it.each(errors)("does not expose raw %s messages", (recoverability) => {
    const mapped = mapPublishWorkflowError({
      ok: false,
      stage: "commitManifest",
      code: "code",
      message: "token drive-file fnv1a64:1234567890abcdef",
      recoverability,
    });
    expect(mapped.message).not.toContain("token");
    expect(mapped.message).not.toContain("drive-file");
    expect(mapped.message).not.toContain("fnv1a64");
  });

  it("labels a created revision", () => {
    expect(getRevisionPreparationLabel("created")).toContain("作成");
  });

  it("labels an already prepared revision as verified", () => {
    expect(getRevisionPreparationLabel("alreadyPrepared")).toContain("確認");
  });

  it("labels a committed manifest as updated", () => {
    expect(getManifestCommitLabel("committed")).toContain("更新");
  });

  it("labels an already committed manifest as verified", () => {
    expect(getManifestCommitLabel("alreadyCommitted")).toContain("確認");
  });

  it("keeps commit success when the fresh manifest refresh succeeds", () => {
    const result = buildSanitizedPublishSuccess({
      workflow: {
        ok: true,
        revisionId: "revision",
        operationId: "operation",
        revisionStatus: "created",
        manifestStatus: "committed",
      },
      publishedAt: PUBLISHED_AT,
      refreshed: true,
    });
    expect(result).toMatchObject({
      refreshStatus: "refreshed",
      refreshMessage: null,
    });
  });

  it("keeps commit success when the fresh manifest refresh fails", () => {
    const result = buildSanitizedPublishSuccess({
      workflow: {
        ok: true,
        revisionId: "revision",
        operationId: "operation",
        revisionStatus: "alreadyPrepared",
        manifestStatus: "alreadyCommitted",
      },
      publishedAt: PUBLISHED_AT,
      refreshed: false,
    });
    expect(result.refreshStatus).toBe("refreshFailed");
    expect(result.refreshMessage).toContain("公開は完了");
  });

  it("defines the required Drive success guidance", () => {
    expect(PROJECT_PUBLISH_DRIVE_SUCCESS_MESSAGE).toBe(
      "Google Drive上の公開版を更新しました。",
    );
  });

  it("defines the required offline sync guidance", () => {
    expect(PROJECT_PUBLISH_OFFLINE_SYNC_MESSAGE).toBe(
      "iPadへ反映するには通常のオフライン同期を実行してください。",
    );
  });
});

describe("pending plan lifecycle and race guards", () => {
  const owner: PendingProjectPublishOwner = {
    projectId: PROJECT_ID,
    revisionId: "revision",
    requestSequence: 7,
  };

  it("matches the owning project and revision", () => {
    expect(
      pendingProjectPublishOwnerMatches(owner, {
        projectId: PROJECT_ID,
        revisionId: "revision",
      }),
    ).toBe(true);
  });

  it("rejects a project mismatch", () => {
    expect(
      pendingProjectPublishOwnerMatches(owner, {
        projectId: "other",
        revisionId: "revision",
      }),
    ).toBe(false);
  });

  it("rejects a revision mismatch", () => {
    expect(
      pendingProjectPublishOwnerMatches(owner, {
        projectId: PROJECT_ID,
        revisionId: "other",
      }),
    ).toBe(false);
  });

  it("rejects a missing owner", () => {
    expect(
      pendingProjectPublishOwnerMatches(null, {
        projectId: PROJECT_ID,
        revisionId: "revision",
      }),
    ).toBe(false);
  });

  const discardReasons = [
    "projectChanged",
    "googleDisconnected",
    "workspaceChanged",
    "cancelled",
    "newReview",
    "success",
    "conflict",
    "requiresInspection",
  ] as const;

  it.each(discardReasons)("discards for %s", (reason) => {
    expect(shouldDiscardPendingPlan(reason)).toBe("discard");
  });

  it.each(["retryable", "aborted"] as const)("retains for %s", (reason) => {
    expect(shouldDiscardPendingPlan(reason)).toBe("retain");
  });

  it("accepts a current owner and sequence", () => {
    expect(
      isCurrentProjectPublishRequest(owner, {
        requestSequence: 7,
        selectedProjectId: PROJECT_ID,
      }),
    ).toBe(true);
  });

  it("rejects a stale sequence", () => {
    expect(
      isCurrentProjectPublishRequest(owner, {
        requestSequence: 8,
        selectedProjectId: PROJECT_ID,
      }),
    ).toBe(false);
  });

  it("rejects a project change", () => {
    expect(
      isCurrentProjectPublishRequest(owner, {
        requestSequence: 7,
        selectedProjectId: "other",
      }),
    ).toBe(false);
  });
});

describe("Web Crypto suffix generation", () => {
  it("returns lowercase hex", () => {
    const cryptoSource = {
      getRandomValues: <T extends ArrayBufferView | null>(array: T) => {
        (array as Uint8Array).set([0xab, 0xcd, 0xef, 0x01]);
        return array;
      },
    };
    expect(createRandomHexSuffix(4, cryptoSource)).toBe("abcdef01");
  });

  it("pads zero bytes", () => {
    const cryptoSource = {
      getRandomValues: <T extends ArrayBufferView | null>(array: T) => {
        (array as Uint8Array).set([0, 1, 2, 3]);
        return array;
      },
    };
    expect(createRandomHexSuffix(4, cryptoSource)).toBe("00010203");
  });

  it("uses separate invocations for separate IDs", () => {
    const getRandomValues = vi
      .fn()
      .mockImplementationOnce((array: Uint8Array) => {
        array.fill(1);
        return array;
      })
      .mockImplementationOnce((array: Uint8Array) => {
        array.fill(2);
        return array;
      });
    expect(createRandomHexSuffix(4, { getRandomValues })).not.toBe(
      createRandomHexSuffix(4, { getRandomValues }),
    );
    expect(getRandomValues).toHaveBeenCalledTimes(2);
  });

  it.each([0, -1, 1.5])("rejects invalid byte length %s", (byteLength) => {
    expect(() => createRandomHexSuffix(byteLength)).toThrow(TypeError);
  });
});
