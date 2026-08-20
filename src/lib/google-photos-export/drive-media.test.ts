import { afterEach, describe, expect, it, vi } from "vitest";
import { openDriveProjectAssetStream } from "./drive-media";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("google photos drive media stream", () => {
  it("accepts an initial 200 response with the expected MIME type", async () => {
    const fetchMock = installFetch({
      status: 200,
      headers: {
        "Content-Type": "image/jpeg; charset=binary",
        "Content-Length": "100",
      },
      body: "x".repeat(100),
    });

    const stream = await openStream({ startByte: 0, expectedSizeBytes: 100 });
    expect(stream).toBeInstanceOf(ReadableStream);
    expect(fetchMock.mock.calls[0]?.[1]).not.toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Range: expect.anything() }),
      }),
    );
    const headers = new Headers(
      (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers,
    );
    expect(headers.get("Range")).toBeNull();
  });

  it("accepts a resume 206 response with an exact Content-Range", async () => {
    installFetch({
      status: 206,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Range": "bytes 10-99/100",
        "Content-Length": "90",
      },
      body: "y".repeat(90),
    });

    await expect(
      openStream({ startByte: 10, expectedSizeBytes: 100 }),
    ).resolves.toBeInstanceOf(ReadableStream);
    const headers = lastRequestHeaders();
    expect(headers.get("Range")).toBe("bytes=10-");
  });

  it("rejects a resume request that receives HTTP 200", async () => {
    installFetch({
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": "90",
      },
      body: "y".repeat(90),
    });

    await expect(
      openStream({ startByte: 10, expectedSizeBytes: 100 }),
    ).rejects.toThrow("drive-asset-stream-failed");
  });

  it("rejects a Content-Range whose start does not match the requested offset", async () => {
    installFetch({
      status: 206,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Range": "bytes 0-99/100",
        "Content-Length": "100",
      },
      body: "y".repeat(100),
    });

    await expect(
      openStream({ startByte: 10, expectedSizeBytes: 100 }),
    ).rejects.toThrow("drive-asset-stream-failed");
  });

  it("rejects a Content-Range whose total size does not match", async () => {
    installFetch({
      status: 206,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Range": "bytes 10-99/200",
        "Content-Length": "90",
      },
      body: "y".repeat(90),
    });

    await expect(
      openStream({ startByte: 10, expectedSizeBytes: 100 }),
    ).rejects.toThrow("drive-asset-stream-failed");
  });

  it("rejects a MIME type that does not match the expected type", async () => {
    installFetch({
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": "100",
      },
      body: "x".repeat(100),
    });

    await expect(
      openStream({ startByte: 0, expectedSizeBytes: 100 }),
    ).rejects.toThrow("drive-asset-stream-failed");
  });

  it("rejects an inconsistent Content-Length", async () => {
    installFetch({
      status: 206,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Range": "bytes 10-99/100",
        "Content-Length": "10",
      },
      body: "y".repeat(10),
    });

    await expect(
      openStream({ startByte: 10, expectedSizeBytes: 100 }),
    ).rejects.toThrow("drive-asset-stream-failed");
  });

  it("does not put Drive URLs or file IDs into thrown errors", async () => {
    installFetch({
      status: 500,
      headers: { "Content-Type": "text/plain" },
      body: "raw drive error",
    });

    await expect(
      openStream({ startByte: 0, expectedSizeBytes: 100 }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: "drive-asset-stream-failed",
      }),
    );
  });
});

function openStream(input: { startByte: number; expectedSizeBytes: number }) {
  return openDriveProjectAssetStream({
    accessToken: "drive-token",
    assetFileId: "image-file-secret",
    expectedMimeType: "image/jpeg",
    expectedSizeBytes: input.expectedSizeBytes,
    startByte: input.startByte,
    signal: new AbortController().signal,
  });
}

function installFetch(input: {
  status: number;
  headers: Record<string, string>;
  body: string;
}) {
  const fetchMock = vi.fn(
    async () =>
      new Response(input.body, {
        status: input.status,
        headers: input.headers,
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastRequestHeaders() {
  const fetchMock = globalThis.fetch as unknown as {
    mock: { calls: Array<[unknown, RequestInit?]> };
  };
  return new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers);
}
