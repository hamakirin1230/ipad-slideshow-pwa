import { describe, expect, it } from "vitest";
import {
  buildPublicPublicationManifest,
  isValidPublicShareId,
  PUBLIC_PUBLICATION_MAX_ASSET_SIZE_BYTES,
  validatePublicPublicationAssetDescriptor,
  type PublicPublicationAssetDescriptor,
  type PublicPublicationRevisionInput,
} from "./public-publication-contract";
import {
  comparePublicActivationOrder,
  derivePublicRevisionId,
  derivePublicShareId,
  getPublicAssetPathname,
} from "./public-publication-identity";
import { parsePublicUploadPayload } from "./public-publication-request";

const secret = "a-secure-test-secret-with-at-least-32-characters";
const projectId = "11111111-1111-4111-8111-111111111111";
const revisionId = "rev_20260813T120000000Z_ab12cd34";
const asset: PublicPublicationAssetDescriptor = {
  assetId: "22222222-2222-4222-8222-222222222222",
  driveFileId: "private-drive-file-id",
  mimeType: "image/jpeg",
  sizeBytes: 1234,
  modifiedTime: "2026-08-13T12:00:00.000Z",
  checksum: "private-checksum",
};

describe("opaque public publication identity", () => {
  it("is stable, URL-safe, and does not expose source identifiers", () => {
    const shareId = derivePublicShareId(projectId, secret);
    const publicRevisionId = derivePublicRevisionId({
      projectId,
      revisionId,
      secret,
    });
    expect(derivePublicShareId(projectId, secret)).toBe(shareId);
    expect(isValidPublicShareId(shareId)).toBe(true);
    expect(isValidPublicShareId(publicRevisionId)).toBe(true);
    expect(shareId).not.toContain(projectId);
    expect(publicRevisionId).not.toContain(revisionId);
    expect(getPublicAssetPathname({ projectId, asset, secret })).not.toMatch(
      /private-drive-file-id|22222222|private-checksum/,
    );
  });

  it("orders activations by Drive source modified time, not write order", () => {
    const older = {
      sourceModifiedTime: "2026-08-13T12:00:00.000Z",
      publicationTimestamp: "2026-08-13T12:00:00.000Z",
      pathname: "shares/opaque/activations/late-write-old.json",
    };
    const newer = {
      sourceModifiedTime: "2026-08-13T12:01:00.000Z",
      publicationTimestamp: "2026-08-13T12:01:00.000Z",
      pathname: "shares/opaque/activations/early-write-new.json",
    };
    expect(comparePublicActivationOrder(older, newer)).toBeGreaterThan(0);
    expect([older, newer].sort(comparePublicActivationOrder)[0]).toBe(newer);
  });

  it("rejects malformed public share IDs", () => {
    expect(isValidPublicShareId(projectId)).toBe(false);
    expect(isValidPublicShareId("../private")).toBe(false);
    expect(isValidPublicShareId("short")).toBe(false);
  });
});

describe("public manifest sanitizer", () => {
  it("keeps presentation fields and removes all Drive and publication internals", () => {
    const revision: PublicPublicationRevisionInput = {
      projectId,
      revisionId,
      publishedAt: "2026-08-13T12:00:00.000Z",
      manifest: {
        title: "公開作品",
        slides: [
          {
            assetId: asset.assetId,
            caption: "テロップ",
            durationSeconds: 5,
            order: 0,
            mimeType: asset.mimeType,
          },
        ],
      },
      assets: [asset],
    };
    const manifest = buildPublicPublicationManifest({
      revision,
      assetUrls: new Map([
        [asset.assetId, "https://public.example/opaque-asset.jpg"],
      ]),
    });
    expect(manifest).toEqual({
      schemaVersion: 1,
      title: "公開作品",
      slides: [
        {
          order: 0,
          caption: "テロップ",
          durationSeconds: 5,
          mediaKind: "image",
          mimeType: "image/jpeg",
          assetUrl: "https://public.example/opaque-asset.jpg",
        },
      ],
    });
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toMatch(
      /private-drive-file-id|11111111|22222222|rev_2026|private-checksum|operationId/,
    );
  });
});

describe("public upload authorization input", () => {
  const validPayload = {
    manifestFileId: "private-manifest-file",
    projectId,
    revisionId,
    asset,
  };

  it("accepts the supported MIME and size boundary", () => {
    expect(
      validatePublicPublicationAssetDescriptor({
        ...asset,
        sizeBytes: PUBLIC_PUBLICATION_MAX_ASSET_SIZE_BYTES,
        mimeType: "video/mp4",
      }),
    ).toBe(true);
    expect(parsePublicUploadPayload(JSON.stringify(validPayload))).not.toBeNull();
  });

  it("rejects malformed, oversized, and unsupported requests", () => {
    expect(parsePublicUploadPayload(null)).toBeNull();
    expect(
      parsePublicUploadPayload(
        JSON.stringify({
          ...validPayload,
          asset: {
            ...asset,
            sizeBytes: PUBLIC_PUBLICATION_MAX_ASSET_SIZE_BYTES + 1,
          },
        }),
      ),
    ).toBeNull();
    expect(
      parsePublicUploadPayload(
        JSON.stringify({
          ...validPayload,
          asset: { ...asset, mimeType: "text/html" },
        }),
      ),
    ).toBeNull();
  });
});
