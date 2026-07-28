import { describe, expect, it } from "vitest";
import type { ProjectPublishRevision } from "./project-publish-revision";
import {
  buildRevisionDetailViewModel,
  formatAssetSize,
  formatMetadataStatus,
  formatPublicationStatus,
  formatPublishedAt,
  formatPublishOperation,
  formatRevisionPublicationMarker,
  getRevisionPublicationMarker,
  mapPublishHistoryErrorCode,
} from "./project-publish-history-view";
import type { ProjectPublicationOverview } from "./project-publish-history-overview";

function buildRevision(): ProjectPublishRevision {
  return {
    schemaVersion: 1,
    revisionId: "rev_20260712T123456789Z_ab12cd34",
    projectId: "22222222-2222-4222-8222-222222222222",
    publishedAt: "2026-07-12T12:34:56.789Z",
    operation: "rollback",
    restoredFromRevisionId: "rev_20260711T123456789Z_cd34ef56",
    sourceManifestModifiedTime: "2026-07-12T12:30:00Z",
    sourceManifestCanonicalHash: "fnv1a64:0123456789abcdef",
    previousRevisionId: "rev_20260712T100000000Z_1234abcd",
    summary: { slideCount: 2, assetCount: 2, remoteOnlyAssetCount: 1 },
    assets: [
      {
        assetId: "asset-image-a",
        driveFileId: "drive-file-sensitive-image",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        modifiedTime: "2026-07-12T12:00:00Z",
        checksum: "checksum-sensitive-full-value",
        remoteOnly: false,
      },
      {
        assetId: "asset-video-a",
        driveFileId: "drive-file-sensitive-video",
        mimeType: "video/mp4",
        sizeBytes: 52_428_800,
        modifiedTime: null,
        checksum: null,
        remoteOnly: true,
      },
    ],
    manifest: {
      app: "ipad-slideshow-pwa",
      role: "projectManifest",
      schemaVersion: 1,
      workspaceId: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      title: "Fixture project",
      slides: [
        {
          slideId: "slide-image-a",
          assetId: "asset-image-a",
          assetFileId: "drive-file-sensitive-image",
          assetName: "image-a.jpg",
          type: "image",
          mimeType: "image/jpeg",
          source: "localFile",
          sourceMimeType: "image/jpeg",
          sourceMediaItemId: "source-image-a",
          durationSeconds: 10,
          caption: "A".repeat(160),
          createdAt: "2026-07-12T12:00:00Z",
          updatedAt: "2026-07-12T12:30:00Z",
        },
        {
          slideId: "slide-video-a",
          assetId: "asset-video-a",
          assetFileId: "drive-file-sensitive-video",
          assetName: "video-a.mp4",
          type: "video",
          mimeType: "video/mp4",
          source: "localFile",
          sourceMimeType: "video/mp4",
          sourceMediaItemId: "source-video-a",
          durationMs: 30_000,
          durationSeconds: 12,
          caption: "Video caption",
          createdAt: "2026-07-12T12:00:00Z",
          updatedAt: "2026-07-12T12:30:00Z",
        },
      ],
      createdAt: "2026-07-12T12:00:00Z",
      updatedAt: "2026-07-12T12:30:00Z",
    },
  };
}

describe("history formatters", () => {
  it.each([
    ["publish", "公開"],
    ["rollback", "ロールバック"],
    [null, "不明"],
    [undefined, "不明"],
  ] as const)("formats operation %s", (value, expected) => {
    expect(formatPublishOperation(value)).toBe(expected);
  });

  it.each([
    ["ready", "有効"],
    ["invalid", "要確認"],
  ] as const)("formats metadata status %s", (value, expected) => {
    expect(formatMetadataStatus(value)).toBe(expected);
  });

  it("formats UTC and offset timestamps in Asia/Tokyo", () => {
    expect(formatPublishedAt("2026-07-12T12:34:56Z")).toContain("21:34:56");
    expect(formatPublishedAt("2026-07-12T21:34:56+09:00")).toContain("21:34:56");
  });

  it.each([null, undefined, "invalid"])("guards invalid datetime %s", (value) => {
    expect(formatPublishedAt(value)).toBe("不明");
  });

  it.each([
    [null, "不明"],
    [-1, "不明"],
    [0, "0 B"],
    [1024, "1.0 KB"],
    [1024 * 1024, "1.0 MB"],
    [1.2 * 1024 * 1024, "1.2 MB"],
    [1024 * 1024 * 1024, "1.0 GB"],
  ])("formats size %s", (value, expected) => {
    expect(formatAssetSize(value)).toBe(expected);
  });

  it.each([
    ["unpublished", "未公開"],
    ["current", "現在公開中"],
    ["currentWithUnpublishedChanges", "現在公開中・未公開編集あり"],
    ["missingCurrentRevision", "現在の公開情報を確認できない"],
    ["inconsistent", "現在の公開情報を確認できない"],
    ["noPublicationWithHistory", "publicationなし・履歴revisionあり"],
    ["unavailable", "現在の公開情報を確認できない"],
  ] as const)("formats publication status %s", (status, expected) => {
    expect(formatPublicationStatus(status)).toBe(expected);
  });
});

describe("current revision markers", () => {
  const publication: ProjectPublicationOverview = {
    status: "current",
    currentRevisionId: "revision-current",
    publishedAt: "2026-07-12T12:34:56Z",
    operation: "publish",
    hasUnpublishedChanges: false,
    currentRevisionInList: true,
    currentRevisionMarker: "verified",
    message: "current",
    diagnostics: [],
  };

  it("marks only the verified manifest reference as current", () => {
    expect(getRevisionPublicationMarker(publication, "revision-current")).toBe(
      "current",
    );
    expect(getRevisionPublicationMarker(publication, "revision-other")).toBe(
      "history",
    );
  });

  it("marks an unresolved manifest reference for inspection", () => {
    expect(
      getRevisionPublicationMarker(
        { ...publication, currentRevisionMarker: "needsInspection" },
        "revision-current",
      ),
    ).toBe("needsInspection");
  });

  it("does not infer current without publication", () => {
    expect(getRevisionPublicationMarker(null, "revision-current")).toBe(
      "history",
    );
  });

  it.each([
    ["current", "現在公開中"],
    ["needsInspection", "manifest参照先・要確認"],
    ["history", "履歴revision"],
  ] as const)("formats %s marker neutrally", (marker, expected) => {
    expect(formatRevisionPublicationMarker(marker)).toBe(expected);
  });
});

describe("sanitized error mapping", () => {
  it.each([
    ["duplicateHistoryFolder", "重複"],
    ["duplicateRevisionsFolder", "重複"],
    ["invalidHistoryFolder", "正しくありません"],
    ["invalidMetadata", "正しくありません"],
    ["invalidRevision", "正しくありません"],
    ["driveReadFailed", "Google Drive"],
    ["unknown-code", "Google Drive"],
  ])("maps %s without raw input", (code, fragment) => {
    const result = mapPublishHistoryErrorCode(code);
    expect(result).toContain(fragment);
    expect(result).not.toContain(code);
    expect(result).not.toContain("raw-sensitive-error");
  });
});

describe("revision detail view model", () => {
  it("maps rollback summary, source, and public revision IDs", () => {
    const model = buildRevisionDetailViewModel(buildRevision());
    expect(model).toMatchObject({
      operation: "ロールバック",
      restoredFromRevisionId: "rev_20260711T123456789Z_cd34ef56",
      summary: { slideCount: 2, assetCount: 2, remoteOnlyAssetCount: 1 },
    });
  });

  it("maps image and video slides with caption, duration, and remoteOnly", () => {
    const model = buildRevisionDetailViewModel(buildRevision());
    expect(model.slides[0]).toMatchObject({
      order: 1,
      type: "image",
      durationSeconds: 10,
      remoteOnly: false,
    });
    expect(model.slides[0].caption).toHaveLength(160);
    expect(model.slides[1]).toMatchObject({
      order: 2,
      type: "video",
      caption: "Video caption",
      durationSeconds: 12,
      remoteOnly: true,
    });
  });

  it("maps asset summaries without checksum contents", () => {
    const model = buildRevisionDetailViewModel(buildRevision());
    expect(model.assets).toEqual([
      {
        assetId: "asset-image-a",
        mimeType: "image/jpeg",
        size: "1.0 KB",
        modifiedTime: expect.any(String),
        checksumAvailable: true,
        remoteOnly: false,
      },
      {
        assetId: "asset-video-a",
        mimeType: "video/mp4",
        size: "50.0 MB",
        modifiedTime: "不明",
        checksumAvailable: false,
        remoteOnly: true,
      },
    ]);
  });

  it("does not expose Drive IDs, project IDs, checksum values, token, or raw JSON", () => {
    const serialized = JSON.stringify(buildRevisionDetailViewModel(buildRevision()));
    for (const forbidden of [
      "drive-file-sensitive",
      "22222222-2222-4222-8222-222222222222",
      "checksum-sensitive-full-value",
      "access_token",
      '"manifest"',
      "fnv1a64:0123456789abcdef",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("does not expose the canonical hash in the detail view model", () => {
    const model = buildRevisionDetailViewModel(buildRevision());
    expect(model).not.toHaveProperty("sourceManifestCanonicalHash");
    expect(JSON.stringify(model)).not.toContain("fnv1a64:");
  });

  it("supports empty slide and asset arrays", () => {
    const revision = buildRevision();
    revision.manifest.slides = [];
    revision.assets = [];
    revision.summary = { slideCount: 0, assetCount: 0, remoteOnlyAssetCount: 0 };
    const model = buildRevisionDetailViewModel(revision);
    expect(model.slides).toEqual([]);
    expect(model.assets).toEqual([]);
  });

  it("maps publish without rollback source", () => {
    const revision = buildRevision();
    revision.operation = "publish";
    delete revision.restoredFromRevisionId;
    const model = buildRevisionDetailViewModel(revision);
    expect(model.operation).toBe("公開");
    expect(model.restoredFromRevisionId).toBeNull();
  });
});
