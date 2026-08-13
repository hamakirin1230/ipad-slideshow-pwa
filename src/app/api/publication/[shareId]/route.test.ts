import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolvePublicPublication } = vi.hoisted(() => ({
  resolvePublicPublication: vi.fn(),
}));

vi.mock(
  "@/lib/publication/public-publication-blob-server",
  () => ({ resolvePublicPublication }),
);

import { GET } from "./route";

describe("public publication resolver route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects malformed share IDs before storage lookup", async () => {
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ shareId: "../private" }),
    });
    expect(response.status).toBe(400);
    expect(resolvePublicPublication).not.toHaveBeenCalled();
  });

  it("resolves a public manifest without Google authorization", async () => {
    const shareId = "a".repeat(43);
    resolvePublicPublication.mockResolvedValue({
      schemaVersion: 1,
      title: "公開作品",
      slides: [],
    });
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ shareId }),
    });
    expect(response.status).toBe(200);
    expect(resolvePublicPublication).toHaveBeenCalledWith(shareId);
  });
});
