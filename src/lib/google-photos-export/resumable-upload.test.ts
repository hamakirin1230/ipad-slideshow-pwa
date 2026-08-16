import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES,
  uploadGooglePhotosResumableStream,
} from "./resumable-upload";

const source = readFileSync(new URL("./resumable-upload.ts", import.meta.url), "utf8");

describe("google photos resumable upload", () => {
  it("uploads chunks, advances offset, and does not accumulate the whole file", async () => {
    const chunks = [
      new Uint8Array(GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES).fill(1),
      new Uint8Array(GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES).fill(2),
      new Uint8Array(128).fill(3),
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    const offsets: number[] = [];
    const uploaded: number[] = [];
    const uploadChunk = vi.fn(async (input: { offset: number; chunk: Uint8Array; finalize: boolean }) => {
      uploaded.push(input.chunk.byteLength);
      if (input.finalize) return "upload-token";
      return null;
    });

    const token = await uploadGooglePhotosResumableStream({
      stream,
      session: { sessionUrl: "https://photos.example/session", offset: 0 },
      sizeBytes: GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES * 2 + 128,
      signal: new AbortController().signal,
      adapter: {
        startSession: vi.fn(),
        uploadChunk,
      },
      onOffset: (offset) => offsets.push(offset),
    });

    expect(token).toBe("upload-token");
    expect(uploaded).toEqual([
      GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES,
      GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES,
      128,
    ]);
    expect(offsets.at(-1)).toBe(GOOGLE_PHOTOS_RESUMABLE_CHUNK_BYTES * 2 + 128);
    expect(uploadChunk.mock.calls.some((call) => call[0].finalize)).toBe(true);
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
        session: { sessionUrl: "https://photos.example/session", offset: 0 },
        sizeBytes: 16,
        signal: controller.signal,
        adapter: {
          startSession: vi.fn(),
          uploadChunk,
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
