import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildFreshPublicRevisionInput,
  activatePublicRevision,
  verifyPublicRevisionArtifact,
} = vi.hoisted(
  () => ({
    buildFreshPublicRevisionInput: vi.fn(),
    activatePublicRevision: vi.fn(),
    verifyPublicRevisionArtifact: vi.fn(),
  }),
);

vi.mock(
  "@/lib/publication/public-publication-drive-server",
  () => ({
    readBearerAccessToken: (request: Request) =>
      request.headers.get("Authorization") === "Bearer token" ? "token" : null,
    buildFreshPublicRevisionInput,
  }),
);
vi.mock(
  "@/lib/publication/public-publication-blob-server",
  () => ({ activatePublicRevision, verifyPublicRevisionArtifact }),
);
vi.mock(
  "@/lib/publication/public-publication-identity",
  () => ({ requirePublicShareSecret: () => "test-secret" }),
);

import { POST } from "./route";

const body = {
  projectId: "11111111-1111-4111-8111-111111111111",
  revisionId: "rev_20260813T120000000Z_ab12cd34",
  manifestFileId: "private-manifest-file",
};

describe("public activation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyPublicRevisionArtifact.mockResolvedValue(true);
  });

  it("rejects missing bearer authorization", async () => {
    const response = await POST(request(body, false));
    expect(response.status).toBe(401);
    expect(buildFreshPublicRevisionInput).not.toHaveBeenCalled();
  });

  it("does not activate when fresh Drive authority does not match", async () => {
    buildFreshPublicRevisionInput.mockResolvedValue(null);
    const response = await POST(request(body));
    expect(response.status).toBe(409);
    expect(activatePublicRevision).not.toHaveBeenCalled();
  });

  it("activates the requested revision after a fresh matching read", async () => {
    buildFreshPublicRevisionInput.mockResolvedValue({
      revisionId: body.revisionId,
      publishedAt: "2026-08-13T12:00:00.000Z",
      sourceModifiedTime: "2026-08-13T12:00:01.000Z",
    });
    activatePublicRevision.mockResolvedValue({
      sharePath: "/share/opaque-share",
    });
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(buildFreshPublicRevisionInput).toHaveBeenCalledTimes(2);
    expect(activatePublicRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: body.projectId,
        revisionId: body.revisionId,
        sourceModifiedTime: "2026-08-13T12:00:01.000Z",
      }),
    );
  });

  it("does not activate when Drive current revision changes after artifact verification", async () => {
    buildFreshPublicRevisionInput
      .mockResolvedValueOnce({
        revisionId: body.revisionId,
        publishedAt: "2026-08-13T12:00:00.000Z",
        sourceModifiedTime: "2026-08-13T12:00:01.000Z",
      })
      .mockResolvedValueOnce(null);
    const response = await POST(request(body));
    expect(response.status).toBe(409);
    expect(activatePublicRevision).not.toHaveBeenCalled();
  });

  it("does not activate when the immutable public artifact differs from Drive", async () => {
    buildFreshPublicRevisionInput.mockResolvedValue({
      revisionId: body.revisionId,
      publishedAt: "2026-08-13T12:00:00.000Z",
      sourceModifiedTime: "2026-08-13T12:00:01.000Z",
    });
    verifyPublicRevisionArtifact.mockResolvedValue(false);
    const response = await POST(request(body));
    expect(response.status).toBe(409);
    expect(activatePublicRevision).not.toHaveBeenCalled();
  });
});

function request(value: unknown, authorized = true) {
  return new Request("https://example.test/api/publication/activate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorized ? { Authorization: "Bearer token" } : {}),
    },
    body: JSON.stringify(value),
  });
}
