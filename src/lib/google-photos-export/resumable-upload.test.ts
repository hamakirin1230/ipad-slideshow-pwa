import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES,
  GOOGLE_PHOTOS_UPLOADS_URL,
  isGooglePhotosResumeOffsetValid,
  parseGooglePhotosChunkGranularity,
  parseGooglePhotosUploadSessionQuery,
  queryGooglePhotosResumableSession,
  resolveGooglePhotosResumableChunkSize,
  startGooglePhotosResumableSession,
  uploadGooglePhotosResumableStream,
} from "./resumable-upload";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./resumable-upload.ts", import.meta.url), "utf8");
const GRANULARITY_256K = 256 * 1024;
const SESSION_URL = "https://photos.example/session";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("google photos resumable upload", () => {
  it("reads session URL and chunk granularity from the start response", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 200,
          headers: {
            "X-Goog-Upload-URL": SESSION_URL,
            "X-Goog-Upload-Chunk-Granularity": String(GRANULARITY_256K),
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      startGooglePhotosResumableSession({
        accessToken: "photos-token",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        fileName: "beach.jpg",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      sessionUrl: SESSION_URL,
      chunkGranularity: GRANULARITY_256K,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      GOOGLE_PHOTOS_UPLOADS_URL,
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("rejects a start response that omits chunk granularity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 200,
            headers: { "X-Goog-Upload-URL": SESSION_URL },
          }),
      ),
    );

    await expect(
      startGooglePhotosResumableSession({
        accessToken: "photos-token",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        fileName: "beach.jpg",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("photos-upload-granularity-invalid");
  });

  it("rejects invalid chunk granularity values", () => {
    expect(parseGooglePhotosChunkGranularity(null)).toBeNull();
    expect(parseGooglePhotosChunkGranularity("")).toBeNull();
    expect(parseGooglePhotosChunkGranularity("0")).toBeNull();
    expect(parseGooglePhotosChunkGranularity("-1")).toBeNull();
    expect(parseGooglePhotosChunkGranularity("1.5")).toBeNull();
    expect(parseGooglePhotosChunkGranularity("abc")).toBeNull();
    expect(parseGooglePhotosChunkGranularity("262144")).toBe(262144);
  });

  it("uses granularity itself when it exceeds the 8MiB target", () => {
    const granularity = GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES + 1;
    expect(resolveGooglePhotosResumableChunkSize(granularity)).toBe(granularity);
  });

  it("keeps non-final chunks as an integer multiple when 8MiB is not divisible", () => {
    const granularity = 300_000;
    const chunkSize = resolveGooglePhotosResumableChunkSize(granularity);
    expect(chunkSize % granularity).toBe(0);
    expect(chunkSize).not.toBe(GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES);
    expect(chunkSize).toBe(Math.floor(GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES / granularity) * granularity);
  });

  it("uploads 8MiB chunks for 256KiB granularity and a remaining final chunk", async () => {
    const chunks = [
      new Uint8Array(GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES).fill(1),
      new Uint8Array(GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES).fill(2),
      new Uint8Array(128).fill(3),
    ];
    const uploaded = await uploadFromChunks(chunks, GRANULARITY_256K);

    expect(uploaded.token).toBe("upload-token");
    expect(uploaded.sizes).toEqual([
      GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES,
      GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES,
      128,
    ]);
    expect(uploaded.sizes.slice(0, -1).every((size) => size % GRANULARITY_256K === 0)).toBe(
      true,
    );
    expect(uploaded.offsets.at(-1)).toBe(
      GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES * 2 + 128,
    );
  });

  it("aligns non-final chunks to an indivisible granularity and finalizes remaining bytes", async () => {
    const granularity = 300_000;
    const chunkSize = resolveGooglePhotosResumableChunkSize(granularity);
    const chunks = [
      new Uint8Array(chunkSize).fill(1),
      new Uint8Array(chunkSize).fill(2),
      new Uint8Array(128).fill(3),
    ];
    const uploaded = await uploadFromChunks(chunks, granularity);

    expect(uploaded.sizes).toEqual([chunkSize, chunkSize, 128]);
    expect(uploaded.sizes[0]! % granularity).toBe(0);
    expect(uploaded.sizes[1]! % granularity).toBe(0);
    expect(uploaded.sizes[2]).toBe(128);
  });

  it("parses an authoritative query offset only when the session is active", () => {
    expect(
      parseGooglePhotosUploadSessionQuery(
        new Headers({
          "X-Goog-Upload-Status": "active",
          "X-Goog-Upload-Size-Received": "4096",
        }),
      ),
    ).toEqual({ ok: true, status: "active", offset: 4096 });
    expect(
      parseGooglePhotosUploadSessionQuery(
        new Headers({
          "X-Goog-Upload-Status": "final",
          "X-Goog-Upload-Size-Received": "4096",
        }),
      ),
    ).toEqual({ ok: false });
    expect(
      parseGooglePhotosUploadSessionQuery(
        new Headers({
          "X-Goog-Upload-Status": "active",
          "X-Goog-Upload-Size-Received": "nope",
        }),
      ),
    ).toEqual({ ok: false });
    expect(isGooglePhotosResumeOffsetValid(0, 10)).toBe(true);
    expect(isGooglePhotosResumeOffsetValid(10, 10)).toBe(true);
    expect(isGooglePhotosResumeOffsetValid(11, 10)).toBe(false);
  });

  it("queries the session URL without uploading bytes", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 200,
          headers: {
            "X-Goog-Upload-Status": "active",
            "X-Goog-Upload-Size-Received": "2048",
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      queryGooglePhotosResumableSession({
        sessionUrl: SESSION_URL,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ ok: true, status: "active", offset: 2048 });
    expect(fetchMock).toHaveBeenCalledWith(
      SESSION_URL,
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Length": "0",
          "X-Goog-Upload-Command": "query",
        },
      }),
    );
  });

  it("returns a failed query instead of retrying a write", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network");
      }),
    );

    await expect(
      queryGooglePhotosResumableSession({
        sessionUrl: SESSION_URL,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ ok: false });
  });

  it("stops on abort and does not retry", async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(new Uint8Array(16).fill(1));
        streamController.close();
      },
    });
    const uploadChunk = vi.fn(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });

    await expect(
      uploadGooglePhotosResumableStream({
        stream,
        session: {
          sessionUrl: SESSION_URL,
          chunkGranularity: GRANULARITY_256K,
          offset: 0,
        },
        sizeBytes: 16,
        signal: controller.signal,
        adapter: {
          startSession: vi.fn(),
          uploadChunk,
          querySession: vi.fn(),
        },
        onOffset: () => undefined,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(uploadChunk).toHaveBeenCalledTimes(1);
  });

  it("does not read the Drive body into a whole-file Blob or ArrayBuffer", () => {
    expect(source).not.toContain(".blob()");
    expect(source).not.toContain(".arrayBuffer()");
    expect(source).toContain("stream.getReader()");
    expect(source).toContain("GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES");
  });
});

async function uploadFromChunks(chunks: Uint8Array[], chunkGranularity: number) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const offsets: number[] = [];
  const sizes: number[] = [];
  const uploadChunk = vi.fn(
    async (input: { offset: number; chunk: Uint8Array; finalize: boolean }) => {
      sizes.push(input.chunk.byteLength);
      if (input.finalize) return "upload-token";
      return null;
    },
  );
  const sizeBytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const token = await uploadGooglePhotosResumableStream({
    stream,
    session: {
      sessionUrl: SESSION_URL,
      chunkGranularity,
      offset: 0,
    },
    sizeBytes,
    signal: new AbortController().signal,
    adapter: {
      startSession: vi.fn(),
      uploadChunk,
      querySession: vi.fn(),
    },
    onOffset: (offset) => offsets.push(offset),
  });
  return { token, sizes, offsets, uploadChunk };
}
