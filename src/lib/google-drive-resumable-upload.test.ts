import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DRIVE_RESUMABLE_UPLOAD_CHUNK_BYTES,
  getDriveResumableUploadChunkWindow,
} from "./google-drive";
import { DRIVE_VIDEO_MAX_BYTES } from "./drive-video-policy";

describe("Drive resumable video upload ranges", () => {
  it("keeps the existing 8 MiB chunk size", () => {
    expect(DRIVE_RESUMABLE_UPLOAD_CHUNK_BYTES).toBe(8 * 1024 * 1024);
  });

  it("calculates a chunk above the 2 GiB boundary without truncation", () => {
    const offset = 3 * 1024 * 1024 * 1024 + 123;
    const chunk = getDriveResumableUploadChunkWindow({
      offset,
      totalBytes: DRIVE_VIDEO_MAX_BYTES,
    });

    expect(chunk).toEqual({
      start: offset,
      endExclusive: offset + DRIVE_RESUMABLE_UPLOAD_CHUNK_BYTES,
      contentRange: `bytes ${offset}-${offset + DRIVE_RESUMABLE_UPLOAD_CHUNK_BYTES - 1}/${DRIVE_VIDEO_MAX_BYTES}`,
    });
  });

  it("builds the final Content-Range at exactly 5 GiB", () => {
    const offset = DRIVE_VIDEO_MAX_BYTES - 4 * 1024 * 1024;
    const chunk = getDriveResumableUploadChunkWindow({
      offset,
      totalBytes: DRIVE_VIDEO_MAX_BYTES,
    });

    expect(chunk.endExclusive).toBe(DRIVE_VIDEO_MAX_BYTES);
    expect(chunk.contentRange).toBe(
      `bytes ${offset}-${DRIVE_VIDEO_MAX_BYTES - 1}/${DRIVE_VIDEO_MAX_BYTES}`,
    );
  });

  it("keeps the resumable implementation slice-based without full-file reads", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./google-drive.ts", import.meta.url)),
      "utf8",
    );
    const start = source.indexOf(
      "async function createDriveProjectAssetFileResumable",
    );
    const end = source.indexOf(
      "async function createDriveResumableUploadSession",
      start,
    );
    const implementation = source.slice(start, end);

    expect(implementation).toContain("input.blob.slice(");
    expect(implementation).not.toContain("arrayBuffer(");
    expect(implementation).not.toContain(".text(");
    expect(implementation).not.toContain("new Blob(");
    expect(implementation).not.toMatch(/<<|>>>?|~~/);
  });
});
