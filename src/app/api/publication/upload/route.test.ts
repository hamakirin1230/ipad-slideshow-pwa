import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientPayload: "",
  handleUpload: vi.fn(),
  verifyDriveAssetAccess: vi.fn(),
  verifyDriveProjectManifestAccess: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({
  handleUpload: mocks.handleUpload,
}));
vi.mock(
  "@/lib/publication/public-publication-drive-server",
  () => ({
    readBearerAccessToken: (request: Request) =>
      request.headers.get("Authorization") === "Bearer token" ? "token" : null,
    verifyDriveAssetAccess: mocks.verifyDriveAssetAccess,
    verifyDriveProjectManifestAccess: mocks.verifyDriveProjectManifestAccess,
  }),
);
vi.mock(
  "@/lib/publication/public-publication-identity",
  () => ({
    getPublicAssetPathname: () => "shares/opaque/assets/opaque.jpg",
    requirePublicShareSecret: () => "test-secret",
  }),
);

import { POST } from "./route";

const validPayload = {
  manifestFileId: "private-manifest",
  projectId: "11111111-1111-4111-8111-111111111111",
  revisionId: "rev_20260813T120000000Z_ab12cd34",
  asset: {
    assetId: "22222222-2222-4222-8222-222222222222",
    driveFileId: "private-asset",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    modifiedTime: "2026-08-13T12:00:00.000Z",
    checksum: "checksum",
  },
};

describe("public Blob upload authorization route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientPayload = JSON.stringify(validPayload);
    mocks.verifyDriveAssetAccess.mockResolvedValue(true);
    mocks.verifyDriveProjectManifestAccess.mockResolvedValue(true);
    mocks.handleUpload.mockImplementation(async (options: {
      onBeforeGenerateToken: (
        pathname: string,
        clientPayload: string | null,
        multipart: boolean,
      ) => Promise<Record<string, unknown>>;
    }) => {
      const constraints = await options.onBeforeGenerateToken(
        "shares/opaque/assets/opaque.jpg",
        mocks.clientPayload,
        true,
      );
      return { type: "blob.generate-client-token", constraints };
    });
  });

  it("rejects a token request without Google bearer authorization", async () => {
    const response = await POST(request(false));
    expect(response.status).toBe(400);
    expect(mocks.verifyDriveAssetAccess).not.toHaveBeenCalled();
  });

  it("rejects malformed size or MIME before issuing a token", async () => {
    mocks.clientPayload = JSON.stringify({
      ...validPayload,
      asset: { ...validPayload.asset, mimeType: "text/html" },
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(mocks.verifyDriveAssetAccess).not.toHaveBeenCalled();
  });

  it("issues only exact pathname, MIME, and size constraints", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      constraints: {
        allowedContentTypes: string[];
        maximumSizeInBytes: number;
        allowOverwrite: boolean;
      };
    };
    expect(body.constraints).toMatchObject({
      allowedContentTypes: ["image/jpeg"],
      maximumSizeInBytes: 1024,
      allowOverwrite: false,
    });
  });
});

function request(authorized = true) {
  return new Request("https://example.test/api/publication/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorized ? { Authorization: "Bearer token" } : {}),
    },
    body: JSON.stringify({ type: "blob.generate-client-token" }),
  });
}
