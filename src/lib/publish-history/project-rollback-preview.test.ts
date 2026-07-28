import { describe, expect, it } from "vitest";
import type {
  DriveFileCandidate,
  DriveSlideSummary,
  ProjectManifest,
} from "../google-drive";
import {
  deriveProjectPublishRevisionSummary,
  getProjectManifestContentCanonicalHash,
  type ProjectPublishRevision,
} from "./project-publish-revision";
import {
  buildProjectRollbackPreview,
  isCurrentProjectRollbackPreviewRequest,
  type ProjectRollbackFreshAsset,
} from "./project-rollback-preview";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const ASSETS_FOLDER_ID = "drive-assets-folder-secret";
const IMAGE_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const VIDEO_ASSET_ID = "44444444-4444-4444-8444-444444444444";
const IMAGE_FILE_ID = "drive-image-file-secret";
const VIDEO_FILE_ID = "drive-video-file-secret";
const CURRENT_REVISION_ID = "rev_20260728T010000000Z_1111aaaa";
const TARGET_REVISION_ID = "rev_20260727T010000000Z_2222bbbb";

function slide(
  overrides: Partial<DriveSlideSummary> = {},
): DriveSlideSummary {
  return {
    slideId: "55555555-5555-4555-8555-555555555555",
    assetId: IMAGE_ASSET_ID,
    assetFileId: IMAGE_FILE_ID,
    assetName: "image.jpg",
    type: "image",
    mimeType: "image/jpeg",
    source: "localFile",
    sourceMimeType: "image/jpeg",
    sourceMediaItemId: "source-image",
    fileSize: 1200,
    durationSeconds: 10,
    caption: "target caption",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function manifest(
  title: string,
  slides: DriveSlideSummary[],
): ProjectManifest {
  return {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title,
    slides,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
}

function revision(input: {
  revisionId: string;
  manifest: ProjectManifest;
  operation?: "publish" | "rollback";
  restoredFromRevisionId?: string;
  assets?: ProjectPublishRevision["assets"];
}): ProjectPublishRevision {
  const assets =
    input.assets ??
    [
      {
        assetId: IMAGE_ASSET_ID,
        driveFileId: IMAGE_FILE_ID,
        mimeType: "image/jpeg",
        sizeBytes: 1200,
        modifiedTime: "2026-07-20T00:00:00.000Z",
        checksum: "checksum-image-secret",
        remoteOnly: false,
      },
    ];
  return {
    schemaVersion: 1,
    revisionId: input.revisionId,
    projectId: PROJECT_ID,
    publishedAt:
      input.revisionId === CURRENT_REVISION_ID
        ? "2026-07-28T01:00:00.000Z"
        : "2026-07-27T01:00:00.000Z",
    operation: input.operation ?? "publish",
    ...(input.restoredFromRevisionId
      ? { restoredFromRevisionId: input.restoredFromRevisionId }
      : {}),
    sourceManifestModifiedTime: "2026-07-20T00:00:00.000Z",
    sourceManifestCanonicalHash: getProjectManifestContentCanonicalHash(
      input.manifest,
    ),
    previousRevisionId: null,
    summary: deriveProjectPublishRevisionSummary(input.manifest, assets),
    assets,
    manifest: input.manifest,
  };
}

function metadata(
  overrides: Partial<DriveFileCandidate> = {},
): DriveFileCandidate {
  return {
    id: IMAGE_FILE_ID,
    name: "image.jpg",
    mimeType: "image/jpeg",
    modifiedTime: "2026-07-20T00:00:00.000Z",
    sizeBytes: 1200,
    checksum: "checksum-image-secret",
    parents: [ASSETS_FOLDER_ID],
    trashed: false,
    appProperties: {
      app: "ipad-slideshow-pwa",
      role: "asset",
      schemaVersion: "1",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      assetId: IMAGE_ASSET_ID,
    },
    ...overrides,
  };
}

function previewFixture(input: {
  currentManifest?: ProjectManifest;
  currentRevisionManifest?: ProjectManifest;
  targetManifest?: ProjectManifest;
  targetRevisionId?: string;
  targetAssets?: ProjectPublishRevision["assets"];
  freshAssets?: ProjectRollbackFreshAsset[];
  targetOperation?: "publish" | "rollback";
  restoredFromRevisionId?: string;
} = {}) {
  const currentManifest =
    input.currentManifest ??
    manifest("Current title", [slide({ caption: "current caption" })]);
  const targetManifest =
    input.targetManifest ?? manifest("Current title", [slide()]);
  const currentRevision = revision({
    revisionId: CURRENT_REVISION_ID,
    manifest: input.currentRevisionManifest ?? currentManifest,
  });
  currentManifest.publication = {
    schemaVersion: 1,
    currentRevisionId: currentRevision.revisionId,
    publishedAt: currentRevision.publishedAt,
    operation: currentRevision.operation,
    operationId: "pubop_20260728T010000000Z_1234abcd",
    contentCanonicalHash: currentRevision.sourceManifestCanonicalHash,
  };
  const targetRevision = revision({
    revisionId: input.targetRevisionId ?? TARGET_REVISION_ID,
    manifest: targetManifest,
    operation: input.targetOperation,
    restoredFromRevisionId: input.restoredFromRevisionId,
    assets: input.targetAssets,
  });
  return buildProjectRollbackPreview({
    checkedAt: "2026-07-28T02:00:00.000Z",
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    assetsFolderId: ASSETS_FOLDER_ID,
    currentManifest,
    currentRevision,
    targetRevision,
    freshAssets: input.freshAssets ?? [
      { assetId: IMAGE_ASSET_ID, metadata: metadata() },
    ],
  });
}

describe("buildProjectRollbackPreview", () => {
  it("classifies unchanged assets as ready and calculates caption impact", () => {
    const result = previewFixture();
    expect(result.readiness).toBe("ready");
    expect(result.assets[0]).toMatchObject({
      impactStatus: "unchanged",
      offlineDisposition: "offlineEligible",
    });
    expect(result.manifestImpact.changedSlideCount).toBe(1);
  });

  it("returns noChange when playback content and title are the same", () => {
    const same = manifest("Current title", [slide()]);
    const result = previewFixture({
      currentManifest: structuredClone(same),
      targetManifest: structuredClone(same),
    });
    expect(result.readiness).toBe("noChange");
    expect(result.message).toContain("再生内容の変更はありません");
  });

  it("returns noChange for the current revision target without unpublished edits", () => {
    const same = manifest("Current title", [slide()]);
    const result = previewFixture({
      currentManifest: structuredClone(same),
      targetManifest: structuredClone(same),
      targetRevisionId: CURRENT_REVISION_ID,
    });
    expect(result.targetRevisionId).toBe(CURRENT_REVISION_ID);
    expect(result.readiness).toBe("noChange");
  });

  it("allows the current revision target when saved unpublished edits exist", () => {
    const published = manifest("Current title", [slide()]);
    const current = structuredClone(published);
    current.slides[0].caption = "saved unpublished edit";
    const result = previewFixture({
      currentManifest: current,
      currentRevisionManifest: published,
      targetManifest: published,
    });
    expect(result.readiness).toBe("ready");
    expect(result.replacesUnpublishedChanges).toBe(true);
    expect(result.warnings.join(" ")).toContain(
      "公開後に保存された未公開編集",
    );
    expect(result.warnings.join(" ")).not.toContain("未保存の編集");
  });

  it("treats exactly 50 MiB video as offlineEligible and larger video as remoteOnly", () => {
    const videoSlide = slide({
      assetId: VIDEO_ASSET_ID,
      assetFileId: VIDEO_FILE_ID,
      assetName: "video.mp4",
      type: "video",
      mimeType: "video/mp4",
      durationMs: 30_000,
    });
    const videoManifest = manifest("Current title", [videoSlide]);
    const savedVideo = {
      assetId: VIDEO_ASSET_ID,
      driveFileId: VIDEO_FILE_ID,
      mimeType: "video/mp4",
      sizeBytes: 50 * 1024 * 1024,
      modifiedTime: "2026-07-20T00:00:00.000Z",
      checksum: "video-checksum",
      remoteOnly: false,
    };
    const baseMetadata = metadata({
      id: VIDEO_FILE_ID,
      name: "video.mp4",
      mimeType: "video/mp4",
      sizeBytes: 50 * 1024 * 1024,
      checksum: "video-checksum",
      appProperties: {
        ...metadata().appProperties,
        assetId: VIDEO_ASSET_ID,
      },
    });
    const exact = previewFixture({
      targetManifest: videoManifest,
      targetAssets: [savedVideo],
      freshAssets: [{ assetId: VIDEO_ASSET_ID, metadata: baseMetadata }],
    });
    expect(exact.assets[0].offlineDisposition).toBe("offlineEligible");

    const large = previewFixture({
      targetManifest: videoManifest,
      targetAssets: [{ ...savedVideo, sizeBytes: 50 * 1024 * 1024 + 1, remoteOnly: true }],
      freshAssets: [
        {
          assetId: VIDEO_ASSET_ID,
          metadata: { ...baseMetadata, sizeBytes: 50 * 1024 * 1024 + 1 },
        },
      ],
    });
    expect(large.readiness).toBe("ready");
    expect(large.assets[0].offlineDisposition).toBe("remoteOnly");
    expect(large.warnings.join(" ")).toContain("offlineでは利用できません");
  });

  it("treats a video with missing fresh size as unverifiable, not content loss", () => {
    const videoSlide = slide({
      assetId: VIDEO_ASSET_ID,
      assetFileId: VIDEO_FILE_ID,
      assetName: "video.mp4",
      type: "video",
      mimeType: "video/mp4",
    });
    const savedVideo = {
      assetId: VIDEO_ASSET_ID,
      driveFileId: VIDEO_FILE_ID,
      mimeType: "video/mp4",
      sizeBytes: 1024,
      modifiedTime: "2026-07-20T00:00:00.000Z",
      checksum: "video-checksum",
      remoteOnly: false,
    };
    const freshVideo = metadata({
      id: VIDEO_FILE_ID,
      name: "video.mp4",
      mimeType: "video/mp4",
      sizeBytes: undefined,
      checksum: "video-checksum",
      appProperties: {
        ...metadata().appProperties,
        assetId: VIDEO_ASSET_ID,
      },
    });
    const result = previewFixture({
      targetManifest: manifest("Current title", [videoSlide]),
      targetAssets: [savedVideo],
      freshAssets: [{ assetId: VIDEO_ASSET_ID, metadata: freshVideo }],
    });
    expect(result.readiness).toBe("degraded");
    expect(result.assets[0]).toMatchObject({
      impactStatus: "unverifiable",
      offlineDisposition: "unavailable",
    });
  });

  it.each([
    ["checksum", { checksum: "changed-checksum" }],
    ["size", { sizeBytes: 9999 }],
  ])("blocks when fresh %s proves content changed", (_label, override) => {
    const result = previewFixture({
      freshAssets: [
        { assetId: IMAGE_ASSET_ID, metadata: metadata(override) },
      ],
    });
    expect(result.readiness).toBe("blocked");
    expect(result.assets[0].impactStatus).toBe("contentChanged");
  });

  it("warns when checksum matches but modifiedTime changed", () => {
    const result = previewFixture({
      freshAssets: [
        {
          assetId: IMAGE_ASSET_ID,
          metadata: metadata({ modifiedTime: "2026-07-21T00:00:00.000Z" }),
        },
      ],
    });
    expect(result.readiness).toBe("degraded");
    expect(result.assets[0].impactStatus).toBe("metadataChanged");
  });

  it.each([
    ["saved checksum", { targetAssets: [{ ...revision({ revisionId: TARGET_REVISION_ID, manifest: manifest("Current title", [slide()]) }).assets[0], checksum: null }] }],
    ["fresh checksum", { freshAssets: [{ assetId: IMAGE_ASSET_ID, metadata: metadata({ checksum: undefined }) }] }],
    ["fresh size", { freshAssets: [{ assetId: IMAGE_ASSET_ID, metadata: metadata({ sizeBytes: undefined }) }] }],
    ["fresh modifiedTime", { freshAssets: [{ assetId: IMAGE_ASSET_ID, metadata: metadata({ modifiedTime: undefined }) }] }],
  ])("does not promote missing %s to unchanged", (_label, override) => {
    const result = previewFixture(override);
    expect(result.readiness).toBe("degraded");
    expect(result.assets[0].impactStatus).toBe("unverifiable");
  });

  it.each([
    ["missing", null],
    ["trashed", metadata({ trashed: true })],
    ["wrong parent", metadata({ parents: ["wrong-parent"] })],
    [
      "wrong role",
      metadata({
        appProperties: { ...metadata().appProperties, role: "other" },
      }),
    ],
    [
      "wrong workspace",
      metadata({
        appProperties: {
          ...metadata().appProperties,
          workspaceId: "other-workspace",
        },
      }),
    ],
    [
      "wrong project",
      metadata({
        appProperties: {
          ...metadata().appProperties,
          projectId: "other-project",
        },
      }),
    ],
    [
      "wrong assetId",
      metadata({
        appProperties: {
          ...metadata().appProperties,
          assetId: "other-asset",
        },
      }),
    ],
    ["wrong Drive reference", metadata({ id: "other-drive-file" })],
    ["wrong MIME", metadata({ mimeType: "image/png" })],
  ])("blocks unavailable asset: %s", (_label, fresh) => {
    const result = previewFixture({
      freshAssets: [{ assetId: IMAGE_ASSET_ID, metadata: fresh }],
    });
    expect(result.readiness).toBe("blocked");
    expect(result.assets[0].impactStatus).toBe("unavailable");
  });

  it("calculates title, added, removed, changed and order impact without timestamp noise", () => {
    const first = slide({ slideId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const second = slide({
      slideId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      caption: "second",
    });
    const current = manifest("Before", [first, second]);
    const timestampOnly = { ...first, updatedAt: "2026-07-28T03:00:00.000Z" };
    const changedSecond = { ...second, caption: "changed" };
    const added = slide({
      slideId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    const target = manifest("After", [changedSecond, timestampOnly, added]);
    const result = previewFixture({
      currentManifest: current,
      targetManifest: target,
    });
    expect(result.manifestImpact).toMatchObject({
      titleChanged: true,
      addedSlideCount: 1,
      removedSlideCount: 0,
      changedSlideCount: 1,
      slideOrderChanged: true,
    });
  });

  it("counts slide removal separately", () => {
    const kept = slide({
      slideId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    const removed = slide({
      slideId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    const result = previewFixture({
      currentManifest: manifest("Current title", [kept, removed]),
      targetManifest: manifest("Current title", [kept]),
    });
    expect(result.manifestImpact).toMatchObject({
      addedSlideCount: 0,
      removedSlideCount: 1,
    });
  });

  it.each([
    ["caption", { caption: "changed caption" }],
    ["duration", { durationSeconds: 99 }],
    ["video runtime", { durationMs: 45_000 }],
    ["asset reference", { assetFileId: "other-file" }],
  ])("counts %s as playback content change", (_label, override) => {
    const base = slide();
    const result = previewFixture({
      currentManifest: manifest("Current title", [base]),
      targetManifest: manifest("Current title", [{ ...base, ...override }]),
    });
    expect(result.manifestImpact.changedSlideCount).toBe(1);
  });

  it("shows restoredFromRevisionId for a rollback revision", () => {
    const result = previewFixture({
      targetOperation: "rollback",
      restoredFromRevisionId: "rev_20260720T010000000Z_abcd1234",
    });
    expect(result.targetOperation).toBe("rollback");
    expect(result.restoredFromRevisionId).toBe(
      "rev_20260720T010000000Z_abcd1234",
    );
  });

  it("keeps the public preview free of Drive IDs, hashes and checksum values", () => {
    const serialized = JSON.stringify(previewFixture());
    expect(serialized).not.toContain(IMAGE_FILE_ID);
    expect(serialized).not.toContain(ASSETS_FOLDER_ID);
    expect(serialized).not.toContain("checksum-image-secret");
    expect(serialized).not.toContain("fnv1a64:");
    expect(serialized).not.toContain("operationId");
    expect(serialized).not.toContain("raw");
  });
});

describe("rollback preview request owner guard", () => {
  const owner = {
    projectId: PROJECT_ID,
    targetRevisionId: TARGET_REVISION_ID,
  };
  const current = {
    owner,
    activeOwner: owner,
    sequence: 2,
    activeSequence: 2,
    currentProjectId: PROJECT_ID,
    currentTargetRevisionId: TARGET_REVISION_ID,
    aborted: false,
  };

  it("accepts only the active owner and sequence", () => {
    expect(isCurrentProjectRollbackPreviewRequest(current)).toBe(true);
  });

  it.each([
    ["project changed", { currentProjectId: "other-project" }],
    ["target changed", { currentTargetRevisionId: CURRENT_REVISION_ID }],
    ["newer request started", { activeSequence: 3 }],
    ["owner cleared", { activeOwner: null }],
    ["aborted", { aborted: true }],
  ])("discards an old result when %s", (_label, override) => {
    expect(
      isCurrentProjectRollbackPreviewRequest({ ...current, ...override }),
    ).toBe(false);
  });
});
