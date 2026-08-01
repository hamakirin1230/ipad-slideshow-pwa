import { describe, expect, it, vi } from "vitest";
import { DRIVE_VIDEO_OFFLINE_MAX_BYTES } from "../drive-video-policy";
import type { ProjectManifest } from "../google-drive";
import {
  getProjectManifestContentCanonicalHash,
  getProjectManifestCanonicalHash,
  parseProjectPublishRevision,
} from "./project-publish-revision";
import {
  buildProjectPublishRevisionAppProperties,
  buildProjectPublishRevisionDraft,
  buildProjectPublishWritePlan,
  createProjectPublishOperationId,
  isValidProjectPublishOperationId,
  runProjectPublishPreflight,
  type ProjectPublishAssetMetadataInput,
  type ProjectPublishPreflightInput,
  type ProjectPublishPreflightIssueCode,
} from "./project-publish-preflight";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const IMAGE_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const VIDEO_ASSET_ID = "44444444-4444-4444-8444-444444444444";
const IMAGE_SLIDE_ID = "55555555-5555-4555-8555-555555555555";
const VIDEO_SLIDE_ID = "66666666-6666-4666-8666-666666666666";
const IMAGE_DRIVE_FILE_ID = "drive-file-image-a";
const VIDEO_DRIVE_FILE_ID = "drive-file-video-a";
const CHECKED_AT = "2026-07-13T12:33:00.000Z";
const PUBLISHED_AT = "2026-07-13T12:34:56.789Z";
const REVISION_ID = "rev_20260713T123456789Z_ab12cd34";
const OPERATION_ID = "pubop_20260713T123300000Z_1234abcd";
const PREVIOUS_REVISION_ID = "rev_20260712T123456789Z_cd34ef56";

function buildManifest(): ProjectManifest {
  return {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: "Publish fixture",
    slides: [
      {
        slideId: IMAGE_SLIDE_ID,
        assetId: IMAGE_ASSET_ID,
        assetFileId: IMAGE_DRIVE_FILE_ID,
        assetName: "image-a.jpg",
        type: "image",
        mimeType: "image/jpeg",
        source: "localFile",
        sourceMimeType: "image/jpeg",
        sourceMediaItemId: "source-image-a",
        fileSize: 1200,
        durationSeconds: 10,
        caption: "Opening caption",
        createdAt: "2026-07-13T12:00:00.000Z",
        updatedAt: "2026-07-13T12:00:00.000Z",
      },
      {
        slideId: VIDEO_SLIDE_ID,
        assetId: VIDEO_ASSET_ID,
        assetFileId: VIDEO_DRIVE_FILE_ID,
        assetName: "video-a.mp4",
        type: "video",
        mimeType: "video/mp4",
        source: "localFile",
        sourceMimeType: "video/mp4",
        sourceMediaItemId: "source-video-a",
        fileSize: DRIVE_VIDEO_OFFLINE_MAX_BYTES + 1,
        durationMs: 30_000,
        durationSeconds: 12,
        caption: "Video caption",
        createdAt: "2026-07-13T12:00:00.000Z",
        updatedAt: "2026-07-13T12:00:00.000Z",
      },
    ],
    createdAt: "2026-07-13T12:00:00.000Z",
    updatedAt: "2026-07-13T12:30:00.000Z",
  };
}

function buildAssets(): ProjectPublishAssetMetadataInput[] {
  return [
    {
      assetId: IMAGE_ASSET_ID,
      driveFileId: IMAGE_DRIVE_FILE_ID,
      mimeType: "image/jpeg",
      sizeBytes: 1200,
      modifiedTime: "2026-07-13T12:01:00.000Z",
      checksum: "checksum-image-a",
      remoteOnly: false,
      trashed: false,
      role: "asset",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    },
    {
      assetId: VIDEO_ASSET_ID,
      driveFileId: VIDEO_DRIVE_FILE_ID,
      mimeType: "video/mp4",
      sizeBytes: DRIVE_VIDEO_OFFLINE_MAX_BYTES + 1,
      modifiedTime: "2026-07-13T12:02:00.000Z",
      checksum: "checksum-video-a",
      remoteOnly: true,
      trashed: false,
      role: "asset",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    },
  ];
}

function buildInput(): ProjectPublishPreflightInput {
  const manifest = buildManifest();
  const canonicalHash = getProjectManifestCanonicalHash(manifest);
  return {
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    checkedAt: CHECKED_AT,
    publishedAt: PUBLISHED_AT,
    revisionId: REVISION_ID,
    operationId: OPERATION_ID,
    manifest,
    sourceManifest: {
      modifiedTime: "2026-07-13T12:30:00.000Z",
      canonicalHash,
      currentRevisionId: null,
    },
    expectedCurrent: {
      manifestModifiedTime: "2026-07-13T12:30:00.000Z",
      manifestCanonicalHash: canonicalHash,
      currentRevisionId: null,
    },
    latestPublishedRevision: null,
    historyStatus: { status: "notConfigured" },
    assets: buildAssets(),
  };
}

function buildSubsequentInput(): ProjectPublishPreflightInput {
  return {
    ...buildInput(),
    historyStatus: { status: "ready", validRevisionCount: 1 },
    latestPublishedRevision: {
      revisionId: PREVIOUS_REVISION_ID,
      publishedAt: "2026-07-12T12:34:56.789Z",
      metadataStatus: "ready",
    },
  };
}

function expectSuccess(input: ProjectPublishPreflightInput = buildInput()) {
  const result = runProjectPublishPreflight(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected preflight success");
  return result;
}

function expectIssue(
  input: ProjectPublishPreflightInput,
  code: ProjectPublishPreflightIssueCode,
) {
  const result = runProjectPublishPreflight(input);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected preflight failure");
  expect(result.issues.some((candidate) => candidate.code === code)).toBe(true);
  return result.issues;
}

describe("valid publish planning", () => {
  it("builds an initial publish plan without performing Drive writes", () => {
    const result = expectSuccess();
    expect(result.plan.initialPublish).toBe(true);
    expect(result.plan.folders).toEqual({
      ensureHistoryFolder: true,
      ensureRevisionsFolder: true,
    });
    expect(result.summary.previousRevisionId).toBeNull();
  });

  it("builds a subsequent publish from the supplied latest valid revision", () => {
    const result = expectSuccess(buildSubsequentInput());
    expect(result.plan.initialPublish).toBe(false);
    expect(result.plan.revisionFile.body.previousRevisionId).toBe(
      PREVIOUS_REVISION_ID,
    );
    expect(result.plan.folders.ensureHistoryFolder).toBe(false);
  });

  it("preserves image, video, caption, duration, and slide ordering", () => {
    const result = expectSuccess();
    expect(result.plan.revisionFile.body.manifest.slides).toEqual(
      buildManifest().slides,
    );
  });

  it("permits an image-only publish", () => {
    const input = buildInput();
    input.manifest.slides = [input.manifest.slides[0]];
    input.assets = [input.assets[0]];
    const hash = getProjectManifestCanonicalHash(input.manifest);
    input.sourceManifest.canonicalHash = hash;
    input.expectedCurrent.manifestCanonicalHash = hash;
    const result = expectSuccess(input);
    expect(result.summary).toMatchObject({
      slideCount: 1,
      assetCount: 1,
      remoteOnlyAssetCount: 0,
    });
  });

  it("permits an empty validated manifest with no asset metadata", () => {
    const input = buildInput();
    input.manifest.slides = [];
    input.assets = [];
    const hash = getProjectManifestCanonicalHash(input.manifest);
    input.sourceManifest.canonicalHash = hash;
    input.expectedCurrent.manifestCanonicalHash = hash;
    expect(expectSuccess(input).summary.assetCount).toBe(0);
  });

  it("sorts revision assets by assetId independently of input order", () => {
    const left = buildInput();
    const right = buildInput();
    right.assets.reverse();
    expect(expectSuccess(left).plan.revisionFile.canonicalBody).toBe(
      expectSuccess(right).plan.revisionFile.canonicalBody,
    );
  });

  it("keeps appProperties aligned with the revision body", () => {
    const result = expectSuccess();
    expect(result.plan.revisionFile.appProperties).toEqual({
      app: "ipad-slideshow-pwa",
      role: "projectPublishRevision",
      schemaVersion: "1",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      revisionId: REVISION_ID,
      operation: "publish",
      publishedAt: PUBLISHED_AT,
    });
  });

  it("uses the fixed partial-failure-aware write step order", () => {
    expect(expectSuccess().plan.steps.map((step) => step.kind)).toEqual([
      "ensureHistoryFolder",
      "ensureRevisionsFolder",
      "createRevisionFile",
      "verifyRevisionFile",
      "updateCurrentManifest",
      "verifyCurrentManifest",
    ]);
  });

  it("plans formal publication metadata without adding it to revision content", () => {
    const result = expectSuccess();
    expect(result.plan.currentManifestUpdate.publication).toEqual({
      currentRevisionId: REVISION_ID,
      publishedAt: PUBLISHED_AT,
      schemaVersion: 1,
      operation: "publish",
      operationId: OPERATION_ID,
      contentCanonicalHash: result.plan.revisionFile.body.sourceManifestCanonicalHash,
    });
    expect(result.plan.revisionFile.body.manifest).not.toHaveProperty(
      "publication",
    );
  });

  it("uses manifest publication as the expected current revision", () => {
    const input = buildSubsequentInput();
    input.manifest.publication = {
      schemaVersion: 1,
      currentRevisionId: PREVIOUS_REVISION_ID,
      publishedAt: "2026-07-12T12:34:56.789Z",
      operation: "publish",
      operationId: "pubop_20260712T123300000Z_abcdef12",
      contentCanonicalHash: getProjectManifestContentCanonicalHash(input.manifest),
    };
    const hash = getProjectManifestContentCanonicalHash(input.manifest);
    input.sourceManifest.canonicalHash = hash;
    input.sourceManifest.currentRevisionId = PREVIOUS_REVISION_ID;
    input.expectedCurrent.manifestCanonicalHash = hash;
    input.expectedCurrent.currentRevisionId = PREVIOUS_REVISION_ID;
    const result = expectSuccess(input);
    expect(result.plan.currentManifestUpdate.expectedPreviousRevisionId).toBe(
      PREVIOUS_REVISION_ID,
    );
    expect(result.plan.revisionFile.body.manifest).not.toHaveProperty("publication");
  });

  it("ignores publication-only differences in the content hash", () => {
    const input = buildSubsequentInput();
    input.manifest.publication = {
      schemaVersion: 1,
      currentRevisionId: PREVIOUS_REVISION_ID,
      publishedAt: "2026-07-12T12:34:56.789Z",
      operation: "publish",
      operationId: "pubop_20260712T123300000Z_abcdef12",
      contentCanonicalHash: getProjectManifestContentCanonicalHash(input.manifest),
    };
    const hash = getProjectManifestContentCanonicalHash(input.manifest);
    input.sourceManifest = {
      modifiedTime: input.expectedCurrent.manifestModifiedTime,
      canonicalHash: hash,
      currentRevisionId: PREVIOUS_REVISION_ID,
    };
    input.expectedCurrent.manifestCanonicalHash = hash;
    input.expectedCurrent.currentRevisionId = PREVIOUS_REVISION_ID;
    expect(expectSuccess(input).plan.revisionFile.body.manifest).not.toHaveProperty(
      "publication",
    );
  });

  it("blocks expected current revision mismatch with manifest publication", () => {
    const input = buildInput();
    input.manifest.publication = {
      schemaVersion: 1,
      currentRevisionId: PREVIOUS_REVISION_ID,
      publishedAt: "2026-07-12T12:34:56.789Z",
      operation: "publish",
      operationId: "pubop_20260712T123300000Z_abcdef12",
      contentCanonicalHash: getProjectManifestContentCanonicalHash(input.manifest),
    };
    const hash = getProjectManifestContentCanonicalHash(input.manifest);
    input.sourceManifest.canonicalHash = hash;
    input.expectedCurrent.manifestCanonicalHash = hash;
    expectIssue(input, "currentRevisionConflict");
  });

  it("does not mutate manifest or asset input", () => {
    const input = buildInput();
    const before = structuredClone(input);
    expectSuccess(input);
    expect(input).toEqual(before);
  });
});

describe("operation ID", () => {
  it("creates a deterministic UTC compact operation ID", () => {
    expect(
      createProjectPublishOperationId({
        startedAt: "2026-07-13T21:33:00.000+09:00",
        randomSuffix: "1234abcd",
      }),
    ).toBe(OPERATION_ID);
  });

  it("changes when the timestamp changes", () => {
    expect(
      createProjectPublishOperationId({
        startedAt: "2026-07-13T12:33:00.001Z",
        randomSuffix: "1234abcd",
      }),
    ).not.toBe(OPERATION_ID);
  });

  it("changes when the suffix changes", () => {
    expect(
      createProjectPublishOperationId({
        startedAt: CHECKED_AT,
        randomSuffix: "1234abce",
      }),
    ).not.toBe(OPERATION_ID);
  });

  it.each([
    [OPERATION_ID, true],
    ["op_20260713T123300000Z_1234abcd", false],
    ["pubop_20260713T123300000Z_1234abc", false],
    ["pubop_20260713T123300000Z_1234abcde", false],
    ["pubop_20260713T123300000Z_1234/abcd", false],
    ["pubop_20260713T123300000Z_1234 abcd", false],
    ["pubop_20260230T123300000Z_1234abcd", false],
  ])("validates operation ID %s", (value, expected) => {
    expect(isValidProjectPublishOperationId(value)).toBe(expected);
  });

  it.each([
    ["date-only", "2026-07-13", "1234abcd"],
    ["invalid suffix", CHECKED_AT, "1234/abcd"],
    ["uppercase suffix", CHECKED_AT, "1234ABCD"],
  ])("rejects %s input", (_label, startedAt, randomSuffix) => {
    expect(() =>
      createProjectPublishOperationId({ startedAt, randomSuffix }),
    ).toThrow(TypeError);
  });
});

describe("identity, manifest, and optimistic concurrency", () => {
  it.each([
    ["invalidProjectId", "projectId", "not-a-project-id"],
    ["invalidWorkspaceId", "workspaceId", "not-a-workspace-id"],
    ["invalidCheckedAt", "checkedAt", "2026-07-13"],
    ["invalidPublishedAt", "publishedAt", "2026-02-30T12:00:00Z"],
    ["invalidRevisionId", "revisionId", "rev_invalid"],
    ["invalidOperationId", "operationId", "pubop_invalid"],
  ] as const)("returns %s", (code, key, value) => {
    const input = buildInput();
    Object.assign(input, { [key]: value });
    expectIssue(input, code);
  });

  it("blocks an invalid manifest through the existing parser", () => {
    const input = buildInput();
    input.manifest.slides[0].durationSeconds = 0;
    expectIssue(input, "invalidManifest");
  });

  it("blocks a project mismatch", () => {
    const input = buildInput();
    input.projectId = "77777777-7777-4777-8777-777777777777";
    expectIssue(input, "manifestProjectMismatch");
  });

  it("blocks a workspace mismatch", () => {
    const input = buildInput();
    input.workspaceId = "88888888-8888-4888-8888-888888888888";
    expectIssue(input, "manifestWorkspaceMismatch");
  });

  it("blocks a recomputed source manifest hash mismatch", () => {
    const input = buildInput();
    input.sourceManifest.canonicalHash =
      "fnv1a64:0000000000000000";
    input.expectedCurrent.manifestCanonicalHash =
      "fnv1a64:0000000000000000";
    expectIssue(input, "manifestHashMismatch");
  });

  it("blocks a source and expected hash mismatch", () => {
    const input = buildInput();
    input.expectedCurrent.manifestCanonicalHash =
      "fnv1a64:0000000000000000";
    expectIssue(input, "manifestHashMismatch");
  });

  it("blocks a source and expected modifiedTime mismatch", () => {
    const input = buildInput();
    input.expectedCurrent.manifestModifiedTime =
      "2026-07-13T12:30:01.000Z";
    expectIssue(input, "manifestModifiedTimeMismatch");
  });

  it("blocks a source and expected currentRevisionId mismatch", () => {
    const input = buildInput();
    input.expectedCurrent.currentRevisionId = PREVIOUS_REVISION_ID;
    expectIssue(input, "currentRevisionConflict");
  });

  it("accepts a matching non-null expected currentRevisionId", () => {
    const input = buildSubsequentInput();
    input.manifest.publication = {
      schemaVersion: 1,
      currentRevisionId: PREVIOUS_REVISION_ID,
      publishedAt: "2026-07-12T12:34:56.789Z",
      operation: "publish",
      operationId: "pubop_20260712T123300000Z_abcdef12",
      contentCanonicalHash: getProjectManifestContentCanonicalHash(input.manifest),
    };
    const hash = getProjectManifestContentCanonicalHash(input.manifest);
    input.sourceManifest.canonicalHash = hash;
    input.sourceManifest.currentRevisionId = PREVIOUS_REVISION_ID;
    input.expectedCurrent.manifestCanonicalHash = hash;
    input.expectedCurrent.currentRevisionId = PREVIOUS_REVISION_ID;
    expect(expectSuccess(input).plan.expectedCurrent.currentRevisionId).toBe(
      PREVIOUS_REVISION_ID,
    );
  });

  it.each([
    ["source modifiedTime", "sourceManifest", "modifiedTime", "invalidSourceManifestState"],
    ["source hash", "sourceManifest", "canonicalHash", "invalidSourceManifestState"],
    ["expected modifiedTime", "expectedCurrent", "manifestModifiedTime", "invalidExpectedCurrentState"],
    ["expected hash", "expectedCurrent", "manifestCanonicalHash", "invalidExpectedCurrentState"],
  ] as const)("blocks invalid %s", (_label, parent, key, code) => {
    const input = buildInput();
    (input[parent] as unknown as Record<string, unknown>)[key] = "invalid";
    expectIssue(input, code);
  });
});

describe("asset metadata", () => {
  it("blocks missing metadata", () => {
    const input = buildInput();
    input.assets.pop();
    expectIssue(input, "missingAssetMetadata");
  });

  it("blocks unexpected metadata", () => {
    const input = buildInput();
    input.assets.push({
      ...input.assets[0],
      assetId: "77777777-7777-4777-8777-777777777777",
      driveFileId: "drive-file-unexpected",
    });
    expectIssue(input, "unexpectedAssetMetadata");
  });

  it("blocks duplicate assetId", () => {
    const input = buildInput();
    input.assets[1].assetId = input.assets[0].assetId;
    expectIssue(input, "duplicateAssetId");
  });

  it("blocks duplicate Drive file references", () => {
    const input = buildInput();
    input.assets[1].driveFileId = input.assets[0].driveFileId;
    expectIssue(input, "duplicateDriveFileReference");
  });

  it("blocks trashed assets", () => {
    const input = buildInput();
    input.assets[0].trashed = true;
    expectIssue(input, "trashedAsset");
  });

  it.each([
    ["empty MIME", "mimeType", ""],
    ["negative size", "sizeBytes", -1],
    ["decimal size", "sizeBytes", 1.5],
    ["invalid modifiedTime", "modifiedTime", "2026-02-30T12:00:00Z"],
    ["empty checksum", "checksum", ""],
    ["invalid assetId", "assetId", "invalid"],
    ["empty driveFileId", "driveFileId", ""],
  ] as const)("blocks %s", (_label, key, value) => {
    const input = buildInput();
    Object.assign(input.assets[0], { [key]: value });
    expectIssue(input, "invalidAssetMetadata");
  });

  it.each([
    ["MIME value", "mimeType", "image/png", "assetMimeTypeMismatch"],
    [
      "image/video MIME family",
      "mimeType",
      "video/mp4",
      "assetMediaTypeMismatch",
    ],
    [
      "Drive file reference",
      "driveFileId",
      "different-drive-file",
      "assetFileReferenceMismatch",
    ],
    [
      "workspace",
      "workspaceId",
      "88888888-8888-4888-8888-888888888888",
      "assetWorkspaceMismatch",
    ],
    [
      "project",
      "projectId",
      "77777777-7777-4777-8777-777777777777",
      "assetProjectMismatch",
    ],
    ["role", "role", "other", "assetRoleMismatch"],
    ["known size", "sizeBytes", 1201, "assetSizeMismatch"],
  ] as const)("blocks mismatched %s", (_label, key, value, code) => {
    const input = buildInput();
    Object.assign(input.assets[0], { [key]: value });
    expectIssue(input, code);
  });

  it("blocks a video slide with image MIME metadata", () => {
    const input = buildInput();
    input.assets[1].mimeType = "image/jpeg";
    expectIssue(input, "assetMediaTypeMismatch");
  });

  it.each([
    ["large video marked local", true, false],
    ["small video marked remote", false, true],
  ])("blocks remoteOnly mismatch: %s", (_label, large, remoteOnly) => {
    const input = buildInput();
    const size = large ? DRIVE_VIDEO_OFFLINE_MAX_BYTES + 1 : 1200;
    input.manifest.slides[1].fileSize = size;
    input.assets[1].sizeBytes = size;
    input.assets[1].remoteOnly = remoteOnly;
    const hash = getProjectManifestCanonicalHash(input.manifest);
    input.sourceManifest.canonicalHash = hash;
    input.expectedCurrent.manifestCanonicalHash = hash;
    expectIssue(input, "remoteOnlyMismatch");
  });

  it.each([
    ["missingAssetSize", "sizeBytes"],
    ["missingAssetModifiedTime", "modifiedTime"],
    ["missingAssetChecksum", "checksum"],
  ] as const)("allows warning %s", (code, key) => {
    const input = buildInput();
    Object.assign(input.assets[0], { [key]: null });
    const result = expectSuccess(input);
    expect(result.warnings.some((warning) => warning.code === code)).toBe(true);
  });

  it("warns while allowing a correctly derived remoteOnly asset", () => {
    const result = expectSuccess();
    expect(result.warnings.some((warning) => warning.code === "remoteOnlyAsset")).toBe(true);
  });

  it("allows duplicate slide references to the same consistent asset", () => {
    const input = buildInput();
    input.manifest.slides.push({
      ...input.manifest.slides[0],
      slideId: "99999999-9999-4999-8999-999999999999",
      caption: "Duplicate reference",
    });
    const hash = getProjectManifestCanonicalHash(input.manifest);
    input.sourceManifest.canonicalHash = hash;
    input.expectedCurrent.manifestCanonicalHash = hash;
    expect(expectSuccess(input).summary).toMatchObject({
      slideCount: 3,
      assetCount: 2,
    });
  });
});

describe("history state", () => {
  it("treats a ready history with zero valid revisions as initial publish", () => {
    const input = buildInput();
    input.historyStatus = { status: "ready", validRevisionCount: 0 };
    const result = expectSuccess(input);
    expect(result.plan.initialPublish).toBe(true);
    expect(result.plan.folders.ensureHistoryFolder).toBe(false);
  });

  it("blocks an invalid history status", () => {
    const input = buildInput();
    input.historyStatus = { status: "broken" } as never;
    expectIssue(input, "historyStateInvalid");
  });

  it("blocks a ready non-empty history without latest metadata", () => {
    const input = buildInput();
    input.historyStatus = { status: "ready", validRevisionCount: 1 };
    expectIssue(input, "latestRevisionInvalid");
  });

  it("blocks latest metadata for a zero-revision history", () => {
    const input = buildSubsequentInput();
    input.historyStatus = { status: "ready", validRevisionCount: 0 };
    expectIssue(input, "historyStateInvalid");
  });

  it.each([
    ["invalid revision ID", "revisionId", "rev_invalid"],
    ["invalid publishedAt", "publishedAt", "2026-07-12"],
    ["invalid metadata status", "metadataStatus", "invalid"],
  ] as const)("blocks latest %s", (_label, key, value) => {
    const input = buildSubsequentInput();
    Object.assign(input.latestPublishedRevision as object, { [key]: value });
    expectIssue(input, "latestRevisionInvalid");
  });

  it("blocks previousRevisionId self-reference", () => {
    const input = buildSubsequentInput();
    if (input.latestPublishedRevision) {
      input.latestPublishedRevision.revisionId = REVISION_ID;
    }
    expectIssue(input, "previousRevisionSelfReference");
  });

  it("blocks publishedAt before the previous revision", () => {
    const input = buildSubsequentInput();
    if (input.latestPublishedRevision) {
      input.latestPublishedRevision.publishedAt =
        "2026-07-14T12:34:56.789Z";
    }
    expectIssue(input, "publishedAtBeforePreviousRevision");
  });

  it("allows equal publishedAt with a warning", () => {
    const input = buildSubsequentInput();
    if (input.latestPublishedRevision) {
      input.latestPublishedRevision.publishedAt = PUBLISHED_AT;
    }
    const result = expectSuccess(input);
    expect(
      result.warnings.some(
        (warning) => warning.code === "publishedAtMatchesPreviousRevision",
      ),
    ).toBe(true);
  });
});

describe("revision and security guarantees", () => {
  it("builds a revision accepted by the existing parser", () => {
    const revision = expectSuccess().plan.revisionFile.body;
    expect(parseProjectPublishRevision(revision).ok).toBe(true);
    expect(revision).not.toHaveProperty("restoredFromRevisionId");
    expect(revision.operation).toBe("publish");
  });

  it("builds identical canonical revision content for identical inputs", () => {
    expect(expectSuccess().plan.revisionFile.canonicalHash).toBe(
      expectSuccess().plan.revisionFile.canonicalHash,
    );
  });

  it("exposes standalone pure draft, appProperties, and plan helpers", () => {
    const success = expectSuccess();
    const body = buildProjectPublishRevisionDraft({
      projectId: PROJECT_ID,
      publishedAt: PUBLISHED_AT,
      revisionId: REVISION_ID,
      manifest: buildManifest(),
      sourceManifestModifiedTime: "2026-07-13T12:30:00.000Z",
      sourceManifestCanonicalHash: getProjectManifestCanonicalHash(
        buildManifest(),
      ),
      previousRevisionId: null,
      assets: success.plan.revisionFile.body.assets,
    });
    expect(buildProjectPublishRevisionAppProperties({ workspaceId: WORKSPACE_ID, revision: body })).toEqual(
      success.plan.revisionFile.appProperties,
    );
    expect(
      buildProjectPublishWritePlan({
        operationId: OPERATION_ID,
        workspaceId: WORKSPACE_ID,
        checkedAt: CHECKED_AT,
        historyStatus: { status: "notConfigured" },
        expectedCurrent: buildInput().expectedCurrent,
        revision: body,
      }).revisionFile.canonicalBody,
    ).toBe(success.plan.revisionFile.canonicalBody);
  });

  it("does not include raw identifiers in the safe summary", () => {
    const summaryText = JSON.stringify(expectSuccess().summary);
    expect(summaryText).not.toContain(IMAGE_DRIVE_FILE_ID);
    expect(summaryText).not.toContain(VIDEO_DRIVE_FILE_ID);
    expect(summaryText).not.toContain(PROJECT_ID);
  });

  it("does not echo raw invalid values or URLs in issue messages", () => {
    const input = buildInput();
    const rawValue = "https://www.googleapis.com/drive/v3/files/sensitive";
    input.assets[0].driveFileId = rawValue;
    const issueText = JSON.stringify(
      expectIssue(input, "assetFileReferenceMismatch"),
    );
    expect(issueText).not.toContain(rawValue);
    expect(issueText).not.toContain("https://");
  });

  it("does not echo token-like input in issue messages", () => {
    const input = buildInput();
    const tokenLikeValue = "Bearer sensitive-token-value";
    input.assets[0].checksum = tokenLikeValue;
    input.assets[0].mimeType = "";
    const issueText = JSON.stringify(expectIssue(input, "invalidAssetMetadata"));
    expect(issueText).not.toContain(tokenLikeValue);
    expect(issueText).not.toContain("Bearer");
  });

  it("does not write to console", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expectSuccess();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
  });
});
