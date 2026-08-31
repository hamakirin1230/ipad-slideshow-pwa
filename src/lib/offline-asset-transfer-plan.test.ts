import { describe, expect, it } from "vitest";
import type { OfflineAsset, OfflineAssetBlobRecord } from "./offline-schema";
import {
  planOfflineAssetTransfers,
  type OfflineDesiredAssetTransfer,
} from "./offline-asset-transfer-plan";

const PROJECT_ID = "project-a";
const SYNCED_AT = "2026-08-31T00:00:00.000Z";

function desired(
  override: Partial<OfflineDesiredAssetTransfer> = {},
): OfflineDesiredAssetTransfer {
  return {
    projectId: PROJECT_ID,
    assetId: "asset-a",
    sourceDriveFileId: "drive-a",
    sourceMimeType: "image/jpeg",
    sourceSizeBytes: 4,
    sourceUpdatedAt: "2026-08-30T00:00:00.000Z",
    checksum: "checksum-a",
    blobVariant: "original",
    requiresBlob: true,
    ...override,
  };
}

function confirmedAsset(
  override: Partial<OfflineAsset> = {},
): OfflineAsset {
  return {
    schemaVersion: 1,
    assetId: "asset-a",
    projectId: PROJECT_ID,
    sourceDriveFileId: "drive-a",
    sourceMimeType: "image/jpeg",
    sourceSizeBytes: 4,
    sourceUpdatedAt: "2026-08-30T00:00:00.000Z",
    checksum: "checksum-a",
    blobMimeType: "image/jpeg",
    blobSizeBytes: 4,
    blobVariant: "original",
    blobStatus: "ready",
    syncedAt: SYNCED_AT,
    ...override,
  };
}

function confirmedBlob(
  override: Partial<OfflineAssetBlobRecord> = {},
): OfflineAssetBlobRecord {
  return {
    schemaVersion: 1,
    assetId: "asset-a",
    projectId: PROJECT_ID,
    blob: new Blob([new Uint8Array(4)], { type: "image/jpeg" }),
    blobMimeType: "image/jpeg",
    blobSizeBytes: 4,
    blobVariant: "original",
    syncedAt: SYNCED_AT,
    ...override,
  };
}

function plan(input: {
  desiredAssets?: OfflineDesiredAssetTransfer[];
  confirmedAssets?: OfflineAsset[];
  confirmedBlobs?: OfflineAssetBlobRecord[];
  confirmedReady?: boolean;
} = {}) {
  return planOfflineAssetTransfers({
    projectId: PROJECT_ID,
    desiredAssets: input.desiredAssets ?? [desired()],
    confirmedAssets: input.confirmedAssets ?? [confirmedAsset()],
    confirmedBlobs: input.confirmedBlobs ?? [confirmedBlob()],
    confirmedReady: input.confirmedReady ?? true,
  });
}

describe("offline asset transfer planner", () => {
  it("downloads every local asset for a fresh project", () => {
    const result = plan({ confirmedAssets: [], confirmedBlobs: [] });
    expect(result).toMatchObject({ ok: true, reuse: [], remoteOnly: [] });
    if (result.ok) expect(result.download.map((item) => item.assetId)).toEqual(["asset-a"]);
  });

  it.each([
    ["image", {}],
    [
      "video",
      {
        sourceMimeType: "video/mp4",
        sourceSizeBytes: 4,
      },
    ],
  ])("reuses an exact unchanged %s Blob", (_label, override) => {
    const next = desired(override);
    const asset = confirmedAsset({
      sourceMimeType: next.sourceMimeType,
      blobMimeType: next.sourceMimeType,
    });
    const blob = confirmedBlob({
      blob: new Blob([new Uint8Array(4)], { type: next.sourceMimeType }),
      blobMimeType: next.sourceMimeType,
    });
    const result = plan({ desiredAssets: [next], confirmedAssets: [asset], confirmedBlobs: [blob] });
    expect(result.ok && result.reuse).toHaveLength(1);
    expect(result.ok && result.download).toEqual([]);
  });

  it("uses revision plus source metadata when Drive has no checksum", () => {
    const next = desired({ checksum: undefined, sourceRevisionId: "revision-a" });
    const result = plan({
      desiredAssets: [next],
      confirmedAssets: [confirmedAsset({ checksum: undefined, sourceRevisionId: "revision-a" })],
    });
    expect(result.ok && result.reuse).toHaveLength(1);
  });

  it("uses file identity, MIME, size, and sourceUpdatedAt when stronger identity is absent", () => {
    const next = desired({ checksum: undefined, sourceRevisionId: undefined });
    const result = plan({
      desiredAssets: [next],
      confirmedAssets: [confirmedAsset({ checksum: undefined, sourceRevisionId: undefined })],
    });
    expect(result.ok && result.reuse).toHaveLength(1);
  });

  it.each([
    ["checksum", confirmedAsset(), desired({ checksum: undefined })],
    [
      "revision",
      confirmedAsset({ checksum: undefined, sourceRevisionId: "revision-a" }),
      desired({ checksum: undefined, sourceRevisionId: undefined }),
    ],
  ])(
    "downloads when confirmed %s authority is missing from current Drive metadata",
    (_label, asset, next) => {
      const result = plan({
        desiredAssets: [next],
        confirmedAssets: [asset],
      });
      expect(result.ok && result.download).toHaveLength(1);
    },
  );

  it.each([
    ["checksum mismatch", desired({ checksum: "changed" }), confirmedAsset()],
    ["revision mismatch", desired({ checksum: undefined, sourceRevisionId: "revision-b" }), confirmedAsset({ checksum: undefined, sourceRevisionId: "revision-a" })],
    ["asset replacement", desired({ sourceDriveFileId: "drive-b" }), confirmedAsset()],
    ["size mismatch", desired({ sourceSizeBytes: 5 }), confirmedAsset()],
    ["MIME mismatch", desired({ sourceMimeType: "image/png" }), confirmedAsset()],
    ["unverifiable source ETag", desired(), confirmedAsset({ sourceETag: "etag-a" })],
  ])("downloads on %s", (_label, next, asset) => {
    const result = plan({ desiredAssets: [next], confirmedAssets: [asset] });
    expect(result.ok && result.download).toHaveLength(1);
    expect(result.ok && result.reuse).toEqual([]);
  });

  it.each([
    ["blob missing", []],
    ["blob metadata size mismatch", [confirmedBlob({ blobSizeBytes: 5 })]],
    ["blob MIME mismatch", [confirmedBlob({ blobMimeType: "image/png" })]],
    ["blob variant mismatch", [confirmedBlob({ blobVariant: "optimized" })]],
    ["blob actual size mismatch", [confirmedBlob({ blob: new Blob([new Uint8Array(3)], { type: "image/jpeg" }) })]],
  ])("downloads when the confirmed %s", (_label, confirmedBlobs) => {
    const result = plan({ confirmedBlobs });
    expect(result.ok && result.download).toHaveLength(1);
  });

  it("does not reuse records when the confirmed snapshot was not ready", () => {
    const result = plan({ confirmedReady: false });
    expect(result.ok && result.download).toHaveLength(1);
  });

  it("keeps current remoteOnly policy out of the download list", () => {
    const remoteOnly = desired({ requiresBlob: false, sourceSizeBytes: 60 * 1024 * 1024 });
    const result = plan({ desiredAssets: [remoteOnly] });
    expect(result.ok && result.remoteOnly).toEqual([remoteOnly]);
    expect(result.ok && result.download).toEqual([]);
  });

  it("plans unchanged reuse, changed and added downloads, and removed obsolete records", () => {
    const changed = desired({ assetId: "asset-b", sourceDriveFileId: "drive-b", checksum: "new-b" });
    const added = desired({ assetId: "asset-c", sourceDriveFileId: "drive-c", checksum: "checksum-c" });
    const result = plan({
      desiredAssets: [desired(), changed, added],
      confirmedAssets: [
        confirmedAsset(),
        confirmedAsset({ assetId: "asset-b", sourceDriveFileId: "drive-b", checksum: "old-b" }),
        confirmedAsset({ assetId: "asset-removed", sourceDriveFileId: "drive-removed" }),
      ],
      confirmedBlobs: [
        confirmedBlob(),
        confirmedBlob({ assetId: "asset-b" }),
        confirmedBlob({ assetId: "asset-removed" }),
      ],
    });
    expect(result.ok && result.reuse.map((item) => item.desired.assetId)).toEqual(["asset-a"]);
    expect(result.ok && result.download.map((item) => item.assetId)).toEqual(["asset-b", "asset-c"]);
    expect(result.ok && result.obsolete.map((item) => item.assetId)).toEqual(["asset-removed"]);
  });

  it.each(["confirmed asset", "confirmed blob"])("fails closed for duplicate %s identity", (kind) => {
    const result = plan({
      confirmedAssets: kind === "confirmed asset" ? [confirmedAsset(), confirmedAsset()] : undefined,
      confirmedBlobs: kind === "confirmed blob" ? [confirmedBlob(), confirmedBlob()] : undefined,
    });
    expect(result).toEqual({ ok: false, reason: "ambiguousConfirmedIdentity" });
  });
});
